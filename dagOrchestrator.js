// dagOrchestrator.js — Оркестратор DAG-графа подзадач
// Версия: 1.0
//
// Читает DAG из pipeline_state.json, топологически сортирует,
// выполняет ноды через Compiler -> Executor -> Critic,
// обрабатывает условные переходы и retry.

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PAPERCLIP_API = "http://127.0.0.1:3100/api";
const DATA_DIR = "C:\\Users\\rus\\Desktop\\merge\\data";
const MAX_CONCURRENT = 2; // макс. параллельных нод
const MAX_RETRIES_PER_NODE = 2;

// ─────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────
function httpRequest(url, method = "GET", body = null) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const transport = u.protocol === "https:" ? https : http;
    const options = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, timeout: 5000 };
    if (body) {
      const data = JSON.stringify(body);
      options.headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) };
    }
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(Buffer.concat(chunks).toString("utf-8")), status: res.statusCode }); }
        catch { resolve({ ok: false, data: null, status: res.statusCode, error: "JSON parse failed" }); }
      });
    });
    req.on("error", (e) => resolve({ ok: false, data: null, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, data: null, error: "Timeout" }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─────────────────────────────────────
// Pipeline state
// ─────────────────────────────────────
function readState() {
  const p = path.join(DATA_DIR, "pipeline_state.json");
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function writeState(state) {
  const p = path.join(DATA_DIR, "pipeline_state.json");
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf-8");
}

// ─────────────────────────────────────
// Топологическая сортировка (копия из taskPlanner)
// ─────────────────────────────────────
function topologicalSort(nodes) {
  const sorted = [];
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.find(n => n.id === id);
    if (node) {
      for (const dep of node.depends_on || []) visit(dep);
      sorted.push(node);
    }
  }
  for (const n of nodes) visit(n.id);
  return sorted;
}

function findLevels(nodes) {
  const sorted = topologicalSort(nodes);
  const nodeLevel = {};
  for (const n of sorted) {
    nodeLevel[n.id] = (n.depends_on || []).length === 0
      ? 0
      : Math.max(...(n.depends_on || []).map(d => (nodeLevel[d] ?? -1) + 1));
  }
  const levels = {};
  for (const n of sorted) {
    const lvl = nodeLevel[n.id];
    if (!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(n);
  }
  return Object.values(levels); // [[level0], [level1], ...]
}

// ─────────────────────────────────────
// Выполнение одной ноды
// ─────────────────────────────────────
async function executeNode(node, companyId, issueId, allResults, logs) {
  const nodeId = node.id;
  const action = node.action;
  const params = node.params || {};

  // Проверка условия
  if (node.condition) {
    const [condNode, condStatus] = node.condition.split(".");
    const prevResult = allResults[condNode];
    if (condStatus === "success" && (!prevResult || prevResult.status !== "succeeded")) {
      logs.push(`[DAG] Skipping ${nodeId}: condition ${node.condition} not met`);
      allResults[nodeId] = { nodeId, status: "skipped", reason: `Condition ${node.condition} not met` };
      return;
    }
  }

  logs.push(`[DAG] Executing ${nodeId}: ${action}`);

  // Создаём задачу в Paperclip для этой ноды
  // Формируем JSON с description для Compiler
  const body = JSON.stringify({
    tool_name: action,
    system_command: `Execute ${action}`,
    strict_params: params,
    dag_context: { node_id: nodeId, dag_results: allResults },
  });

  const issueRes = await httpRequest(`${PAPERCLIP_API}/issues/${issueId}`, "PATCH", {
    description: body,
  }).catch(() => {});

  // Запускаем heartbeat для Compiler
  const agentsRes = await httpRequest(`${PAPERCLIP_API}/companies/${companyId}/agents`);

  let compilerId = null;
  let executorId = null;
  let criticId = null;

  if (agentsRes.ok && agentsRes.data) {
    const agents = Array.isArray(agentsRes.data) ? agentsRes.data
      : agentsRes.data.items || agentsRes.data.agents || [];
    compilerId = (agents.find(a => a.adapterType === "compiler") || {}).id;
    executorId = (agents.find(a => a.adapterType === "executor") || {}).id;
    criticId = (agents.find(a => a.adapterType === "critic") || {}).id;
  }

  let retries = 0;
  let success = false;
  let lastResult = null;

  while (retries <= MAX_RETRIES_PER_NODE && !success) {
    retries++;
    logs.push(`[DAG] ${nodeId} attempt ${retries}/${MAX_RETRIES_PER_NODE + 1}`);

    // Compiler
    if (compilerId) {
      await httpRequest(`${PAPERCLIP_API}/issues/${issueId}/checkout`, "POST", { agentId: compilerId }).catch(() => {});
      const compRun = await httpRequest(
        `${PAPERCLIP_API}/companies/${companyId}/agents/${compilerId}/heartbeat`,
        "POST", { source: "assignment", timeoutMs: 30000 }
      ).catch(() => {});
      if (!compRun?.ok) {
        logs.push(`[DAG] ${nodeId} compiler heartbeat failed`);
        continue;
      }
    }

    // Executor
    if (executorId) {
      await httpRequest(`${PAPERCLIP_API}/issues/${issueId}/checkout`, "POST", { agentId: executorId }).catch(() => {});
      const execRun = await httpRequest(
        `${PAPERCLIP_API}/companies/${companyId}/agents/${executorId}/heartbeat`,
        "POST", { source: "assignment", timeoutMs: 60000 }
      ).catch(() => {});

      if (!execRun?.ok) {
        logs.push(`[DAG] ${nodeId} executor heartbeat failed`);
        continue;
      }

      // Получаем executor run
      const execRunId = execRun.data?.runId || execRun.data?.id;
      if (execRunId) {
        const execDetail = await httpRequest(`${PAPERCLIP_API}/heartbeat-runs/${execRunId}`);
        if (execDetail.ok && execDetail.data?.resultJson) {
          lastResult = execDetail.data.resultJson;
        }
      }
    }

    // Critic
    if (criticId) {
      // Write pipeline state for critic
      writeState({
        user_input: `Execute ${action}`,
        issue_id: issueId,
        company_id: companyId,
        executor_result: lastResult || { status: "unknown" },
        retry_count: retries - 1,
      });

      await httpRequest(`${PAPERCLIP_API}/issues/${issueId}/checkout`, "POST", { agentId: criticId }).catch(() => {});
      const critRun = await httpRequest(
        `${PAPERCLIP_API}/companies/${companyId}/agents/${criticId}/heartbeat`,
        "POST", { source: "assignment", timeoutMs: 45000 }
      ).catch(() => {});

      if (critRun?.ok) {
        const critRunId = critRun.data?.runId || critRun.data?.id;
        if (critRunId) {
          const critDetail = await httpRequest(`${PAPERCLIP_API}/heartbeat-runs/${critRunId}`);
          const verdict = critDetail?.data?.resultJson?.verdict;
          logs.push(`[DAG] ${nodeId} critic verdict: ${verdict}`);
          if (verdict === "approve") {
            success = true;
          } else {
            logs.push(`[DAG] ${nodeId} rejected: ${critDetail?.data?.resultJson?.reason || "unknown"}`);
          }
        }
      } else {
        // No critic available or it failed — assume success if executor ran
        success = lastResult !== null;
      }
    } else {
      // No critic agent configured
      success = lastResult !== null;
    }
  }

  allResults[nodeId] = {
    nodeId,
    action,
    status: success ? "succeeded" : "failed",
    result: lastResult,
    retries,
  };

  logs.push(`[DAG] ${nodeId} ${success ? "✅ succeeded" : "❌ failed"} after ${retries} attempt(s)`);
}

// ─────────────────────────────────────
// Главная функция оркестрации
// ─────────────────────────────────────

/**
 * Запускает оркестрацию DAG.
 *
 * @param {object} dag - DAG-граф { type: "dag", nodes: [...] }
 * @param {string} companyId - Paperclip company ID
 * @param {string} issueId - Paperclip issue ID
 * @returns {Promise<{status, results, logs}>}
 */
async function orchestrateDag(dag, companyId, issueId) {
  const logs = [];
  const allResults = {};
  const nodes = dag.nodes;

  if (!nodes || nodes.length === 0) {
    return { status: "completed", results: {}, logs: ["[DAG] Empty DAG — nothing to execute"] };
  }

  logs.push(`[DAG] Starting orchestration of ${nodes.length} nodes`);

  // Топологическая сортировка по уровням
  const levels = findLevels(nodes);
  logs.push(`[DAG] ${levels.length} execution levels: ${levels.map(l => l.map(n => n.id).join(",")).join(" | ")}`);

  // Выполняем по уровням (внутри уровня — параллельно с ограничением)
  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const levelNodes = levels[levelIdx];
    logs.push(`[DAG] Level ${levelIdx + 1}: ${levelNodes.map(n => n.id).join(", ")}`);

    // Параллельное выполнение с ограничением concurrency
    const chunks = [];
    for (let i = 0; i < levelNodes.length; i += MAX_CONCURRENT) {
      chunks.push(levelNodes.slice(i, i + MAX_CONCURRENT));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(node =>
        executeNode(node, companyId, issueId, allResults, logs)
          .catch(err => {
            logs.push(`[DAG] ${node.id} error: ${err.message}`);
            allResults[node.id] = { nodeId: node.id, status: "error", error: err.message };
          })
      ));
    }
  }

  // Проверяем все результаты
  const allSucceeded = nodes.every(n => allResults[n.id]?.status === "succeeded");
  const anyFailed = nodes.some(n => allResults[n.id]?.status === "failed");

  const status = allSucceeded ? "completed" : (anyFailed ? "failed_some" : "completed");
  logs.push(`[DAG] Final status: ${status}`);

  return {
    status,
    results: allResults,
    logs,
  };
}

module.exports = {
  orchestrateDag,
  topologicalSort,
  findLevels,
};

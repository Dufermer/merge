// ceoAgentV2.js — CEO Agent v2 с динамическим agent loop
// Версия: 2.0
//
// Использует hermes-wrapper (think → act → observe) для решения задач.
// Сохраняет фичи v1: memory, skills, project context.
// Paperclip adapter остаётся в ceo/index.js.

const path = require("node:path");
const fs = require("node:fs");
const { runAgentLoop } = require("./hermes-wrapper");

const LOG_FILE = path.join(__dirname, "data", "ceov2.log");
const MEMORY_FILE = path.join(__dirname, "data", "ceov2_memory.json");
const PAPERCLIP_API = "http://127.0.0.1:3100/api";
const TRANSLATOR_AGENT_ID = "badd8cf8-b72d-492a-bdca-c29dd9bc16f0";
const COMPANY_ID = "793573ec-9d0c-44de-a5e6-477fbf16cb64";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch {}
}

/**
 * Простая память для CEO v2 (JSON-based).
 */
class SimpleMemory {
  constructor() {
    this.entries = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        this.entries = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8")).entries || [];
      }
    } catch {}
  }

  _save() {
    try {
      const dir = path.dirname(MEMORY_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(MEMORY_FILE, JSON.stringify({ entries: this.entries }, null, 2), "utf-8");
    } catch {}
  }

  store(task, result) {
    this.entries.push({ task, result, timestamp: new Date().toISOString() });
    if (this.entries.length > 100) this.entries.shift();
    this._save();
  }

  search(query, topK = 3) {
    const q = query.toLowerCase();
    const qWords = q.split(/\s+/).filter((w) => w.length >= 3);

    const scored = this.entries.map((e) => {
      const text = `${e.task} ${e.result}`.toLowerCase();
      const matches = qWords.filter((w) => text.includes(w)).length;
      const similarity = qWords.length > 0 ? matches / qWords.length : 0;
      return { ...e, similarity };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }
}

const memory = new SimpleMemory();

/**
 * HTTP request helper
 */
function httpReq(url, method = "GET", body = null) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const http = require("node:http");
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method, timeout: 10000,
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(JSON.stringify(body)) } : {},
    };
    const req = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(d), status: res.statusCode }); }
        catch { resolve({ ok: false, data: d, status: res.statusCode }); }
      });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "Timeout" }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Определяет, нужно ли делегировать задачу Translator'у.
 * Простые задачи (1 глагол) делегируются.
 * Сложные задачи (2+ глагола) выполняются CEO через agent loop.
 */
function shouldDelegate(task) {
  const t = task.toLowerCase();

  // Simple math — always handle directly (faster)
  if (t.match(/сколько\s+будет|^\d+\s*[\+\-\*\/]/)) return false;

  // Count action verbs
  const verbs = ["прочитай","найди","сделай","выполни","запусти","проверь","read","find","execute","run","check","list","перечисли"];
  const matches = t.match(new RegExp(verbs.join("|"), "gi"));
  const verbCount = matches ? matches.length : 0;

  // Has conjunction between actions = multi-step
  const hasConjunction = /,\s*| и |затем|потом/.test(t);

  // Delegate if exactly 1 verb and it's a delegation keyword (simple task)
  if (verbCount === 1 && hasConjunction === false) {
    log(`[CEOv2] shouldDelegate: YES (1 verb: "${matches[0]}")`);
    return true;
  }

  log(`[CEOv2] shouldDelegate: NO (${verbCount} verbs, conj=${hasConjunction})`);
  return false;
}

/**
 * Создаёт sub-issue для Translator через Paperclip API.
 */
async function delegateToTranslator(task, companyId, parentIssueId) {
  log(`[CEOv2] Delegating to Translator: "${task.slice(0, 80)}"`);

  const res = await httpReq(
    `${PAPERCLIP_API}/companies/${companyId || COMPANY_ID}/issues`,
    "POST",
    {
      title: task.length > 80 ? task.slice(0, 77) + "..." : task,
      description: task,
      assigneeAgentId: TRANSLATOR_AGENT_ID,
      parentId: parentIssueId,
    }
  );

  if (!res.ok || !res.data) {
    log(`[CEOv2] Delegation FAILED: ${res.error || res.status}`);
    return { success: false, error: `API error: ${res.status}` };
  }

  log(`[CEOv2] Sub-issue created: ${res.data.identifier} (${res.data.id.slice(0, 12)}...)`);
  return { success: true, subIssueId: res.data.id, identifier: res.data.identifier };
}

/**
 * Обновляет статус задачи в Paperclip.
 */
async function updateIssueStatus(issueId, status, resultJson) {
  const body = { status };
  if (resultJson) body.result = resultJson;
  const res = await httpReq(`${PAPERCLIP_API}/issues/${issueId}`, "PATCH", body);
  log(`[CEOv2] Issue ${issueId.slice(0, 8)} → ${status} (ok=${res.ok})`);
  return res.ok;
}

/**
 * Обрабатывает задачу с возможностью делегирования.
 */
async function processTask(task, options = {}) {
  const startTime = Date.now();

  // Check memory first
  const memResults = memory.search(task);
  if (memResults.length > 0 && memResults[0].similarity >= 0.85) {
    log(`[CEOv2] Memory hit! (sim=${memResults[0].similarity})`);
    return {
      answer: memResults[0].result,
      turns: 0,
      timeMs: Date.now() - startTime,
      fromMemory: true,
      delegated: false,
    };
  }

  log(`[CEOv2] Processing: "${task.slice(0, 80)}"`);

  // NO agent loop for now — keep existing behavior for complex tasks
  // but for simple tasks, use the agent loop (which will handle it in 1 turn via fallback)
  log(`[CEOv2] Starting agent loop...`);
  const result = await runAgentLoop(task, options);
  const elapsed = Date.now() - startTime;
  
  // Не сохраняем в память ошибки
  const isError = result.answer && (
    result.answer.includes("Error") || 
    result.answer.includes("error") ||
    result.answer.includes("ENOENT") ||
    result.answer.includes("not found")
  );
  
  if (!isError) {
    memory.store(task, result.answer);
    log(`[CEOv2] Saved to memory`);
  } else {
    log(`[CEOv2] NOT saving error to memory`);
  }

  return {
    answer: result.answer,
    turns: result.turns,
    timeMs: elapsed,
    fromMemory: false,
    delegated: false,
  };
}

/**
 * Обрабатывает задачу через agent loop (для Paperclip).
 * @param {string} task — описание задачи
 * @param {string} issueId — ID задачи в Paperclip (для PATCH)
 * @param {string} companyId — ID компании в Paperclip
 * @param {object} options — опции
 * @returns {object} { answer, turns, timeMs, fromMemory }
 */
async function processUserRequest(task, issueId, companyId, options = {}) {
  // Step 1: Check if we should delegate
  if (shouldDelegate(task) && issueId) {
    log(`[CEOv2] Delegating task to Translator`);
    const delegation = await delegateToTranslator(task, companyId, issueId);
    if (delegation.success) {
      // Update parent issue status
      await updateIssueStatus(issueId, "in_progress", {
        delegated_to: "translator",
        sub_issue_id: delegation.subIssueId,
      });
      return {
        answer: `Delegated to Translator (${delegation.identifier})`,
        delegated: true,
        subIssueId: delegation.subIssueId,
        fromMemory: false,
        turns: 0,
      };
    }
    log(`[CEOv2] Delegation failed, falling back to agent loop`);
  }

  // Step 2: Process through agent loop
  const result = await processTask(task, options);

  // Гибридный подход: PATCH + return (как в CEO v5)
  if (issueId && companyId) {
    try {
      const http = require("node:http");
      const body = JSON.stringify({
        status: "done",
        result: {
          answer: result.answer,
          fromMemory: result.fromMemory,
          turns: result.turns,
        },
      });
      const url = new URL(`http://127.0.0.1:3100/api/issues/${issueId}`);
      const req = http.request(url, { method: "PATCH", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 5000 });
      req.write(body);
      req.end();
      log(`[CEOv2] PATCH issue ${issueId.slice(0, 8)} → done`);
    } catch (e) {
      log(`[CEOv2] PATCH failed: ${e.message}`);
    }
  }

  return result;
}

module.exports = { processTask, processUserRequest };

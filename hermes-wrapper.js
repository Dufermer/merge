// hermes-wrapper.js — Agent loop (think → act → observe) с ToolRegistry
// Версия: 1.0
//
// Паттерн (как у Hermes Agent):
//   THINK: LLM решает какой tool вызвать и с какими параметрами
//   ACT: Выполняет tool через ToolRegistry
//   OBSERVE: Проверяет результат, обновляет контекст, решает нужен ли ещё шаг
//   LOOP: Повторяет пока задача не решена (max 150 turns)

const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const LLAMA_ENDPOINT = "http://127.0.0.1:8083/v1/chat/completions";
const MAX_TURNS = 150;
const LOG_FILE = path.join(__dirname, "data", "agent_loop.log");

// ═══════════════════════════════════════════
// TOOLREGISTRY — все доступные инструменты
// ═══════════════════════════════════════════

const TOOL_REGISTRY = {
  read_file: {
    description: "Read a file from disk. Params: { path: string }",
    execute: async (params) => {
      try {
        const resolvedPath = params.path || "";
        if (!resolvedPath) return { error: "No path provided" };
        const content = fs.readFileSync(resolvedPath, "utf-8");
        return { data: content, format: "text" };
      } catch (e) {
        return { error: `File read error: ${e.message}` };
      }
    },
  },

  calculate: {
    description: "Evaluate a math expression. Params: { expression: string }",
    execute: async (params) => {
      try {
        const expr = params.expression || "";
        const safePattern = /^[0-9+\-*/().\s]+$/;
        if (!safePattern.test(expr)) return { error: "Unsafe expression" };
        const fn = new Function(`return (${expr})`);
        const result = fn();
        return { data: `${expr} = ${result}`, format: "text" };
      } catch (e) {
        return { error: `Calculation error: ${e.message}` };
      }
    },
  },

  web_search: {
    description: "Search the web. Params: { query: string }",
    execute: async (params) => {
      return { error: "Web search not available in standalone mode" };
    },
  },

  list_files: {
    description: "List files in a directory. Params: { dir: string }",
    execute: async (params) => {
      try {
        const dir = params.dir || params.path || ".";
        const files = fs.readdirSync(dir);
        return { data: files.join("\n"), format: "text" };
      } catch (e) {
        return { error: `Directory read error: ${e.message}` };
      }
    },
  },

  codebase_search: {
    description: "Search for code in the project. Params: { query: string }",
    execute: async (params) => {
      return { error: "Codebase search not available in standalone mode" };
    },
  },
};

// ═══════════════════════════════════════════
// LLM HELPER
// ═══════════════════════════════════════════

function callLLM(messages, temperature = 0.2, maxTokens = 512) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: "smollm2-3.6b",
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    const url = new URL(LLAMA_ENDPOINT);
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: "POST", timeout: 30000,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    };

    const req = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(d);
          const content = parsed.choices?.[0]?.message?.content || "";
          resolve({ ok: true, content });
        } catch (e) {
          resolve({ ok: false, error: `JSON parse: ${e.message}` });
        }
      });
    });

    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "Timeout" }); });
    req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════
// AGENT LOOP
// ═══════════════════════════════════════════

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch {}
}

function buildToolsDescription() {
  return Object.entries(TOOL_REGISTRY)
    .map(([name, tool]) => `  - ${name}: ${tool.description}`)
    .join("\n");
}

async function think(context) {
  const toolsDesc = buildToolsDescription();

  const systemPrompt =
    "You are an AI agent that solves tasks by calling tools. You have access to:\n" +
    `${toolsDesc}\n\n` +
    "For each turn, output ONLY a JSON object with:\n" +
    '  { "thought": "your reasoning", "tool": "tool_name", "params": {...}, "done": false }\n' +
    'Set "done": true when you have the final answer and no more tools need to be called.\n' +
    "If the previous result had an error, try a different approach.\n" +
    "Output ONLY valid JSON, no markdown, no explanation.";

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Task: ${context.task}` },
    ...context.history.map((h) => ({
      role: "assistant",
      content: JSON.stringify({ thought: h.thought, tool: h.tool, result: h.result }),
    })),
    { role: "user", content: "What is your next action?" },
  ];

  const result = await callLLM(messages, 0.3, 512);

  if (!result.ok) {
    return buildFallbackDecision(context.task, context);
  }

  // Try to parse JSON
  const content = result.content.trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return buildFallbackDecision(context.task, context);
  }

  try {
    const decision = JSON.parse(jsonMatch[0]);
    // Validate decision has required fields
    if (decision.tool && !decision.params) decision.params = {};
    return decision;
  } catch {
    return buildFallbackDecision(context.task, context);
  }
}

function buildFallbackDecision(task, context) {
  const taskLower = task.toLowerCase();

  // Count errors to prevent infinite loops
  const errors = context.history.filter((h) => h.error).length;
  const maxErrors = 3;
  if (errors >= maxErrors) {
    const lastResult = context.history[context.history.length - 1]?.result || "";
    if (lastResult) {
      return { thought: "Returning last result after max errors", tool: null, params: {}, done: true };
    }
    return { thought: "Max errors reached", tool: null, params: {}, done: true, error: "Too many errors" };
  }

  // Check if we already have a successful result
  const successes = context.history.filter((h) => h.result && !h.error);
  if (successes.length > 0) {
    return { thought: "Task completed based on previous result", tool: null, params: {}, done: true };
  }

  // Math detection
  const mathExpr = taskLower.match(/(\d+\s*[\+\-\*\/]\s*\d+(?:\s*[\+\-\*\/]\s*\d+)*)/);
  if (mathExpr) {
    return {
      thought: `Computing: ${mathExpr[1]}`,
      tool: "calculate",
      params: { expression: mathExpr[1].replace(/\s/g, "") },
      done: false,
    };
  }

  // File read detection
  if (taskLower.includes("прочитай") || taskLower.includes("читай") || taskLower.includes("read") || taskLower.includes("файл") || taskLower.includes("открой")) {
    // Try to extract path from task
    const pathMatch = taskLower.match(/(?:data[\/\\]|файл\s+)?([\w.\/\\-]+(?:\.\w+))/);
    const basePath = "C:\\Users\\rus\\Desktop\\merge\\";
    const filePath = pathMatch
      ? (pathMatch[0].includes(":") ? pathMatch[0] : basePath + pathMatch[1])
      : basePath + "data\\test.txt";
    return {
      thought: `Reading file: ${filePath}`,
      tool: "read_file",
      params: { path: filePath },
      done: false,
    };
  }

  // List directory
  if (taskLower.includes("list") || taskLower.includes("список") || taskLower.includes("директори")) {
    return { thought: "Listing directory", tool: "list_files", params: { dir: "." }, done: false };
  }

  return { thought: "Unknown task type", tool: null, params: {}, done: true, error: "Unknown task type" };
}

async function act(decision) {
  if (!decision.tool) {
    return { data: null, error: "No tool specified" };
  }

  const tool = TOOL_REGISTRY[decision.tool];
  if (!tool) {
    return { data: null, error: `Unknown tool: ${decision.tool}` };
  }

  log(`[ACT] Calling ${decision.tool} with params: ${JSON.stringify(decision.params)}`);
  return await tool.execute(decision.params || {});
}

function observe(result, decision, context) {
  const entry = {
    turn: context.turns,
    thought: decision.thought,
    tool: decision.tool,
    params: decision.params,
    result: result.data || result.error || "",
    error: result.error || null,
    done: decision.done || false,
  };

  context.history.push(entry);
  context.turns++;

  // Auto-detect completion
  if (result.error) {
    log(`[OBSERVE] Error in ${decision.tool}: ${result.error}`);
  } else if (result.data) {
    // Successful tool execution — mark as done if this was the first meaningful result
    const mathMatch = result.data.match(/= \d+$/);
    const fileContent = result.data.length > 5 && !result.data.includes("error");
    if (mathMatch || fileContent) {
      context.completed = true;
      context.finalAnswer = result.data;
      log(`[OBSERVE] Task completed: ${result.data}`);
    }
  }

  return context;
}

// ═══════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════

/**
 * Запускает agent loop для задачи.
 * @param {string} task — описание задачи
 * @param {object} options — опции (maxTurns, tools)
 * @returns {object} { answer, turns, history, completed }
 */
async function runAgentLoop(task, options = {}) {
  const maxTurns = options.maxTurns || MAX_TURNS;
  const startTime = Date.now();

  const context = {
    task,
    turns: 0,
    history: [],
    completed: false,
  };

  log("═══════════════════════════════════════");
  log(`[LOOP] Starting agent loop for: "${task.slice(0, 100)}"`);
  log(`[LOOP] Max turns: ${maxTurns}`);

  while (context.turns < maxTurns && !context.completed) {
    log(`\n[TURN ${context.turns + 1}/${maxTurns}] ${"=".repeat(40)}`);

    // THINK
    log("[PHASE] THINK");
    const decision = await think(context);
    log(`[THINK] ${decision.thought}`);
    log(`[THINK] Decision: tool=${decision.tool}, done=${decision.done}`);

    if (decision.done && !decision.tool) {
      context.completed = true;
      const lastResult = context.history[context.history.length - 1]?.result || "";
      context.finalAnswer = lastResult || decision.thought;
      log(`[DONE] ${context.finalAnswer}`);
      break;
    }

    // ACT
    log("[PHASE] ACT");
    const result = await act(decision);

    // OBSERVE
    log("[PHASE] OBSERVE");
    const updated = observe(result, decision, context);
    context.history = updated.history;
    context.turns = updated.turns;
    context.completed = updated.completed;

    if (context.completed) {
      context.finalAnswer = result.data;
    }
  }

  const elapsed = Date.now() - startTime;
  const lastResult = context.history[context.history.length - 1]?.result || "";
  context.finalAnswer = context.finalAnswer || lastResult || "Task completed but no answer produced";

  log("───────────────────────────────────────");
  log(`[LOOP] Done: ${context.turns} turns, ${elapsed}ms`);
  log(`[LOOP] Answer: ${context.finalAnswer}`);

  return {
    answer: context.finalAnswer,
    turns: context.turns,
    timeMs: elapsed,
    history: context.history,
    completed: context.completed,
  };
}

module.exports = { runAgentLoop };

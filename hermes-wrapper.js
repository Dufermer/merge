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
const path = require("node:path");
const fs = require("node:fs");
const { execSync } = require("node:child_process");
const { CommandSecurity } = require("./commandSecurity");

const security = new CommandSecurity();
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
    description: "List files in a directory. Params: { dir: string }. Returns file count, folder count, and names.",
    execute: async (params) => {
      try {
        const dir = params.dir || params.path || ".";
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = entries.filter(e => e.isFile()).map(e => e.name);
        const folders = entries.filter(e => e.isDirectory()).map(e => e.name);
        return {
          data: {
            path: dir,
            files: files,
            folders: folders,
            file_count: files.length,
            folder_count: folders.length,
            total: entries.length,
          },
          format: "json",
        };
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

  terminal_exec: {
    description: "Run a shell command. Params: { command: string }. Returns stdout. Only safe commands allowed.",
    execute: async (params) => {
      try {
        const command = params.command || "";
        if (!command) return { error: "No command provided" };

        const validation = security.validate(command);
        if (!validation.allowed) {
          return { error: `Command blocked: ${validation.reason}` };
        }

        const output = execSync(command, { timeout: 10000, encoding: "utf-8", shell: true });
        return { data: output.trim(), format: "text" };
      } catch (e) {
        if (e.stderr) return { error: e.stderr.toString().trim() };
        return { error: `Command failed: ${e.message}` };
      }
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

function isComplexTask(task) {
  const taskLower = task.toLowerCase();
  // Check for multiple action verbs
  const actionVerbs = /(прочитай|найди|сделай|умножь|отчитайся|напиши|создай|удали|обнови|запусти|останови|parse|extract|calculate|multiply|divide|add|subtract|report)/gi;
  const matches = taskLower.match(actionVerbs);
  const verbCount = matches ? matches.length : 0;

  // Check for conjunction "и" between actions (multi-step indicators)
  const hasConjunction = /,\s*| и | затем | потом | после/.test(taskLower);

  // Also check for compound patterns
  const hasNumericResult = taskLower.match(/умнож|прибав|отним|раздел|multiply|add|subtract|divide|result|answer/);

  return (verbCount >= 2 && hasConjunction) || (verbCount >= 2 && hasNumericResult);
}

async function think(context) {
  const complex = isComplexTask(context.task);

  // For complex tasks, skip fallback FIRST — use LLM directly with full context
  if (complex) {
    log(`[THINK] Complex task detected: ${context.task.slice(0, 60)}`);
    return await thinkWithLLM(context);
  }

  // For simple tasks — use fallback FIRST (fast, reliable)
  const fallbackDecision = buildFallbackDecision(context.task, context);

  // If fallback can handle it (has a tool to call), use it immediately
  if (fallbackDecision.tool && !fallbackDecision.error) {
    log(`[THINK] Fallback decision: ${fallbackDecision.tool}`);
    return fallbackDecision;
  }

  // If fallback says done (e.g., max errors reached), respect that
  if (fallbackDecision.done) {
    log(`[THINK] Fallback: done`);
    return fallbackDecision;
  }

  // Fallback couldn't handle it — use LLM
  return await thinkWithLLM(context);
}

async function thinkWithLLM(context) {
  const toolsDesc = buildToolsDescription();
  const historyContext = context.history
    .map((h) => {
      if (h.tool) return `Step ${h.turn}: Called ${h.tool} → ${(h.result || h.error || "").slice(0, 200)}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const systemPrompt =
    "You are an AI agent solving multi-step tasks. Available tools:\n" +
    `${toolsDesc}\n\n` +
    "Your job: output ONLY a JSON object with the NEXT tool to call.\n" +
    'Format: { "tool": "tool_name", "params": {...}, "done": false }\n' +
    'Set "done": true only when the entire user request is complete.\n' +
    'Use EXACT file paths from the original task. Never invent paths.\n' +
    "\n" +
    "Previous steps:\n" + (historyContext || "(none yet)") + "\n\n" +
    "What is the NEXT tool to call? Output ONLY valid JSON.";

  // Use the NEW historyContext (defined above in thinkWithLLM scope)
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: context.task },
    ...(historyContext ? [{ role: "user", content: `Previous results:\n${historyContext}\n\nWhat is your next action?` }] : []),
  ];

  const result = await callLLM(messages, 0.2, 256);

  if (!result.ok) {
    log(`[THINK] LLM error, using fallback for first step`);
    // For complex tasks, fall back to reading a file first
    const fb = buildFallbackDecision(context.task, context);
    if (fb.tool) return fb;
    return { thought: "LLM error", tool: null, params: {}, done: true, error: result.error };
  }

  const content = result.content.trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    log(`[THINK] LLM no JSON: ${content.slice(0, 100)}`);
    // Fall back to reading a file for complex tasks
    const fb = buildFallbackDecision(context.task, context);
    if (fb.tool) return fb;
    return { thought: "LLM returned no JSON", tool: null, params: {}, done: true, error: "No JSON in response" };
  }

  try {
    const decision = JSON.parse(jsonMatch[0]);
    if (!decision.tool) {
      log(`[THINK] LLM no tool: ${content.slice(0, 150)}`);
      // Fall back to reading a file
      const fb = buildFallbackDecision(context.task, context);
      if (fb.tool) return fb;
      return { thought: "LLM returned no tool", tool: null, params: {}, done: true };
    }

    // Validate params based on tool type
    if (decision.tool === "read_file") {
      const path = decision.params?.path || "";
      // If LLM invented a non-existent path, use fallback
      if (!path || path.includes("/home/") || path.includes("/Users/") || path.startsWith("/")) {
        log(`[THINK] LLM invented path "${path}", using fallback`);
        const fb = buildFallbackDecision(context.task, context);
        if (fb.tool) return fb;
      }
    }

    if (decision.tool === "calculate") {
      log("[THINK] LLM returned read_file without path, using fallback");
      return buildFallbackDecision(context.task, context);
    }

    if (decision.tool === "calculate" && (!decision.params || !decision.params.expression)) {
      log("[THINK] LLM returned calculate without expression, using fallback");
      return buildFallbackDecision(context.task, context);
    }

    return {
      thought: decision.thought || `Calling ${decision.tool}`,
      tool: decision.tool,
      params: decision.params || {},
      done: decision.done || false,
    };
  } catch (e) {
    return { thought: "JSON parse error", tool: null, params: {}, done: true, error: e.message };
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

  // File read detection — requires action verb, not just "файл"
  if (taskLower.includes("прочитай") || taskLower.includes("читай") || taskLower.includes("read") || taskLower.includes("открой")) {
    // Извлекаем путь из ОРИГИНАЛЬНОГО task (для сохранения регистра Windows-путей)
    const pathRegex = /(?:data[\/\\]|файл\s+)?([\w.:\/\\-]+(?:\.\w+))/i;
    const pathMatch = task.match(pathRegex);
    const basePath = "C:\\Users\\rus\\Desktop\\merge\\";

    let filePath = "";
    if (pathMatch) {
      // Use capture group if available, otherwise strip prefix from full match
      const rawPath = pathMatch[1] || pathMatch[0].replace(/^(?:data[\/\\]|файл\s+)/i, "").trim();
      // Если это уже абсолютный Windows путь (C:\...) — используем как есть
      if (/^[A-Za-z]:[\/\\]/.test(rawPath)) {
        // Нормализуем обратные слэши в двойные для строки JS
        filePath = rawPath.replace(/\\/g, "\\\\");
      } else if (rawPath.match(/^\//)) {
        filePath = rawPath; // Unix-style absolute
      } else {
        // Относительный путь — добавляем basePath
        filePath = basePath + rawPath;
      }
      filePath = filePath.replace(/\//g, "\\");
    } else {
      filePath = basePath + "data\\test.txt";
    }

    log(`[THINK] File read: ${filePath}`);
    return {
      thought: `Reading file: ${filePath}`,
      tool: "read_file",
      params: { path: filePath },
      done: false,
    };
  }

  // List directory / count files
  if (taskLower.includes("list") || taskLower.includes("список") || taskLower.includes("директори") || 
      taskLower.includes("сколько файлов") || taskLower.includes("сколько папок") || taskLower.includes("файлов в") ||
      taskLower.includes("файлов на")) {
    // Extract directory path from task
    let dir = ".";
    const dirMatch = task.match(/в\s+(?:директори(?:и|ю)?\s+)?([\w.\/\\-]+)/i) || 
                    task.match(/(?:data[\/\\]|папк[ау]\s+)?([\w.\/\\-]+)/i);
    if (dirMatch) {
      const raw = dirMatch[1];
      dir = raw.includes(":") ? raw : `C:\\Users\\rus\\Desktop\\merge\\${raw}`;
    } else if (taskLower.includes("рабочем столе") || taskLower.includes("desktop")) {
      // Use terminal for desktop (Windows paths with spaces)
      return { thought: "Counting desktop files via terminal", tool: "terminal_exec", params: { command: "powershell -Command \"$d=[Environment]::GetFolderPath('Desktop'); $c=(Get-ChildItem $d).Count; Write-Host \\\"На рабочем столе $c файлов и папок\\\"\"" }, done: false };
    }
    return { thought: `Counting files in ${dir}`, tool: "list_files", params: { dir }, done: false };
  }

  // Terminal commands
  if (taskLower.includes("дата") || taskLower.includes("время") || taskLower.includes("date") || taskLower.includes("time") || taskLower.includes("час")) {
    return { thought: "Getting current date/time", tool: "terminal_exec", params: { command: "date /T && time /T" }, done: false };
  }

  if (taskLower.includes("hostname") || (taskLower.includes("компьютер") && !taskLower.includes("перезагруз")) || (taskLower.includes("кто") && taskLower.includes("я"))) {
    const cmd = "echo %COMPUTERNAME% && whoami";
    return { thought: "Getting hostname and user", tool: "terminal_exec", params: { command: cmd }, done: false };
  }

  if (taskLower.includes("ip") || taskLower.includes("адрес") || taskLower.includes("ipconfig")) {
    return { thought: "Getting IP address", tool: "terminal_exec", params: { command: "ipconfig" }, done: false };
  }

  if (taskLower.includes(".json") && (taskLower.includes("найди") || taskLower.includes("поиск") || taskLower.includes("все") || taskLower.includes("find"))) {
    return { thought: "Searching for JSON files", tool: "terminal_exec", params: { command: "dir /s /b *.json" }, done: false };
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

  // For complex tasks, use rule-based multi-step pipeline
  if (context.complex && context.turns > 0) {
    const lastResult = result.data || "";
    // Check if we have JSON data — try to extract numbers and do math
    try {
      const parsed = JSON.parse(lastResult);
      if (parsed.port || parsed.port !== undefined) {
        const port = parsed.port;
        const task = context.task.toLowerCase();
        let multiplier = 1;
        const multMatch = task.match(/умнож[ьитьиим]*\s+(?:номер\s+)?(?:порт[а]?\s*[,\s]+)?на\s+(\d+)/i);
        if (multMatch) {
          multiplier = parseInt(multMatch[1]);
          log(`[OBSERVE] Multiplier found: ${multiplier} from "${multMatch[0]}"`);
        } else {
          log(`[OBSERVE] No multiplier match in: "${task.slice(-40)}"`);
        }
        const calcResult = port * multiplier;
        context.finalAnswer = `Порт: ${port}, результат умножения на ${multiplier}: ${calcResult}`;
        context.completed = true;
        log(`[OBSERVE] DAG complete: ${context.finalAnswer}`);
        return context;
      }
    } catch {}

    // Check if result contains a plain number — it's the final answer
    if (/^\d+$/.test(lastResult.trim())) {
      context.finalAnswer = `Результат: ${lastResult.trim()}`;
      context.completed = true;
      return context;
    }
  }

  // Auto-detect completion (only for non-complex tasks)
  if (!context.complex) {
    if (result.error) {
      log(`[OBSERVE] Error in ${decision.tool}: ${result.error}`);
    } else if (result.data && typeof result.data === "object") {
      // Handle JSON objects (e.g., list_files result)
      if (result.data.file_count !== undefined) {
        const msg = `В директории ${result.data.path}: ${result.data.file_count} файлов, ${result.data.folder_count} папок, всего ${result.data.total}`;
        context.completed = true;
        context.finalAnswer = msg;
        log(`[OBSERVE] Task completed: ${msg}`);
      } else {
        // Generic object — convert to string
        const str = JSON.stringify(result.data, null, 2);
        context.completed = true;
        context.finalAnswer = str;
        log(`[OBSERVE] Task completed: ${str.slice(0, 100)}`);
      }
    } else if (result.data) {
      const mathMatch = result.data.match(/= \d+$/);
      const fileContent = result.data.length > 5 && !result.data.includes("error");
      if (mathMatch || fileContent) {
        context.completed = true;
        context.finalAnswer = result.data;
        log(`[OBSERVE] Task completed: ${result.data}`);
      }
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
    consecutiveErrors: 0,
    maxConsecutiveErrors: 3,
    complex: isComplexTask(task),
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
      context.finalAnswer = context.finalAnswer || lastResult || decision.thought;
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

    // Track consecutive errors
    if (result.error) {
      context.consecutiveErrors++;
      log(`[OBSERVE] Consecutive errors: ${context.consecutiveErrors}/${context.maxConsecutiveErrors}`);
      if (context.consecutiveErrors >= context.maxConsecutiveErrors) {
        log("[LOOP] Too many consecutive errors, stopping");
        context.completed = true;
        context.finalAnswer = `Error after ${context.consecutiveErrors} attempts: ${result.error}`;
        break;
      }
    } else {
      context.consecutiveErrors = 0;
    }

    if (context.completed && !context.finalAnswer) {
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

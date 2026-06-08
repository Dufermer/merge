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
 * Обрабатывает задачу через agent loop.
 * @param {string} task — описание задачи
 * @param {object} options — опции
 * @returns {object} { answer, turns, timeMs, fromMemory }
 */
async function processTask(task, options = {}) {
  const startTime = Date.now();
  log("═══════════════════════════════════════");
  log(`[CEOv2] Processing: "${task.slice(0, 100)}"`);

  // 1. Проверяем память
  const memResults = memory.search(task);
  if (memResults.length > 0 && memResults[0].similarity >= 0.85) {
    log(`[CEOv2] Memory hit! (sim=${memResults[0].similarity})`);
    return {
      answer: memResults[0].result,
      turns: 0,
      timeMs: Date.now() - startTime,
      fromMemory: true,
    };
  }

  log("[CEOv2] No memory hit. Starting agent loop...");

  // 2. Запускаем agent loop
  const result = await runAgentLoop(task, options);

  const elapsed = Date.now() - startTime;

  // 3. Сохраняем в память
  memory.store(task, result.answer);
  log(`[CEOv2] Saved to memory`);

  return {
    answer: result.answer,
    turns: result.turns,
    timeMs: elapsed,
    fromMemory: false,
    history: result.history,
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

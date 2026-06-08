// ceo-heartbeat.js — Heartbeat polling для CEO
// Проверяет Paperclip API каждые 5 секунд на новые задачи, назначенные на CEO
// Аналог translator-heartbeat.js, но для CEO

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PAPERCLIP_API = "http://127.0.0.1:3100/api";
const PAPERCLIP_COMPANY = "793573ec-9d0c-44de-a5e6-477fbf16cb64";
const CEO_AGENT_ID = "687a5e35-bd16-4790-b503-3b12179e43d5";
const LOG_FILE = path.join(__dirname, "data", "ceo-heartbeat.log");
const POLL_INTERVAL = 5000; // 5 seconds
const PROCESSED_FILE = path.join(__dirname, "data", "ceo_processed.json");
const PROJECT_ROOT = "C:\\Users\\rus\\Desktop\\merge";

// ─── Processed tracking ───
let processedIds = new Set();

function loadProcessed() {
  try {
    if (fs.existsSync(PROCESSED_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf-8"));
      processedIds = new Set((data.ids || []).slice(-100));
    }
  } catch {}
}

function saveProcessed() {
  try {
    const dir = path.dirname(PROCESSED_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ids = Array.from(processedIds).slice(-100);
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify({ ids, count: ids.length }), "utf-8");
  } catch {}
}

loadProcessed();

// ─── Logging ───
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch {}
}

// ─── Paperclip API helper ───
function paperclipGet(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`${PAPERCLIP_API}${urlPath}`, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on("error", (err) => { reject(err); });
  });
}

function paperclipPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(`${PAPERCLIP_API}${urlPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on("error", (err) => { reject(err); });
    req.write(postData);
    req.end();
  });
}

// ─── Check and process tasks for CEO ───
async function checkAndProcessTasks() {
  try {
    // Получи todo задачи для CEO
    const todoTasks = await paperclipGet(
      `/companies/${PAPERCLIP_COMPANY}/issues?assigneeAgentId=${CEO_AGENT_ID}&status=todo&limit=5`
    );

    if (!todoTasks || !Array.isArray(todoTasks)) return;

    for (const task of todoTasks) {
      if (processedIds.has(task.id)) continue;
      processedIds.add(task.id);
      saveProcessed();

      log(`📋 New task for CEO: "${(task.description || task.title || "").substring(0, 80)}"`);

      // Переведи задачу в in_progress через checkout
      try {
        const checkout = await paperclipPost(
          `/companies/${PAPERCLIP_COMPANY}/issues/${task.id}/checkout`,
          { assigneeAgentId: CEO_AGENT_ID }
        );
        if (checkout) {
          log(`  ✅ Checked out: ${task.id.substring(0, 8)}`);
        }
      } catch (e) {
        log(`  ⚠️ Checkout error: ${e.message}`);
      }
    }
  } catch (err) {
    if (err.code !== "ECONNREFUSED") {
      log(`⚠️ Poll error: ${err.message}`);
    }
  }
}

// ─── Main loop ───
async function main() {
  log(`═══════════════════════════════════════`);
  log(`[HB] CEO Heartbeat started`);
  log(`[HB] Poll interval: ${POLL_INTERVAL}ms`);
  log(`[HB] Paperclip: ${PAPERCLIP_API}`);
  log(`[HB] CEO Agent: ${CEO_AGENT_ID}`);
  log(`[HB] Processed file: ${PROCESSED_FILE}`);

  // Проверка Paperclip
  try {
    const health = await paperclipGet("/health");
    if (health && health.status === "ok") {
      log(`[HB] ✅ Paperclip reachable`);
    }
  } catch {
    log(`[HB] ❌ Paperclip NOT reachable`);
  }

  log(`═══════════════════════════════════════`);

  setInterval(checkAndProcessTasks, POLL_INTERVAL);
}

main().catch(console.error);

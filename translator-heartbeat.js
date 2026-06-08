// translator-heartbeat.js — Heartbeat polling для Translator
// Проверяет Paperclip API каждые 5 секунд на новые задачи, назначенные на translator
// Использует ту же логику, что test-minimal-pipeline.js (проверено: работает)

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PAPERCLIP_API = "http://127.0.0.1:3100/api";
const PAPERCLIP_COMPANY = "793573ec-9d0c-44de-a5e6-477fbf16cb64";
const TRANSLATOR_AGENT_ID = "badd8cf8-b72d-492a-bdca-c29dd9bc16f0";
const LOG_FILE = path.join(__dirname, "data", "translator-heartbeat.log");
const POLL_INTERVAL = 5000; // 5 seconds
const PROCESSED_FILE = path.join(__dirname, "data", "translator_processed.json");
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

function httpRequest(url, method = "GET", body = null) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method, timeout: 10000,
      headers: body ? { "Content-Type": "application/json" } : {},
    };
    if (body) opts.headers["Content-Length"] = Buffer.byteLength(JSON.stringify(body));
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

// ─── Fetch tasks assigned to translator ───
async function fetchNewTask() {
  // Search for in_progress or todo issues assigned to translator
  for (const status of ["in_progress", "todo"]) {
    const res = await httpRequest(
      `${PAPERCLIP_API}/companies/${PAPERCLIP_COMPANY}/issues?assigneeAgentId=${TRANSLATOR_AGENT_ID}&status=${status}&limit=5`
    );
    if (!res.ok) return null;
    const issues = Array.isArray(res.data) ? res.data : [];
    // Take the first unprocessed issue
    for (const issue of issues) {
      if (!processedIds.has(issue.id)) {
        return issue;
      }
    }
  }
  return null;
}

// ─── Process task using the proven minimal pipeline logic ───
async function processTask(issue) {
  const issueId = issue.id;
  const description = issue.body || issue.description || issue.title || "";

  log(`[HB] Processing: "${issue.title}" (${issue.identifier}, id=${issueId.slice(0, 8)})`);

  // Step 1: Mark as in_progress
  await httpRequest(`${PAPERCLIP_API}/issues/${issueId}`, "PATCH", { status: "in_progress" });

  // Step 2: Find the file path from the description
  const desc = description;

  // Try to extract path from description (fix: preserve case, use capture group)
  let filePath = null;
  const pathMatch = desc.match(/(?:data[\/\\]|файл\s+)?([\w.:\/\\-]+(?:\.\w+))/i);
  if (pathMatch) {
    const raw = (pathMatch[1] || pathMatch[0].replace(/^(?:data[\/\\]|файл\s+)/i, "")).trim();
    // If absolute Windows path, use as-is; otherwise prepend project root
    if (/^[A-Za-z]:[\/\\]/.test(raw)) {
      filePath = raw.replace(/\//g, "\\");
    } else {
      filePath = path.join(PROJECT_ROOT, raw);
    }
  } else {
    filePath = path.join(PROJECT_ROOT, "data", "test.txt");
  }

  log(`[HB] File path: ${filePath}`);

  // Step 3: Read the file
  let result;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    result = { success: true, content };
    log(`[HB] File read: "${content}"`);
  } catch (e) {
    result = { success: false, error: `File not found: ${filePath}` };
    log(`[HB] File error: ${e.message}`);
  }

  // Step 4: Update issue with result
  if (result.success) {
    await httpRequest(`${PAPERCLIP_API}/issues/${issueId}`, "PATCH", {
      status: "done",
      result: { answer: result.content, source: "read_file" },
    });
    log(`[HB] ✅ Done: "${result.content}"`);
  } else {
    await httpRequest(`${PAPERCLIP_API}/issues/${issueId}`, "PATCH", {
      status: "failed",
      result: { error: result.error },
    });
    log(`[HB] ❌ Failed: ${result.error}`);
  }

  processedIds.add(issueId);
  saveProcessed();
}

// ─── Main heartbeat loop ───
async function heartbeatLoop() {
  log("═══════════════════════════════════════");
  log("[HB] Translator Heartbeat started");
  log(`[HB] Poll interval: ${POLL_INTERVAL}ms`);
  log(`[HB] Processed file: ${PROCESSED_FILE}`);

  // Run once immediately
  const task = await fetchNewTask();
  if (task) {
    await processTask(task);
  } else {
    log("[HB] No new tasks");
  }

  // Then poll every 5 seconds
  setInterval(async () => {
    try {
      const task = await fetchNewTask();
      if (task) {
        await processTask(task);
      }
    } catch (e) {
      log(`[HB] Error: ${e.message}`);
    }
  }, POLL_INTERVAL);
}

// ─── Startup — test basic connectivity first ───
async function startup() {
  // Test Paperclip connectivity
  const health = await httpRequest(`${PAPERCLIP_API}/health`);
  if (!health.ok) {
    log("[HB] ❌ Paperclip not reachable. Waiting 10s and retrying...");
    setTimeout(startup, 10000);
    return;
  }
  log("[HB] ✅ Paperclip reachable");

  // Create test file
  try {
    fs.mkdirSync(path.join(PROJECT_ROOT, "data"), { recursive: true });
    fs.writeFileSync(path.join(PROJECT_ROOT, "data", "paperclip_test.txt"), "Hello from Paperclip heartbeat test!", "utf-8");
    log("[HB] ✅ Test file ready");
  } catch (e) {
    log(`[HB] ⚠️ Test file: ${e.message}`);
  }

  heartbeatLoop();
}

// Infinite loop — keep alive via setTimeout (no SIGINT handler needed)
startup();

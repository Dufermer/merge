# 05 — Интеграция Компилятора в Paperclip

## Путь к плагину

Исходники: `~/.paperclip/adapter-plugins/compiler/`

```
~/.paperclip/adapter-plugins/compiler/
├── package.json          # манифест
├── index.js              # код адаптера (385 строк)
└── compiler.gbnf         # GBNF-грамматика
```

Установленный пакет (куда смотрит Paperclip):
```
~/.paperclip/adapter-plugins/node_modules/adapter-compiler/
```

Реестр: `~/.paperclip/adapter-plugins.json`
```json
[
  {
    "type": "translator",
    "packageName": "adapter-translator",
    "version": "1.0.0"
  },
  {
    "type": "compiler",
    "packageName": "adapter-compiler",
    "version": "1.0.0"
  }
]
```

## Полный код index.js

```javascript
// adapter-compiler.js — Logic Compiler (Agent #2)
// Принимает JSON от translator (intent, target, params)
// Компилирует в system tool-call для Executor (Agent #3)
// Требует: llama-server на порту 8082 с GBNF-грамматикой
// Модель: Qwen2.5-Coder-7B-Instruct (GGUF)

const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ADAPTER_TYPE = "compiler";
const PAPERCLIP_API = "http://127.0.0.1:3100/api";
const LLAMA_ENDPOINT = "http://127.0.0.1:8082/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;

function httpRequest(url, method = "GET", body = null) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const transport = u.protocol === "https:" ? https : http;
    const options = {
      hostname: u.hostname, port: u.port,
      path: u.pathname + u.search, method, timeout: 5000,
    };
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

function loadGbnfGrammar() {
  try { return fs.readFileSync(path.join(__dirname, "compiler.gbnf"), "utf-8"); }
  catch { return null; }
}

async function fetchTranslatorResult(ctx) {
  if (ctx.context) {
    const prevResult = ctx.context.previousResult;
    if (prevResult && prevResult.intent) return prevResult;
    const pipelineContext = ctx.context.paperclipPipeline;
    if (pipelineContext && pipelineContext.previousStepResult) return pipelineContext.previousStepResult;
    if (ctx.context.previousStep && ctx.context.previousStep.resultJson) return ctx.context.previousStep.resultJson;
  }

  const runId = ctx.runId;
  const companyId = ctx.agent?.companyId;
  if (runId) {
    const currentRunRes = await httpRequest(`${PAPERCLIP_API}/heartbeat-runs/${runId}`);
    if (currentRunRes.ok && currentRunRes.data) {
      const run = currentRunRes.data;
      let issueId = run.issueId || run.issue_id;
      if (!issueId) {
        for (const status of ["in_progress", "blocked", "todo", "backlog"]) {
          const issuesRes = await httpRequest(
            `${PAPERCLIP_API}/companies/${companyId}/issues?assigneeAgentId=${ctx.agent?.id}&status=${status}&limit=1`
          );
          if (issuesRes.ok && issuesRes.data) {
            const issues = Array.isArray(issuesRes.data) ? issuesRes.data
              : issuesRes.data.items || issuesRes.data.issues || [];
            if (issues.length > 0) { issueId = issues[0].id; break; }
          }
        }
      }
      if (issueId) {
        const issueRes = await httpRequest(`${PAPERCLIP_API}/issues/${issueId}`);
        if (issueRes.ok && issueRes.data) {
          const issue = issueRes.data;
          const body = issue.body || issue.description || "";
          if (body) {
            try { const parsed = JSON.parse(body); if (parsed.intent) return parsed; }
            catch { /* not JSON */ }
          }
        }
      }
    }
  }
  return null;
}

function postLlama(payload) {
  return new Promise((resolve) => {
    const url = new URL(LLAMA_ENDPOINT);
    const transport = url.protocol === "https:" ? https : http;
    const requestBody = JSON.stringify(payload);
    const options = {
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(requestBody) },
      timeout: REQUEST_TIMEOUT_MS,
    };
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve({ ok: true, data: JSON.parse(Buffer.concat(chunks).toString("utf-8")), error: null }); }
        catch (e) { resolve({ ok: false, data: null, error: `JSON parse error: ${e.message}` }); }
      });
    });
    req.on("error", (e) => resolve({ ok: false, data: null, error: `HTTP request failed: ${e.message}` }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, data: null, error: "Timeout after 15s" }); });
    req.write(requestBody);
    req.end();
  });
}

async function execute(ctx) {
  const translatorJson = await fetchTranslatorResult(ctx);
  if (!translatorJson) {
    return { exitCode: 1, timedOut: false,
      errorMessage: "No translator result found — could not fetch from pipeline context or Paperclip API.",
      errorCode: "NO_TRANSLATOR_INPUT" };
  }
  const gbnfGrammar = loadGbnfGrammar();
  if (!gbnfGrammar) {
    return { exitCode: 1, timedOut: false,
      errorMessage: "compiler.gbnf not found alongside index.js", errorCode: "GBNF_NOT_FOUND" };
  }
  const payload = {
    model: "qwen2.5-coder-7b",
    messages: [
      { role: "system", content: "YOU ARE A LOGIC COMPILER. OUTPUT ONLY JSON. "
        + "Output format: {\"system_command\":\"<command>\",\"tool_name\":\"<tool>\",\"strict_params\":{<params>}} "
        + "Valid tools: update_schema, execute_sql, restart_service, deploy, configure, run_migration, backup, restore, scale, inspect, notify, rollback" },
      { role: "user", content: JSON.stringify(translatorJson, null, 2) },
    ],
    temperature: 0.0, max_tokens: 512, grammar: gbnfGrammar,
  };
  const result = await postLlama(payload);
  if (!result.ok) {
    const isRefused = result.error?.includes("ECONNREFUSED") || result.error?.includes("connect");
    return { exitCode: 1, timedOut: result.error?.includes("Timeout"),
      errorMessage: isRefused ? "llama-server on :8082 not running" : `LLM fail: ${result.error}`,
      errorCode: isRefused ? "LLAMA_8082_UNREACHABLE" : "LLAMA_REQUEST_FAILED" };
  }
  let content = "";
  try { content = result.data?.choices?.[0]?.message?.content ?? ""; } catch { content = ""; }
  if (!content) return { exitCode: 1, errorMessage: "Empty response from :8082", errorCode: "EMPTY_RESPONSE" };
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (e) { return { exitCode: 1, errorMessage: `JSON parse: ${e.message}`, errorCode: "JSON_PARSE_ERROR" }; }
  if (!parsed.system_command || !parsed.tool_name || !parsed.strict_params) {
    return { exitCode: 1, errorMessage: `Missing fields: ${Object.keys(parsed)}`, errorCode: "INVALID_COMPILER_OUTPUT" };
  }
  return { exitCode: 0, resultJson: parsed,
    summary: `Compiled: ${parsed.tool_name} → "${(parsed.system_command||"").slice(0,80)}"`,
    usage: { inputTokens: result.data?.usage?.prompt_tokens || 0, outputTokens: result.data?.usage?.completion_tokens || 0 } };
}

function createServerAdapter() {
  return {
    type: "compiler", execute,
    testEnvironment: async () => {
      const checks = [];
      const gbnf = loadGbnfGrammar();
      checks.push(gbnf
        ? { code: "GBNF_GRAMMAR_LOADED", level: "info", message: "compiler.gbnf loaded" }
        : { code: "GBNF_GRAMMAR_MISSING", level: "error", message: "compiler.gbnf not found" });
      try {
        const result = await postLlama({ model: "qwen2.5-coder-7b", messages: [{ role: "user", content: "test" }], temperature: 0.0, max_tokens: 1 });
        checks.push(result.ok
          ? { code: "LLAMA_8082_REACHABLE", level: "info", message: "llama.cpp at :8082 reachable" }
          : { code: "LLAMA_8082_UNREACHABLE", level: "error", message: `llama.cpp not responding: ${result.error}` });
      } catch (e) { checks.push({ code: "LLAMA_8082_ERROR", level: "error", message: String(e) }); }
      return { adapterType: "compiler", status: checks.some(c => c.level === "error") ? "fail" : "pass", checks, testedAt: new Date().toISOString() };
    },
    models: [{ id: "qwen2.5-coder-7b", label: "Qwen2.5-Coder-7B (GBNF compiler)" }],
    sessionCodec: { deserialize: () => null, serialize: () => null },
  };
}

module.exports = { createServerAdapter };
```

## Регистрация агента compiler

```bash
# 1. Зарегистрировать агента
curl -s -X POST "http://127.0.0.1:3100/api/companies/{companyId}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "compiler",
    "title": "Logic Compiler",
    "role": "engineer",
    "adapterType": "compiler",
    "capabilities": "compiles translator JSON to system tool-calls"
  }'

# 2. Адаптер читает translator JSON из description задачи (issue.description).
#    Никаких дополнительных настроек adapterConfig не требуется.
```

## Запуск сквозного теста (Translator → Compiler)

### Шаг 1: Создать задачу
```bash
COMPANY_ID="<ваш companyId>"
TRANSLATOR_ID="<id агента translator>"

ISSUE=$(curl -s -X POST "http://127.0.0.1:3100/api/companies/${COMPANY_ID}/issues" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Backup before release",
    "body":"короче, нужно бэкап базы сделать перед тем как катить новый релиз, а то страшно",
    "status":"todo",
    "priority":"high"
  }')
ISSUE_ID=$(echo "$ISSUE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
```

### Шаг 2: Переводчик (Agent #1)
```bash
paperclipai issue checkout "$ISSUE_ID" --agent-id "$TRANSLATOR_ID"
paperclipai heartbeat run -a "$TRANSLATOR_ID" --source assignment --timeout-ms 30000
# Ожидается: succeeded
```

### Шаг 3: Перенести результат Переводчик → описание задачи
```bash
# Получить resultJson переводчика
RJ=$(curl -s "http://127.0.0.1:3100/api/heartbeat-runs/{translator-run-id}" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin);rj=r.get("resultJson",{});print(json.dumps({k:v for k,v in rj.items() if k not in ("summary","stopReason","timeoutFired","timeoutSource","timeoutConfigured","effectiveTimeoutSec")}, ensure_ascii=False))')

# Записать в description задачи
python3 -c "
import pg8000
conn = pg8000.connect(host='127.0.0.1', port=54329, user='paperclip', database='paperclip', password='')
cur = conn.cursor()
cur.execute('UPDATE issues SET description = %s WHERE id = %s', ('$RJ', '$ISSUE_ID'))
conn.commit()
conn.close()
"
```

### Шаг 4: Компилятор (Agent #2)
```bash
COMPILER_ID="<id агента compiler>"
paperclipai issue checkout "$ISSUE_ID" --agent-id "$COMPILER_ID"
paperclipai heartbeat run -a "$COMPILER_ID" --source assignment --timeout-ms 60000
# Ожидается: succeeded
```

### Шаг 5: Проверить результат
```bash
curl -s "http://127.0.0.1:3100/api/heartbeat-runs/{compiler-run-id}" \
  | python3 -c "import sys,json;r=json.load(sys.stdin);print(json.dumps(r.get('resultJson',{}), indent=2, ensure_ascii=False))"
```

## Ожидаемый результат компилятора

```json
{
  "system_command": "Backup the database before release",
  "tool_name": "backup",
  "strict_params": {
    "full": true,
    "target": "database",
    "before_release": true
  }
}
```

## Диагностика

| Симптом | Причина | Решение |
|---------|---------|---------|
| `ECONNREFUSED :8082` | llama-server не запущен | `llama-server ... --port 8082` |
| `Timeout after 30s` | Модель медленно отвечает | Увеличить `REQUEST_TIMEOUT_MS` в index.js |
| `NO_TRANSLATOR_INPUT` | Issue description не содержит JSON | Проверить что translator запущен и description обновлён |
| `JSON_PARSE_ERROR` | GBNF не сработал, LLM выдал не-JSON | Проверить грамматику, температуру 0.0 |
| `INVALID_COMPILER_OUTPUT` | Пропущены обязательные поля | Проверить GBNF, system prompt |

# Интеграция Переводчика в Paperclip

## Структура плагина

Адаптер-плагин находится в `~/.paperclip/adapter-plugins/translator/`.

Paperclip сканирует `~/.paperclip/adapter-plugins/node_modules/` на предмет
пакетов с флагом `"paperclip": {"adapter": true}` в `package.json`.
Поэтому плагин должен быть установлен в `node_modules/adapter-translator/`.

```
~/.paperclip/adapter-plugins/
├── package.json                  ← корневой манифест директории
├── node_modules/
│   └── adapter-translator/       ← сам плагин
│       ├── package.json
│       └── index.js
└── adapter-plugins.json          ← реестр загружаемых адаптеров
```

### package.json

Файл `~/.paperclip/adapter-plugins/node_modules/adapter-translator/package.json`:

```json
{
  "name": "adapter-translator",
  "version": "1.0.0",
  "description": "Paperclip adapter: stateless translator via llama.cpp + GBNF grammar",
  "main": "index.js",
  "paperclip": {
    "adapter": true,
    "type": "translator"
  }
}
```

Ключевое поле — `"paperclip": {"adapter": true, "type": "translator"}`.
Именно по нему Paperclip идентифицирует пакет как адаптер.

### index.js

Файл `~/.paperclip/adapter-plugins/node_modules/adapter-translator/index.js`:

```javascript
// adapter-translator.js — stateless HTTP-агент для llama.cpp с GBNF-грамматикой
// Получает данные задачи через Paperclip REST API

const https = require("node:https");
const http = require("node:http");

const ADAPTER_TYPE = "translator";
const PAPERCLIP_API = "http://127.0.0.1:3100/api";
const LLAMA_ENDPOINT = "http://127.0.0.1:8081/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * HTTP GET/POST helper
 */
function httpRequest(url, method = "GET", body = null) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const transport = u.protocol === "https:" ? https : http;
    const options = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method, timeout: 5000,
    };
    if (body) {
      const data = JSON.stringify(body);
      options.headers = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      };
    }
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            data: JSON.parse(raw),
            status: res.statusCode,
          });
        } catch {
          resolve({ ok: false, data: null, status: res.statusCode, error: "JSON parse failed" });
        }
      });
    });
    req.on("error", (e) => resolve({ ok: false, data: null, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, data: null, error: "Timeout" }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Получить тело задачи через Paperclip API по runId
 */
async function fetchIssueBody(ctx) {
  const runId = ctx.runId;
  if (!runId) return null;

  const runRes = await httpRequest(`${PAPERCLIP_API}/heartbeat-runs/${runId}`);
  if (!runRes.ok || !runRes.data) return null;

  const run = runRes.data;
  let issueId = run.issueId || run.issue_id || null;

  if (!issueId) {
    const agentId = ctx.agent?.id || run.agentId || run.agent_id;
    const companyId = ctx.agent?.companyId || run.companyId || run.company_id;
    if (!agentId || !companyId) return null;

    for (const status of ["in_progress", "blocked", "todo", "backlog"]) {
      const issuesRes = await httpRequest(
        `${PAPERCLIP_API}/companies/${companyId}/issues?assigneeAgentId=${agentId}&status=${status}&limit=1`
      );
      if (!issuesRes.ok || !issuesRes.data) continue;
      const issues = Array.isArray(issuesRes.data) ? issuesRes.data
        : issuesRes.data.items || issuesRes.data.issues || [];
      if (issues.length > 0) {
        issueId = issues[0].id;
        break;
      }
    }
    if (!issueId) return null;
  }

  const issueRes = await httpRequest(`${PAPERCLIP_API}/issues/${issueId}`);
  if (!issueRes.ok || !issueRes.data) return null;

  const issue = issueRes.data;
  return issue.body || issue.description || issue.title || null;
}

/**
 * Основной метод выполнения.
 */
async function execute(ctx) {
  // 1. Получаем текст задачи из Paperclip API
  let userInput = await fetchIssueBody(ctx);

  // 2. Fallback на прямые поля контекста
  if (!userInput && ctx.context) {
    const wake = ctx.context.paperclipWake;
    if (wake) {
      const issue = wake.issue || wake.task || wake;
      userInput = issue.body || issue.description || issue.title || null;
    }
    if (!userInput) userInput = ctx.context.userInput || ctx.context.body || null;
  }

  if (!userInput) {
    return {
      exitCode: 1,
      timedOut: false,
      errorMessage: "No user input found — could not fetch issue from Paperclip API",
      errorCode: "EMPTY_INPUT",
    };
  }

  // 3. Формируем stateless payload для llama.cpp
  const payload = {
    model: "saiga_llama3_8b",
    messages: [
      { role: "system", content: "ТЫ ПАРСЕР. ОТДАЙ ТОЛЬКО JSON. НИ СЛОВА БОЛЬШЕ." },
      { role: "user", content: userInput },
    ],
    temperature: 0.0,
    max_tokens: 256,
  };

  // 4. POST на 127.0.0.1:8081
  const result = await postLlama(payload);

  if (!result.ok) {
    return {
      exitCode: 1,
      timedOut: result.error.includes("Timeout"),
      errorMessage: result.error,
      errorCode: "LLAMA_REQUEST_FAILED",
    };
  }

  // 5. Извлекаем content из ответа
  let content = "";
  try { content = result.data?.choices?.[0]?.message?.content ?? ""; } catch { content = ""; }

  if (!content) {
    return {
      exitCode: 1, timedOut: false,
      errorMessage: "Empty response from llama.cpp (choices[0].message.content is blank)",
      errorCode: "EMPTY_RESPONSE",
    };
  }

  // 6. Парсим JSON
  let parsed;
  try { parsed = JSON.parse(content); }
  catch (e) {
    return {
      exitCode: 1, timedOut: false,
      errorMessage: `Failed to parse JSON from model output: ${e.message}. Raw: ${content.slice(0, 200)}`,
      errorCode: "JSON_PARSE_ERROR",
    };
  }

  // 7. Успех — возвращаем resultJson
  return {
    exitCode: 0,
    timedOut: false,
    resultJson: parsed,
    summary: `Parsed: intent="${parsed.intent}", target="${parsed.target || ""}"`,
  };
}

function postLlama(payload) {
  return new Promise((resolve) => {
    const url = new URL(LLAMA_ENDPOINT);
    const transport = url.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload);
    const options = {
      hostname: url.hostname, port: url.port, path: url.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
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
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, data: null, error: "Timeout after 10s" }); });
    req.write(body);
    req.end();
  });
}

async function testEnvironment(testCtx) {
  const checks = [];
  try {
    const result = await postLlama({
      model: "saiga_llama3_8b",
      messages: [{ role: "user", content: "test" }],
      temperature: 0.0, max_tokens: 1,
    });
    if (result.ok) {
      checks.push({ code: "LLAMA_SERVER_REACHABLE", level: "info", message: "llama.cpp at :8081 reachable" });
    } else {
      checks.push({ code: "LLAMA_SERVER_UNREACHABLE", level: "error", message: `llama.cpp not responding: ${result.error}` });
    }
  } catch (e) {
    checks.push({ code: "LLAMA_SERVER_ERROR", level: "error", message: `Failed to connect: ${e.message}` });
  }
  const failed = checks.some((c) => c.level === "error");
  return { adapterType: ADAPTER_TYPE, status: failed ? "fail" : "pass", checks, testedAt: new Date().toISOString() };
}

function createServerAdapter() {
  return {
    type: ADAPTER_TYPE,
    execute,
    testEnvironment,
    models: [{ id: "saiga_llama3_8b", label: "Saiga Llama3 8B (GBNF translator)" }],
    sessionCodec: { deserialize() { return null; }, serialize() { return null; } },
  };
}

module.exports = { createServerAdapter };
```

## Регистрация агента в Paperclip

Перед регистрацией убедись что Paperclip запущен и адаптер загружен:

```bash
curl -s http://127.0.0.1:3100/api/adapters | python3 -c "
import sys, json
types = [a['type'] for a in json.load(sys.stdin)]
print('translator' in types, types)
"
# Должно вернуть: True ['...', 'translator']
```

### Создание агента через API

```bash
COMPANY_ID="{companyId}"  # заменить на ID компании

curl -s -X POST "http://127.0.0.1:3100/api/companies/${COMPANY_ID}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "translator",
    "title": "Парсер русского в JSON (GBNF grammar via llama.cpp)",
    "role": "engineer",
    "adapterType": "translator",
    "capabilities": "parse natural language commands into structured JSON via llama.cpp with GBNF grammar"
  }'
```

> ⚠️ Поле `role` принимает строгий enum: `ceo | cto | cmo | cfo | security | engineer |
> designer | pm | qa | devops | researcher | general`. Для исполнителей
> используй `engineer` или `general`.

### Проверка регистрации

```bash
curl -s "http://127.0.0.1:3100/api/companies/${COMPANY_ID}/agents" | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    print(f\"{a['name']:20s} | {a['adapterType']:15s} | {a['status']}\")
"
```

## Тестирование

### "Сухой" тест (LLM сервер выключен)

Ожидаемая ошибка: `ECONNREFUSED` — адаптер честно пытался соединиться с :8081.

```bash
# 1. Создать задачу
ISSUE=$(curl -s -X POST "http://127.0.0.1:3100/api/companies/${COMPANY_ID}/issues" \
  -H "Content-Type: application/json" \
  -d '{"title":"Dry test translator","body":"тестовый запрос","assigneeAgentId":"<agentId>","status":"todo","priority":"high"}')
ISSUE_ID=$(echo "$ISSUE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Зачекаутить
npx paperclipai issue checkout "$ISSUE_ID" --agent-id "<agentId>"

# 3. Запустить heartbeat
npx paperclipai heartbeat run -a "<agentId>" --source assignment --timeout-ms 15000
```

**Ожидаемый результат:** статус `failed`, ошибка `connect ECONNREFUSED 127.0.0.1:8081`,
errorCode `LLAMA_REQUEST_FAILED`. Время выполнения < 5 секунд.

### "Боевой" тест (LLM сервер включён на :8081)

```bash
# 1. Создать задачу с грязным русским текстом
ISSUE=$(curl -s -X POST "http://127.0.0.1:3100/api/companies/${COMPANY_ID}/issues" \
  -H "Content-Type: application/json" \
  -d '{"title":"Live test translator","body":"слушай, надо бы в базу данных новый индекс добавить, а то селект по юзерам тупит пиздец","assigneeAgentId":"<agentId>","status":"todo","priority":"high"}')
ISSUE_ID=$(echo "$ISSUE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Зачекаутить
npx paperclipai issue checkout "$ISSUE_ID" --agent-id "<agentId>"

# 3. Запустить heartbeat
npx paperclipai heartbeat run -a "<agentId>" --source assignment --timeout-ms 15000
```

**Ожидаемый результат:** статус `succeeded`, exitCode `0`, `resultJson` содержит
распарсенный JSON с полями `intent`, `target`, `params`.

### Получение результата

```bash
# ID heartbeat run из вывода предыдущей команды
curl -s "http://127.0.0.1:3100/api/heartbeat-runs/<runId>" | python3 -c "
import sys, json
run = json.load(sys.stdin)
print('Status:', run['status'])
print('ExitCode:', run.get('exitCode'))
print('Result:', json.dumps(run.get('resultJson'), indent=2, ensure_ascii=False))
"
```

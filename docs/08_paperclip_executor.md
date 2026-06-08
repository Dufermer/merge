# 08 — Интеграция Исполнителя в Paperclip

## Путь к плагину

```
~/.paperclip/adapter-plugins/executor/
├── package.json          # манифест
├── index.js              # код адаптера (Tool Execution Layer)
└── executor.gbnf         # GBNF-грамматика (с полем data_source)

~/.paperclip/adapter-plugins/node_modules/adapter-executor/  # копия
```

## Реестр (adapter-plugins.json)

```json
[
  { "type": "translator", "packageName": "adapter-translator", "version": "1.0.0" },
  { "type": "compiler",   "packageName": "adapter-compiler",   "version": "1.0.0" },
  { "type": "executor",   "packageName": "adapter-executor",   "version": "1.0.0" }
]
```

## Архитектура Tool Execution Layer

Ключевое отличие от предыдущей версии — **LLM больше не генерирует данные**.

### Логика execute()

```
execute(ctx)
  │
  ├─ 1. fetchCompilerResult() — получить JSON от Компилятора
  │
  ├─ 2. executeTool(tool_name, strict_params)
  │       │
  │       ├─ Есть в ToolRegistry?
  │       │   ├─ ДА  → выполнить JS-функцию → реальные данные
  │       │   │         data_source = "external_tool"
  │       │   │
  │       │   └─ НЕТ → fallbackToLlmGeneration()
  │       │             data_source = "internal_mock"
  │       │
  │       └─ Результат: {found, data, format, source, logs}
  │
  ├─ 3. buildFormatterPrompt(toolName, toolResult, compilerJson)
  │       └─ Формирует промпт с РЕАЛЬНЫМИ данными:
  │          "YOU ARE A DATA FORMATTER. HERE IS THE REAL DATA:
  │           {data}  FORMAT THIS EXACT DATA..."
  │
  ├─ 4. POST → llama.cpp (:8083) с GBNF
  │
  └─ 5. Вернуть resultJson в Paperclip
```

### Что делает LLM?

```javascript
// System prompt:
"YOU ARE A DATA FORMATTER. FORMAT REAL DATA INTO JSON. NEVER ADD OUTSIDE KNOWLEDGE."

// User prompt содержит:
// 1. Реальные данные от инструмента
// 2. Требуемую JSON-схему
// 3. Инструкцию: используй ТОЛЬКО эти данные
```

## Полный код index.js

Файл: `~/.paperclip/adapter-plugins/executor/index.js`

Ключевые компоненты:

### ToolRegistry (объект TOOLS)

```javascript
const TOOLS = {
  read_file: async (params) => {
    // Безопасное чтение файла
    // Доступ разрешён только внутри DATA_DIR
    // path traversal блокируется
    const safePath = params.path || "";
    // ... проверки безопасности ...
    const content = fs.readFileSync(fullPath, "utf-8");
    return { data: parsedContent, format: "json"|"text", size, error: null, logs: [...] };
  },

  web_search: async (params) => {
    // Заглушка. В проде заменить на DuckDuckGo/Tavily API.
    return { data: "mock result", format: "text", source: "mock", error: null, logs: [...] };
  },

  list_files: async (params) => {
    const files = fs.readdirSync(DATA_DIR);
    return { data: files, count, directory, error: null, logs: [...] };
  },

  /**
   * codebase_search — семантический поиск по коду через AST-анализ.
   * Требует: npm install @babel/parser @babel/traverse в папке плагина executor.
   * Модуль: codebaseAnalyzer.js
   * Алгоритм: scanProjectStructure → buildAstIndex → semanticSearch → extractCodeBlock
   * Поддерживаемые языки: JS/TS (Babel AST), Python, Go, Rust, Java/C#, Ruby, PHP (regex)
   * params: { query: "...", target_dir: "..." }
   */
  codebase_search: async (params) => {
    // сканирует проект, строит AST-индекс, ищет функции/классы
    // возвращает топ-3 результата с confidence score
    // извлекает фрагмент кода для лучшего совпадения
  },

  /**
   * code_patch — генерация и применение патчей к коду через LLM.
   * Требует: SmolLM2 на :8083 + codePatch.gbnf
   * Модуль: codePatcher.js
   * Pipeline: generatePatch → validatePatch → applyPatch → verifyWithTests
   * params: { filePath, functionName, modificationType, context, testCommand }
   * modificationType: add_try_catch | add_logging | refactor | fix_bug
   */
  code_patch: async (params) => {
    // 1. generatePatch — LLM генерирует модифицированный код
    // 2. validatePatch — Babel проверяет синтаксис
    // 3. applyPatch — создаёт backup, заменяет функцию в файле
    // 4. verifyWithTests — запускает тесты, rollback при ошибке
  },
};
```

### Форматтер-промпт (buildFormatterPrompt)

```javascript
function buildFormatterPrompt(toolName, toolResult, compilerJson) {
  return [
    "YOU ARE A DATA FORMATTER. YOUR ONLY JOB IS TO PACKAGE REAL EXTERNAL DATA...",
    "",
    "=== RULES ===",
    "1. DO NOT add any knowledge from your training data.",
    "2. DO NOT guess or infer missing values.",
    "3. ONLY use the data provided below.",
    "4. If data is missing or an error occurred, state it in final_state.error.",
    "",
    "=== TOOL EXECUTION REPORT ===",
    `Tool called: ${toolName}`,
    `Parameters: ${JSON.stringify(compilerJson.strict_params || {})}`,
    `Data source: external_tool`,
    "",
    "=== DATA RETURNED BY TOOL ===",
    dataStr,
    "",
    "=== REQUIRED OUTPUT FORMAT ===",
    `{ "status": ..., "tool_executed": ..., "data_source": "external_tool", ...}`,
    "",
    "FORMAT THE DATA ABOVE INTO THIS JSON STRUCTURE NOW.",
  ].join("\n");
}
```

### Обработка ошибок

- Tool не найден в реестре → `fallbackToLlmGeneration()` → data_source=`"internal_mock"`
- Tool вернул ошибку → `exitCode=1`, pipeline стопается
- LLM не ответила → `exitCode=1`, `LLAMA_8083_UNREACHABLE`
- GBNF не загрузился → `exitCode=1`, `GBNF_NOT_FOUND`

## Регистрация агента executor

```bash
curl -s -X POST "http://127.0.0.1:3100/api/companies/{companyId}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "executor",
    "title": "Tool Executor (Real Data Formatter)",
    "role": "engineer",
    "adapterType": "executor",
    "capabilities": "executes real tools via ToolRegistry and formats results via SmolLM2"
  }'
```

## Сквозной тест (с реальными данными)

### Шаг 1: Создать задачу

```bash
COMPANY_ID="{companyId}"

ISSUE=$(curl -s -X POST "http://127.0.0.1:3100/api/companies/${COMPANY_ID}/issues" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Read server config",
    "body":"прочитай файл server_config.json и скажи, какой там сейчас порт и статус",
    "status":"todo",
    "priority":"high"
  }')
ISSUE_ID=$(echo "$ISSUE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Issue: $ISSUE_ID"
```

### Шаг 2: Запустить Translator

```bash
TRANSLATOR_ID="<id агента translator>"
npx paperclipai issue checkout "$ISSUE_ID" --agent-id "$TRANSLATOR_ID"
npx paperclipai heartbeat run -a "$TRANSLATOR_ID" --source assignment --timeout-ms 15000
```

### Шаг 3: Запустить Compiler

```bash
COMPILER_ID="<id агента compiler>"
npx paperclipai issue checkout "$ISSUE_ID" --agent-id "$COMPILER_ID"
npx paperclipai heartbeat run -a "$COMPILER_ID" --source assignment --timeout-ms 15000
```

### Шаг 4: Запустить Executor

```bash
EXECUTOR_ID="<id агента executor>"
npx paperclipai issue checkout "$ISSUE_ID" --agent-id "$EXECUTOR_ID"
npx paperclipai heartbeat run -a "$EXECUTOR_ID" --source assignment --timeout-ms 60000
```

### Шаг 5: Проверить результат

```bash
# Найти последний heartbeat-run executor
curl -s "http://127.0.0.1:3100/api/companies/${COMPANY_ID}/agents/${EXECUTOR_ID}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print('lastHeartbeat:', r.get('lastHeartbeatAt'))"

# Получить детали по run-id
curl -s "http://127.0.0.1:3100/api/heartbeat-runs/{runId}" \
  | python3 -c "
import sys, json
r = json.load(sys.stdin)
print('Status:', r['status'])
print('ExitCode:', r.get('exitCode'))
res = r.get('resultJson', {})
print('Tool:', res.get('tool_executed'))
print('DataSource:', res.get('data_source'))
print('FinalState:', json.dumps(res.get('final_state'), indent=2, ensure_ascii=False))
"
```

**Ожидаемый результат в `final_state.tool_output`:**
```json
{
  "tool_output": {"port": 8080, "status": "maintenance", "version": "2.4.1"},
  "format": "json",
  "error": null
}
```

Значения `port: 8080` и `status: "maintenance"` — **реальные, прочитанные с диска**,
не выдуманные моделью.

### Проверка data_source

Если всё работает правильно:
```json
{
  "data_source": "external_tool",
  ...
}
```

Если стоит `"internal_mock"` — значит инструмент не нашёлся в ToolRegistry
и сработал фоллбэк с LLM-генерацией.

## Добавление новых инструментов

Новый инструмент добавляется одной функцией в объект `TOOLS`:

```javascript
// В index.js, секция TOOLS:
rest_api_get: async (params) => {
  const url = params.url;
  if (!url) return { data: null, error: "URL required", logs: ["[API] No URL"] };
  try {
    const res = await fetch(url);
    const data = await res.json();
    return {
      data,
      format: "json",
      error: null,
      logs: [`[API] GET ${url} → ${res.status}`],
    };
  } catch (e) {
    return { data: null, error: e.message, logs: [`[API] Failed: ${e.message}`] };
  }
},

sqlite_query: async (params) => {
  // Требует npm install better-sqlite3
  const Database = require("better-sqlite3");
  const db = new Database(path.join(DATA_DIR, params.database));
  const rows = db.prepare(params.sql).all();
  db.close();
  return { data: rows, format: "json", error: null,
    logs: [`[DB] ${params.sql} → ${rows.length} rows`] };
},
```

После изменения `index.js`:
```bash
# Hot-reload (без перезапуска Paperclip)
curl -s -X POST "http://127.0.0.1:3100/api/adapters/executor/reload"
```

---

## Автономный поисковый движок (searchEngine.js)

Модуль `searchEngine.js` (~750 строк) — полноценный агентский поисковый
движок на чистом JS, без внешних AI-вызовов.

### Компоненты

| Функция | Назначение |
|---------|-----------|
| `evaluateResultRelevance(result, query)` | Оценка релевантности (score 0-100) |
| `verifyFacts(claims, sources)` | Кросс-верификация с confidence |
| `reformulateQuery(query, results)` | Переформулировка при плохих результатах |
| `extractFacts(results, query)` | Извлечение дат/чисел/утверждений |
| `intelligentWebSearch(query, opts, searchFn)` | Многоступенчатый поиск |
| `wikipediaSearch(query)` | Поиск через Wikipedia REST API |

### Алгоритм оценки релевантности

1. Keyword match (0-40) — TF-ish по заголовку и сниппету
2. Trusted domain (0-25) — база из 50+ доменов (wikipedia 90, arxiv 95)
3. Snippet completeness (0-15) — полные предложения
4. Title match bonus (0-10) — последовательные keywords
5. Spam penalty (-50) — SEO-мусор (pikabu, vc.ru)
6. Short snippet penalty (-20)

### Многоступенчатый поиск

```
Шаг A: Поиск (Wikipedia API / Bing Playwright / DDG HTTP)
Шаг B: Relevance scoring → фильтр ≥30
Шаг C: Извлечение фактов (даты, числа, утверждения)
Шаг D: Кросс-верификация (fuzzy match через Levenshtein)
Шаг E: Стоп при ≥3 источниках с confidence ≥0.5
Шаг F: Переформулировка запроса (синонимы, кавычки, уточнения)
```

### Поисковые бэкенды

| Бэкенд | Надёжность | Скорость |
|--------|-----------|----------|
| Wikipedia API | ✅ Высокая | Быстро |
| Bing (Playwright) | ⚠️ Средняя | Медленно |
| DuckDuckGo HTML | ❌ Блокируется | Быстро |

Рекомендуется Wikipedia API как первичный бэкенд — бесплатно, без капчи,
структурированные JSON-данные.

### Настройка критериев (в strict_params)

```json
{
  "query": "Apple founding date",
  "maxIterations": 3,
  "minConfidence": 0.7,
  "minIndependentSources": 3
}
```


# 07 — Исполнитель (Executor) — Tool Execution Layer

## Назначение

Исполнитель — Agent #3 (финальное звено) в конвейере Stateless MoE.
Принципиальное отличие от классических LLM-агентов: **LLM — не источник данных,
а только форматтер**. Все данные добываются через ToolRegistry — реестр реальных
JS-функций, работающих с внешним миром (файловая система, API, БД).

## Архитектура: LLM как процессор, Адаптер как шина данных

```
Compiler JSON  ──→  ToolRegistry.lookup(tool_name)
                        │
                        ├─ read_file()    → читает файл с диска
                        ├─ web_search()   → заглушка (имитация API)
                        └─ list_files()   → список файлов в data/
                        │
                        ▼
                  Реальные данные (строка/объект)
                        │
                        ▼
  Prompt:  "YOU ARE A DATA FORMATTER. HERE IS THE REAL DATA:
            {data}  FORMAT THIS EXACT DATA INTO THE REQUIRED JSON."
                        │
                        ▼
              SmolLM2 (:8083)  →  JSON-отчёт с data_source="external_tool"
```

## Модель

| Параметр | Значение |
|----------|----------|
| Модель | SmolLM2-3.6B-Instruct-GGUF |
| Ссылка HF | https://huggingface.co/HuggingFaceTB/SmolLM2-3.6B-Instruct-GGUF |
| Размер (Q4_K_M) | ~2.5 GB |
| Формат | GGUF (Q4_K_M) |
| Порт | 8083 |
| Температура | 0.0 |
| Max tokens | 512 |
| Роль | **Data Formatter** — не генератор, только упаковщик |

## ToolRegistry — реестр инструментов

Все инструменты — асинхронные JS-функции, живущие в `index.js` адаптера.
Добавление нового инструмента = добавление функции в объект `TOOLS`.

### Встроенные инструменты

| Инструмент | Описание | Возвращает |
|-----------|----------|------------|
| `read_file` | Читает файл с диска (только внутри `DATA_DIR`) | `{data, format, size, logs}` |
| `web_search` | Имитация поискового запроса (заглушка) | `{data, format, source, logs}` |
| `list_files` | Список файлов в `DATA_DIR` | `{data[], count, directory, logs}` |

### Безопасность

- `read_file` проверяет path traversal: `..` и абсолютные пути блокируются
- Результирующий путь проверяется на вхождение в `DATA_DIR`
- `DATA_DIR` = `C:\Users\rus\Desktop\merge\data` (настраивается в коде)

### Пример добавления нового инструмента

```javascript
// В объекте TOOLS в index.js:
sqlite_query: async (params) => {
  const dbPath = path.join(DATA_DIR, params.database || "default.db");
  // Реальный SQLite-запрос
  const rows = await querySqlite(dbPath, params.sql);
  return {
    data: rows,
    format: "json",
    logs: [`[DB] Query executed: ${params.sql}`],
    error: null,
  };
},
```

## GBNF-грамматика (executor.gbnf)

Файл: `~/.paperclip/adapter-plugins/executor/executor.gbnf`

```gbnf
root  ::= "{" ws
  "\"status\"" ws ":" ws status_enum ","
  ws "\"tool_executed\"" ws ":" ws string ","
  ws "\"data_source\"" ws ":" ws source_enum ","
  ws "\"execution_time_ms\"" ws ":" ws number ","
  ws "\"logs\"" ws ":" ws array ","
  ws "\"final_state\"" ws ":" ws object
  ws "}"

status_enum ::= "\"success\"" | "\"failed\"" | "\"mocked\""
source_enum ::= "\"external_tool\"" | "\"internal_mock\""
```

Новое поле `data_source`:
- `"external_tool"` — данные получены из реального JS-вызова
- `"internal_mock"` — инструмент не найден, сработал фоллбэк (LLM сгенерировала сама)

## Команда запуска сервера

```powershell
C:\Users\rus\Desktop\merge\llama_cpp\llama-server.exe `
  --model "C:\Users\rus\Desktop\merge\llama_cpp\smollm2-3.6b-instruct-q4_k_m.gguf" `
  --port 8083 --host 127.0.0.1 --no-warmup -ngl 35 `
  --grammar-file "%USERPROFILE%\.paperclip\adapter-plugins\executor\executor.gbnf"
```

## Поток данных (полный цикл)

```
Вход:     "прочитай файл server_config.json и скажи, какой там порт и статус"
              │
              ▼
Translator → {"intent":"read","target":"data","params":{"file":"server_config.json"}}
              │
              ▼
Compiler  → {"tool_name":"read_file","system_command":"Read server_config.json",
              "strict_params":{"path":"server_config.json"}}
              │
              ▼
Executor  → ToolRegistry.read_file({path:"server_config.json"})
              │
              ├─ Физически читает C:\...\data\server_config.json
              ├─ Получает: {"port":8080,"status":"maintenance","version":"2.4.1"}
              │
              ▼
            Форматирует через SmolLM2 (:8083):
              {
                "status": "success",
                "tool_executed": "read_file",
                "data_source": "external_tool",
                "execution_time_ms": 12,
                "logs": ["[FS] Read: server_config.json", ...],
                "final_state": {
                  "tool_output": {"port":8080,"status":"maintenance","version":"2.4.1"},
                  "format": "json",
                  "error": null
                }
              }
```

## Метрики производительности

| Метрика | Значение |
|---------|----------|
| read_file (без LLM) | < 5 ms |
| read_file + LLM formatting | ~500-1000 ms |
| VRAM (SmolLM2 @ -ngl 35) | ~1.8 GB |

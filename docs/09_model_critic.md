# 09 — Критик (Critic) — Quality Gate

## Назначение

Критик — Agent #4 (Quality Gate) в конвейере Stateless MoE. Проверяет
результат Исполнителя на соответствие изначальному запросу пользователя.
Принимает решение: `approve` (задача выполнена) или `reject` (нужен retry).

## Поток

```
Executor resultJson ──→ Critic ──→ approve → задача closed
  + pipeline_state     :8083   └── reject → retry compiler + executor
```

## Модель

| Параметр | Значение |
|----------|----------|
| Модель | SmolLM2-3.6B-Instruct (переиспользует :8083) |
| Порт | 8083 (общий с Executor) |
| Температура | 0.0 |
| Max tokens | 256 |

**Важно:** Критик не требует отдельной модели. Он переиспользует SmolLM2 на
порту 8083, так как Критик и Исполнитель не работают одновременно.

## GBNF-грамматика (critic.gbnf)

```gbnf
root  ::= "{" ws
  "\"verdict\"" ws ":" ws verdict_enum ","
  ws "\"confidence\"" ws ":" ws number ","
  ws "\"reason\"" ws ":" ws string ","
  ws "\"retry_instructions\"" ws ":" ws string
  ws "}"

verdict_enum ::= "\"approve\"" | "\"reject\""

string ::= "\"" ([^"]*) "\""
number ::= "-"? (("0" | [1-9] [0-9]*)) ("." [0-9]+)?
ws ::= ([ \t\n\r])*
```

## Closed-Loop Retry Logic

```
Critic.execute()
  │
  ├─ 1. Read pipeline_state.json (user_input + executor_result)
  │
  ├─ 2. POST to :8083 with critic system prompt
  │     "COMPARE THE USER INTENT WITH THE EXECUTION REPORT"
  │
  ├─ 3. Parse verdict
  │
  ├─ ✅ approve → PATCH issue status=completed
  │
  └─ ❌ reject
        ├─ retry_count < 2?
        │   YES → update pipeline_state.json
        │       → write retry_instructions to issue description
        │       → POST heartbeat for compiler agent
        │       → return pipeline_status="retry_queued"
        │
        └─ NO → PATCH issue status=cancelled
              → return MAX_RETRIES_EXCEEDED
```

### pipeline_state.json

Хранится в `C:\Users\rus\Desktop\merge\data\pipeline_state.json`:

```json
{
  "user_input": "исходный запрос",
  "issue_id": "uuid",
  "company_id": "uuid",
  "executor_result": { ... },
  "retry_count": 0,
  "retry_instructions": ""
}
```

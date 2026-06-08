# 10 — Интеграция Критика в Paperclip

## Путь к плагину

```
~/.paperclip/adapter-plugins/critic/
├── package.json       # манифест
├── index.js           # код адаптера (430+ строк)
└── critic.gbnf        # GBNF-грамматика

~/.paperclip/adapter-plugins/node_modules/adapter-critic/
```

## Реестр (adapter-plugins.json)

```json
{ "type": "critic", "packageName": "adapter-critic", "version": "1.0.0" }
```

## Регистрация агента

```bash
curl -s -X POST "http://127.0.0.1:3100/api/companies/{companyId}/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "critic",
    "title": "Quality Gate Critic",
    "role": "engineer",
    "adapterType": "critic",
    "capabilities": "validates executor output, approves/rejects, triggers retry loop"
  }'
```

## Сквозной тест

```bash
# 1. Создать pipeline_state.json
python3 -c "
import json
state = {
    'user_input': 'найди кто основал Apple',
    'issue_id': 'test-001',
    'company_id': '{companyId}',
    'executor_result': {'status':'mocked','logs':['no data']},
    'retry_count': 0
}
with open('C:/Users/rus/Desktop/merge/data/pipeline_state.json','w') as f:
    json.dump(state, f)
"

# 2. Создать задачу и запустить критика
ISSUE=$(curl -s -X POST "http://127.0.0.1:3100/api/companies/{companyId}/issues" \
  -H "Content-Type: application/json" \
  -d '{"title":"Critic test","body":"test","status":"todo","priority":"high"}')
ISSUE_ID=$(echo "$ISSUE" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

paperclipai issue checkout $ISSUE_ID --agent-id {criticId}
paperclipai heartbeat run -a {criticId} --source assignment --timeout-ms 45000
```

## Ожидаемый результат

```json
{
  "pipeline_status": "retry_queued",
  "verdict": "reject",
  "retry_count": 1,
  "retry_instructions": "Please retry with a different tool..."
}
```

## Диагностика

| Симптом | Причина | Решение |
|---------|---------|---------|
| `NO_PIPELINE_STATE` | pipeline_state.json не найден | Executor должен записать его первым |
| `LLAMA_8083_UNREACHABLE` | SmolLM2 не запущен | `start_all.ps1` |
| `MAX_RETRIES_EXCEEDED` | 2 retry не помогли | Проверить retry_instructions, логи |
| `JSON_PARSE_ERROR` | Модель вернула не-JSON | markdown-код: очищается автоматически |

## Closed-Loop Autonomous Pipeline

```
User Input
    │
    ▼
┌──────────────┐
│  Translator  │ → {intent, target, params}
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Compiler    │ → {tool_name, system_command, strict_params}
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Executor    │ → {status, tool_executed, data}
└──────┬───────┘
       │
       ▼
┌──────────────┐    ─ ─ ─ retry (max 2) ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  Critic      │                                              │
│  (Quality    │ → reject → retry_instructions → Compiler ───┘
│   Gate)      │
└──────┬───────┘
       │
       ▼
  ✅ Result to user   or   ❌ MAX_RETRIES_EXCEEDED
```

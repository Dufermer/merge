# Модель Переводчика (Translator Agent)

## Назначение

Парсинг "грязного" русского текста (естественный язык, сленг, мат) в строгий
JSON-контракт с полями `intent`, `target`, `params`. Используется как первый
шаг конвейера: User Input → Translator → Compiler → Executor.

## Модель

| Параметр | Значение |
|----------|----------|
| Название | Saiga Llama3 8B |
| Формат | GGUF (Q4_K_M) |
| Размер | ~4.6 GB |
| Источник | [`itlwas/saiga_llama3_8b-Q4_K_M-GGUF`](https://huggingface.co/itlwas/saiga_llama3_8b-Q4_K_M-GGUF) |
| Язык | Русский (fine-tuned на инструкциях) |

## Путь к файлу

```
C:\Users\rus\Desktop\merge\llama_cpp\saiga_llama3_8b-q4_k_m.gguf
```

## GBNF-грамматика

Файл: `C:\Users\rus\Desktop\merge\llama_cpp\translator.gbnf`

```
# GBNF grammar for Translator Agent
# Forces strict JSON output: intent + target + params
root ::= "{" ws
  "\"intent\"" ws ":" ws intent_enum ","
  ws "\"target\"" ws ":" ws target_enum ","
  ws "\"params\"" ws ":" ws object
  ws "}"

# Available intents (что нужно сделать)
intent_enum ::= "\"create\""
  | "\"update\""
  | "\"delete\""
  | "\"read\""
  | "\"refactor\""
  | "\"configure\""
  | "\"deploy\""
  | "\"migrate\""
  | "\"backup\""
  | "\"restore\""
  | "\"analyze\""
  | "\"notify\""

# Available targets (к чему относится intent)
target_enum ::= "\"schema\""
  | "\"database\""
  | "\"api\""
  | "\"service\""
  | "\"config\""
  | "\"code\""
  | "\"infrastructure\""
  | "\"data\""
  | "\"user\""
  | "\"system\""

# JSON primitives
string ::= "\"" ([^"]*) "\""
boolean ::= "true" | "false"
number ::= "-"? (("0" | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [+-]? [0-9]+)?
null   ::= "null"

value ::= object | array | string | number | boolean | null

object ::= "{" ws (pair ("," ws pair)*)? ws "}"
pair  ::= string ws ":" ws value

array ::= "[" ws (value ("," ws value)*)? ws "]"

ws ::= ([ \t\n\r])*
```

## Команда запуска сервера

```bash
C:\Users\rus\Desktop\merge\llama_cpp\llama-server.exe ^
  -m C:\Users\rus\Desktop\merge\llama_cpp\saiga_llama3_8b-q4_k_m.gguf ^
  --port 8081 ^
  -c 2048 ^
  -ngl 35 ^
  --grammar-file C:\Users\rus\Desktop\merge\llama_cpp\translator.gbnf ^
  --temp 0.0
```

**Ожидаемый вывод в логах:**

```
HTTP server listening on port 8081
llm_load_tensors: offloaded 33/33 layers to GPU
llm_load_tensors: VRAM used: 4500 MB
```

## Тестовый запрос

```bash
curl -s -m 15 http://127.0.0.1:8081/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"saiga_llama3_8b\",\"messages\":[{\"role\":\"system\",\"content\":\"ТЫ ПАРСЕР. ОТДАЙ ТОЛЬКО JSON. НИ СЛОВА БОЛЬШЕ.\"},{\"role\":\"user\",\"content\":\"слушай, надо бы в базу данных новый индекс добавить, а то селект по юзерам тупит пиздец\"}],\"temperature\":0.0,\"max_tokens\":256}"
```

### Ожидаемый JSON-ответ

```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"intent\":\"create\",\"target\":\"database\",\"params\":{\"object\":\"index\",\"table\":\"users\",\"reason\":\"slow_select\"}}"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 35,
    "completion_tokens": 24,
    "total_tokens": 59
  }
}
```

> ⚠️ GBNF гарантирует валидный JSON, но не гарантирует семантическую
> корректность. Если модель не поняла запрос — JSON будет, но с неправильными
> intent/target. Это нормально для первого прототипа.

## Метрики производительности (RTX 3070)

| Метрика | Ожидание |
|---------|----------|
| Prompt processing | ~300ms (cache hit) / ~600ms (cache miss) |
| Token generation | ~60 t/s |
| VRAM usage | ~4.5 GB |
| RAM usage | ~0.5 GB |
| Первый токен (TTFT) | ~350ms |

## Обработка ошибок

| Симптом | Причина | Решение |
|---------|---------|---------|
| `offloaded 0/33 layers to GPU` | Vulkan не подхватился | Проверить `vulkan.dll` и флаг `-ngl 35` |
| `HTTP server listening on port 8081` не появился | Порт занят | `netstat -ano \| grep ":8081"`, убить процесс |
| Модель выдаёт невалидный JSON | GBNF не загрузился | Проверить `--grammar-file` |

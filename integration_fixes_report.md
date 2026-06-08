# Integration Fixes Report

## Дата: 2026-06-08

## Проблема 1: Translator парсит "2+5 =?" как "refactor"

### Причина
GBNF-грамматика не включала "calculate" в enum intent.
Было: `intent-val ::= "update_schema" | "add_component" | "fix_bug" | "refactor" | "other"`
Стало: `intent-val ::= "calculate" | "read_file" | "write_file" | "search" | "update_schema" | "add_component" | "fix_bug" | "refactor" | "other"`

### Исправление
- ✅ Добавлен "calculate" в enum intent
- ✅ Добавлены calculate_params
- ✅ Добавлены новые target-val ("file", "web")
- ✅ Saiga :8081 перезапущен с новой грамматикой

## Проблема 2: CEO v2 "no concrete action evidence"

### Причина
CEO v2 не унаследовал гибридный PATCH + return из CEO v5.

### Исправление
- ✅ Добавлен `processUserRequest(task, issueId, companyId)` в ceoAgentV2.js
- ✅ При вызове с issueId: PATCH /issues/{id} → status=done + result
- ✅ CEO adapter (ceo/index.js) теперь использует ceoAgentV2 с issueId и companyId
- ✅ Return { exitCode, resultJson, summary } для Paperclip lifecycle

## Файлы
- `llama_cpp/translator.gbnf` — обновлён (calculate)
- `translator.gbnf` — обновлён (calculate)
- `ceoAgentV2.js` — добавлен processUserRequest с PATCH
- `ceo/index.js` — использует ceoAgentV2

## Следующий шаг
Создать задачу "сколько будет 2+5?" в Paperclip UI, назначить на CEO.
Проверить что CEO v2 + agent loop + calculate tool → ответ "7" → status=done.

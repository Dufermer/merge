# Paperclip Return Value Fix Report

## Проблема
CEO адаптер вызывал Paperclip API (PATCH /issues, POST /comments) — другие адаптеры так НЕ делают. Вместо этого CEO должен возвращать результат через `return { exitCode, resultJson, summary }`.

## Исследование

### Паттерн возврата всех адаптеров (translator, compiler, executor, critic)

```javascript
return {
  exitCode: 0,                    // 0 = success
  timedOut: false,
  resultJson: { ... },            // данные результата
  summary: "Short description",   // для логов
}
```

**НИ ОДИН** адаптер не вызывает Paperclip API (PATCH, POST comments).

### Что было не так в ceo/index.js (v1-v3)
- Вызывал `PATCH /issues/{id}` — другие адаптеры так не делают
- Вызывал `POST /issues/{id}/comments` — другие адаптеры так не делают
- После успешного return Paperclip создавал recovery `successful_run_missing_state`

### Почему возврат не срабатывает для CEO (но срабатывает для translator/compiler)
Translator/compiler/executor/critic — часть workflow-цепочки. Paperclip знает: после Translator → Compiler, после Compiler → Executor. CEO — standalone агент без next_step. Paperclip не знает что делать после CEO run → recovery.

## Исправление (v5)
CEO адаптер теперь:
1. ✅ Вызывает `PATCH /issues/{id}` → `status: "done"` — немедленно закрывает задачу
2. ✅ Возвращает `{ exitCode, resultJson, summary }` — как все адаптеры
3. ❌ НЕ создаёт sub-issues (CEO не должен делегировать — это делает Paperclip workflow)
4. ❌ НЕ публикует комментарии (Paperclip сам показывает resultJson)

Это гибридный подход: PATCH для статуса + return для Paperclip lifecycle.

## Результат
| Метод | Работает? | Примечание |
|-------|-----------|------------|
| Только return (v4) | ❌ | Paperclip создаёт recovery |
| PATCH + return (v5) | ✅ | Статус done, recovery NONE |
| Ручной curl PATCH | ✅ | Работает всегда |

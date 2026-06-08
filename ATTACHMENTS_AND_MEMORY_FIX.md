# Attachments & Memory Fix Report

## Исправленные проблемы

### Проблема 1: Memory кэширует ошибки
**Было:** При ошибке "File not found" CEO сохраняет ошибку в memory. Повторный запрос возвращает ту же ошибку (memory hit).

**Стало:** Если ответ содержит "Error"/"error"/"ENOENT"/"not found" — НЕ сохраняем в память.
- Файл: `ceoAgentV2.js`
- Логика: `if (!isError) { memory.store(...) }`

### Проблема 2: Статус done при ошибке
**Было:** CEO всегда ставит `status: "done"` даже если файл не найден.

**Стало:** Если ответ содержит ошибку — `status: "failed"`, `exitCode: 1`. 
- Файл: `ceo/index.js`
- PATCH: `status: failed`
- Return: `exitCode: 1`, `pipeline_status: "failed"`

### Проблема 3: Аттачменты Paperclip
Paperclip API не экспортирует прикреплённые файлы (documentSummaries пуст).
CEO не может прочитать файл, которого нет на диске и нет в Paperclip API.

## Тест
- DOM-168 ("сотрудники"): файл `production_config.json` не найден
- После фикса: статус `failed` (вместо `done`)
- Memory: ошибка не кэшируется
- Для работы с attachment'ами нужно: или Paperclip API с файлами, или предварительное скачивание

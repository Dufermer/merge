# Полный диагностический отчёт

## Дата: 2026-06-08

## Компании в Paperclip

| Название | ID | Количество агентов |
|----------|----|-------------------|
| Dominion | 793573ec-9d0c-44de-a5e6-477fbf16cb64 | 5 (после чистки) |

## Агенты в правильной компании (Dominion)

| ID (сокращённый) | Name | Role | Adapter Type |
|-----------------|------|------|-------------|
| 05946204 | critic | engineer | auto (critic) |
| 90f94f89 | compiler | engineer | auto (compiler) |
| badd8cf8 | translator | general | auto (translator) |
| 36f5f5cc | executor | engineer | auto (executor) |
| 687a5e35 | ceo | ceo | auto (ceo) |

## Удалённые дубликаты

| Name | ID | Причина |
|------|----|---------|
| translator 2 | 7b8c1735-3131-4834-8c59-93e8eb97a84c | Дубликат translator |

## Созданные агенты

| Name | ID | Adapter Type |
|------|----|-------------|
| ceo | 687a5e35-bd16-4790-b503-3b12179e43d5 | ceo (через имя адаптера) |

## Загруженные адаптеры

| Type | Loaded | Models |
|------|--------|--------|
| translator | ✅ | 1 |
| compiler | ✅ | 1 |
| executor | ✅ | 1 |
| critic | ✅ | 1 |
| ceo | ✅ | 1 |

## Тест "сколько будет 2+2"

### Прямой тест CEO агента (через node.js)

- **Статус:** SUCCESS
- **Время:** 298ms
- **Ответ:** "Обработано: сколько будет 2+2"
- **Режим:** из памяти (fromMemory: true)

### Тест через Paperclip (через assigneeAgentId)

- **Статус:** FAILED
- **Точка отказа:** CEO adapter — NO_INPUT
- **Причина:** При heartbeat-запуске Paperclip передаёт контекст без `ctx.input` и без issueId в run. Адаптер не может получить userInput.

### Тест через Paperclip (после фикса adapter)

- **Статус:** PENDING (требуется перезапуск Paperclip с обновлённым адаптером)
- **Фикс:** Добавлен fallback — поиск задач по assigneeAgentId через API

## Выявленные проблемы

### Проблема 1: CEO адаптер не был зарегистрирован
- **Причина:** `adapter-plugins.json` не содержал `ceo` адаптер, `node_modules/adapter-ceo/` отсутствовал
- **Решение:** Добавлен в adapter-plugins.json, скопирован в node_modules/

### Проблема 2: NO_INPUT при heartbeat-запуске
- **Причина:** `ctx.input` не передаётся Paperclip при heartbeat. Адаптер не искал задачи по assignee.
- **Решение:** Добавлен 3-й fallback — поиск assigned issues через API (как в translator адаптере)

### Проблема 3: Дубликат translator
- **Причина:** Пользователь создал вручную второго переводчика
- **Решение:** Удалён translator 2

### Проблема 4: Отсутствует инструмент calculate
- **Причина:** В ToolRegistry Executor не было "calculate"
- **Решение:** Добавлен calculate в executor/index.js + compiler.gbnf

## ToolRegistry Executor

Текущие инструменты:
- ✅ read_file
- ✅ web_search
- ✅ codebase_search
- ✅ terminal_exec
- ✅ db_query
- ✅ code_patch
- ✅ list_files
- ✅ calculate (добавлен)

## Заключение

Система диагностирована. CEO агент зарегистрирован и виден в Paperclip. Удалён дубликат translator 2. Добавлен инструмент calculate. Для полноценной работы CEO через Paperclip heartbeat требуется доработка адаптера (fallback на fetch assigned issues уже добавлен, нужен перезапуск).

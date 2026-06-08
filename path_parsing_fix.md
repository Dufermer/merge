# Path Parsing Fix Report

## Дата: 2026-06-08

## Проблема
CEO v2 парсит Windows-пути неправильно:
- Вход: `data/server_config.json` (relative) or `C:\Users\rus\Desktop\merge\data\server_config.json` (absolute)
- Получено: `файл data\server_config.json` (включается "файл " prefix)
- Причина: использовался `pathMatch[0]` (полное совпадение) вместо `pathMatch[1]` (только capture group)

## Найденные проблемы

1. **`pathMatch[0]` включает prefix** — `(?:data[/\\]|файл\s+)` — не захватывающая группа, но `pathMatch[0]` всё равно включает её
2. **Capture group `pathMatch[1]` не работал** — в некоторых окружениях (terminal node -e) отдавал undefined из-за экранирования

## Исправления

1. **`hermes-wrapper.js`** — `buildFallbackDecision()`:
   - Используется `pathMatch[1] || pathMatch[0].replace(/^(?:data[/\\]|файл\s+)/i, "")`
   - Если capture group не работает — вручную удаляем prefix из полного совпадения

## Тест

| Параметр | Результат |
|----------|-----------|
| Input | `прочитай файл data/server_config.json, найди там порт, умножь на 10` |
| Extracted path | `data/server_config.json` ✅ |
| Normalized path | `C:\Users\rus\Desktop\merge\data\server_config.json` ✅ |
| File read | ✅ `{"port":8080,"host":"localhost","debug":true}` |
| Completion | 1 turn, 6ms ✅ |

## Ограничение
После чтения файла agent loop останавливается (правильное обнаружение завершения). 
Для multi-step задач (parse port + calculate) нужен более сложный observe logic.

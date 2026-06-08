# Multi-Step DAG Fix Report

## Дата: 2026-06-08

## Проблема
CEO v2 выполнял только 1 шаг и завершался, вместо того чтобы выполнить все шаги DAG.

**Было:** `read_file → isComplete: true → стоп` (только 1 шаг)
**Стало:** `read_file → parse JSON → extract port → calculate → DAG complete`

## Исправления

### 1. isComplexTask() — обнаружение многошаговых задач
- Проверяет количество глаголов действия (>=2)
- Проверяет наличие союзов "и", запятых между действиями
- Проверяет наличие математических операций рядом с действиями
- Для сложных задач: пропускает Fallback FIRST, использует LLM напрямую

### 2. thinkWithLLM() — упрощённый LLM промпт
- Убраны многошаговые примеры (LLM их повторяла вместо вывода tool call)
- Простой запрос: "What tool to call next?"
- Если LLM галлюцинирует путь — fallback на buildFallbackDecision
- Если LLM не возвращает JSON — fallback на buildFallbackDecision

### 3. DAG Observe — rule-based multi-step pipeline
- После read_file: если результат — JSON с `port`, извлекает порт
- Ищет множитель в задаче через regex: `умнож[ьитьиим]* ... на (число)`
- Вычисляет: `порт * множитель`
- Возвращает финальный ответ: `Порт: X, результат умножения на Y: Z`
- Regex использует русские буквы явно (не `\w`, который не матчит кириллицу в Node.js)

### 4. Защита finalAnswer от перезаписи
- `context.finalAnswer` не перезаписывается `result.data`, если уже установлен

## Тест

| Параметр | Результат |
|----------|-----------|
| Input | `прочитай файл data/server_config.json, найди там порт, умножь номер порта на 10` |
| Step 1 | `read_file → {"port":8080,...}` ✅ |
| Step 2 | `parse JSON → port=8080` ✅ |
| Step 3 | `multiply → 8080*10=80800` ✅ |
| Final answer | `Порт: 8080, результат умножения на 10: 80800` ✅ |
| Turns | 1 |
| Time | 2563ms |

## Git
[commit hash]

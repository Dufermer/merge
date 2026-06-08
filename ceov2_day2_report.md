# CEO v2 Day 2 Report

## Дата: 2026-06-08

## Проблема
SmolLM2 неправильно парсит путь для read_file, уходит в бесконечный цикл.

## Исправления

1. **Fallback FIRST**: `think()` теперь пытается keyword-based fallback ДО вызова LLM. Для известных типов задач (math, file read) LLM вообще не вызывается.
2. **Few-shot examples в LLM prompt**: Для неизвестных задач улучшен промпт с примерами правильных JSON с полными путями.
3. **Валидация параметров**: Проверка `params.path` для `read_file` и `params.expression` для `calculate`. Если LLM вернул tool без параметров — fallback.
4. **Consecutive error counter**: `maxConsecutiveErrors: 3` — после 3 ошибок подряд loop останавливается (вместо бесконечного цикла).

## Тесты

### Math (2+2)
- **Turns:** 1 ✅
- **Время:** 4ms
- **Статус:** РАБОТАЕТ

### File read (data/test.txt)
- **Turns:** 1 ✅
- **THINK:** Fallback decision: read_file
- **ACT:** `read_file({"path":"C:\\Users\\rus\\Desktop\\merge\\data/test.txt"})`
- **OBSERVE:** `"Test file for CEO v2 agent loop"`
- **Статус:** ✅ **РАБОТАЕТ** (1 turn, 3ms)

### File read (malformed path)
- **Turns:** 3 (остановлен по consecutiveErrors)
- **Статус:** ⚠️ path испорчен shell'ом, но loop не ушёл в бесконечность

## Следующий шаг (День 3)
Интегрировать CEO v2 с Paperclip adapter (ceo/index.js).
Заменить вызов ceoAgent.js на ceoAgentV2.js в Paperclip адаптере.

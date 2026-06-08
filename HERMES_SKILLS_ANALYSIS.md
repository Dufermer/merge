# Hermes Skills System Analysis

## Как создаются skills
- Автоматически после успешных сложных задач (2+ steps)
- Триггер: completion of complex task with non-error result
- Формат: JSON файл в memory/skills/ с полями: id, name, pattern, steps, toolsUsed, answer, successRate

## Как skills self-improve
- Usage count увеличивается при каждом использовании
- Success rate обновляется на основе результатов
- Last used timestamp обновляется

## Что мы можем взять
1. SkillAutoCreator — создание skills после успешных задач ✅
2. Pattern matching — поиск похожих skills по паттерну ✅
3. Skills vector store — быстрый lookup ✅

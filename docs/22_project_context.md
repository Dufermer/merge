# 22 — Project Context

## Назначение

Project Context — автообновляемый файл `PROJECT_CONTEXT.md`, который CEO читает при старте каждой сессии. Содержит ключевую информацию о проекте: Tech Stack, Architecture, Key Files, Conventions, Recent Changes.

## Как это работает

```
Первая сессия:
  CEO: "какие модели используются?"
  → Не знает → запускает codebase_search (3-5 секунд)
  → Находит модели → обновляет PROJECT_CONTEXT.md

Вторая сессия:
  CEO: "какие модели используются?"
  → Читает PROJECT_CONTEXT.md → "Saiga 8B, Qwen 7B, SmolLM2 3.6B"
  → Отвечает напрямую (~50ms вместо 3-5 секунд)
```

## Структура файла

```markdown
# Project Context

## Project Overview
Локальная AI-система для автоматизации DevOps-задач

## Tech Stack
- Backend: Node.js 18+
- LLM: llama.cpp с Vulkan backend
- Models: Saiga 8B, Qwen 7B, SmolLM2 3.6B
- DB: SQLite, PostgreSQL
- Vector Store: @xenova/transformers (all-MiniLM-L6-v2)

## Architecture
4-агентный конвейер с DAG-оркестрацией
CEO Agent с семантической памятью
Self-learning skills система

## Key Files
- `start_all.ps1` — запуск всей инфраструктуры
- `dagOrchestrator.js` — графовый оркестратор
- `ceoAgent.js` — CEO диспетчер
- `llama_cpp/` — директория с GGUF-моделями

## Conventions
- Все адаптеры используют GBNF-грамматики
- Код-патчи валидируются через Babel перед применением
- SQL-запросы параметризованы (защита от инъекций)
- Git-First: автоматические коммиты после изменений

## Recent Changes
- 2026-06-08: Analyzed project structure, found 3 GGUF models
```

## API

| Метод | Описание |
|-------|----------|
| `readProjectContext()` | Читает PROJECT_CONTEXT.md, создаёт если нет |
| `updateProjectContext(section, content)` | Обновляет конкретную секцию |
| `autoUpdate(task, result)` | Анализирует результат, обновляет релевантные секции |
| `getRelevantContext(userInput)` | Извлекает только релевантные секции для задачи |

## Интеграция с CEO

1. **Фаза 0:** CEO загружает Project Context
2. **Фаза 5:** CEO автообновляет контекст после важных задач

## Экономия времени

| Сценарий | Без Project Context | С Project Context | Экономия |
|----------|-------------------|-------------------|----------|
| "Какие модели?" | 3-5 секунд (codebase_search) | ~50ms (чтение файла) | **60-100x** |
| "Где лежат файлы?" | 3-5 секунд | ~50ms | **60-100x** |
| "Что за технологии?" | 5-10 секунд | ~50ms | **100-200x** |

# CEO Agent — Стратегический оркестратор системы

## Обзор

CEO Agent — это "мозг" системы, который принимает стратегические решения:

- **Ответить напрямую** из памяти (мгновенно, ~50ms)
- **Использовать существующий skill** (быстро, ~100ms)
- **Делегировать специалистам** через DAG (сложные задачи)
- **Сгенерировать несколько стратегий** (критичные задачи, Multi-Strategy)

CEO работает на SmolLM2 :8083 (переиспользует модель Executor/Critic).

## Архитектура CEO

```
[User Request]
     │
     ▼
[CEO Agent :8083]
     │
     ├─ Phase 0: Load Project Context
     │   └─ Читает PROJECT_CONTEXT.md (Tech Stack, Key Files, Conventions)
     │
     ├─ Phase 1: Search Memory & Skills
     │   ├─ Keyword search (1-5ms, 50+ синонимов)
     │   └─ Vector search (30-50ms, semantic)
     │
     ├─ Phase 2: Decision Making
     │   ├─ Direct Answer (from memory)
     │   ├─ Use Skill (from skills library)
     │   ├─ Multi-Strategy Planning (generate 2-3 plans)
     │   └─ Delegate to DAG Orchestrator
     │
     ├─ Phase 3: Execution with Safety
     │   ├─ Git-First (auto-commit после изменений)
     │   └─ Error Recovery (база паттернов)
     │
     └─ Phase 4: Learning
         ├─ Store in Memory (vector store)
         ├─ Create Skill (если задача сложная и успешная)
         └─ Update Project Context (если важные открытия)
```

## Компоненты CEO

### 1. Memory Manager (Node.js Vector Store)

- **Модель:** all-MiniLM-L6-v2 (384-мерные embeddings, ~90MB)
- **Хранилище:** `memory/vector_store.json` (persistence)
- **Поиск:** гибридный (keyword + vector)
- **Синонимы:** 50+ групп (русский + английский)
- **API:** `searchMemory(query)`, `storeMemory(task, result)`

### 2. Self-Learning Skills

- **Хранилище:** `memory/skills_vector_store.json`
- **Структура skill:** `{trigger_patterns, dag_template, parameters, stats}`
- **Эволюция:** new → stable → canon (на основе success_count)
- **API:** `searchSkills(query)`, `executeSkill(skill, params)`, `createSkill(task, dag)`

### 3. Git-First

- **Триггер:** успешное изменение кода (code_patch, terminal_exec)
- **Commit message:** генерируется через SmolLM2 (осмысленный)
- **История:** `memory/git_history.json`
- **API:** `autoCommit(files, message)`, `rollbackToCommit(hash)`

### 4. Error Recovery

- **Хранилище:** `memory/error_patterns.json`
- **Структура:** `{signature, action, count, successRate}`
- **Actions:** restart_server, increase_timeout, regenerate_with_stricter_gbnf, etc.
- **API:** `findRecoveryPattern(error)`, `applyRecovery(pattern, context)`

### 5. Multi-Strategy Planning

- **Генерация:** 2-3 плана через SmolLM2
- **Оценка:** score = (success_rate × 0.5) + ((1 - complexity) × 0.3) + ((1 - risk) × 0.2)
- **Fallback:** автоматическое переключение на backup при провале
- **API:** `generateStrategies(task)`, `selectBestStrategy(strategies)`, `switchToBackup()`

### 6. Project Context

- **Файл:** `PROJECT_CONTEXT.md` (автообновляемый)
- **Секции:** Tech Stack, Key Files, Conventions, Recent Changes
- **Обновление:** после важных задач (complexity ≥ 3 или новые открытия)
- **API:** `readProjectContext()`, `autoUpdate(task, result)`

## Поток данных (примеры)

### Пример 1: Прямой ответ из памяти

```
User: "какой порт в конфиге?"

CEO: searchMemory("какой порт в конфиге")
  → Keyword: similarity 0.3 (низкий)
  → Vector: similarity 0.92 (высокий, нашёл "прочитай server_config.json")

CEO: answer_directly → "Порт 8080"

Время: ~50ms (вместо 3-5 секунд на полный пайплайн)
```

### Пример 2: Использование skill

```
User: "сделай резервную копию PostgreSQL"

CEO: searchSkills("сделай резервную копию PostgreSQL")
  → Keyword: similarity 0.45 ("резервная копия" ≠ "бэкап")
  → Vector: similarity 0.91 (синонимы!)

CEO: executeSkill(skill_backup, {target: "PostgreSQL"})
  → Использует dag_template из skill
  → Выполняет без создания DAG с нуля

Время: ~100ms (вместо 5-10 секунд)
```

### Пример 3: Multi-Strategy с fallback

```
User: "прочитай server_config.json и найди порт"

CEO: generateStrategies() → 3 плана:
  strategy_A: "Read file directly" (risk: low, score: 0.85)
  strategy_B: "Search for config files, then read" (risk: low, score: 0.72)
  strategy_C: "Read all configs in directory" (risk: medium, score: 0.65)

CEO: selectBestStrategy() → strategy_A
CEO: execute(strategy_A) → ERROR: File not found
CEO: switchToBackupStrategy() → strategy_B
CEO: execute(strategy_B) → SUCCESS (нашёл backup_config.json)
```

### Пример 4: Error Recovery

```
User: "прочитай файл"

CEO: delegate to Translator
Translator: ERROR ECONNREFUSED :8081

CEO: findRecoveryPattern("ECONNREFUSED:8081")
  → Найден паттерн: action="restart_server", successRate=1.0

CEO: applyRecovery() → перезапускает llama-server
CEO: retry → SUCCESS

Паттерн обновлён: count=3, successRate=1.0
```

## Производительность

| Операция | Время | Примечание |
|----------|-------|------------|
| Load Project Context | ~5ms | Чтение файла |
| Keyword search | ~1-5ms | 50+ синонимов |
| Vector search | ~30-50ms | Node.js embeddings |
| Use Skill | ~100ms | Без создания DAG |
| Direct Answer | ~50ms | Из памяти |
| Multi-Strategy Planning | ~500ms | Генерация 3 планов |
| Git-First (auto-commit) | ~200ms | После изменений |
| Error Recovery | ~50ms | Поиск паттерна |

## Сравнение: с CEO vs без CEO

| Метрика | Без CEO (старая архитектура) | С CEO |
|---------|----------------------------|-------|
| Повторный запрос | 3-5 секунд (полный пайплайн) | ~50ms (из памяти) |
| Похожая задача | 5-10 секунд (создание DAG) | ~100ms (использование skill) |
| Ошибка сервера | Manual restart | Auto-recovery (паттерн) |
| Изменение кода | Без коммита | Auto-commit (Git-First) |
| Сложная задача | Один план | 2-3 плана + fallback |
| Новая сессия | Сканирование проекта (5-10s) | Чтение PROJECT_CONTEXT.md (~5ms) |

## Заключение

CEO Agent превращает систему из "конвейера без памяти" в "настоящего AI-ассистента", который:

- **Помнит** предыдущие задачи и результаты
- **Учится** на успешных задачах (skills)
- **Восстанавливается** после ошибок (error recovery)
- **Планирует** стратегически (multi-strategy)
- **Коммитит** изменения (git-first)
- **Контекстуален** (project context)

Это делает систему **production-ready** и **самообучающейся**.

# Hermes Agent Architecture Analysis

## Обзор

Hermes Agent — self-improving AI agent от Nous Research. Запущен локально как текущий ассистент. Анализ проводится на основе системного промпта и конфигурации.

## Архитектура

### 1. Agent Loop (think → act → observe)
```
User Input → Analysis → Tool Decision → Execution → Observation → Next Action
     ↑                                                              │
     └────────────────────────── Loop ──────────────────────────────┘
```
- **max_turns:** 150 (сколько шагов может сделать агент за сессию)
- **gateway_timeout:** 1800s (макс время сессии)
- **api_max_retries:** 3 (автоматический retry при ошибках API)
- **tool_use_enforcement:** auto (автовыбор инструментов)

### 2. Tool-Calling (MCP)
- **MCP Servers:** Native MCP client в config.yaml
- **Toolsets:** hermes-cli (терминал, файлы, веб, и т.д.)
- **Каждый tool** имеет: имя, параметры, описание
- **Child agents:** `delegate_task` — spawn subagents с изолированными контекстами
- **Parallel execution:** до 3 concurrent детей, max_spawn_depth: 1

### 3. Skills System (процедурная память)
```
Skills хранятся в ~/AppData/Local/hermes/skills/
├── core/ (базовые: plan, fabricate, recovery)
├── devops/ (деплой, туннели, Docker)
├── creative/ (архитектура, дизайн)
├── github/ (PR, code review)
├── mlops/ (ML задачи)
└── 20+ категорий
```
- **Skill = SKILL.md** с frontmatter (name, description, platforms) + тело (steps, pitfalls, examples)
- **Триггер:** Загрузка при релевантности задачи
- **Самосовершенствование:** Skill создаётся после сложной задачи, патчится при ошибках

### 4. Memory System
- **Session search:** FTS5 SQLite — поиск по прошлым разговорам
- **Memory tool:** durable facts (user preferences, environment, conventions)
- **User profile:** who the user is (name, role, preferences)
- **Context compaction:** при превышении контекста — summary предыдущих шагов

### 5. Error Handling
- **retry()** — автоматический retry для transient errors
- **Systematic debugging** — 4-phase подход (факты → гипотеза → проверка → вывод)
- **Backup before changes** — git commit, .bak файлы
- **Validation** — syntax checks после редактирования

### 6. Self-Correction
- **Vault** — централизованное хранение credentials
- **Security audit** — проверка паролей, ключей
- **No fabrication** — "не выдумывать" (critical directive)
- **Honest blockers** — сообщать о проблемах честно

## CEO ↔ Hermes Integration Points

### Что Hermes может дать CEO:
1. **Agent loop** — think → act → observe вместо статичного processUserRequest
2. **Tool-calling** — MCP servers для инструментов (сейчас ToolRegistry живёт в executor/index.js)
3. **Skills** — процедурная память вместо самодельного skillManager
4. **Memory** — FTS5 + durable facts вместо JSON-файлов
5. **Error recovery** — встроенный retry + debugging workflow
6. **Child agents** — delegate_task для параллельного выполнения

### Что CEO уже умеет (и нужно сохранить):
1. **Paperclip integration** — создание sub-issues, обновление статуса
2. **Memory Manager** — векторная память (NodeVectorStore с transformers)
3. **Skill Manager** — свои skills (DAG templates, параметры)
4. **Multi-Strategy** — генерация планов с оценкой
5. **Project Context** — автообновляемый контекст
6. **5 адаптеров Paperclip** — translator, compiler, executor, critic
7. **9 инструментов ToolRegistry** — read_file, calculate, и т.д.
8. **DAG Orchestrator** — графовое исполнение

## Вывод

Hermes — это production-ready agent framework. CEO — наша надстройка для Paperclip.
Лучший подход: CEO остаётся Paperclip adapter'ом, но использует Hermes-подобный agent loop
вместо статичного processUserRequest.

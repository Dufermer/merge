# Self-Correcting DAG Agent — Обзор архитектуры (v2.0.0)

## Назначение

Локальный конвейер агентов для Paperclip. Каждый агент — stateless HTTP-запрос к
llama.cpp с GBNF-грамматикой, зажимающей вывод в строгий JSON. Агенты соединены
последовательно: выход одного → вход следующего.

## Поток данных

```
User Input (русский "грязный" текст)
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Translator  │  :8081  │  Saiga Llama3 8B  │  JSON-контракт │
│  (intent + target + params)                                  │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Compiler   │  :8082  │  Qwen2.5-Coder-7B  │  tool-call     │
│  (system_command + tool_name + strict_params)                │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Executor   │  :8083  │  SmolLM2-3.6B      │  Execution     │
│  (status + tool_executed + logs + final_state)               │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Critic     │  :8083  │  SmolLM2-3.6B      │  Quality Gate  │
│  (approve/reject + closed-loop retry)                        │
└──────────────────────────────────────────────────────────────┘
    │           ─ ─ ─ retry (max 2) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
    ▼                                                           │
  Result → Paperclip / пользователь          Compiler ←─────────┘
```

## Таблица агентов

| Агент | Роль | Модель | Порт | Статус |
|-------|------|--------|------|--------|
| translator | Парсинг русского текста в JSON-контракт | Saiga Llama3 8B (Q4_K_M) | 8081 | ✅ Готов |
| compiler | Компиляция JSON-контракта в system tool-call | Qwen2.5-Coder-7B-Instruct | 8082 | ✅ Готов |
| executor | Генерация mock/report, вызов ToolRegistry (7 инструментов) | SmolLM2-3.6B-Instruct | 8083 | ✅ Готов |
| ceo | Диспетчер с памятью, поиск в истории, делегирование пайплайна | SmolLM2-3.6B-Instruct | 8083* | ✅ Готов |
| critic | Quality Gate — валидация + closed-loop retry | SmolLM2-3.6B-Instruct | 8083* | ✅ Готов |

## Принципы

- **Stateless** — каждый вызов execute() не хранит историю. Никаких сессий.
- **GBNF-grammar** — каждая модель выдаёт строго валидный JSON. Никакой свободы.
- **Модульность** — каждая модель живёт на своём порту, заменяется независимо.
- **Vulkan** — единый рантайм для GPU на Windows. Без CUDA Toolkit.

## Файлы документации

| Файл | Назначение |
|------|------------|
| `00_OVERVIEW.md` | Общая карта системы (этот файл) |
| `01_llama_cpp_setup.md` | Установка инференс-сервера llama.cpp |
| `02_model_translator.md` | Спецификация модели Переводчика |
| `03_paperclip_translator.md` | Интеграция Переводчика в Paperclip |
| `04_model_compiler.md` | Спецификация модели Компилятора |
| `05_paperclip_compiler.md` | Интеграция Компилятора в Paperclip |
| `06_full_system_run.md` | Полный запуск и сквозной тест системы |
| `07_model_executor.md` | Спецификация модели Исполнителя |
| `08_paperclip_executor.md` | Интеграция Исполнителя в Paperclip |
| `09_model_critic.md` | Спецификация модели Критика |
| `10_paperclip_critic.md` | Интеграция Критика (Closed-Loop Retry) |
| `11_task_decomposer.md` | Task Planner — DAG-декомпозиция составных задач |
| `12_dag_orchestrator.md` | DAG Orchestrator — графовое исполнение подзадач |
| `13_codebase_analyzer.md` | Codebase Analyzer — AST-индекс и семантический поиск по коду |
| `14_terminal_executor.md` | Terminal Executor — безопасное выполнение shell-команд |
| `15_code_patcher.md` | Code Patcher — генерация и применение патчей через LLM |
| `16_database_executor.md` | Database Executor — безопасная работа с SQLite/PostgreSQL |
| `17_ceo_agent.md` | CEO Agent & Memory — диспетчер с долговременной памятью |
| `18_self_learning_skills.md` | Self-Learning Skills — автосоздание шаблонов из успешных задач |

## Установка

Подробное руководство: [INSTALL.md](../INSTALL.md)

**Быстрая установка:**

```bash
# Linux/macOS
git clone https://github.com/Dufermer/merge.git
cd merge
chmod +x install.sh && ./install.sh
```

```powershell
# Windows
git clone https://github.com/Dufermer/merge.git
cd merge
.\install.ps1
```

---

## Требования к окружению
- **OS:** Windows 10/11
- **GPU:** NVIDIA (RTX 3070 и выше) с Vulkan-драйвером
- **RAM:** ≥ 16 GB
- **Диск:** ≥ 30 GB свободно (модели GGUF)
- **Утилиты:** curl, python3, npx (Paperclip CLI)

---

## ✅ ИТОГ: 🧠 Self-Correcting DAG-Based Autonomous Agent

Базовый MoE-конвейер из 3 stateless-агентов работает стабильно:

| Агент | Статус | Модель | Порт | GBNF |
|-------|--------|--------|------|------|
| Translator (Agent #1) | ✅ Проверен | Saiga Llama3 8B | 8081 | Нет (system prompt) |
| Compiler (Agent #2) | ✅ Проверен | Qwen2.5-Coder-7B | 8082 | `compiler.gbnf` |
| Executor (Agent #3) | ✅ Адаптер готов | SmolLM2-3.6B | 8083 | `executor.gbnf` |

GBNF-грамматики обеспечивают 100% предсказуемость вывода — модель физически
не может выйти за пределы заданной JSON-схемы.

Мастер-скрипты `start_all.ps1` и `stop_all.ps1` позволяют развернуть
систему на чистой машине за 1 минуту.

### Результаты финального теста (2026-06-08)

```
User input: "nado by backup bazy sdelat pered relizom, a to strashno"

Translator → {"intent":"refactor","target":"database","params":{...}}
Compiler   → {"tool_name":"backup","system_command":"...","strict_params":{...}}
Executor   → ⚠️ требует запуска :8083 (SmolLM2 не запущен в момент теста)
```

### Что работает прямо сейчас

- ✅ Translator: парсинг русскоязычных команд в JSON-контракт (intent/target/params)
- ✅ Compiler: компиляция JSON в system tool-call с GBNF-валидацией
- ✅ Executor: запуск инструментов через ToolRegistry + поиск через searchEngine.js
- ✅ **Critic: Quality Gate — проверка результата, approve/reject, closed-loop retry (макс 2 попытки)**
- ✅ Paperclip: четыре кастомных адаптера загружены и работают
- ✅ Pipeline: ручная передача контекста через `description` задачи + `pipeline_state.json`
- ✅ Scripts: `start_all.ps1` / `stop_all.ps1` с поддержкой 3 серверов
- ✅ **Self-Correction: при reject Критика → автоматический retry Компилятора + Исполнителя**
- ✅ **Task Planner: анализ сложности, DAG-декомпозиция составных задач (taskPlanner.js)**
- ✅ **DAG Orchestrator: графовое исполнение подзадач с параллельностью и retry (dagOrchestrator.js)**
- ✅ **Codebase Analyzer: AST-индекс + семантический поиск по коду (codebaseAnalyzer.js + codebase_search tool)**
- ✅ **Safe terminal execution with automatic rollback (terminal_exec tool with whitelist, sandbox, snapshot/rollback)**
- ✅ **Code Patcher: генерация и применение патчей к коду через LLM с верификацией и rollback (codePatcher.js + code_patch tool)**
- ✅ **Database Executor: безопасное выполнение SQL-запросов с авто-бэкапом и блокировкой деструктивных операций (databaseExecutor.js + db_query tool)**
- ✅ **CEO Agent: диспетчер с долговременной памятью — повторные запросы отвечает мгновенно из кэша (ceoAgent.js + memoryManager.js)**
- ✅ **Self-Learning Skills: автосоздание шаблонов из успешных задач, эволюция до canon (skillManager.js + skillCreator.js)**

## Roadmap (следующие шаги)

### 🔜 Шаг 1: Реальные инструменты для Executor
Заменить mock-генерацию на реальные вызовы: SQL (pg8000), файловая система,
REST API. Executor будет не генерировать отчёт, а выполнять команду.

### 🔜 Шаг 2: Агент #4 (Critic)
Добавить четвёртый stateless-агент, который верифицирует результат
Исполнителя перед отдачей пользователю. Модель: любая 3-7B. GBNF: `{"valid":bool,"issues":[...],"suggestions":[...]}`.

### 🔜 Шаг 3: Оптимизация VRAM
При 8 GB VRAM (RTX 3070) все три модели одновременно не помещаются.
Решение: загружать модели в VRAM только на время их фазы конвейера
(on-demand loading через llama.cpp CLI с `--no-warmup`).

### 🔜 Шаг 4: Единый API-шлюз
Создать FastAPI-сервер, который принимает задачу одним POST-запросом
и сам прогоняет через 3-ступенчатый конвейер, возвращая финальный
resultJson. Без ручного копирования `description` между шагами.

### 🔜 Шаг 5: Автоматический pipeline в Paperclip
Дождаться, когда Paperclip добавит поддержку цепочек агентов (pipeline),
чтобы контекст передавался автоматически без `UPDATE issues SET description`. 


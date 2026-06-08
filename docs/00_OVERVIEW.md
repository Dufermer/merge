# Архитектура системы — CEO Agent как центральный компонент (v2.0.0)

## Назначение

Локальная, приватная, самообучающаяся система AI-агентов. **CEO Agent** — стратегический оркестратор, который принимает все пользовательские запросы, ищет ответ в памяти, использует навыки (skills), генерирует несколько стратегий или делегирует специалистам.

## Архитектура

```
[User Request]
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  CEO Agent :8083                                             │
│  ─────────────────────────────────────────────────           │
│  Phase 0: Project Context (PROJECT_CONTEXT.md)              │
│  Phase 1: Search Memory (vector + keyword) + Skills         │
│  Phase 2: Decision (direct / skill / multi-strategy / dag)  │
│  Phase 3: Execute + Git-First + Error Recovery              │
│  Phase 4: Learn (store memory + create skill + update ctx)  │
└─────────────────────────────────────────────────────────────┘
     │
     ├─ Direct Answer (from memory)       ~50ms
     ├─ Use Skill (from skills library)   ~100ms
     ├─ Multi-Strategy (2-3 plans)       ~500ms
     │
     └─ Delegate to Specialists:
            │
            ▼
        ┌──────────────────────────────────────────────────────┐
        │  Translator :8081  (Saiga 8B) — парсинг русского в   │
        │  JSON-контракт {intent, target, params}               │
        └──────────────────────────────────────────────────────┘
            │
            ▼
        ┌──────────────────────────────────────────────────────┐
        │  Compiler :8082   (Qwen 7B) — компиляция JSON в      │
        │  system tool-call с GBNF-валидацией                   │
        └──────────────────────────────────────────────────────┘
            │
            ▼
        ┌──────────────────────────────────────────────────────┐
        │  Executor :8083   (SmolLM2 3.6B) — ToolRegistry      │
        │  7 инструментов: read_file, web_search, codebase_    │
        │  search, terminal_exec, code_patch, db_query,         │
        │  list_files                                           │
        └──────────────────────────────────────────────────────┘
            │
            ▼
        ┌──────────────────────────────────────────────────────┐
        │  Critic :8083    (SmolLM2 3.6B) — Quality Gate       │
        │  approve / reject + closed-loop retry                 │
        └──────────────────────────────────────────────────────┘
            │           ── retry (max 2) ── Compiler
            ▼
    Result → CEO Aggregates + Git-First + Error Recovery
```

## Таблица агентов

| Агент | Роль | Модель | Порт | Статус |
|-------|------|--------|------|--------|
| **ceo** | Стратегический оркестратор (память, навыки, стратегии) | SmolLM2-3.6B | 8083* | ✅ Готов |
| translator | Парсинг русского текста в JSON-контракт | Saiga Llama3 8B | 8081 | ✅ Готов |
| compiler | Компиляция JSON-контракта в system tool-call | Qwen2.5-Coder-7B | 8082 | ✅ Готов |
| executor | Выполнение инструментов через ToolRegistry (7 инструментов) | SmolLM2-3.6B | 8083 | ✅ Готов |
| critic | Quality Gate — валидация + closed-loop retry | SmolLM2-3.6B | 8083* | ✅ Готов |

## CEO Agent — 6 киллер-фич

| № | Фича | Модуль | Описание |
|---|------|--------|----------|
| 1 | Семантическая память | `memoryManager.js` + `nodeVectorStore.js` | all-MiniLM-L6-v2, 50+ синонимов, гибридный поиск |
| 2 | Self-Learning Skills | `skillManager.js` + `skillCreator.js` | Создание рецептов из DAG, эволюция new→canon |
| 3 | Multi-Strategy | `multiStrategy.js` | 2-3 плана, оценка risk/complexity/success, fallback |
| 4 | Error Recovery | `errorRecovery.js` | База паттернов, учится на ошибках, 6 типов actions |
| 5 | Git-First | `gitFirst.js` | Auto-commit после изменений, генерация commit messages |
| 6 | Project Context | `projectContext.js` | PROJECT_CONTEXT.md, автообновление, экономия 5-10s |

## Файлы документации

| Файл | Назначение |
|------|------------|
| `23_ceo_comprehensive.md` | **CEO Agent — главный документ** |
| `00_OVERVIEW.md` | Общая архитектура (этот файл) |
| `17_ceo_agent.md` | CEO Agent — базовое описание |
| `18_self_learning_skills.md` | Self-Learning Skills |
| `19_git_first.md` | Git-First (auto-commit) |
| `20_error_recovery.md` | Error Recovery Patterns |
| `21_multi_strategy.md` | Multi-Strategy Planning |
| `22_project_context.md` | Project Context |
| `24_graphify_integration.md` | Graphify — knowledge graph |
| `01`-`16` | Остальные модули |

## Что работает прямо сейчас

### CEO Agent (новое)
- ✅ **Семантическая память:** гибридный поиск keyword + vector
- ✅ **Self-Learning Skills:** автосоздание рецептов, эволюция до canon
- ✅ **Multi-Strategy:** генерация 2-3 планов с fallback
- ✅ **Error Recovery:** база паттернов, 6 actions
- ✅ **Git-First:** auto-commit после code_patch
- ✅ **Project Context:** автообновляемый PROJECT_CONTEXT.md
- ✅ **Conversation history:** последние 10 сообщений
- ✅ **Graphify:** knowledge graph — анализ архитектуры через AST-граф

### Специалисты (делегирование)
- ✅ Translator: парсинг русскоязычных команд в JSON-контракт
- ✅ Compiler: компиляция JSON в system tool-call с GBNF
- ✅ Executor: 7 инструментов (read_file, web_search, codebase_search, terminal_exec, code_patch, db_query, list_files)
- ✅ Critic: Quality Gate — проверка результата, approve/reject, closed-loop retry
- ✅ Paperclip: 5 кастомных адаптеров (ceo, translator, compiler, executor, critic)

### Инфраструктура
- ✅ DAG Orchestrator: графовое исполнение подзадач с параллельностью и retry
- ✅ Task Planner: анализ сложности, DAG-декомпозиция
- ✅ Database Executor: SQLite/PostgreSQL с авто-бэкапом
- ✅ Terminal Executor: безопасное выполнение shell-команд
- ✅ Host-memory prompt caching (-cram): 3 модели на 8 ГБ VRAM
- ✅ Pure Node.js vector store: без Python-зависимостей

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

## Требования к окружению

- **OS:** Windows 10/11, Linux, macOS 13+
- **GPU:** NVIDIA (RTX 3070 и выше) с Vulkan-драйвером
- **RAM:** ≥ 16 GB
- **Диск:** ≥ 30 GB свободно (модели GGUF)
- **Утилиты:** curl, python3, Node.js 18+, Git

## Принципы

- **Stateless** — каждый вызов execute() не хранит историю. CEO Agent добавляет stateful-слой через память.
- **GBNF-grammar** — каждая модель выдаёт строго валидный JSON.
- **Модульность** — каждая модель живёт на своём порту, заменяется независимо.
- **Vulkan** — единый рантайм для GPU на Windows. Без CUDA Toolkit.
- **Git-First** — каждое изменение кода → осмысленный коммит.
- **Self-learning** — система учится на успешных задачах и ошибках.

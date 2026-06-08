# 🧠 Autonomous Self-Correcting AI Agent System with CEO Orchestrator

[![llama.cpp](https://img.shields.io/badge/llama.cpp-b5563b?style=flat-square)](https://github.com/ggml-org/llama.cpp)
[![Version](https://img.shields.io/badge/version-2.0.0-blue?style=flat-square)](CHANGELOG.md)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

**Локальная, приватная, самообучающаяся система AI-агентов с CEO-оркестратором на базе llama.cpp и Paperclip.**

Система работает на потребительском железе (RTX 3070, 8 GB VRAM) без платных API и облаков. **CEO Agent** — главный компонент системы — принимает стратегические решения, делегирует задачи 4 специалистам и учится на опыте. Самообучающаяся, самовосстанавливающаяся, с автоматическими коммитами.

---

## 🎯 Ключевые возможности

### CEO Agent — стратегический оркестратор (ГЛАВНЫЙ КОМПОНЕНТ)

CEO Agent — это "мозг" системы, который содержит **6 киллер-фич**:

1. **🧠 Семантическая память** — помнит предыдущие задачи (Node.js vector store, 50+ синонимов)
2. **🎯 Self-Learning Skills** — учится на успешных задачах, создаёт рецепты
3. **📊 Multi-Strategy Planning** — генерирует 2-3 плана с автопереключением
4. **🛡 Error Recovery** — база паттернов восстановления (учится на ошибках)
5. **🔧 Git-First** — автоматические git-коммиты после изменений
6. **📋 Project Context** — автообновляемый контекст проекта (экономия 5-10s/сессия)

### 4 специалиста (делегирование от CEO)

- **Translator** (Saiga 8B, :8081) — парсит русский язык в JSON-контракты
- **Compiler** (Qwen 7B, :8082) — компилирует JSON в system tool-calls с GBNF
- **Executor** (SmolLM2 3.6B, :8083) — выполняет инструменты через ToolRegistry
- **Critic** (SmolLM2 3.6B, :8083) — Quality Gate, проверяет результат, запускает retry

---

## 🏗 Архитектура

```
[User Request]
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                    CEO Agent :8083                           │
│  ──────────────────────────────────────────────────          │
│  Project Context → Memory/Skills → Decision → Execute/Learn │
└─────────────────────────────────────────────────────────────┘
     │
     ├── Direct Answer (from memory, ~50ms)        ← память
     ├── Use Skill (from skills, ~100ms)            ← навыки
     ├── Multi-Strategy (2-3 plans, ~500ms)         ← стратегии
     │
     └── Delegate to Specialists:
            │
            ▼
     ┌────────────────────────────────────────────┐
     │  Translator :8081  (Saiga 8B)              │
     │  → JSON-контракт {intent, target, params}  │
     └────────────────────────────────────────────┘
            │
            ▼
     ┌────────────────────────────────────────────┐
     │  Compiler :8082   (Qwen 7B)                │
     │  → tool-call {tool_name, strict_params}    │
     └────────────────────────────────────────────┘
            │
            ▼
     ┌────────────────────────────────────────────┐
     │  Executor :8083   (SmolLM2 3.6B)           │
     │  → ToolRegistry (7 tools)                  │
     └────────────────────────────────────────────┘
            │
            ▼
     ┌────────────────────────────────────────────┐
     │  Critic :8083    (SmolLM2 3.6B)            │
     │  → Quality Gate: approve / reject + retry  │
     └────────────────────────────────────────────┘
            │
            ▼
     [CEO Aggregates + Git-First + Error Recovery]
```

**Простой путь:** User → CEO → Translator → Compiler → Executor → Critic → CEO → Result
**Из памяти:** User → CEO → **Direct Answer** (~50ms, без делегирования)
**Из skills:** User → CEO → **Use Skill** (~100ms, готовый DAG из библиотеки)

---

## 🧠 CEO Agent — 6 киллер-фич

### 1. Семантическая память (Node.js Vector Store)

- **Модель:** all-MiniLM-L6-v2 (384-мерные embeddings, ~90MB)
- **Поиск:** гибридный — keyword (1-5ms) + vector (30-50ms)
- **Синонимы:** 50+ групп (русский + английский)
- **Пример:** "где обработка логина?" → находит "handleLogin" (semantic similarity 0.92)
- **Без Python:** чистый Node.js через @xenova/transformers
- **Файл:** `memory/vector_store.json`

### 2. Self-Learning Skills

- **Создание:** из успешных DAG (автоматически, ≥ 2 нод)
- **Использование:** для похожих задач (без создания DAG с нуля)
- **Эволюция:** new → active → stable (3+ успехов) → canon (5+ успехов)
- **Пример:** "сделай бэкап" и "резервная копия" используют один skill
- **Файл:** `memory/skills_vector_store.json`

### 3. Multi-Strategy Planning

- **Генерация:** 2-3 разных плана через SmolLM2
- **Оценка:** score = (success_rate × 0.5) + ((1 - complexity) × 0.3) + ((1 - risk) × 0.2)
- **Fallback:** автоматическое переключение на backup при провале
- **Пример:** план A (read file) → ошибка FileNotFound → план B (search + read) → успех
- **Файл:** `executor/skills/multiStrategy.js`

### 4. Error Recovery

- **База паттернов:** {signature, action, successRate} в error_patterns.json
- **Обучение:** пополняется с каждым инцидентом
- **Actions:** restart_server, increase_timeout, stricter_gbnf, retry_with_different_params
- **Пример:** ECONNREFUSED:8081 → restart_server (98% success rate)
- **Файл:** `memory/error_patterns.json`

### 5. Git-First

- **Auto-commit:** после каждого успешного изменения кода
- **Commit messages:** осмысленные (генерируются через SmolLM2)
- **История:** git_history.json (все авто-коммиты)
- **Rollback:** git checkout к любому коммиту
- **Файл:** `executor/skills/gitFirst.js`

### 6. Project Context

- **Файл:** PROJECT_CONTEXT.md (автообновляемый)
- **Секции:** Tech Stack, Key Files, Conventions, Recent Changes
- **Экономия:** 5-10 секунд на каждой сессии (CEO не сканирует проект заново)
- **Пример:** "какие модели?" → CEO читает контекст → отвечает за ~5ms
- **Файл:** `executor/skills/projectContext.js`

---

## 📊 Производительность: с CEO vs без CEO

| Операция | Без CEO (старая арх.) | С CEO | Ускорение |
|----------|----------------------|-------|-----------|
| Повторный запрос | 3-5 секунд | ~50ms (из памяти) | **60-100x** |
| Похожая задача | 5-10 секунд | ~100ms (skill) | **50-100x** |
| Ошибка сервера | Ручной перезапуск | Авто (паттерн) | **∞** |
| Изменение кода | Без коммита | Auto-commit | **Safety** |
| Сложная задача | 1 план | 2-3 плана + fallback | **Resilience** |
| Новая сессия | Сканирование (5-10s) | Контекст (~5ms) | **1000x** |

---

## 🔧 Production Features

- ✅ **Git-First** — автоматические коммиты после изменений
- ✅ **Error Recovery** — база паттернов, учится на ошибках
- ✅ **Host-memory prompt caching** (`-cram`) — 3 модели на 8 ГБ VRAM
- ✅ **Quality Gate (Critic)** — проверка и retry
- ✅ **Pure Node.js** — без Python-зависимостей
- ✅ **Self-learning skills** — эволюция до canon
- ✅ **Multi-Strategy** — 2-3 плана + fallback

---

## 🚀 Quick Start

```bash
git clone https://github.com/Dufermer/merge.git
cd merge
./install.sh          # Linux/macOS
# или .\install.ps1   # Windows
```

Система автоматически:
- Скачает llama.cpp (последний релиз)
- Проверит наличие GPU и RAM
- Установит Paperclip CLI и зависимости
- Создаст конфигурацию адаптеров

После установки:
```bash
powershell -ExecutionPolicy Bypass -File start_all.ps1
```

---

## 📚 Документация

| Файл | О чем |
|------|-------|
| [`23_ceo_comprehensive.md`](docs/23_ceo_comprehensive.md) | **CEO Agent — главный документ** |
| [`00_OVERVIEW.md`](docs/00_OVERVIEW.md) | Общая архитектура с CEO |
| [`17_ceo_agent.md`](docs/17_ceo_agent.md) | CEO Agent — базовое описание |
| [`18_self_learning_skills.md`](docs/18_self_learning_skills.md) | Self-learning skills |
| [`19_git_first.md`](docs/19_git_first.md) | Git-First (auto-commit) |
| [`20_error_recovery.md`](docs/20_error_recovery.md) | Error Recovery Patterns |
| [`21_multi_strategy.md`](docs/21_multi_strategy.md) | Multi-Strategy Planning |
| [`22_project_context.md`](docs/22_project_context.md) | Project Context |
| [`06_full_system_run.md`](docs/06_full_system_run.md) | Полный запуск и тесты |

Полная документация: [`docs/`](docs/) (23 файла)

---

## 🛠 Технологический стек

| Компонент | Назначение |
|-----------|------------|
| **CEO Agent** | Стратегический оркестратор (Memory, Skills, Git-First, Error Recovery, Multi-Strategy, Project Context) |
| **llama.cpp** (`-cram`) | Host-memory prompt caching |
| **Node.js Vector Store** | Семантическая память (all-MiniLM-L6-v2) |
| **Vulkan backend** | Автоподхват NVIDIA GPU |
| **GBNF-грамматики** | 100% structured output |
| **Paperclip** | Оркестратор AI-агентов |
| **@xenova/transformers** | Embeddings для vector search |

---

## 📂 Структура проекта

```
merge/
├── README.md                          # ← этот файл (с CEO во главе!)
├── ceoAgent.js                        # 🆕 CEO Agent — главный оркестратор
├── PROJECT_CONTEXT.md                 # 🆕 Автообновляемый контекст проекта
├── multiStrategy.gbnf                 # 🆕 GBNF для генерации стратегий
├── start_all.ps1                      # Автоматический запуск инфраструктуры
├── INSTALL.md                         # Подробная инструкция по установке
├── CHANGELOG.md                       # История версий
│
├── memory/                            # 🆕 Память CEO
│   ├── vector_store.json              #   Семантическая память (embeddings)
│   ├── skills_vector_store.json       #   Skills (embeddings)
│   ├── error_patterns.json            #   База паттернов ошибок
│   ├── git_history.json               #   История авто-коммитов
│   └── conversation_history.json      #   История диалога
│
├── llama_cpp/                         # Инференс-сервер и GGUF-модели
│   ├── llama-server.exe
│   ├── saiga_llama3_8b-q4_k_m.gguf
│   ├── qwen2.5-coder-7b-instruct-q4_k_m.gguf
│   └── smollm2-3.6b-instruct-q4_k_m.gguf
│
├── docs/                              # Полная документация (23 файла)
│   ├── 00_OVERVIEW.md                 #   Архитектура с CEO
│   ├── 17_ceo_agent.md                #   CEO Agent
│   ├── 18_self_learning_skills.md     #   Skills
│   ├── 19_git_first.md                #   Git-First
│   ├── 20_error_recovery.md           #   Error Recovery
│   ├── 21_multi_strategy.md           #   Multi-Strategy
│   ├── 22_project_context.md          #   Project Context
│   └── 23_ceo_comprehensive.md        #   CEO полное описание
│
├── data/                              # Данные для инструментов
│   ├── pipeline_state.json
│   └── conversation_history.json
│
└── skills/                            # Хранилище навыков
    └── *.json                         # Шаблоны повторяемых операций
```

### Адаптеры Paperclip

```
~/.paperclip/adapter-plugins/
├── ceo/                               # 🆕 CEO адаптер (входная точка)
│   ├── index.js
│   └── ceoDecision.gbnf
│
├── translator/                        # Переводчик
├── compiler/                          # Компилятор
│
├── executor/                          # Исполнитель + CEO skills
│   ├── index.js
│   ├── memoryManager.js
│   ├── skillManager.js
│   ├── skillCreator.js
│   ├── nodeVectorStore.js
│   └── skills/
│       ├── gitFirst.js               # 🆕 Git-First
│       ├── errorRecovery.js           # 🆕 Error Recovery
│       ├── multiStrategy.js           # 🆕 Multi-Strategy
│       └── projectContext.js          # 🆕 Project Context
│
└── critic/                            # Критик
```

---

## 📋 Системные требования

- **OS:** Windows 10/11, Linux, macOS 13+
- **GPU:** NVIDIA (RTX 3070+) с Vulkan-драйвером
- **RAM:** ≥ 16 GB
- **Диск:** ≥ 30 GB свободно (3 модели GGUF ~12 GB)
- **Утилиты:** Node.js 18+, Python 3.10+, Git

---

## 📄 Лицензия

MIT

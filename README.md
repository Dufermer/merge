# 🧠 Self-Correcting DAG-Based Autonomous Agent

![llama.cpp](https://img.shields.io/badge/llama.cpp-b5563b?style=flat-square)
[![llama.cpp](https://img.shields.io/badge/llama.cpp-host--memory%20prompt%20caching-blue)](https://github.com/ggml-org/llama.cpp/pull/16391)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![Version](https://img.shields.io/badge/version-2.0.0-blue?style=flat-square)
![Status](https://img.shields.io/badge/Status-Production--Ready-00ADD8?style=flat-square)
![Paperclip](https://img.shields.io/badge/Paperclip-v2026.529-8A2BE2?style=flat-square)

**Локальная, приватная, самоисправляющаяся система из 4 AI-агентов с DAG-оркестрацией на базе llama.cpp и Paperclip.**

Система работает на потребительском железе (RTX 3070, 8 GB VRAM) без платных API и облаков. Понимает русский язык, умеет искать в интернете через Wikipedia API, читать файлы с диска, выполнять задачи и самостоятельно исправлять свои ошибки через замкнутый цикл (Closed-Loop Retry). Составные задачи автоматически декомпозируются в DAG-граф и исполняются параллельно.

---

## 🎉 What's New in v2.0.0

| Фича | Описание |
|------|----------|
| **🧩 DAG-оркестрация** | Составные задачи → автоматическая декомпозиция в граф подзадач с параллельным исполнением (concurrency ≤ 2) и retry на каждую ноду |
| **🔬 Codebase Analyzer** | AST-индекс проекта (Babel для JS/TS, regex для Python/Go/Rust/Java). Семантический поиск функций, классов, сигнатур через `codebase_search` tool |
| **🛡 Terminal Executor** | Безопасное выполнение shell-команд с 3-уровневой защитой: whitelist (40+ команд), validatePath, snapshot/rollback для отката изменений |
| **⚡ Host-memory prompt caching** | `-cram` — системные промпты и GBNF кэшируются в RAM. 3 модели на 8 ГБ VRAM без свопинга |
| **📚 14 файлов документации** | От `00_OVERVIEW.md` до `14_terminal_executor.md` — полное покрытие всех модулей и сценариев |

[Полный список изменений →](CHANGELOG.md)

---

## 🚀 О проекте

Мы построили **полностью автономный локальный конвейер AI-агентов**, который:

- **Парсит «грязные» русские тексты** в структурированные JSON-контракты (Translator)
- **Декомпозирует составные задачи** в DAG-граф с параллельными нодами (TaskPlanner)
- **Компилирует JSON в system tool-calls** с GBNF-валидацией (Compiler)
- **Выполняет реальные инструменты**: чтение файлов, веб-поиск через Wikipedia API, SQL-запросы (Executor)
- **Проверяет качество результата** и при необходимости отправляет систему на переделку без участия человека (Critic)

**Ключевые особенности:**

| | |
|---|---|
| 🔒 **Полная приватность** | Никаких вызовов к облачным API. Все модели работают локально |
| 🛠 **Tool Registry** | Реальные инструменты (файловая система, веб-поиск), а не LLM-галлюцинации |
| 🔄 **Self-Correction** | Quality Gate (Critic) проверяет результат и запускает retry при необходимости |
| 🎯 **GBNF-грамматики** | 100% предсказуемый JSON-вывод от всех моделей |
| ⚡ **Host-memory prompt caching** | `-cram` — кэш системных промптов в RAM. 3 модели на 8 ГБ VRAM |
| 🧩 **DAG-оркестрация** | Составные задачи → граф подзадач, параллельное исполнение (concurrency ≤ 2) |

---

## 🏗 Архитектура

```
[User Request]
       │
       ▼
[Translator :8081] ─── analyzeComplexity()
       │                        │
       │ Simple                 │ Complex (DAG)
       ▼                        ▼
┌──────────────────────┐  ┌──────────────────────┐
│ Compiler :8082       │  │ DAG Orchestrator     │
│ → Executor :8083     │  │   Node 1: [C→E→C]   │
│   → Critic :8083     │  │   Node 2: [C→E→C] ◄─┤ parallel
│     → approve/reject │  │   Node N: [C→E→C]   │
└──────────┬───────────┘  └──────────┬───────────┘
           │                         │
           ▼                         ▼
    ┌──────────────────────────────────────┐
    │  Critic :8083 (Quality Gate)         │
    │  approve → Result to User             │
    │  reject  → Retry Loop (max 2)        │
    └──────────────────────────────────────┘
```

**Простой путь:** Translator → Compiler → Executor → Critic (линейный конвейер).
**Сложный путь (DAG):** Translator → DAG Orchestrator → параллельные ноды [C→E→C] → общий Critic.

---

## ⚡ Оптимизации производительности

Система использует **host-memory prompt caching** (llama.cpp PR [#16391](https://github.com/ggml-org/llama.cpp/pull/16391), флаг `-cram`).

### Как это работает

- **Системные промпты** и **GBNF-грамматики** кэшируются в обычной RAM как "extra slots"
- При повторных stateless-вызовах промпт **не прогоняется через нейросеть заново**
- Время до первого токена (TTFT) падает с секунд до **миллисекунд**
- Освобождается **VRAM** для самих моделей (критично при 8 ГБ)

### Почему это важно именно для нас

| Проблема | Без `-cram` | С `-cram` |
|----------|-------------|-----------|
| 3 модели суммарно >10 ГБ на RTX 3070 8 ГБ | ❌ Не влезает | ✅ Работает |
| Повторные вызовы одного эндпоинта | Каждый раз полный прогон | Кэш в RAM |
| GBNF-грамматика 500+ токенов каждый запрос | Трата ресурсов на токенизацию | Закэширована |
| DAG-оркестрация (N нод × 3 LLM-вызова) | Умножаем задержку | Кэш греет только первый вызов |

> **Итог:** `-cram` — единственная причина, почему 3 модели (Saiga 8B + Qwen 7B + SmolLM2 3.6B) работают на одной видеокарте с 8 ГБ VRAM без свопинга.

---

## 🔬 Технологический стек

| Компонент | Назначение |
|-----------|------------|
| **llama.cpp** (`-cram`) | Host-memory prompt caching — кэш системных промптов и GBNF в RAM |
| **Vulkan backend** | Автоподхват NVIDIA GPU без установки CUDA Toolkit |
| **GBNF-грамматики** | 100% structured output — JSON задаётся BNF-грамматикой, модель не может отклониться |
| **Paperclip** | Оркестратор AI-агентов (heartbeat, resultJson, адаптеры) |
| **TaskPlanner** | Декомпозиция составных задач в DAG-граф подзадач |
| **DAG Orchestrator** | Параллельное исполнение графа (concurrency ≤ 2) с retry на каждую ноду |
| **Terminal Executor** | Безопасное выполнение shell-команд с whitelist, sandbox и snapshot/rollback |
| **Puppeteer Stealth** | Обход антибот-защит при веб-поиске (Bing) |
| **Wikipedia REST API** | Основной источник веб-данных (структурированные статьи) |
| **SmolLM2 Critic** | Quality Gate — валидация результатов и запуск retry |

---

## ⚡ Быстрый старт

### Требования

- **OS:** Windows 10/11
- **GPU:** NVIDIA (RTX 3070 и выше) с Vulkan-драйвером
- **RAM:** ≥ 16 GB
- **Диск:** ≥ 30 GB свободно (для 3 моделей GGUF ~12 GB)
- **Утилиты:** Node.js 18+, Python 3.10+, Paperclip CLI (`npm install -g paperclipai`)

### Установка

```powershell
# Автоматическая установка (рекомендуется)
powershell -ExecutionPolicy Bypass -File install.ps1
```

```bash
# Или вручную:
# 1. Клонировать репозиторий
git clone https://github.com/Dufermer/merge.git
cd merge

# 2. Установить зависимости адаптеров
cd ~/.paperclip/adapter-plugins/executor && npm install
cd ~/.paperclip/adapter-plugins/critic && npm install

# 3. Скачать GGUF-модели в llama_cpp/
# (см. docs/02_model_translator.md, docs/04_model_compiler.md, docs/07_model_executor.md)

# 4. Запустить всё одной командой
powershell -ExecutionPolicy Bypass -File start_all.ps1
```

---

## 📂 Структура репозитория

```
merge/
├── README.md                          # ← этот файл
├── start_all.ps1                      # Автоматический запуск всей инфраструктуры
├── stop_all.ps1                       # Остановка всей инфраструктуры
├── dagOrchestrator.js                 # 📦 Графовый оркестратор нод
│
├── llama_cpp/                         # 🏗 Инференс-сервер и GGUF-модели
│   ├── llama-server.exe               #   Бинарный файл llama.cpp
│   ├── saiga_llama3_8b-q4_k_m.gguf    #   Модель Переводчика (~4.9 GB)
│   ├── qwen2.5-coder-7b-instruct-q4_k_m.gguf  # Модель Компилятора (~4.7 GB)
│   └── smollm2-3.6b-instruct-q4_k_m.gguf      # Модель Исполнителя/Критика (~2.5 GB)
│
├── docs/                              # 📚 Полная документация (14 файлов)
│   ├── 00_OVERVIEW.md                 #   Общая карта системы
│   ├── 01_llama_cpp_setup.md          #   Установка llama.cpp
│   ├── 02_model_translator.md         #   Спецификация Переводчика
│   ├── 03_paperclip_translator.md     #   Интеграция Переводчика
│   ├── 04_model_compiler.md           #   Спецификация Компилятора
│   ├── 05_paperclip_compiler.md       #   Интеграция Компилятора
│   ├── 06_full_system_run.md          #   Полный запуск и сквозной тест
│   ├── 07_model_executor.md           #   Спецификация Исполнителя
│   ├── 08_paperclip_executor.md       #   Интеграция Исполнителя (ToolRegistry + searchEngine)
│   ├── 09_model_critic.md             #   Спецификация Критика
│   ├── 10_paperclip_critic.md         #   Интеграция Критика (Closed-Loop Retry)
│   ├── 11_task_decomposer.md          #   Декомпозиция задач в DAG
│   ├── 12_dag_orchestrator.md         #   Графовая оркестрация
│   ├── 13_codebase_analyzer.md        #   AST-индекс и семантический поиск по коду
│   └── 14_terminal_executor.md       #   Безопасное выполнение shell-команд
│
├── data/                              # 📁 Данные для инструментов
│   └── pipeline_state.json            #   Состояние пайплайна (для Critic)
│
└── logs/                              # 📋 Логи (PID-файлы для скриптов)

~/.paperclip/
├── adapter-plugins.json               # Реестр адаптеров Paperclip
├── adapter-plugins/
    ├── translator/                    # 📦 Адаптер Переводчика
    │   ├── index.js                   #   Основной адаптер (DAG-интегрирован)
    │   ├── taskPlanner.js             #   Декомпозитор задач
    │   └── planner.gbnf               #   GBNF для валидации DAG
    ├── compiler/                      # 📦 Адаптер Компилятора (index.js + compiler.gbnf)
    │   └── index.js
    │   └── compiler.gbnf
    ├── executor/                      # 📦 Адаптер Исполнителя (index.js + searchEngine.js + executor.gbnf + codebaseAnalyzer.js + snapshots/)
    │   ├── index.js
    │   ├── searchEngine.js
    │   ├── codebaseAnalyzer.js
    │   ├── executor.gbnf
    │   ├── executor.log
    │   └── snapshots/
    └── critic/                        # 📦 Адаптер Критика (index.js + critic.gbnf)
        ├── index.js
        └── critic.gbnf
```

---

## 📚 Документация

| Файл | О чем |
|------|-------|
| [`00_OVERVIEW.md`](docs/00_OVERVIEW.md) | Общая архитектура, таблица агентов, схема потока данных |
| [`01_llama_cpp_setup.md`](docs/01_llama_cpp_setup.md) | Установка и настройка llama.cpp на Windows |
| [`02_model_translator.md`](docs/02_model_translator.md) | Модель Saiga Llama3 8B, команда запуска :8081 |
| [`03_paperclip_translator.md`](docs/03_paperclip_translator.md) | Полный код адаптера, регистрация, тест |
| [`04_model_compiler.md`](docs/04_model_compiler.md) | Модель Qwen2.5-Coder-7B, GBNF, команда :8082 |
| [`05_paperclip_compiler.md`](docs/05_paperclip_compiler.md) | Полный код адаптера, регистрация, тест |
| [`06_full_system_run.md`](docs/06_full_system_run.md) | **Главный файл**: полный запуск и сквозной тест пайплайна |
| [`07_model_executor.md`](docs/07_model_executor.md) | Модель SmolLM2-3.6B, GBNF, команда :8083 |
| [`08_paperclip_executor.md`](docs/08_paperclip_executor.md) | ToolRegistry, searchEngine.js, интеграция |
| [`09_model_critic.md`](docs/09_model_critic.md) | Quality Gate Critic, Closed-Loop Retry Logic |
| [`10_paperclip_critic.md`](docs/10_paperclip_critic.md) | Полный код, регистрация, pipeline diagram |
| [`11_task_decomposer.md`](docs/11_task_decomposer.md) | Декомпозиция составных задач, API taskPlanner.js, алгоритмы |
| [`12_dag_orchestrator.md`](docs/12_dag_orchestrator.md) | Графовая оркестрация, топологическая сортировка, retry нод |
| [`13_codebase_analyzer.md`](docs/13_codebase_analyzer.md) | AST-индекс, семантический поиск по коду, Babel-парсер |
| [`14_terminal_executor.md`](docs/14_terminal_executor.md) | Безопасное выполнение shell-команд, whitelist, snapshot/rollback |

---

## 🧪 Результаты тестов

### Простая задача (линейный конвейер)

```
Issue: "прочитай файл server_config.json и скажи, какой там порт"

Translator [analyzeComplexity → simple] → Compiler → Executor (read_file) → Critic
                                                                         │
                                                                 verdict: "approve"
                                                                 confidence: 0.95
                                                                 pipeline: "completed"
```

### Составная задача (DAG-оркестрация)

```
Issue: "прочитай файл server_config.json, найди там порт, сделай бэкап данных
        и скажи, какой порт был в конфиге"

Translator [analyzeComplexity → complex (4 steps)]

DAG:
  n1: read_file (server_config.json)             [independent]
  n2: parse_port (из прочитанного файла)         [depends: n1]
  n3: backup_data                                [depends: n1]
  n4: report (какой порт был в конфиге)          [depends: n2, n3]

Execution:
  n1 ──► n2 ──┐
       └─► n3 ──► n4 ──► Critic → approve
```

---

## 📋 Метаданные репозитория

**Description (для GitHub):**
> Локальный самоисправляющийся DAG-конвейер из 4 AI-агентов на базе llama.cpp и Paperclip. Парсинг русского языка, декомпозиция задач в DAG, агентский веб-поиск (Wikipedia API), выполнение задач и автоматический Quality Gate без использования облачных API. Host-memory prompt caching (`-cram`) для работы 3 моделей на 8 ГБ VRAM.

**Topics:**
```
llama-cpp ai-agents dag orchestration paperclip local-llm gbnf autonomous-agents self-correcting russian-llm tool-calling rag prompt-caching host-memory
```

---

## License

MIT

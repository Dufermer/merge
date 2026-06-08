# 🧠 Autonomous Self-Correcting MoE Pipeline

![llama.cpp](https://img.shields.io/badge/llama.cpp-b5563b?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![Status](https://img.shields.io/badge/Status-Production--Ready-00ADD8?style=flat-square)
![Paperclip](https://img.shields.io/badge/Paperclip-v2026.529-8A2BE2?style=flat-square)

**Локальная, приватная, самоисправляющаяся система из 4 AI-агентов на базе llama.cpp и Paperclip.**

Система работает на потребительском железе (RTX 3070, 8 GB VRAM) без платных API и облаков. Понимает русский язык, умеет искать в интернете через Wikipedia API, читать файлы с диска, выполнять задачи и самостоятельно исправлять свои ошибки через замкнутый цикл (Closed-Loop Retry).

---

## 🚀 О проекте

Мы построили **полностью автономный локальный конвейер AI-агентов**, который:

- **Парсит «грязные» русские тексты** в структурированные JSON-контракты (Translator)
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
| ⚡ **Никаких затрат** | Бесплатно, без подписок, без API-ключей |

---

## 🏗 Архитектура

```
 User Input (русский текст)
       │
       ▼
┌────────────────────────────────┐
│  1. Translator  :8081          │ → JSON-контракт
│  Saiga Llama3 8B               │    {intent, target, params}
└────────────────────────────────┘
       │
       ▼
┌────────────────────────────────┐
│  2. Compiler   :8082           │ → System tool-call
│  Qwen2.5-Coder-7B              │    {tool_name, system_command, strict_params}
└────────────────────────────────┘
       │
       ▼
┌────────────────────────────────┐
│  3. Executor  :8083            │ → Tool result
│  ToolRegistry + SmolLM2-3.6B   │    {data_source, status, logs}
└────────────────────────────────┘
       │
       ▼
┌────────────────────────────────┐     ─ ─ ─ retry (max 2) ─ ─ ─
│  4. Critic (Quality Gate)      │ ←─────────────────────────────┐
│  SmolLM2-3.6B                  │    reject + retry_instructions│
│  approve / reject               │                              │
└──────────┬─────────────────────┘                               │
           │                                                     │
           ▼                                                     │
    ✅ Результат пользователю        Compiler ───────────────────┘
```

---

## ⚡ Быстрый старт

### Требования

- **OS:** Windows 10/11
- **GPU:** NVIDIA (RTX 3070 и выше) с Vulkan-драйвером
- **RAM:** ≥ 16 GB
- **Диск:** ≥ 30 GB свободно (для 3 моделей GGUF ~12 GB)
- **Утилиты:** Node.js 18+, Python 3.10+, Paperclip CLI (`npm install -g paperclipai`)

### Установка

```bash
# 1. Клонировать репозиторий
git clone ...
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
│
├── llama_cpp/                         # 🏗 Инференс-сервер и GGUF-модели
│   ├── llama-server.exe               #   Бинарный файл llama.cpp
│   ├── saiga_llama3_8b-q4_k_m.gguf    #   Модель Переводчика (~4.9 GB)
│   ├── qwen2.5-coder-7b-instruct-q4_k_m.gguf  # Модель Компилятора (~4.7 GB)
│   └── smollm2-3.6b-instruct-q4_k_m.gguf      # Модель Исполнителя/Критика (~2.5 GB)
│
├── docs/                              # 📚 Полная документация (10 файлов)
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
│   └── 10_paperclip_critic.md         #   Интеграция Критика (Closed-Loop Retry)
│
├── data/                              # 📁 Данные для инструментов
│   └── pipeline_state.json            #   Состояние пайплайна (для Critic)
│
└── logs/                              # 📋 Логи (PID-файлы для скриптов)

~/.paperclip/
├── adapter-plugins.json               # Реестр адаптеров Paperclip
└── adapter-plugins/
    ├── translator/                    # 📦 Адаптер Переводчика (index.js + package.json)
    │   └── index.js
    ├── compiler/                      # 📦 Адаптер Компилятора (index.js + compiler.gbnf)
    │   └── index.js
    │   └── compiler.gbnf
    ├── executor/                      # 📦 Адаптер Исполнителя (index.js + searchEngine.js + executor.gbnf)
    │   ├── index.js
    │   ├── searchEngine.js
    │   └── executor.gbnf
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

---

## 🧪 Результаты финального теста (v1.0.0)

```
Issue: "прочитай файл server_config.json и скажи, какой там порт"

Translator → Compiler → Executor (read_file → real data) → Critic
                                                             │
                                                     verdict: "approve"
                                                     confidence: 0.95
                                                     pipeline: "completed"
```

---

## 📋 Метаданные репозитория

**Description (для GitHub):**
> Локальный самоисправляющийся MoE-конвейер из 4 AI-агентов на базе llama.cpp и Paperclip. Парсинг русского языка, агентский веб-поиск (Wikipedia API), выполнение задач и автоматический Quality Gate без использования облачных API.

**Topics:**
```
llama-cpp ai-agents moe paperclip local-llm gbnf autonomous-agents self-correcting russian-llm tool-calling rag
```

---

## License

MIT

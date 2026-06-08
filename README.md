# 🧠 Autonomous Self-Correcting AI Agent System with CEO Orchestrator

[![llama.cpp](https://img.shields.io/badge/llama.cpp-b5563b?style=flat-square)](https://github.com/ggml-org/llama.cpp)
[![Version](https://img.shields.io/badge/version-2.0.0-blue?style=flat-square)](CHANGELOG.md)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

**Локальная, приватная, самообучающаяся система AI-агентов с CEO-оркестратором на базе llama.cpp и Paperclip.**

Система работает на потребительском железе (RTX 3070, 8 GB VRAM) без платных API и облаков. **CEO Agent** принимает стратегические решения, делегирует задачи 4 специалистам и учится на опыте. Самообучающаяся, самовосстанавливающаяся, с автоматическими коммитами.

---

## 🎯 Ключевые возможности

### CEO Agent — стратегический оркестратор

CEO Agent — это "мозг" системы, который содержит **6 киллер-фич**:

1. **Семантическая память** — помнит предыдущие задачи (Node.js vector store, 50+ синонимов)
2. **Self-Learning Skills** — учится на успешных задачах, создаёт рецепты
3. **Multi-Strategy Planning** — генерирует 2-3 плана с автопереключением
4. **Error Recovery** — база паттернов восстановления (учится на ошибках)
5. **Git-First** — автоматические git-коммиты после изменений
6. **Project Context** — автообновляемый контекст проекта (экономия 5-10s/сессия)

### 4 специалиста (делегирование от CEO)

- **Translator** (Saiga 8B) — парсит русский язык в JSON-контракты
- **Compiler** (Qwen 7B) — компилирует JSON в system tool-calls с GBNF
- **Executor** (SmolLM2 3.6B) — выполняет инструменты через ToolRegistry
- **Critic** (SmolLM2 3.6B) — Quality Gate, проверяет результат, запускает retry

---

## 🏗 Архитектура

```
[User Request]
     │
     ▼
[CEO Agent :8083] ← Project Context + Memory + Skills
     │
     ├─ Direct Answer (from memory, ~50ms)
     ├─ Use Skill (from skills, ~100ms)
     ├─ Multi-Strategy (2-3 plans, ~500ms)
     └─ Delegate → [Translator → Compiler → Executor → Critic]
                   │
                   ▼
         [CEO Aggregates + Git-First + Error Recovery]
```

---

## 🧠 CEO Agent — 6 киллер-фич

### 1. Семантическая память (Node.js Vector Store)

- **Модель:** all-MiniLM-L6-v2 (384-мерные embeddings, ~90MB)
- **Поиск:** гибридный — keyword (1-5ms) + vector (30-50ms)
- **Синонимы:** 50+ групп (русский + английский)
- **Пример:** "где обработка логина?" → находит "handleLogin" (semantic similarity 0.92)
- **Без Python:** чистый Node.js через @xenova/transformers

### 2. Self-Learning Skills

- **Создание:** из успешных DAG (автоматически, ≥ 2 нод)
- **Использование:** для похожих задач (без создания DAG с нуля)
- **Эволюция:** new → active → stable (3+ успехов) → canon (5+ успехов)
- **Пример:** "сделай бэкап" и "резервная копия" используют один skill

### 3. Multi-Strategy Planning

- **Генерация:** 2-3 разных плана через SmolLM2
- **Оценка:** score = (success_rate × 0.5) + ((1 - complexity) × 0.3) + ((1 - risk) × 0.2)
- **Fallback:** автоматическое переключение на backup при провале
- **Пример:** план A (read file) → ошибка FileNotFound → план B (search + read) → успех

### 4. Error Recovery

- **База паттернов:** {signature, action, successRate} в error_patterns.json
- **Обучение:** пополняется с каждым инцидентом
- **Actions:** restart_server, increase_timeout, stricter_gbnf, retry_with_different_params
- **Пример:** ECONNREFUSED:8081 → restart_server (98% success rate)

### 5. Git-First

- **Auto-commit:** после каждого успешного изменения кода
- **Commit messages:** осмысленные (генерируются через SmolLM2)
- **История:** git_history.json (все авто-коммиты)
- **Rollback:** git checkout к любому коммиту

### 6. Project Context

- **Файл:** PROJECT_CONTEXT.md (автообновляемый)
- **Секции:** Tech Stack, Key Files, Conventions, Recent Changes
- **Экономия:** 5-10 секунд на каждой сессии (CEO не сканирует проект заново)
- **Пример:** "какие модели?" → CEO читает контекст → отвечает за ~5ms

---

## 📊 Производительность: с CEO vs без CEO

| Операция | Без CEO | С CEO | Ускорение |
|----------|---------|-------|-----------|
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

Полная документация: [`docs/`](docs/) (23 файла)

---

## 🛠 Технологический стек

| Компонент | Назначение |
|-----------|------------|
| **llama.cpp** (`-cram`) | Host-memory prompt caching |
| **Node.js Vector Store** | Семантическая память (all-MiniLM-L6-v2) |
| **Vulkan backend** | Автоподхват NVIDIA GPU |
| **GBNF-грамматики** | 100% structured output |
| **Paperclip** | Оркестратор AI-агентов |
| **@xenova/transformers** | Embeddings для vector search |

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

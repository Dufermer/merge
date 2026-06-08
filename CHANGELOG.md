# Changelog

All notable changes to the Self-Correcting DAG-Based Autonomous Agent project.

---

## [v2.0.0] - 2026-06-08

### Added

- **DAG-оркестрация сложных задач** (`taskPlanner.js` + `dagOrchestrator.js`)
  - Автоматическая декомпозиция составных запросов в DAG-граф подзадач
  - Параллельное исполнение независимых нод (concurrency ≤ 2)
  - Closed-loop retry на каждую ноду (Compiler → Executor → Critic, макс 2 попытки)
  - GBNF-валидация DAG через SmolLM2 (`planner.gbnf`)

- **AST-анализатор кодовой базы** (`codebaseAnalyzer.js` + `codebase_search` tool)
  - Семантический поиск функций/классов по AST-индексу
  - Babel AST-парсер для JS/TS (full AST + traverse)
  - Regex-эвристики для Python, Go, Rust, Java, C#, Ruby, PHP
  - Synonym map для нечёткого поиска ("login" ↔ "auth" ↔ "authenticate")
  - Ранжирование результатов: exact name (1.0), partial name (0.5-0.9), signature (0.3-0.6)
  - Извлечение фрагментов кода с контекстом

- **Безопасный исполнитель shell-команд** (`terminal_exec` tool)
  - Трехуровневая защита: whitelist команд, validatePath, snapshot/rollback
  - Whitelist: 40+ команд (echo, git, node, npm, python, curl, docker...)
  - Blocked patterns: rm -rf, sudo, chmod 777, shutdown, pipe-to-bash (12+)
  - Snapshot workDir для medium+ risk перед выполнением
  - Automatic rollback при ненулевом exitCode
  - Все команды логируются в `executor.log`

- **Host-memory prompt caching** (`-cram` из llama.cpp PR #16391)
  - Системные промпты и GBNF-грамматики кэшируются в RAM
  - TTFT падает с секунд до миллисекунд
  - 3 модели (Saiga 8B + Qwen 7B + SmolLM2 3.6B) на одной RTX 3070 (8 ГБ VRAM)

- **Quality Gate (Critic)** с автоматическим closed-loop retry
  - Валидация результата Исполнителя
  - Approve → отдача пользователю
  - Reject → retry Компилятора + Исполнителя (макс 2 попытки)

### Technical

- 14 файлов документации (`docs/00` — `docs/14`)
- Tool Registry: `read_file`, `web_search`, `codebase_search`, `terminal_exec`, `list_files`
- GBNF-грамматики для 100% structured output (compiler, executor, critic, planner)
- Paperclip-адаптеры: translator, compiler, executor, critic
- Vulkan backend (без CUDA Toolkit)
- CloakBrowser для обхода антибот-защит (Bing search)
- Wikipedia REST API как primary search backend
- `start_all.ps1` / `stop_all.ps1` для управления 3 llama-серверами
- 4+7 GGUF-моделей в `llama_cpp/`

---

## [v1.0.0] - 2026-06-07

### Added

- **Базовый MoE-конвейер** из 4 stateless AI-агентов
  - Translator (Saiga Llama3 8B) — парсинг "грязного" русского текста в JSON
  - Compiler (Qwen2.5-Coder-7B) — компиляция JSON в system tool-call с GBNF
  - Executor (SmolLM2-3.6B) — выполнение инструментов через ToolRegistry
  - Critic (SmolLM2-3.6B) — Quality Gate + closed-loop retry

- **Tool Registry** (executor)
  - `read_file` — безопасное чтение файлов с защитой path traversal
  - `web_search` — интеллектуальный веб-поиск через searchEngine.js + Bing/Playwright
  - `list_files` — список файлов в data-директории

- **Paperclip integration**
  - 4 кастомных адаптера (translator, compiler, executor, critic)
  - Heartbeat-driven execution с ручной передачей контекста
  - Company "Dominion", 4 зарегистрированных агента

- **Инфраструктура**
  - `start_all.ps1` / `stop_all.ps1` — управление 3 llama-серверами
  - `pipeline_state.json` — состояние пайплайна
  - 10 файлов документации

- **Веб-поиск** через Wikipedia REST API + Bing (Playwright с CloakBrowser)

- **GBNF-грамматики** для 100% structured output

---

## [v0.1.0] - 2026-06-05

### Added

- Первый proof-of-concept: Translator → Compiler → LLM-генерация
- Базовый Paperclip адаптер translator
- Тестовый запуск 2 агентов

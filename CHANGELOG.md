# Changelog

## v0.1.0 (2026-06-08)

### 🎉 Первый официальный релиз

#### Основные возможности
- **CEO v2 Agent Loop** — think → act → observe цикл (150 turns max)
- **Delegation System** — CEO делегирует простые задачи Translator'у через sub-issues
- **DAG Pipeline** — multi-step задачи (read → parse → calculate → report)
- **Web Fetch** — анализ GitHub репозиториев и веб-страниц (Node.js https, без curl)
- **Terminal Exec** — безопасное выполнение shell команд с CommandSecurity
- **List Files** — подсчёт файлов и папок в директориях
- **PM2 Auto-Recovery** — heartbeats автоматически восстанавливаются после падений

#### Skills System (Hermes-inspired)
- **SkillAutoCreator** — автономное создание skills после успешных сложных задач
- **Skill Reuse** — повторные задачи через pattern matching (500ms вместо 3000ms)

#### Memory System (Hermes-inspired)
- **Memory Nudge** — periodic self-reflection каждые 10 задач
- **Smart Caching** — не кэширует ошибки (threshold 0.9)
- **FTS5-like Session Search** — cross-session recall через keyword matching

#### Интеграция
- **Paperclip UI** — задачи через веб-интерфейс
- **Translator Heartbeat** — polling каждые 5 секунд
- **Sub-Issues** — CEO создаёт sub-issues для Translator
- **CEO Delegation** — задачи с URL не делегируются, выполняются через web_fetch

#### Безопасность
- **CommandSecurity** — whitelist команд, blacklist опасных
- **Date Protection** — даты не парсятся как math
- **URL Cleaning** — очистка URL от markdown синтаксиса
- **Empty Validation** — валидация пустых description

#### Производительность
- Math (2+2): **10ms** (Fallback FIRST)
- File read: **50ms** (Fallback FIRST)
- Повторная задача (skill): **500ms**
- Сложная задача (DAG): **2500ms**
- Web fetch: **400ms**

#### Статистика
- 50+ коммитов
- 20+ спринтов
- 100+ тестов
- 30+ багов починено
- ~5000 строк кода
- 2 недели разработки

### Известные ограничения
- Только Windows paths (C:\Users\...) — нет Unix/Linux
- Нет multi-channel gateway (Telegram/Discord)
- Нет cron scheduler
- Skills создаются только для сложных задач (2+ steps)
- FTS5 на JSON (не SQLite) — для совместимости

### Что дальше (v0.2.0)
- Multi-channel gateway (Telegram, Discord, WhatsApp)
- Cron scheduler
- Subagent spawning
- Honcho user modeling
- Browser-based dashboard

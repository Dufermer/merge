# CEO Agent System v0.1.0

> Self-hosted AI agent system где **orchestration видна**, а **reasoning чистый**.
> Вдохновлено [Hermes Agent](https://github.com/NousResearch/hermes-agent) от Nous Research.

```powershell
# Установка одной командой (Windows)
git clone https://github.com/yourusername/ceo-agent-system && cd ceo-agent-system
npm install
powershell -ExecutionPolicy Bypass -File start_all.ps1
# UI: http://127.0.0.1:3100
```

---

## 🧠 Почему Paperclip, а не reasoning-модели

**Проблема со встроенным reasoning:** Модели вроде o1, DeepSeek R1, Qwen3 с extended thinking загрязняют reasoning внутренними процессами.

| Что происходит внутри модели | Почему это плохо |
|-----------------------------|------------------|
| "Хм, давайте подумаем..." | 2-5 секунд на 2+2 |
| "Проверим ещё раз..." | Двойная работа |
| "А может я ошибаюсь?" | Нестабильные ответы |
| Чёрный ящик | Нельзя увидеть подводные камни |
| Меняет мнение на ходу | Непредсказуемость |

❌ **Reasoning модель (встроенный reasoning):**
```
User: "прочитай config.json"
Model: "Хм... проверить existence?.. permissions?.. encoding?..
        ладно, читаю... а вдруг большой?.. ну давай уже..."
[3 секунды мусорных размышлений]
[Результат. Но что было внутри — неизвестно]
```

✅ **Paperclip + CEO (чистый reasoning):**
```
User: "прочитай config.json"
Paperclip UI → todo
CEO → shouldDelegate() = YES
Sub-issue → Translator → {intent: "read_file", path: "..."}
Executor → readFile → content
Paperclip UI → done
[0 секунд мусора. Каждый шаг виден в UI и логах]
```

**Решение: Paperclip как внешний оркестратор**

```
┌──────────────────────────────────────────┐
│  Paperclip (видимый слой orchestration)   │
│  • Задачи с явными параметрами           │
│  • Workflow: todo → in_progress → done   │
│  • Sub-issues для delegation             │
│  • Полная история: кто, что, когда       │
│  • UI показывает подводные камни         │
└──────────────────────────────────────────┘
        ↓                ↓                ↓
┌────────────┐  ┌────────────┐  ┌────────────┐
│ CEO        │  │ Translator │  │ Executor   │
│ (thinker)  │  │ (GBNF)     │  │ (tools)    │
│ Skills     │  │ No reason  │  │ No reason  │
│ Memory     │  │ Determ.    │  │ Determ.    │
└────────────┘  └────────────┘  └────────────┘
```

### Сравнение: встроенный vs Paperclip

| Аспект | Встроенный reasoning | Paperclip + CEO |
|--------|---------------------|-----------------|
| Видимость | Чёрный ящик | ✅ Полная (UI + логи) |
| Предсказуемость | Может "передумать" | ✅ Детерминированный |
| Latency (простое) | 2000-5000ms | 10-100ms |
| Latency (повтор) | 2000-5000ms | 500ms (skill) |
| Стоимость | Много tokens | 50x дешевле |
| Обучение | Нет памяти | ✅ Skills + Memory nudge |
| Безопасность | Галлюцинации | ✅ Whitelist/blacklist |
| Отладка | Невозможно | ✅ Каждый шаг виден |
| Audit | Нет истории | ✅ Полная в Paperclip |

**Главное:** Paperclip делает orchestration внешней, а значит наблюдаемой, отлаживаемой, детерминированной. Модель думает только когда реально нужно думать.

---

## 📊 Быстрые цифры

| Метрика | Значение |
|---------|----------|
| Простые задачи | 10-100ms (Fallback FIRST) |
| Повторные задачи | 500ms (skills) |
| Сложные задачи | 2000-3000ms (agent loop) |
| Web fetch | 400ms |
| LLM моделей | 3 (Saiga 8B, Qwen 7B, SmolLM2 3.6B) |
| Tools | 9 (read_file, execute, web_fetch, ...) |
| Auto-recovery | PM2 (heartbeats не умирают) |
| Коммитов | 50+ за 2 недели |

---

<details>
<summary><h2>🎯 Примеры использования</h2></summary>

**Простая задача (10ms, без LLM)**
```
User: "сколько будет 2+2?"
CEO: Fallback FIRST → calculate("2+2") → "4" (10ms)
```

**Сложная задача (2500ms, через agent loop)**
```
User: "прочитай server_config.json, найди порт, умножь на 10"
CEO:
  Turn 1: read_file → {"port": 8080}
  Turn 2: calculate(8080 * 10) → 80800
  Turn 3: answer → "Порт: 8080, результат: 80800"
```

**Повторная задача (500ms, через skill)**
```
User: [тот же запрос второй раз]
CEO: находит skill → использует (500ms вместо 3000ms)
     [Создал skill автоматически после первой задачи]
```

**URL анализ (400ms)**
```
User: "прочитай https://github.com/nousresearch/hermes-agent"
CEO: web_fetch через GitHub API → "Hermes Agent — self-improving AI agent..."
```

**Опасная команда (заблокирована)**
```
User: "удали все файлы в data/"
CEO: CommandSecurity → BLOCKED (Remove-Item в blacklist)
     Статус: failed (не done!)
```
</details>

<details>
<summary><h2>🏗️ Архитектура</h2></summary>

```
┌─────────────────────────────────────────────────┐
│              INTERFACE LAYER                      │
│   Paperclip UI  │  CLI  │  (future: Telegram)    │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│              DECISION LAYER (CEO)                 │
│   Fallback FIRST → Skills → Memory → shouldDel. │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│              EXECUTION LAYER                      │
│   Agent Loop (think→act→observe)  │  ToolReg.(9) │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│              INFRASTRUCTURE                       │
│   PM2  │  Paperclip  │  llama.cpp  │  Skills     │
└─────────────────────────────────────────────────┘
```

**Роли агентов:** CEO (стратег) → Translator (парсер) → Executor (инструменты) → Compiler (код) → Critic (QA)

**Ключевые принципы:**
1. Не заставляй модели имитировать людей — разделяй обязанности
2. Обходи LLM где можно — Fallback FIRST быстрее
3. Накапливай опыт — skills + memory nudge
4. Защищай от галлюцинаций — whitelist/blacklist
5. Делай production-ready — PM2 auto-recovery

Полная документация: [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md)
</details>

<details>
<summary><h2>🔧 Конфигурация</h2></summary>

**LLM модели:** Saiga 8B (:8081), Qwen 7B (:8082), SmolLM2 3.6B (:8083)

**Tools:** read_file, write_file, execute, calculate, list_files, web_fetch, terminal_exec, search

**CommandSecurity:** Whitelist (dir, Get-ChildItem, curl, ping, ipconfig) | Blacklist (Remove-Item, format, shutdown, taskkill)

**Memory:** Threshold 0.95 | Vector store | FTS5 | Nudge каждые 10 задач

**Skills:** Auto-creation после 2+ steps | Reuse через 500ms
</details>

<details>
<summary><h2>📚 Hermes-подобные фичи</h2></summary>

| Фича | Наша реализация | Статус |
|------|----------------|--------|
| Skill creation | skillAutoCreator.js | ✅ |
| Memory nudge | memoryNudge.js | ✅ |
| FTS5 session | sessionSearch.js | ✅ |
| Subagent spawning | Sub-issues через Paperclip | ✅ |
| Browser dashboard | Paperclip UI | ✅ |
| Honcho modeling | — | 🔜 |
| Multi-channel | — | 🔜 |
| Cron scheduler | — | 🔜 |
</details>

<details>
<summary><h2>🐛 Troubleshooting</h2></summary>

**Heartbeats умерли:** `pm2 restart all`
**CEO не отвечает:** `pm2 logs ceo-heartbeat --lines 50`
**LLM не отвечает:** `curl http://127.0.0.1:8083/health`
**Web fetch не работает:** проверь интернет, GitHub API rate limit
**Задача blocked:** проверь статус в Paperclip UI, переоткрой
</details>

<details>
<summary><h2>🛣️ Roadmap</h2></summary>

**v0.2.0:** Multi-channel gateway, Cron scheduler, Honcho modeling, Browser dashboard
**v1.0.0:** Batch trajectory gen, Trajectory compression, Cross-agent memory, RBAC, Audit
</details>

---

📖 **Документация:** [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) • [CHANGELOG.md](CHANGELOG.md) • [docs/PM2_SETUP.md](docs/PM2_SETUP.md)

🤝 **Contributing:** Fork → Feature branch → Commit → Push → Pull Request

🙏 **Благодарности:** Hermes Agent (Nous Research), Paperclip, llama.cpp, PM2

**Релиз:** v0.1.0 · 2026-06-08 · **Лицензия:** MIT · **Платформы:** Windows 10/11

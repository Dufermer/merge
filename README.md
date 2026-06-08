# CEO Agent System v0.1.0

Self-hosted AI agent system с autonomous task execution, skills learning, и memory management.

## 🚀 Quick Start

### Требования
- Windows 10/11, Node.js 18+, Python 3.11+
- 8GB+ RAM, 10GB+ disk space

### Установка
```bash
git clone https://github.com/yourusername/ceo-agent-system
cd ceo-agent-system
npm install
powershell -ExecutionPolicy Bypass -File start_all.ps1
```

Открой [http://127.0.0.1:3100](http://127.0.0.1:3100), создай задачу:
- **Title:** Test Task • **Description:** сколько будет 2+2? • **Assignee:** ceo

---

## 🧠 Почему Paperclip — "чистый" reasoning

**Проблема:** reasoning-модели (o1, DeepSeek R1) "думают вслух" — тратят секунды, галлюцинируют, скрывают подводные камни.

**Решение:** Paperclip разделяет **orchestration** (видимый workflow) и **execution** (выполнение без "размышлений"):

```
User → Paperclip UI → CEO (решает: delegate / execute) → Specialists (делают, не думая)
                                                                                          
Всё видно: кто, что, когда. Каждый шаг предсказуем.
```

Сравнение:

| Аспект | Встроенный reasoning | Paperclip + CEO |
|--------|---------------------|-----------------|
| Видимость | Чёрный ящик | ✅ Полная прозрачность (UI + логи) |
| Скорость | 2-5s на простые задачи | ✅ 10-50ms (Fallback FIRST) |
| Надёжность | Галлюцинации | ✅ Whitelist/blacklist |
| Debugging | Сложно | ✅ Каждый шаг виден |
| Audit | Нет | ✅ Полная история |

Пример видимости в Paperclip:
```
DOM-123 "прочитай конфиг, найди порт, умножь на 10"
14:01:23 → todo (создана)
14:01:24 → CEO received
14:01:25 → Turn 1: read_file → {"port": 8080}
14:01:26 → Turn 2: calculate(8080*10) → 80800
14:01:26 → Status: done → "Порт: 8080, результат: 80800"
```

---

<details>
<summary><h2>📋 Возможности</h2></summary>

**Базовые:** Math (10ms), File read/write (50ms), Directory listing (100ms), Terminal exec с CommandSecurity (200ms), Web fetch GitHub/Web (400ms)

**Продвинутые:** DAG pipeline (2500ms), Skills auto-creation (500ms повторные), Memory nudge, FTS5 session search, Delegation CEO→Translator

**Интеграция:** Paperclip UI, PM2 auto-recovery, Sub-issues, CLI

**Безопасность:** CommandSecurity whitelist/blacklist, date protection, URL cleaning, empty validation, memory threshold 0.95
</details>

<details>
<summary><h2>🎯 Примеры</h2></summary>

**Простая (10ms):** "сколько будет 2+2?" → "2+2 = 4" (Fallback FIRST)

**Сложная (2500ms):** "прочитай config.json, найди порт, умножь на 10" → "Порт: 8080, результат: 80800"

**Повторная (500ms):** тот же запрос → skill reuse

**URL (400ms):** "прочитай репозиторий https://github.com/..." → README через GitHub API
</details>

<details>
<summary><h2>🏗️ Архитектура</h2></summary>

```
User → Paperclip UI → CEO v2 (Decision Layer) → Agent Loop (think→act→observe)
                                                 → ToolRegistry (9 tools)
                                                 → Delegation → Translator → Result
```
</details>

<details>
<summary><h2>📊 Производительность</h2></summary>

| Тип | Время | Метод |
|-----|-------|-------|
| Math | 10ms | Fallback FIRST |
| File read | 50ms | Fallback FIRST |
| Skill reuse | 500ms | Pattern match |
| DAG | 2500ms | Agent loop |
| Web fetch | 400ms | https.get() |

vs reasoning модели: **50-500x быстрее** на простых задачах
</details>

<details>
<summary><h2>🔧 Troubleshooting</h2></summary>

**Heartbeats умерли:** `pm2 restart all`
**CEO не отвечает:** `pm2 logs ceo-heartbeat --lines 50`
**Задача заблокирована:** проверь статус в Paperclip UI, перезапусти если "Missing disposition"
</details>

---

**Релиз:** v0.1.0 (2026-06-08) • **Лицензия:** MIT

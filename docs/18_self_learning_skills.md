# 18 — Self-Learning Skills System

## Назначение

Self-Learning Skills — система, которая автоматически создаёт переиспользуемые шаблоны (skills) из успешных составных задач. CEO Agent использует skills для мгновенного выполнения повторяющихся операций без создания DAG с нуля.

## Как это работает

```
User Request
    │
    ▼
┌─────────────────────────────────────────────┐
│ CEO Agent                                    │
│                                              │
│ Phase 0: searchSkills(query)                 │
│   ├── Найден skill (sim ≥ 0.85) → use skill │
│   └── Не найден → Phase 1 (memory)          │
│                                              │
│ После успешного выполнения:                  │
│   createSkillFromDag() → сохраняет skill     │
│                                              │
│ Эволюция:                                    │
│   5+ успешных использований → canon          │
│   confidence < 0.5 → deprecated → удаление   │
└─────────────────────────────────────────────┘
```

## Структура Skill

```json
{
  "id": "skill_1234567890_abc",
  "intent": "read file, backup, report",
  "description": "прочитай файл, сделай бэкап и отчитайся",
  "dag_template": {
    "nodes": [
      { "id": "n1", "action": "read_file", "params": {}, "depends_on": [] },
      { "id": "n2", "action": "backup", "params": {}, "depends_on": ["n1"] },
      { "id": "n3", "action": "report", "params": {}, "depends_on": ["n2"] }
    ]
  },
  "tags": ["read", "backup", "report"],
  "status": "new",
  "created": "2026-06-08T12:00:00.000Z",
  "updated": "2026-06-08T12:00:00.000Z",
  "stats": {
    "use_count": 6,
    "success_count": 5,
    "fail_count": 1,
    "confidence": 0.83
  }
}
```

## Компоненты

### skillManager.js

**Расположение:** `C:\Users\rus\Desktop\merge\skillManager.js`

| Метод | Описание |
|-------|----------|
| `listSkills()` | Список всех skills из `skills/` |
| `saveSkill(skill)` | Сохраняет skill в JSON-файл |
| `getSkill(skillId)` | Загружает skill по ID |
| `searchSkills(query, topK)` | Ищет подходящий skill по keywords |
| `updateStats(skillId, success)` | Обновляет статистику использования |
| `evolveSkills()` | Продвигает canon, удаляет deprecated |
| `createSkill(intent, desc, dag, tags)` | Создаёт новый skill |

### skillCreator.js

**Расположение:** `C:\Users\rus\Desktop\merge\skillCreator.js`

| Метод | Описание |
|-------|----------|
| `createSkillFromDag(dagResult, userInput, dagNodes)` | Создаёт skill из успешной DAG-задачи |
| `extractParamsFromInput(userInput, skill)` | Извлекает параметры из запроса |
| `applySkill(skill, userInput)` | Применяет skill к запросу (заполняет параметры) |

## Статусы Skill

| Статус | Условие | Описание |
|--------|---------|----------|
| `new` | Только создан | Ожидает первого использования |
| `stable` | Использован ≥ 2 раза | Проверенный шаблон |
| `canon` | success_count ≥ 5 | Эталонный skill, высшая степень доверия |
| `deprecated` | confidence < 0.5 при ≥ 3 использований | Ненадёжный, будет удалён |

## Эволюция

```
new → stable (2 use) → canon (5+ success)
new → deprecated (confidence < 0.5) → deleted (evolveSkills)
```

## Как создаются Skills

Условия создания:
1. Задача выполнена успешно
2. DAG содержит ≥ 2 ноды (составная задача)
3. Теги извлекаются из запроса (read, backup, report, config, search)

## Как используются Skills

1. CEO Agent ищет skill по запросу (`searchSkills`)
2. Если similarity ≥ 0.85 — использует шаблон
3. `applySkill()` извлекает параметры из запроса (file_path, target, backup)
4. Выполняет DAG из шаблона
5. Обновляет статистику (`updateStats`)

## Хранилища

| Данные | Путь |
|--------|------|
| Skills JSON | `C:\Users\rus\Desktop\merge\skills/*.json` |
| Лог создания | `C:\Users\rus\Desktop\merge\data\skill_creation.log` |

## E2E Тесты

### Тест 1: Создание skill

```
Задача: "прочитай config.yaml, найди порт, сделай бэкап и отчитайся"
DAG: 4 ноды (read_file → process, backup → report)
Skill создан: ✅
  intent: "prochitai config.yaml, naidi port, sdelai"
  tags: ["backup", "config"]
  nodes: 4
  status: "new"
```

### Тест 2: Использование skill

```
Задача: "прочитай config.yaml, найди порт, сделай бэкап"
CEO: searchSkills → found skill (similarity: 1.15)
skillManager.updateStats() → use_count: 1
Время: 21ms (быстрее создания DAG с нуля)
```

### Тест 3: Эволюция skill

```
5 успешных использований + 1 использование CEO
→ success_count: 5, use_count: 6, confidence: 0.83
→ status: "canon"
✅ Skill помечен как эталонный
```

## Ограничения

1. **Keyword-based поиск:** Без ChromaDB используется совпадение слов. Точность ниже семантического поиска.
2. **Threshold 0.85:** Высокий порог предотвращает ложные срабатывания.
3. **Только составные задачи:** Skills создаются для DAG с ≥ 2 нодами.
4. **Не автоматическое удаление:** `evolveSkills()` нужно вызывать явно или по расписанию.

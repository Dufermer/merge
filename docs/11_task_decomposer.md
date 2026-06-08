# 11 — Task Planner (Планировщик DAG-графов)

## Назначение

Модуль `taskPlanner.js` — автономный планировщик, который разбивает сложные
запросы на граф атомарных подзадач с зависимостями (DAG).

Вся логика — чистый JS, без внешних AI-вызовов.

## Расположение

```
~/.paperclip/adapter-plugins/translator/taskPlanner.js
```

## API

### `analyzeComplexity(userInput)`

Определяет, является ли задача простой или составной.

| Параметр | Тип | Описание |
|----------|-----|----------|
| userInput | string | Исходный запрос пользователя |

**Возвращает:**
```json
{
  "isComplex": true,
  "estimatedSteps": 4,
  "hasConditions": false,
  "actionsFound": ["backup", "read_file", "report"]
}
```

**Алгоритм:**
1. Сканирует текст на наличие глаголов из `ACTION_SYNONYMS` (50+ русских/английских слов)
2. Считает маркеры последовательности ("затем", "после", "then")
3. Считает маркеры условий ("если", "если успешно", "if")
4. Если найдено ≥2 разных действий ИЛИ ≥1 маркер → `isComplex: true`

### `extractSubtasks(userInput)`

Выделяет атомарные подзадачи с определением действия и объекта.

| Параметр | Тип | Описание |
|----------|-----|----------|
| userInput | string | Исходный запрос |

**Возвращает:**
```json
[
  {"action": "read_file", "object": "server_config.json", "params": {...}},
  {"action": "backup", "object": "database", "params": {...}},
  {"action": "report", "object": "results", "params": {...}}
]
```

**Алгоритм:**
1. Находит все глаголы-действия в тексте по порядку
2. Для каждого глагола извлекает объект (текст до следующего глагола)
3. Строит параметры на основе действия (read_file → path, backup → target)

### `buildDependencyGraph(subtasks)`

Строит DAG на основе порядка подзадач и лингвистических маркеров.

| Параметр | Тип | Описание |
|----------|-----|----------|
| subtasks | Array | Массив подзадач от extractSubtasks |

**Возвращает:**
```json
[
  {"id": "n1", "action": "read_file", "params": {...}, "depends_on": []},
  {"id": "n2", "action": "backup", "params": {...}, "depends_on": ["n1"]},
  {"id": "n3", "action": "report", "params": {...}, "depends_on": ["n2"], "condition": "n2.success"}
]
```

**Алгоритм:**
1. Каждая следующая подзадача зависит от предыдущей (последовательный DAG)
2. Маркеры "после", "затем" = явная зависимость
3. Маркеры "если", "при условии" = условный переход (condition)
4. **Строгая проверка ацикличности** через DFS — при обнаружении цикла строится линейный граф

### `decomposeTask(userInput, options)`

Главная функция. Комбинирует все три выше в один вызов.

| Параметр | Тип | Описание |
|----------|-----|----------|
| userInput | string | Исходный запрос |
| options.useLLM | boolean | Валидировать DAG через SmolLM2 (:8083) |

**Возвращает:**
```json
{
  "task_type": "complex",
  "dag": {
    "type": "dag",
    "nodes": [...]
  },
  "complexity": {
    "estimatedSteps": 3,
    "hasConditions": false,
    "parallelLevels": 1
  }
}
```

### `topologicalSort(nodes)`

Топологическая сортировка DAG.

### `findIndependentNodes(nodes)`

Определяет уровни параллельности.
```json
[["n1"], ["n2", "n3"], ["n4"]]
```
— ноды на каждом уровне можно выполнять параллельно.

## ACTION_SYNONYMS (50+ слов)

| Действие | Русские слова | Английские слова |
|----------|---------------|------------------|
| backup | бэкап, сохрани, скопируй, зарезервируй | backup, save, copy, archive |
| deploy | задеплой, выкати, релиз | deploy, release, publish |
| read_file | прочитай, открой, покажи, найди | read, show, display, open, get |
| run_tests | тест, протестируй, проверь | test, check, verify, validate |
| configure | настрой, конфигурируй | configure, setup |
| web_search | поищи, ищи, погугли | search, find, look up |
| notify | уведоми, сообщи, отправь | notify, send |
| report | скажи, расскажи, суммируй, доложи, ответь | report, summarize, answer |

## planner.gbnf

Файл: `~/.paperclip/adapter-plugins/translator/planner.gbnf`

GBNF-грамматика для финальной валидации DAG через SmolLM2 на :8083.
Фиксирует структуру: `{"type":"dag","nodes":[{"id","action","params","depends_on","condition?}]}`.

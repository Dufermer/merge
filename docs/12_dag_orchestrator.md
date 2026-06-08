# 12 — DAG Orchestrator (Оркестратор графа подзадач)

## Назначение

Модуль `dagOrchestrator.js` выполняет DAG-граф подзадач: топологически
сортирует, запускает ноды через Compiler → Executor → Critic, обрабатывает
условные переходы и retry.

## Расположение

```
C:\Users\rus\Desktop\merge\dagOrchestrator.js
```

## Архитектура

```
Оркестратор читает DAG из pipeline_state.json
                    │
                    ▼
    ┌───────────────────────────────┐
    │ Топологическая сортировка     │
    │ → уровни параллельности       │
    └───────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │ Для каждого уровня:           │
    │ Promise.all(node1, node2)     │
    │ concurrency ≤ 2               │
    └───────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │ Для каждой ноды:              │
    │ 1. Compiler heartbeat         │
    │ 2. Executor heartbeat         │
    │ 3. Critic heartbeat            │
    │ 4. Если reject → retry (×2)   │
    │ 5. Результат → pipeline_state │
    └───────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │ Проверка conditions           │
    │ Если условие не выполнено →   │
    │ нода пропускается (skipped)   │
    └───────────────────────────────┘
                    │
                    ▼
            Финальный resultJson
```

## API

### `orchestrateDag(dag, companyId, issueId)`

Главная функция оркестрации.

| Параметр | Тип | Описание |
|----------|-----|----------|
| dag | object | DAG-граф `{type:"dag", nodes:[...]}` |
| companyId | string | Paperclip company ID |
| issueId | string | Paperclip issue ID |

**Возвращает:**
```json
{
  "status": "completed",
  "results": {
    "n1": {"nodeId": "n1", "status": "succeeded", "result": {...}, "retries": 1},
    "n2": {"nodeId": "n2", "status": "succeeded", "result": {...}, "retries": 0},
    "n3": {"nodeId": "n3", "status": "skipped", "reason": "Condition n2.success not met"}
  },
  "logs": ["[DAG] ..."]
}
```

### `topologicalSort(nodes)`

Топологическая сортировка (копия из taskPlanner).

### `findLevels(nodes)`

Группировка нод по уровням исполнения.

## Выполнение ноды (executeNode)

```
executeNode(node, companyId, issueId, allResults, logs)
  │
  ├─ Проверка условия (condition)
  │   Если не выполнено → skip
  │
  ├─ Запись description задачи для Compiler
  │
  ├─ Retry loop (макс 2 попытки)
  │   ├─ 1. Compiler heartbeat
  │   ├─ 2. Executor heartbeat
  │   ├─ 3. Critic heartbeat с pipeline_state
  │   └─ Если approve → success
  │
  └─ Сохранение результата в allResults
```

## Условные переходы

Нода с `condition: "n2.success"` выполняется только если нода n2
завершилась со статусом `succeeded`. В противном случае нода
пропускается со статусом `skipped`.

## Конкурентность

- Внутри уровня ноды выполняются параллельно через `Promise.all`
- Максимум 2 одновременные ноды (MAX_CONCURRENT = 2)
- Это предотвращает перегрузку LLM-серверов на :8081/:8082/:8083

## Retry Logic

- Каждая нода получает максимум 2 попытки (MAX_RETRIES_PER_NODE = 2)
- После каждой неудачной попытки pipeline_state обновляется с новым retry_count
- Critic решает: approve (успех) или reject (повтор)
- Если все попытки исчерпаны → нода помечается как failed

## Интеграция

Оркестратор может быть вызван:
1. Из нового адаптера `dag_runner` (не реализован)
2. Напрямую из скрипта или CLI
3. Через cron задачу в Paperclip

```javascript
const dagOrc = require("./dagOrchestrator");

const result = await dagOrc.orchestrateDag(dag, companyId, issueId);
console.log(result.status);
console.log(result.results);
```

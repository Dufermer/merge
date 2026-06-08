# Complex Task Debug Report

## Задача
"прочитай файл server_config.json, найди там порт, сделай бэкап, умножь порт на 10 и отчитайся"

## Результаты проверки

### 1. CEO Agent
```
Complex task detected: 5 action verbs  (прочитай, найди, сделай, умножь, отчитайся)
Phase 1: Skipped (math=false, complex=true) ✅
Decision: delegate
```

**После фикса:** CEO больше НЕ отвечает "2+2 = 4" из памяти для сложных задач.

### 2. taskPlanner.analyzeComplexity
```
isComplex: true
estimatedSteps: 2
actionsFound: ["backup", "read_file"]
✅ Работает корректно
```

### 3. DAG Orchestrator
```
Exports: orchestrateDag, topologicalSort, findLevels
✅ Модуль загружается
```

## Найденная проблема

### Проблема 1: CEO отвечает из памяти для сложных задач (ИСПРАВЛЕНО)
До фикса: CEO находил "2+2 = 4" в памяти (similarity >= 0.6) и отвечал этим вместо обработки.
После фикса: CEO пропускает память для задач с >= 2 глаголами действия.

### Проблема 2: DAG Orchestrator не подключён к ToolRegistry
CEO вызывает `dagOrch.orchestrateDag()` с generic node actions:
```
{id: "n1", action: "read_file", params: {path: "..."}}
```

Но Orchestrator не умеет выполнять "read_file" — нет связи с Executor-ToolRegistry.
ToolRegistry живёт в `executor/index.js`, Orchestrator в `merge/dagOrchestrator.js`.

### Проблема 3: Delegation path в CEO Agent подвисает
CEO пытается делегировать через DAG Orchestrator, но Orchestrator:
- Не может выполнить ноды (нет tool handlers)
- Не возвращает ошибку быстро
- CEO ждёт 15+ секунд

## Рекомендации

1. ✅ **CEO — memory skip for complex** — ИСПРАВЛЕНО
2. ❌ DAG Orchestrator → нужно подключить ToolRegistry из executor/index.js
3. ❌ CEO delegation path → добавить timeout 5s и fallback

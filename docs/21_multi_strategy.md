# 21 — Multi-Strategy Planning

## Назначение

Multi-Strategy Planning — система, которая генерирует 2-3 разных плана (стратегии) для сложных задач, оценивает их по риску, сложности и вероятности успеха, выполняет лучший и автоматически переключается на backup при провале.

## Как это работает

```
Сложная задача
    │
    ▼
generateStrategies(task, 3)
    ├── strategy_A: "Sequential" (risk=low, complexity=3, success=0.8)
    ├── strategy_B: "Parallel" (risk=medium, complexity=6, success=0.7)
    └── strategy_C: "Delegated" (risk=low, complexity=5, success=0.75)
    │
    ▼
evaluateStrategies(strategies)
    score = (success_rate × 0.5) + ((1 - complexity/10) × 0.3) + ((1 - risk_score) × 0.2)
    │
    ▼
selectBestStrategy(evaluated)
    → strategy_A (score: 0.85)
    │
    ├── Success → готово
    │
    └── Failure → switchToBackupStrategy(...)
        → strategy_C (score: 0.72)
```

## API

| Метод | Описание |
|-------|----------|
| `generateStrategies(task, topK)` | Генерирует topK стратегий через SmolLM2 |
| `evaluateStrategies(strategies)` | Оценивает по risk, complexity, success rate |
| `selectBestStrategy(evaluated)` | Выбирает стратегию с макс. score |
| `switchToBackupStrategy(failed, backups, reason)` | Переключается на backup при провале |

## Score Formula

```
score = (success_rate × 0.5) + ((1 - normalized_complexity) × 0.3) + ((1 - risk_score) × 0.2)
```

| Параметр | Вес | Значения |
|----------|-----|----------|
| success_rate | 0.5 | 0.0-1.0 (от LLM) |
| complexity | 0.3 | 1-10 (нормализуется) |
| risk_score | 0.2 | low=0.2, medium=0.5, high=0.9 |

## Пример

```
Task: "прочитай файл, найди порт, сделай бэкап и отчитайся"

Стратегии:
  strategy_A: "Manual Failover" (risk=medium, complexity=8, success=0.70) → score=0.51
  strategy_B: "Automated Failover" (risk=medium, complexity=9, success=0.80) → score=0.53
  strategy_C: "Cloud Failover" (risk=high, complexity=10, success=0.90) → score=0.47

Лучшая: strategy_B (score: 0.53)
```

## Fallback

```
strategy_B провалилась → switchToBackupStrategy:
  "Switched from strategy_B to strategy_A due to: File not found"
  → strategy_A выполняется успешно
```

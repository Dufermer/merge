# 20 — Error Recovery Patterns

## Назначение

Error Recovery — система, которая учится на ошибках. Каждый раз, когда агент сталкивается с ошибкой, он запоминает её сигнатуру и действие, которое помогло (или не помогло). Со временем система накапливает базу эффективных паттернов восстановления.

## Как это работает

```
Task Execution
    │
    ├── Success → Git-First (auto commit)
    │
    └── Error → Error Recovery
                │
                ├── extractErrorSignature(error)
                │   "ECONNREFUSED:8081"
                │
                ├── findRecoveryPattern(error)
                │   └── Поиск в error_patterns.json
                │
                ├── Найден паттерн (successRate > 0.3)?
                │   ├── YES → applyRecovery(pattern) + retry
                │   │         └── logError(error, action, success)
                │   └── NO  → logError(error, "none", false)
                │             └── throw error
                │
                └── Результат логируется для обучения
```

## API

| Метод | Описание |
|-------|----------|
| `extractErrorSignature(error)` | Извлекает сигнатуру из ошибки |
| `logError(error, recoveryAction, success)` | Логирует ошибку и результат recovery |
| `findRecoveryPattern(error)` | Ищет паттерн восстановления |
| `applyRecovery(pattern, context)` | Применяет действие восстановления |
| `getStats()` | Статистика по всем паттернам |

## Типы recovery actions

| Action | Описание | Применяется для |
|--------|----------|-----------------|
| `restart_server` | Перезапуск сервера | ECONNREFUSED |
| `increase_timeout` | Увеличение таймаута в 2 раза | Timeout, HTTP_429 |
| `regenerate_with_stricter_gbnf` | Более строгая GBNF грамматика | SyntaxError |
| `retry_with_different_params` | Ретрай с изменёнными параметрами | EXIT_1, ENOTFOUND |
| `check_file_path` | Проверка пути к файлу | ENOENT |
| `check_permissions` | Проверка прав доступа | EACCES |

## Примеры паттернов

```json
{
  "signature": "ECONNREFUSED:8081",
  "recoveryAction": "restart_server",
  "count": 23,
  "successCount": 22,
  "successRate": 0.96,
  "lastSeen": "2026-06-08T..."
}
```

```json
{
  "signature": "Timeout:30000",
  "recoveryAction": "increase_timeout",
  "count": 5,
  "successCount": 4,
  "successRate": 0.80,
  "lastSeen": "2026-06-08T..."
}
```

## Сигнатуры ошибок

| Сигнатура | Условие |
|-----------|---------|
| `ECONNREFUSED:<port>` | error.code === "ECONNREFUSED" |
| `Timeout:<ms>` | TimeoutError |
| `SyntaxError:<text>` | SyntaxError |
| `ENOENT:file_not_found` | ENOENT |
| `HTTP_429:rate_limited` | 429 Too Many Requests |
| `EXIT_1:non_zero_exit` | Ненулевой exit code |

## Статистика

После 3+ тестов:
```
Total patterns: 2
Most common: Timeout:30000 (3 occ, 67% success)
Average success rate: 0.84
```

## Эффективность

- **successRate > 0.5** — паттерн считается эффективным, применяется автоматически
- **successRate 0.3-0.5** — паттерн существует, но ненадёжен
- **successRate < 0.3** — паттерн помечается как "ineffective", не применяется

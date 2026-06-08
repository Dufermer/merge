# 16 — Database Executor (Безопасная работа с базами данных)

## Назначение

Модуль `databaseExecutor.js` даёт агенту безопасный доступ к базам данных: SQLite (локально) и PostgreSQL (удалённо). Включает анализ схемы, автоматические бэкапы перед записью, защиту от SQL-инъекций и блокировку деструктивных операций.

## Расположение

```
~/.paperclip/adapter-plugins/executor/databaseExecutor.js
```

## Зависимости

```bash
cd ~/.paperclip/adapter-plugins/executor
npm install better-sqlite3 pg
```

## API

### `analyzeSchema(dbConfig)`

Анализирует схему БД: таблицы, колонки, типы, индексы.

| Параметр | Тип | Описание |
|----------|-----|----------|
| dbConfig | object | `{ path: "...", type: "sqlite" }` или `{ connectionString: "...", type: "postgres" }` |

**Возвращает (SQLite):**
```json
{
  "tables": [
    {
      "name": "users",
      "columns": [
        { "name": "id", "type": "INTEGER", "notNull": true, "primaryKey": true },
        { "name": "name", "type": "TEXT", "notNull": true },
        { "name": "email", "type": "TEXT", "notNull": false }
      ],
      "rowCount": 3
    }
  ]
}
```

### `executeQuery(sql, params, dbConfig, options)`

Выполняет SQL-запрос с параметризацией и защитой.

| Параметр | Тип | Описание |
|----------|-----|----------|
| sql | string | SQL-запрос с `?` placeholders |
| params | array | Параметры (для защиты от SQL-инъекций) |
| dbConfig | object | `{ path, type }` или `{ connectionString, type }` |
| options | object | `{ readOnly, autoBackup }` |

**Возвращает:**
```json
{
  "rows": [{ "id": 1, "name": "Alice" }],
  "changes": 0,
  "backupCreated": false,
  "backupPath": null,
  "blocked": false,
  "error": null
}
```

### `validateSqlSafety(sql)`

Проверяет SQL-запрос на безопасность.

| Результат | Операции | Статус |
|-----------|----------|--------|
| safe | SELECT, PRAGMA, EXPLAIN, INSERT, UPDATE (с WHERE), DELETE (с WHERE) | ✅ Разрешено |
| blocked | DROP TABLE, TRUNCATE, DELETE без WHERE, UPDATE без WHERE, ATTACH | ❌ Заблокировано |

## Безопасность

### 1. Параметризованные запросы

Все значения передаются через `?` placeholders. Сырые строки в SQL запрещены.

```javascript
// ✅ Правильно
executeQuery("UPDATE users SET email = ? WHERE id = ?", ["new@test.com", 1], ...)

// ❌ Неправильно (риск SQL-инъекции)
executeQuery("UPDATE users SET email = '" + email + "' WHERE id = " + id, [], ...)
```

### 2. Автоматический бэкап

Перед write-операциями (INSERT, UPDATE, DELETE, CREATE) создаётся копия файла БД:
```
data/.db_backups/test_users.db.<timestamp>.bak
```

### 3. Блокировка деструктивных операций

| Команда | Статус | Причина |
|---------|--------|---------|
| `DROP TABLE` | ❌ Blocked | Destructive DDL |
| `TRUNCATE` | ❌ Blocked | Destructive DDL |
| `DELETE FROM users` (без WHERE) | ❌ Blocked | Безопасность |
| `UPDATE users SET x=1` (без WHERE) | ❌ Blocked | Безопасность |
| `ATTACH DATABASE` | ❌ Blocked | Безопасность |
| `DELETE FROM users WHERE id=1` | ✅ Разрешено | Есть WHERE |
| `INSERT INTO users ...` | ✅ Разрешено | Безопасно |
| `SELECT ...` | ✅ Разрешено | Read-only |

### 4. Rollback при ошибке

Если write-запрос падает с ошибкой (неправильный синтаксис, constraint violation):
1. Файл БД восстанавливается из бэкапа
2. В логах фиксируется `Rollback: completed`

## Интеграция с ToolRegistry

Инструмент `db_query` в `executor/index.js`:

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| sql | string | Да | SQL-запрос с `?` placeholders |
| params | array | Нет | Параметры запроса |
| dbType | string | Нет | `sqlite` (по умолч.) или `postgres` |
| dbPath | string | Для SQLite | Путь к .db файлу |
| connectionString | string | Для Postgres | Строка подключения |

## Примеры

### Чтение данных

```json
{
  "tool_name": "db_query",
  "strict_params": {
    "sql": "SELECT id, name, email FROM users WHERE id = ?",
    "params": [1],
    "dbType": "sqlite",
    "dbPath": "C:\\Users\\rus\\Desktop\\merge\\data\\test_users.db"
  }
}
```

### Анализ схемы

```json
{
  "tool_name": "db_query",
  "strict_params": {
    "sql": "SELECT name FROM sqlite_master WHERE type='table'",
    "dbType": "sqlite",
    "dbPath": "C:\\Users\\rus\\Desktop\\merge\\data\\test_users.db"
  }
}
```

### Запись с авто-бэкапом

```json
{
  "tool_name": "db_query",
  "strict_params": {
    "sql": "UPDATE users SET email = ? WHERE id = ?",
    "params": ["new@test.com", 1],
    "dbType": "sqlite",
    "dbPath": "C:\\Users\\rus\\Desktop\\merge\\data\\test_users.db"
  }
}
```

## E2E Тест

### Тест 1 — Schema + SELECT

```bash
Schema: 1 table (users: 3 columns)
Query: SELECT id, name, email FROM users
Result: 3 rows (Alice, Bob, Charlie)
✅ Read-only, no backup needed
```

### Тест 2 — UPDATE с бэкапом

```bash
Query: UPDATE users SET email = ? WHERE id = ?
Params: ["new@test.com", 1]
Backup: ✅ test_users.db.1234567890.bak (8192 bytes)
Changes: 1
Email changed: alice@test.com → new@test.com
```

### Тест 3 — Блокировка DROP TABLE

```bash
Query: DROP TABLE users
Blocked: ✅ YES
Reason: "DROP" is blocked by safety policy. Destructive DDL operations are not allowed.
Команда не выполнена.
```

### Тест 4 — Блокировка DELETE без WHERE

```bash
Query: DELETE FROM users
Blocked: ✅ YES
Reason: DELETE without WHERE is blocked by safety policy. Add a WHERE clause.
Команда не выполнена.
```

## Поддерживаемые БД

| Тип | Драйвер | Статус |
|-----|---------|--------|
| SQLite | better-sqlite3 | ✅ Работает |
| PostgreSQL | pg | ✅ Реализован (ждёт тестов с реальным сервером) |

## Ограничения

1. **PostgreSQL требует async:** Все pg-запросы асинхронные. Схема анализируется через `information_schema`.
2. **Бэкап только для SQLite:** Для Postgres рекомендуется использовать серверные снапшоты.
3. **WAL mode:** SQLite открывается с `journal_mode=WAL` для лучшей конкурентности.
4. **Нет JOIN-анализа:** Модуль не анализирует сложные JOIN-ы — только базовую безопасность по первому токену.

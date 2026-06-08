# 15 — Code Patcher (Генерация и применение патчей)

## Назначение

Модуль `codePatcher.js` замыкает полный цикл: "найди код → модифицируй → примени → проверь". Использует SmolLM2 на :8083 для генерации модификаций кода через GBNF-грамматику `codePatch.gbnf`.

## Расположение

```
~/.paperclip/adapter-plugins/executor/codePatcher.js
~/.paperclip/adapter-plugins/executor/codePatch.gbnf
```

## Зависимости

- `@babel/parser` (уже установлен для `codebaseAnalyzer.js`)
- SmolLM2 на :8083 (для генерации кода)
- `codePatch.gbnf` (GBNF-грамматика для structured output)

## API

### `generatePatch(filePath, functionName, modificationType, context)`

Генерирует модификацию кода через SmolLM2.

| Параметр | Тип | Описание |
|----------|-----|----------|
| filePath | string | Абсолютный путь к файлу |
| functionName | string | Имя функции/класса для модификации |
| modificationType | string | `add_try_catch` / `add_logging` / `refactor` / `fix_bug` |
| context | string | Дополнительный контекст (описание проблемы) |

**Типы модификаций:**

| Тип | Что делает |
|-----|-----------|
| `add_try_catch` | Оборачивает тело функции в try-catch, логирует ошибки, возвращает значение по умолчанию |
| `add_logging` | Добавляет console.log на entry, ключевых ветвлениях и return |
| `refactor` | Рефакторинг: современный синтаксис, разделение на helper-функции |
| `fix_bug` | Исправление бага по описанию из context |

**Возвращает:**
```json
{
  "originalCode": "function old(params) { ... }",
  "modifiedCode": "function new(params) { ... }",
  "diff": "- old line\n+ new line",
  "language": "javascript",
  "startLine": 10,
  "endLine": 25,
  "filePath": "...",
  "functionName": "handleUserLogin",
  "logs": []
}
```

### `validatePatch(modifiedCode, language)`

Валидирует сгенерированный код.

| Параметр | Тип | Описание |
|----------|-----|----------|
| modifiedCode | string | Код для валидации |
| language | string | javascript / python / go / ... |

**Что проверяет:**
- Баланс скобок `{}`, `[]`, `()` (с учётом строк и комментариев)
- JS/TS: полный синтаксический анализ через `@babel/parser`
- Python: эвристики (начинается с `def`/`class`, проверка отступов)
- Пустой код
- Markdown-обёртки (``` ```) и преамбулы/постскриптумы

**Возвращает:**
```json
{ "valid": true, "errors": [] }
```

### `applyPatch(filePath, functionName, modifiedCode, location)`

Применяет патч к файлу.

| Параметр | Тип | Описание |
|----------|-----|----------|
| filePath | string | Путь к файлу |
| functionName | string | Имя функции для замены |
| modifiedCode | string | Новый код функции |
| location | object | `{ startLine, endLine }` (опционально, ускоряет поиск) |

**Процесс:**
1. Создаёт бэкап в `.backups/<filename>.<timestamp>.bak`
2. Находит функцию в файле через regex
3. Определяет границы функции (баланс скобок)
4. Заменяет старый код на новый
5. Записывает файл

**Возвращает:**
```json
{ "success": true, "backupPath": "...", "linesReplaced": 15 }
```

### `verifyWithTests(workDir, testCommand, backupPath, originalFilePath)`

Выполняет тесты и автоматический rollback при неудаче.

| Параметр | Тип | Описание |
|----------|-----|----------|
| workDir | string | Рабочая директория |
| testCommand | string | Команда для запуска тестов |
| backupPath | string | Путь к бэкапу для rollback |
| originalFilePath | string | Путь к файлу для восстановления |

**Процесс:**
1. Выполняет `testCommand` через `child_process.execFile`
2. Если exitCode ≠ 0 → восстанавливает файл из бэкапа
3. Возвращает результат

**Возвращает:**
```json
{
  "passed": true,
  "exitCode": 0,
  "testOutput": "...",
  "rolledBack": false
}
```

## Интеграция с ToolRegistry

Инструмент `code_patch` в `executor/index.js`:

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| filePath | string | Да | Путь к файлу |
| functionName | string | Да | Имя функции/класса |
| modificationType | string | Нет | add_try_catch / add_logging / refactor / fix_bug |
| context | string | Нет | Описание проблемы |
| testCommand | string | Нет | Команда для verifyWithTests (опционально) |

**Полный конвейер:**
1. `generatePatch` → LLM на :8083 → генерация кода
2. `validatePatch` → Babel-парсинг + баланс скобок
3. `applyPatch` → бэкап → замена → запись
4. `verifyWithTests` (если указан testCommand) → тесты → rollback при ошибке

## Пример вызова (от Компилятора)

```json
{
  "tool_name": "code_patch",
  "strict_params": {
    "filePath": "C:\\Users\\rus\\Desktop\\merge\\data\\auth_module.js",
    "functionName": "handleUserLogin",
    "modificationType": "add_try_catch",
    "context": "Function crashes when username is null",
    "testCommand": "node -e \"require('./data/auth_module').handleUserLogin(null, 'test')\""
  }
}
```

## Ограничения

1. **LLM-зависимость:** Качество патча зависит от SmolLM2 на :8083. Для сложных рефакторингов может потребоваться более мощная модель.
2. **Regex-поиск функций:** Для не-JS языков (Python, Go) границы функции определяются по балансу скобок, что может давать false positives на вложенных конструкциях.
3. **Только READ-ONLY для codebaseAnalyzer:** `codePatcher.js` — ПЕРВЫЙ модуль, который **изменяет** файлы. Всегда создаёт бэкап перед записью.
4. **GBNF-грамматика:** Текущая `codePatch.gbnf` — свободная (разрешён любой текст). Ужесточение грамматики (строгий JS AST) — в будущих версиях.
5. **Rollback:** Работает только если указан `testCommand`. Без тестов rollback не выполняется.

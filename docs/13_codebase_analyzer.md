# 13 — Codebase Analyzer (Семантический анализ кода)

## Назначение

Модуль `codebaseAnalyzer.js` даёт Исполнителю (Agent #3) способность "понимать" код: строить AST-индекс проекта, искать функции/классы по естественному запросу и извлекать фрагменты кода.

**Принцип:** Никаких внешних AI API. Вся логика — локальный JS + AST-парсинг через Babel.

## Расположение

```
~/.paperclip/adapter-plugins/executor/codebaseAnalyzer.js
```

## Зависимости

```bash
cd ~/.paperclip/adapter-plugins/executor
npm install @babel/parser @babel/traverse
```

## API

### `scanProjectStructure(rootDir)`

Рекурсивно сканирует директорию.

| Параметр | Тип | Описание |
|----------|-----|----------|
| rootDir | string | Корневая директория проекта |

**Возвращает:**
```json
{
  "files": [
    { "path": "...", "relPath": "...", "ext": ".js", "lang": "javascript", "name": "file.js", "size": 1234 }
  ],
  "totalFiles": 88,
  "rootDir": "..."
}
```

Игнорирует: `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.next`, `target`, `vendor`, `venv`, бинарные/миницифированные файлы.

### `buildAstIndex(scanResult)`

Строит AST-индекс из результатов сканирования.

| Параметр | Тип | Описание |
|----------|-----|----------|
| scanResult | object | Результат `scanProjectStructure()` |

**Поддерживаемые языки:**

| Язык | Парсер |
|------|--------|
| JavaScript / JSX | @babel/parser (полный AST + traverse) |
| TypeScript / TSX | @babel/parser + typescript plugin |
| Python | Regex-эвристики (`def`, `class`) |
| Go | Regex (`func Name(params)`) |
| Rust | Regex (`fn name(params)`) |
| Java / C# | Regex (`public Type Name(params)`) |
| Ruby, PHP | Regex (`def`, `function`) |

**Извлекаемые сущности:**
- **Functions**: имя, файл, строка, сигнатура, async, тип (declaration/arrow/definition)
- **Classes**: имя, файл, строка, сигнатура, список методов
- **Methods**: имя, файл, строка, родительский класс, kind (method/get/set)
- **Imports (ESM)**: source, names, file
- **Exports (ESM)**: name, file, type (function/class/variable)

**Возвращает:**
```json
{
  "index": {
    "functions": [...],
    "classes": [...],
    "imports": [...],
    "exports": [...],
    "all": { "handleUserLogin": [{ type: "function", ... }] }
  },
  "stats": { "totalFunctions": 13, "totalClasses": 1, ... },
  "warnings": ["[SKIP] ..."]
}
```

### `semanticSearch(query, index)`

Семантический поиск по AST-индексу.

| Параметр | Тип | Описание |
|----------|-----|----------|
| query | string | Естественный запрос ("функция обработки входа") |
| index | object | Индекс из `buildAstIndex()` |

**Алгоритм ранжирования:**

| Уровень | Условие | Confidence |
|---------|---------|------------|
| exact_name | query === functionName | 1.0 |
| partial_name | Совпадение слов (camelCase разбивка + синонимы) | 0.5-0.9 |
| signature | Совпадение в сигнатуре функции | 0.3-0.6 |
| type_filter | Фильтр по типу сущности (function/class) | 0.2 |

**Cинонимы:**
```
login ↔ auth ↔ authenticate ↔ signin
create ↔ add ↔ insert ↔ new ↔ make
read ↔ get ↔ fetch ↔ find ↔ query
update ↔ edit ↔ modify ↔ change ↔ set
delete ↔ remove ↔ destroy ↔ drop
database ↔ db ↔ sql ↔ storage
validate ↔ check ↔ verify ↔ test
error ↔ exception ↔ fail ↔ throw
handle ↔ process ↔ manage → handler
```

**Возвращает:**
```json
{
  "results": [
    { "name": "handleUserLogin", "entityType": "function", "confidence": 1.0,
      "matchType": "exact_name", "line": 18,
      "file": { "relPath": "data/auth_module.js", ... },
      "signature": "async function(username, password)" }
  ],
  "totalMatches": 3,
  "expandedTerms": ["login", "auth", "authenticate", ...]
}
```

### `extractCodeBlock(filePath, startLine, endLine)`

Безопасно читает фрагмент кода из файла.

| Параметр | Тип | Описание |
|----------|-----|----------|
| filePath | string | Абсолютный путь к файлу |
| startLine | int | Начальная строка (1-indexed) |
| endLine | int | Конечная строка |

**Возвращает:**
```json
{
  "code": "async function handleUserLogin(...",
  "filePath": "C:\\...\\auth_module.js",
  "startLine": 17,
  "endLine": 23,
  "totalLines": 150,
  "size": 512
}
```

## Интеграция с ToolRegistry

Добавлен инструмент `codebase_search` в `executor/index.js`:

| Параметр | Тип | Описание |
|----------|-----|----------|
| query | string | **Обязательно.** Запрос для поиска |
| target_dir | string | Опционально. Путь к проекту (по умолч. merge/) |

**Пример вызова:**
```json
{
  "tool_name": "codebase_search",
  "strict_params": {
    "query": "функция обработки входа пользователей",
    "target_dir": "C:\\Users\\rus\\Desktop\\merge"
  }
}
```

**Возвращает:**
```json
{
  "status": "success",
  "tool_executed": "codebase_search",
  "data_source": "external_tool",
  "resultJson": {
    "query": "login handler",
    "scan_stats": { "total_files": 88, "parseable_files": 7 },
    "index_stats": { "totalFunctions": 13, "totalClasses": 1, ... },
    "search_results": [
      { "name": "handleUserLogin", "confidence": 0.58, ... }
    ],
    "extracted_code": "async function handleUserLogin(..."
  }
}
```

## Ограничения

1. **CJS imports/exports не парсятся.** Babel парсит только ESM (`import`/`export`). `require()`/`module.exports` пропускаются. В будущем — статический анализ CJS.
2. **Русские запросы.** Синонимы только на английском. Русский запрос ("функция входа") → 0 совпадений при английских именах функций.
3. **Regex fallback.** Для Python/Go/Rust/Java — точность ниже, чем Babel AST. Могут быть false positives.
4. **Размер файлов.** Файлы >1MB и неизвестные расширения (.gguf, .dll, .exe) пропускаются автоматически.
5. **Только READ-ONLY.** Модуль не создаёт и не изменяет файлы. Модификация кода — в Спринте 3.
6. **import парсинг.** Только ESM-импорты. CJS `require()` не детектится.

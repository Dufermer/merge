# 24 — Graphify Integration (Knowledge Graph)

## Назначение

Graphify — локальный knowledge graph builder, который строит граф кодовой базы (функции, файлы, связи) через AST-парсинг (tree-sitter). CEO Agent использует граф для понимания архитектуры проекта без сканирования файлов.

## Установка

```bash
npm install @sentropic/graphify
npx @sentropic/graphify update
```

Построит `.graphify/graph.json` (40+ nodes, 44+ edges).

## Команды

| Команда | Описание | Пример |
|---------|----------|--------|
| `update` | Построить/обновить граф | `npx graphify update` |
| `query <question>` | BFS-поиск по графу | `graphify query "auth"` |
| `path <source> <target>` | Кратчайший путь | `graphify path executeNode httpRequest` |
| `explain <node>` | Детали ноды | `graphify explain executeNode` |
| `serve [graph]` | MCP сервер | `graphify serve` |

## Интеграция с CEO Agent

### graphify_query tool (ToolRegistry #9)

Добавлен в Executor:

| Параметр | Тип | Описание |
|----------|-----|----------|
| `operation` | string | query, path, explain, god_nodes |
| `question` | string | Для operation=query |
| `node_name` | string | Для operation=explain |
| `from_node` / `to_node` | string | Для operation=path |
| `limit` | number | Для operation=god_nodes (default: 10) |

### Phase 0 Project Context

CEO загружает god nodes при старте:
```
Phase 0: "Loaded 10 god nodes from Graphify"
```

### Project Context auto-update

После успешной задачи CEO может обновить PROJECT_CONTEXT.md из Graphify:
```
Tech Stack → добавлено: "Graphify — local knowledge graph"
Key Files → добавлено: ".graphify/ — knowledge graph data"
```

## Примеры

### God nodes (топ-10 самых связанных концепций)

```
1. ceoAgent.js (degree: 10)
2. handleUserLogin() (degree: 4)
3. executeNode() (degree: 3)
4. dagOrchestrator.js (degree: 3)
5. httpRequest() (degree: 2)
```

### Path между нодами

```
executeNode() --calls--> httpRequest()
```

### Explain ноды

```
Node: executeNode()
  Source: dagOrchestrator.js L97
  Community: 4
  Degree: 3
  Connections:
    --> dagOrchestrator.js [contains]
    --> httpRequest() [calls]
    --> writeState() [calls]
```

## Требования

- `@sentropic/graphify` установлен локально
- Граф построен (`npx graphify update`)
- 30 KB disk space для graph.json

## Ограничения

- Graphify работает на AST-уровне (функции, классы, импорты)
- PowerShell файлы не поддерживаются (tree-sitter-powershell отсутствует)
- Граф нужно перестраивать при изменении кода

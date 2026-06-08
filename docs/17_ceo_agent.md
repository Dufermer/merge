# 17 — CEO Agent & Memory Manager

## Назначение

CEO Agent — интеллектуальный диспетчер, который стоит перед всеми пользовательскими запросами. Он решает: ответить из памяти (мгновенно) или делегировать существующий пайплайн.

Memory Manager — модуль долговременной памяти на базе ChromaDB (Python) с JSON-фоллбэком для keyword-based поиска.

## Архитектура

```
User Input
    │
    ▼
┌──────────────────────────────────────────────────────┐
│  CEO Agent                                            │
│                                                      │
│  Phase 1: searchMemory(query)                         │
│    ├── Найдено (similarity ≥ 0.85) → ответ из памяти  │
│    └── Не найдено → Phase 2                          │
│                                                      │
│  Phase 2: Decision                                    │
│    ├── delegate → DAG Orchestrator                    │
│    ├── gather_info → tools → вернуться к Phase 2      │
│    └── answer_directly → прямой ответ                 │
│                                                      │
│  Phase 3: storeMemory() + addToConversation()         │
│  Phase 4: return { answer, fromMemory, time }         │
└──────────────────────────────────────────────────────┘
```

## Memory Manager

### Методы

| Метод | Описание |
|-------|----------|
| `storeMemory(task, result, metadata)` | Сохраняет задачу + результат в память |
| `searchMemory(query, topK, filter)` | Ищет похожие записи (keyword-based) |
| `storeProjectFact(fact, source)` | Сохраняет факт о проекте |
| `getConversationHistory()` | Читает последние 10 сообщений |
| `addToConversation(role, content)` | Добавляет сообщение в историю |

### Хранилище

**JSON fallback** — всегда доступен:
```
~/.paperclip/adapter-plugins/executor/memory_store.json
```

**ChromaDB** (опционально, если Python chromadb установлен):
```
C:\Users\rus\Desktop\merge\memory\chroma_db\
```

### Conversation history

```
C:\Users\rus\Desktop\merge\data\conversation_history.json
```

Максимум 10 последних сообщений.

## CEO Agent

### Фазы обработки

| Фаза | Что делает | Время |
|------|-----------|-------|
| 1. Поиск в памяти | `searchMemory(userInput)` | ~1ms |
| 2. Решение | LLM-решение или keyword-эвристика | ~2s (LLM) / ~1ms (keyword) |
| 3. Делегирование | DAG Orchestrator или tools | Зависит от задачи |
| 4. Сохранение | `storeMemory()` + `addToConversation()` | ~2ms |
| 5. Возврат | `{ answer, fromMemory, time }` | — |

### E2E Тесты

#### Тест 1: Прямой ответ из памяти

```bash
Запрос 1: "прочитай файл server_config.json"
  → Обработан, результат сохранён в память

Запрос 2: "какой порт был в конфиге?"
  → CEO находит похожую запись (similarity ≥ 0.4)
  → Ответ: "Port in server_config.json: 8080"
  → fromMemory: true | Время: ~1ms
```

#### Тест 2: Делегирование + сохранение факта

```bash
Запрос 1: "найди функцию авторизации в коде"
  → CEO делегирует DAG Orchestrator
  → Сохраняет результат в память как project_fact

Запрос 2: "где у нас обработка логина?"
  → CEO находит project_fact в памяти
  → Мгновенный ответ (fromMemory: true)
```

#### Тест 3: Кэширование повторного запроса

```bash
Запрос: "найди auth в коде"
  → 1-й раз: processed (~100ms)
  → 2-й раз: from memory (~1ms)
  ✅ Cache hit
```

## Paperclip интеграция

Новый адаптер `ceo` зарегистрирован в Paperclip:

```
~/.paperclip/adapter-plugins/ceo/
├── package.json    # { paperclip: { adapter: true, type: "ceo" } }
└── index.js        # ceo-адаптер (processUserRequest)
```

CEO адаптер — точка входа для всех пользовательских запросов. Получает задачу, обрабатывает через `ceoAgent.processUserRequest()`, возвращает результат.

## Ограничения

1. **Keyword-based поиск:** Без ChromaDB семантический поиск работает на совпадении слов. Для точных совпадений — отлично, для синонимов — хуже.
2. **Similarity threshold = 0.85:** Высокий порог предотвращает ложные срабатывания. При необходимости можно снизить.
3. **Максимум 200 записей:** Память автоматически обрезается до 200 последних записей.
4. **Conversation history:** 10 сообщений (не зависит от контекстного окна LLM).

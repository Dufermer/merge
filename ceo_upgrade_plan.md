# CEO Agent Upgrade Plan — Hermes-Based Wrapper

## Текущее состояние (честно)
- CEO — статичный `processUserRequest()` без agent loop
- Нет think → act → observe цикла
- CEO не умеет решать, какие инструменты вызывать
- DAG Orchestrator не подключён к ToolRegistry
- End-to-end пайплайн не работает

## Цель
Создать Hermes-подобный agent loop для CEO, который:
1. Принимает задачу
2. Думает (think): анализирует, какие шаги нужны
3. Делает (act): вызывает инструменты/ToolRegistry
4. Наблюдает (observe): проверяет результат, решает что дальше
5. Повторяет пока задача не решена

## Оценка сложности: 4-5 дней

## План

### День 1: Интерфейсы + Wrapper

#### CEO ↔ Paperclip Interface (остаётся)
```javascript
// ceo/index.js — Paperclip adapter
async function execute(ctx) {
  const issue = await fetchIssue(ctx);
  const result = await ceoAgentV2.processTask(issue.description);
  await updateIssueStatus(issue.id, "done", result);
  return { exitCode: 0, resultJson: result };
}
```

#### CEO ↔ ToolRegistry Interface (НОВЫЙ)
```javascript
// ceoAgentV2 uses ToolRegistry directly
const toolResult = await toolRegistry.execute("read_file", { path: "data/config.json" });
// вместо вызова DAG Orchestrator
```

#### Agent Loop Interface (НОВЫЙ)
```javascript
// hermes-wrapper.js — Hermes-подобный agent loop
class AgentLoop {
  async run(task) {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const thought = await this.think(task, context);
      const action = await this.decide(thought);
      const result = await this.act(action);
      context = this.observe(result, context);
      if (this.isDone(context)) break;
    }
  }
}
```

### Файлы для создания:
1. `ceoAgentV2.js` — новый CEO с agent loop
2. `hermes-wrapper.js` — agent loop implementation
3. `toolRegistryClient.js` — клиент для ToolRegistry

### День 2: Agent Loop

Реализовать think → act → observe:
- **Think:** LLM (SmolLM2 :8083) анализирует задачу, решает какой tool вызвать
- **Act:** Вызывает tool через ToolRegistry (executor/index.js)
- **Observe:** Проверяет результат, решает нужен ли ещё шаг

```javascript
async function think(task, context) {
  // LLM decides: what tool to call, with what params
  const decision = await callLLM(`Task: ${task}\nAvailable tools: ${listTools()}\nWhat tool to call?`);
  return decision;
}

async function act(decision) {
  // Execute through ToolRegistry
  return await toolRegistry.execute(decision.tool, decision.params);
}

function observe(result, context) {
  // Check if done, update context
  context.results.push(result);
  context.done = result.success && !result.needsMoreSteps;
  return context;
}
```

### День 3: Интеграция с ToolRegistry

Связать agent loop с 9 инструментами:
```javascript
const TOOL_REGISTRY = {
  read_file: async (params) => { ... },
  web_search: async (params) => { ... },
  calculate: async (params) => { ... },
  // ... все 9 инструментов
};
```

### День 4: Сохранение CEO-фич

Добавить поверх agent loop:
- Memory (NodeVectorStore)
- Skills (skillManager)
- Multi-Strategy (multiStrategy.js)
- Project Context (projectContext.js)

### День 5: Тестирование + Стабилизация

- Простой тест: "сколько будет 2+2" → calculate tool → ответ
- Сложный тест: "прочитай файл, найди порт, умножь на 10" → 3 шага
- Error handling: retry при ошибке LLM, fallback при недоступности tool
- Paperclip: задача создаётся, CEO обрабатывает, статус done

## Ключевые решения

1. **CEO остаётся Paperclip adapter'ом** — ceo/index.js не меняется сильно
2. **ceoAgentV2.js** — новая версия с agent loop (старый ceoAgent.js остаётся для совместимости)
3. **ToolRegistry — единый источник правды** для всех инструментов
4. **Hermes-wrapper** — легковесный agent loop (не форк Hermes, а адаптация паттерна)

## Риски

1. SmolLM2 на :8083 может быть слишком слабым для agent loop → fallback на rule-based
2. ToolRegistry в executor/index.js — монолитный файл 1400+ строк → нужно вынести tools в отдельные модули
3. LLM latency (~1s per call) × много шагов → может быть медленно

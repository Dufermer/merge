# Autonomous Self-Correcting MoE Pipeline

**Paperclip + llama.cpp** — v1.0.0

Локальная, приватная система из 4 AI-агентов, способная понимать русский язык,
искать в интернете, выполнять задачи и самостоятельно исправлять ошибки без
участия человека.

## Архитектура

```
[User] ──→ (Translator :8081) ──→ (Compiler :8082) ──→ (Executor :8083) ──→ (Critic :8083) ──→ [Result]
                                     ↑                                                    │
                                     └────────────────── Retry Loop ───────────────────────┘
```

| Агент | Порт | Модель | Роль |
|-------|------|--------|------|
| **Translator** | 8081 | Saiga Llama3 8B (Q4_K_M) | Парсит русский текст в JSON-контракт |
| **Compiler** | 8082 | Qwen2.5-Coder-7B (Q4_K_M) | Компилирует JSON в system tool-call |
| **Executor** | 8083 | SmolLM2-1.7B (Q8_0) | Исполняет инструменты (read_file, web_search) |
| **Critic** | 8083 | SmolLM2-1.7B (Q8_0) | Валидирует результат, approve/reject, retry |

## Hardware Requirements

| Компонент | Минимум | Рекомендация |
|-----------|---------|--------------|
| GPU | RTX 3070 8GB | RTX 4090 24GB |
| RAM | 16 GB | 32 GB |
| CPU | Ryzen 7 7700 | 8+ ядер |
| Диск | 30 GB свободно | SSD |
| ОС | Windows 10/11 | Vulkan-драйверы |

## Quick Start

```powershell
# 1. Запустить всю инфраструктуру одной командой
powershell -ExecutionPolicy Bypass -File start_all.ps1

# 2. Создать задачу (пример)
curl -s -X POST "http://127.0.0.1:3100/api/companies/{companyId}/issues" \
  -H "Content-Type: application/json" \
  -d '{"title":"Read config","body":"прочитай файл server_config.json","status":"todo"}'

# 3. Прогнать через пайплайн
npx paperclipai heartbeat run -a "{translatorId}" --source assignment --timeout-ms 0
npx paperclipai heartbeat run -a "{compilerId}" --source assignment --timeout-ms 0
npx paperclipai heartbeat run -a "{executorId}" --source assignment --timeout-ms 0
npx paperclipai heartbeat run -a "{criticId}" --source assignment --timeout-ms 0
```

## Структура

```
merge/
├── llama_cpp/          — бинарники llama-server и GGUF-модели
├── data/               — данные для инструментов (configs, pipeline state)
├── docs/               — полная документация
│   ├── 00_OVERVIEW.md          — карта системы
│   ├── 01_llama_cpp_setup.md   — установка инференс-сервера
│   ├── 02_model_translator.md  — модель Переводчика
│   ├── 03_paperclip_translator.md — интеграция Переводчика
│   ├── 04_model_compiler.md    — модель Компилятора
│   ├── 05_paperclip_compiler.md  — интеграция Компилятора
│   ├── 06_full_system_run.md   — полный прогон пайплайна
│   ├── 07_model_executor.md    — модель Исполнителя (ToolRegistry)
│   ├── 08_paperclip_executor.md  — интеграция Исполнителя
│   ├── 09_model_critic.md      — модель Критика
│   └── 10_paperclip_critic.md  — интеграция Критика
├── start_all.ps1       — запуск всех сервисов
├── stop_all.ps1        — остановка всех сервисов
└── README.md           — этот файл
```

## Принципы

- **Stateless** — каждый вызов execute() не хранит историю
- **Tool Execution Layer** — LLM не источник данных, а только форматтер
- **GBNF grammar** — строгий JSON на выходе каждой модели
- **Self-correcting** — Critic валидирует результат, retry до 2 раз
- **Stealth web search** — реальный веб-поиск через Playwright + Bing

## Paperclip Dashboard

Локальный UI: http://127.0.0.1:3100
API: http://127.0.0.1:3100/api

## License

MIT

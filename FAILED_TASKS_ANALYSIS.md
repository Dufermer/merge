# Failed Tasks Analysis

## Общая статистика
| Метрика | Значение |
|---------|----------|
| Total tasks | 200 |
| Done | 117 (58.5%) |
| Blocked | 70 (35.0%) |
| Cancelled | 9 (4.5%) |
| Todo | 4 (2.0%) |
| **Real success rate** | **58.5%** |
| **Real failure rate** | **39.5%** |

## Топ-7 паттернов ошибок

### 1. other — 32 задачи (45.7%)
Разнородные задачи: "critic" pipeline, backup, deploy, docker, git.
- *Пример*: `{"pipeline_state":"pipeline_state.json","task":"critic"}`
- *Пример*: `{"tool_name": "backup", "strict_params": {"full": true, "target": "database"}}`
- **Причина**: CEO не умеет обрабатывать JSON-инструкции с tool_name/params — Translator неправильно парсит structured commands.

### 2. file_read — 19 задач (27.1%)
Чтение файлов: прочитай файл data/test.txt и т.д.
- *Пример*: `прочитай файл data/test.txt`
- *Пример*: `прочитай файл data/production_config.json, найди там порт, умножь номер порта на 5`
- **Причина**: CEO не может выполнить multi-step инструкции (прочитай → найди → умножь → отчёт). Нужен skill для pipeline с последовательными tool calls.

### 3. web_fetch — 9 задач (12.9%)
Веб-запросы: репозитории GitHub, URL.
- *Пример*: `прочитай этот репозиторий https://github.com/nousresearch/hermes-agent`
- *Пример*: `{"tool_name":"read_file","system_command":"Read server_config.json"}`
- **Причина**: GitHub анализ требует multi-step (fetch → parse → summarize). JSON-формат не парсится.

### 4. calculate — 9 задач (12.9%)
Вычисления и поиск.
- *Пример*: `3-step pipeline final test v2`
- *Пример*: `{"tool_name":"web_search","system_command":"Search USD/RUB exchange rate"}`
- **Причина**: Pipeline-задачи с несколькими шагами — CEO не держит контекст между шагами.

### 5. config_read — 5 задач (7.1%)
Чтение конфигов — подмножество file_read.
- *Пример*: `{"tool_name": "read_file", "system_command": "Read server_config.json", "strict_params": {"path": "server_config.json"}}`
- **Причина**: JSON-формат инструкций не конвертируется в tool calls.

### 6. code_search — 4 задачи (5.7%)
Поиск в коде.
- *Пример*: `{"tool_name":"web_search","system_command":"Search web for Apple founding date"}`
- **Причина**: Web_search не имплементирован как tool.

### 7. list_files — 1 задача (1.4%)
- *Пример*: `сколько файлов на рабочем столе?`
- **Причина**: list_files tool не вызывается.

## Корень проблем
1. **JSON-инструкции не парсятся** — Translator не конвертирует `{"tool_name":"read_file","strict_params":{"path":"..."}}` в реальный tool call
2. **Multi-step pipeline** — задачи с 2+ шагами (прочитай → найди → умножь → отчёт) падают
3. **Web_search tool** — не имплементирован как tool для CEO
4. **File_read path handling** — пути с подчеркиваниями (production_config.json) не работают

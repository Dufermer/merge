# 04 — Компилятор (Compiler)

## Назначение

Компилятор — Agent #2 в конвейере Stateless MoE. Получает JSON-контракт от
Переводчика (Agent #1) и компилирует его в строгий system tool-call для
Исполнителя (Agent #3).

## Поток

```
Translator resultJson  ──→  Compiler  ──→  resultJson
{intent, target, params}      :8082      {system_command, tool_name, strict_params}
```

## Модель

| Параметр | Значение |
|----------|----------|
| Модель | Qwen2.5-Coder-7B-Instruct-GGUF |
| Ссылка HF | https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF |
| Размер (Q4_K_M) | ~4.5 GB |
| Формат | GGUF (Q4_K_M) |
| Порт | 8082 |
| Температура | 0.0 |
| Max tokens | 512 |

## Путь к файлу

```
C:\Users\rus\Desktop\merge\llama_cpp\qwen2.5-coder-7b-instruct-q4_k_m.gguf
```

## GBNF-грамматика (compiler.gbnf)

Файл: `~/.paperclip/adapter-plugins/compiler/compiler.gbnf`

```gbnf
# GBNF grammar for Logic Compiler (Agent #2)
# Forces strict JSON output: system_command + tool_name + strict_params

root  ::= "{" ws
  "\"system_command\"" ws ":" ws string ","
  ws "\"tool_name\"" ws ":" ws tool_enum ","
  ws "\"strict_params\"" ws ":" ws object
  ws "}"

# Enum of available system tools for the Executor
tool_enum ::= "\"update_schema\""
  | "\"execute_sql\""
  | "\"restart_service\""
  | "\"deploy\""
  | "\"configure\""
  | "\"run_migration\""
  | "\"backup\""
  | "\"restore\""
  | "\"scale\""
  | "\"inspect\""
  | "\"notify\""
  | "\"rollback\""

# JSON primitives
string ::= "\"" ([^"]*) "\""
boolean ::= "true" | "false"
number ::= "-"? (("0" | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [+-]? [0-9]+)?
null   ::= "null"

# Generic JSON value hierarchy
value ::= object | array | string | number | boolean | null

# Object: key-value pairs, empty object allowed
object ::= "{" ws (pair ("," ws pair)*)? ws "}"
pair  ::= string ws ":" ws value

# Array: ordered values, empty array allowed
array ::= "[" ws (value ("," ws value)*)? ws "]"

# Whitespace
ws ::= ([ \t\n\r])*
```

Грамматика гарантирует:
- Наличие всех трёх обязательных полей
- `tool_name` строго из предопределённого enum (12 значений)
- `strict_params` — валидный JSON-объект (может быть пустым)

## Команда запуска сервера

```bash
llama-server \
  --model "C:\Users\rus\Desktop\merge\llama_cpp\qwen2.5-coder-7b-instruct-q4_k_m.gguf" \
  --port 8082 \
  --host 127.0.0.1 \
  --grammar-file "C:\Users\rus\.paperclip\adapter-plugins\compiler\compiler.gbnf" \
  -ngl 35
```

Параметры:
- `-ngl 35` — offload 35 слоёв на GPU (RTX 3070 8GB VRAM)
- `--grammar-file` — предзагрузка GBNF (необязательно, адаптер передаёт grammar в теле запроса)

## VRAM

При совместной работе с Переводчиком (Saiga Llama3 8B на порту 8081):

| Компонент | VRAM |
|-----------|------|
| Saiga Llama3 8B (8081, 35 слоёв GPU) | ~4.5 GB |
| Qwen2.5-Coder-7B (8082, 20 слоёв GPU) | ~3.0 GB |
| **Итого** | ~7.5 GB / 8 GB |

При 8 GB VRAM (RTX 3070) часть слоёв Компилятора автоматически offload-ится
на CPU/RAM. Рекомендуется `-ngl 20-25` для Компилятора при одновременной
работе двух серверов, либо запуск серверов последовательно.

## Пример входа/выхода

**Вход (от Переводчика):**
```json
{
  "intent": "backup",
  "target": "database",
  "params": {
    "before_release": true,
    "full": true
  }
}
```

**Выход (Компилятор):**
```json
{
  "system_command": "Backup the database before release",
  "tool_name": "backup",
  "strict_params": {
    "target": "database",
    "full": true,
    "before_release": true
  }
}
```

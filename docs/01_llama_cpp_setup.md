# Установка llama.cpp (Vulkan-сборка)

Единый инференс-сервер для всех моделей конвейера. Устанавливается один раз.

## Скачивание

1. Открыть [GitHub releases llama.cpp](https://github.com/ggml-ai/llama.cpp/releases)
2. Найти последний релиз (например, `b5128` и выше)
3. Скачать архив с **Vulkan** в названии:
   - `llama-b5128-bin-win-vulkan-x64.zip` (или аналогичный)
4. Распаковать в `C:\Users\rus\Desktop\merge\llama_cpp\`

**Почему Vulkan, а не CUDA?**
- Автоматически подхватывает NVIDIA GPU без установки CUDA Toolkit.
- Единый бэкенд для Windows (не требует отдельной сборки под каждую карту).
- Работает с RTX 3070 из коробки.

## Структура после распаковки

```
C:\Users\rus\Desktop\merge\llama_cpp\
├── llama-server.exe     ← основной бинарник
├── llama-cli.exe
├── llama-quantize.exe
├── vulkan.dll           ← рантайм (должен быть рядом с .exe)
└── ... (прочие утилиты)
```

## Базовые флаги запуска

```bash
llama-server.exe ^
  -m <путь_к_модели.gguf> ^
  --port <PORT> ^
  -c <context_size> ^
  -ngl <gpu_layers> ^
  --grammar-file <путь_к_грамматике.gbnf>
```

| Флаг | Назначение | Рекомендация |
|------|-----------|--------------|
| `-m` | Путь к GGUF-файлу модели | Абсолютный путь |
| `--port` | Порт HTTP-сервера | 8081, 8082, 8083 |
| `-c` | Размер контекста (токенов) | 2048-4096 |
| `-ngl` | Количество слоёв на GPU | 35 (для RTX 3070) |
| `--grammar-file` | GBNF-грамматика для ограничения вывода | Опционально |
| `--temp` | Температура | 0.0 для детерминированного вывода |

## Проверка GPU

При запуске ищи в логах строку:

```
llm_load_tensors: offloaded X/33 layers to GPU
llm_load_tensors: VRAM used: XXXX MB
```

Если `offloaded 0/33 layers to GPU` — Vulkan не подхватился. Проверь:
- Файл `vulkan.dll` рядом с `llama-server.exe`
- Версия драйвера NVIDIA (требуется 537+)
- Флаг `-ngl 35` (без него все слои на CPU)

## Проверка что сервер работает

```bash
curl -s -m 3 http://127.0.0.1:8081/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":5}"
```

Ожидаемый ответ: JSON с `choices[0].message.content` и `usage`.

# Hermes Agent Setup Report

## Установка
- Hermes v0.16.0 уже установлен
- Provider: qwen-free (custom)
- Base URL: http://localhost:3264/api
- Model: qwen3.7-max
- API Key: dummy-key

## Тест
- Запрос: "Ответь одним словом: работает"
- Ответ: "Hermes online. Среда: Windows... Готов к работе."
- Статус: ✅ Работает

## Команды
```bash
hermes                                    # Interactive CLI
hermes -z "prompt"                        # Non-interactive
hermes config set model.default <model>   # Set default model
hermes config set model.provider <prov>   # Set provider
hermes logs --level DEBUG                 # View logs
```

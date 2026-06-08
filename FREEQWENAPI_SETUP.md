# FreeQwenApi Setup Report

## Установка
- Git clone: ✅
- npm install: ✅ (365 packages)
- Auth: ✅ (сессия скопирована из предыдущей установки, 2 аккаунта)
- npm run models:sync: ✅ (28 моделей)
- API server: ✅ (http://localhost:3264/api)

## Доступные модели
- qwen3.7-max (самая мощная, для reasoning)
- qwen3.7-plus (быстрее, для обычных задач)
- qwen3-coder-plus (для кода)
- qwen3-vl-plus (для изображений/видео)
- и 24 других модели

## Тест
- Health check: {"ok":true,"models":28,"accounts":{"total":2,"available":2}}
- Chat: "что такое 2+2?" → "4"
- Статус: ✅ Работает

## Endpoint
http://localhost:3264/api

## Использование
```bash
curl http://localhost:3264/api/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.7-max",
    "messages": [{"role": "user", "content": "..."}],
    "stream": false
  }'
```

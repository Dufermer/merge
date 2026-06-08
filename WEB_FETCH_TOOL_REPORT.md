# Web Fetch Tool Report

## Проблема
DOM-190: "анализ приложения Hermes https://github.com/nousresearch/hermes-agent" → "Unknown task type"
CEO не имел инструмента для анализа веб-страниц и GitHub репозиториев.

## Решение

### 1. Новый tool: web_fetch
- **GitHub**: использует GitHub API для получения README (base64 decode)
- **Веб-страницы**: получает HTML через curl
- **Лимит**: 10000 символов, 30s timeout, 10MB max

### 2. Fallback FIRST паттерн
- URL обнаруживается regex `https?://[^\s]+` ДО проверки памяти
- Определение URL происходит первым в buildFallbackDecision

### 3. Memory skip для URL
- `processTask()` пропускает memory search для запросов с URL
- threshold поднят до 0.9

## Результаты тестов

| Тест | Результат |
|------|-----------|
| GitHub анализ | ✅ README получен, status=done |
| Веб-страница example.com | ✅ HTML получен, status=done |

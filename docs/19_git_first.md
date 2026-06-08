# 19 — Git-First: Автоматические коммиты

## Назначение

Git-First — система автоматических git-коммитов после каждого успешного изменения кода. Вдохновлено Aider: каждое изменение → осмысленный коммит.

## Как это работает

```
code_patch или terminal_exec (успешно)
    │
    ▼
gitFirst.generateCommitMessage(files, context)
    │
    ▼
SmolLM2 :8083 → "Add try-catch to processData"
    │
    ▼
gitFirst.autoCommit(files, message)
    ├── git add <files>
    ├── git commit -m "<message>"
    └── Логирование в git_history.json
```

## API

| Метод | Описание |
|-------|----------|
| `isGitRepo()` | Проверяет, что директория — git-репозиторий |
| `generateCommitMessage(changes, context)` | Генерирует commit message через SmolLM2 |
| `autoCommit(files, message)` | Выполняет `git add` + `git commit`, логирует в `git_history.json` |
| `getRecentCommits(n)` | Последние N коммитов |
| `rollbackToCommit(hash)` | `git checkout <hash>` — откат к коммиту |
| `diffSinceLastCommit()` | `git diff HEAD` — изменения с последнего коммита |

## Интеграция

### codePatcher.js

После `applyPatch` + `verifyWithTests` (если тесты пройдены и нет rollback):
```javascript
const gitFirst = new GitFirst("C:\\Users\\rus\\Desktop\\merge");
const msg = await gitFirst.generateCommitMessage([filePath], "Modified function");
await gitFirst.autoCommit([filePath], msg);
```

### terminal_exec (планируется)

После успешных команд, меняющих файлы.

## Пример commit messages

```
Add try-catch to processData function
Fix SQL injection vulnerability in user query
Update database backup configuration
Refactor handleLogin with error handling
Execute: npm install in executor adapter
Commit: Auto-commit feature tested
```

## Хранилище

```
C:\Users\rus\Desktop\merge\memory\git_history.json
```

## Rollback

```bash
git checkout <commit-hash>
# или через API:
await gitFirst.rollbackToCommit("abc123");
```

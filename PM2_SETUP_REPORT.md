# PM2 Setup Report

## PM2 Version: 7.0.1

## Setup

### Install
```bash
npm install -g pm2
```

### Config file
`ecosystem.config.js` with 2 apps:
- **translator-heartbeat** — polls Paperclip every 5s for new translator tasks
- **paperclip-ceo** — Paperclip server (auto-restart if crashes)

### Startup
- `pm2 startup` — configured for auto-start on Windows boot
- `pm2 save` — saved process list for resurrection

## Auto-recovery Test

| Шаг | Результат |
|-----|-----------|
| Kill translator heartbeat (PID 42968) | ✅ PM2 restarted (PID 13580, restarts=1) |
| Recovery time | < 3 seconds |
| Log continuity | Normal — resumed polling |

## End-to-End Test

| Параметр | Результат |
|----------|-----------|
| Task | PM2 Recovery Test (DOM-165) |
| Parent status | **done** ✅ |
| Sub-issues | DOM-166: done, DOM-167: done ✅ |
| Recovery | **NONE** ✅ |

## Files
- `ecosystem.config.js` — PM2 config
- `start_all.ps1` — updated (pm2 resurrect + start)

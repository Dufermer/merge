# Emergency Debug Report

## Problem
Система не реагирует на новые задачи пользователя.

## Diagnosis
**Причина: Heartbeats умерли после перезапуска Paperclip.**

При каждом перезапуске Paperclip:
1. CEO heartbeat (встроенный в Paperclip) — Paperclip перезапускается, heartbeat останавливается
2. Translator heartbeat (standalone node process) — процесс убивается при kill Paperclip

CEO последний heartbeat: 09:37:28 (2.5+ часов назад)  
Translator heartbeat процесс: DEAD

## Что было найдено

### Проблема A: Heartbeats не переживают перезапуск Paperclip
- CEO heartbeat включён (runtimeConfig.heartbeat.enabled=true) но Paperclip не восстанавливает его автоматически после перезапуска
- Translator heartbeat (node js процесс) убивается вместе с Paperclip

### Проблема B: Нет автоматического восстановления
- Нет systemd/PM2/watchdog для translator-heartbeat
- Нет скрипта автозапуска при старте Paperclip

## Тест после фикса (ручной перезапуск heartbeats)

```
DOM-157 (parent) → CEO делегировал → DOM-158 (sub-issue)
→ Translator heartbeat прочитал файл
→ DOM-157: status=done ✅
→ DOM-158: status=done ✅
```

## Решение
Для production-режима нужен supervisor (PM2 или Windows Service) для:
1. translator-heartbeat.js — авторестарт при падении
2. Paperclip — авторестарт при падении

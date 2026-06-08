#!/usr/bin/env pwsh
# start_all.ps1 — Запуск всей инфраструктуры MoE Conveyer
# Использование: powershell -ExecutionPolicy Bypass -File start_all.ps1

$LLAMA_SERVER  = "$HOME\Desktop\merge\llama_cpp\llama-server.exe"
$MODEL_SAIGA   = "$HOME\Desktop\merge\llama_cpp\saiga_llama3_8b-q4_k_m.gguf"
$MODEL_QWEN    = "$HOME\Desktop\merge\llama_cpp\qwen2.5-coder-7b-instruct-q4_k_m.gguf"
$MODEL_SMOLLM  = "$HOME\Desktop\merge\llama_cpp\smollm2-3.6b-instruct-q4_k_m.gguf"
$GBNF_COMPILER = "$HOME\.paperclip\adapter-plugins\compiler\compiler.gbnf"
$GBNF_EXECUTOR = "$HOME\.paperclip\adapter-plugins\executor\executor.gbnf"
$LOG_DIR       = "$HOME\Desktop\merge\logs"

# Создать папку логов
New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null

Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MoE Conveyer — Full System Startup" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan

# ── Шаг 1: Освободить порты ──
Write-Host "`n[1/5] Освобождение портов..." -ForegroundColor Yellow

function Free-Port($Port) {
    $proc = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "  Порт :$Port занят PID $($proc.OwningProcess), убиваю..."
        Stop-Process -Id $proc.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

Free-Port 8081
Free-Port 8082
Free-Port 8083
Free-Port 3100

Start-Sleep -Seconds 1

# ── Шаг 2: Запуск Переводчик (порт 8081) ──
Write-Host "[2/6] Запуск Переводчика (Saiga Llama3 8B) на :8081..." -ForegroundColor Yellow

$proc1 = Start-Process -FilePath $LLAMA_SERVER -WindowStyle Hidden -PassThru -ArgumentList @(
    "--model", "`"$MODEL_SAIGA`"",
    "--port", "8081",
    "--host", "127.0.0.1",
    "-ngl", "35",
    "--no-warmup"
)
Write-Host "  PID: $($proc1.Id)"
$proc1.Id | Out-File -FilePath "$LOG_DIR\pid_translator.txt" -Encoding ASCII

# ── Шаг 3: Запуск Компилятор (порт 8082) ──
Write-Host "[3/6] Запуск Компилятора (Qwen2.5-Coder-7B) на :8082..." -ForegroundColor Yellow

$proc2 = Start-Process -FilePath $LLAMA_SERVER -WindowStyle Hidden -PassThru -ArgumentList @(
    "--model", "`"$MODEL_QWEN`"",
    "--port", "8082",
    "--host", "127.0.0.1",
    "-ngl", "20",
    "--grammar-file", "`"$GBNF_COMPILER`"",
    "--no-warmup"
)
Write-Host "  PID: $($proc2.Id)"
$proc2.Id | Out-File -FilePath "$LOG_DIR\pid_compiler.txt" -Encoding ASCII

# ── Шаг 4: Запуск Исполнитель (порт 8083) ──
Write-Host "[4/6] Запуск Исполнителя (SmolLM2-3.6B) на :8083..." -ForegroundColor Yellow

$proc4 = Start-Process -FilePath $LLAMA_SERVER -WindowStyle Hidden -PassThru -ArgumentList @(
    "--model", "`"$MODEL_SMOLLM`"",
    "--port", "8083",
    "--host", "127.0.0.1",
    "-ngl", "35",
    "--grammar-file", "`"$GBNF_EXECUTOR`"",
    "--no-warmup"
)
Write-Host "  PID: $($proc4.Id)"
$proc4.Id | Out-File -FilePath "$LOG_DIR\pid_executor.txt" -Encoding ASCII

# ── Ожидание инициализации ──
Write-Host "`n[5/6] Ожидание инициализации серверов (20 сек)... " -NoNewline -ForegroundColor Yellow
Start-Sleep -Seconds 20
Write-Host "готово" -ForegroundColor Green

# Проверка что сервера ответили
$ok8081 = $false
$ok8082 = $false
$ok8083 = $false
for ($i = 0; $i -lt 5; $i++) {
    try {
        $r1 = Invoke-WebRequest -Uri "http://127.0.0.1:8081/v1/chat/completions" -Method POST `
            -ContentType "application/json" -Body '{}' -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r1.StatusCode -ge 200) { $ok8081 = $true }
    } catch {}
    try {
        $r2 = Invoke-WebRequest -Uri "http://127.0.0.1:8082/v1/chat/completions" -Method POST `
            -ContentType "application/json" -Body '{}' -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r2.StatusCode -ge 200) { $ok8082 = $true }
    } catch {}
    try {
        $r3 = Invoke-WebRequest -Uri "http://127.0.0.1:8083/v1/chat/completions" -Method POST `
            -ContentType "application/json" -Body '{}' -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r3.StatusCode -ge 200) { $ok8083 = $true }
    } catch {}
    if ($ok8081 -and $ok8082 -and $ok8083) { break }
    Start-Sleep -Seconds 2
}

if (-not $ok8081) { Write-Host "  ⚠️ :8081 (Translator) не отвечает" -ForegroundColor Red }
else { Write-Host "  ✅ :8081 (Translator) — отвечает" -ForegroundColor Green }

if (-not $ok8082) { Write-Host "  ⚠️ :8082 (Compiler) не отвечает" -ForegroundColor Red }
else { Write-Host "  ✅ :8082 (Compiler) — отвечает" -ForegroundColor Green }

if (-not $ok8083) { Write-Host "  ⚠️ :8083 (Executor) не отвечает (модель не скачана?)" -ForegroundColor Red }
else { Write-Host "  ✅ :8083 (Executor) — отвечает" -ForegroundColor Green }

# ── Шаг 6: Запуск Paperclip ──
Write-Host "[6/6] Запуск Paperclip на :3100..." -ForegroundColor Yellow

$proc3 = Start-Process -FilePath "cmd.exe" -WindowStyle Hidden -PassThru -ArgumentList @(
    "/c", "paperclipai run"
)
Write-Host "  PID: $($proc3.Id)"
$proc3.Id | Out-File -FilePath "$LOG_DIR\pid_paperclip.txt" -Encoding ASCII

Start-Sleep -Seconds 8

# Проверка Paperclip
try {
    $r3 = Invoke-WebRequest -Uri "http://127.0.0.1:3100/api/health" -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($r3.StatusCode -eq 200) { Write-Host "  ✅ :3100 (Paperclip) — отвечает" -ForegroundColor Green }
    else { Write-Host "  ⚠️ :3100 (Paperclip) — статус $($r3.StatusCode)" -ForegroundColor Red }
} catch {
    Write-Host "  ⚠️ :3100 (Paperclip) — не отвечает" -ForegroundColor Red
}

# ── Итог ──
Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ПИД-файлы сохранены в: $LOG_DIR" -ForegroundColor Cyan
Write-Host "  Остановка:  .\stop_all.ps1" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`nЗапущенные процессы на портах:" -ForegroundColor Gray
Get-NetTCPConnection -LocalPort 8081,8082,8083,3100 -ErrorAction SilentlyContinue | Format-Table LocalPort, OwningProcess, State -AutoSize

# ── Шаг 7: Запуск Meta-CEO monitoring ──
Write-Host "[7/7] Запуск Meta-CEO monitoring (каждые 6 часов)..." -ForegroundColor Yellow

$procMeta = Start-Process -FilePath "node.exe" -WindowStyle Hidden -PassThru -ArgumentList @(
    "`"$HOME\Desktop\merge\metaCeoMonitor.js`""
)
Write-Host "  PID: $($procMeta.Id)"
$procMeta.Id | Out-File -FilePath "$LOG_DIR\pid_meta_ceo.txt" -Encoding ASCII

Write-Host "  ✅ Meta-CEO monitoring запущен — автоматические intervention каждые 6 часов" -ForegroundColor Green

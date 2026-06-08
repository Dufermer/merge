#!/usr/bin/env pwsh
# stop_all.ps1 — Остановка всей инфраструктуры MoE Conveyer
# Использование: powershell -ExecutionPolicy Bypass -File stop_all.ps1

$LOG_DIR = "$HOME\Desktop\merge\logs"

Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MoE Conveyer — Full System Shutdown" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan

# ── Способ 1: убить по PID из файлов ──
Write-Host "`n[1/2] Остановка по PID-файлам..." -ForegroundColor Yellow
foreach ($file in @("pid_translator.txt", "pid_compiler.txt", "pid_executor.txt", "pid_paperclip.txt")) {
    $path = "$LOG_DIR\$file"
    if (Test-Path $path) {
        $pid = Get-Content $path -Raw | ForEach-Object { $_.Trim() }
        if ($pid -and $pid -match '^\d+$') {
            Write-Host "  Убиваю PID $pid (из $file)..."
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Remove-Item $path -Force -ErrorAction SilentlyContinue
        }
    }
}

# ── Способ 2: убить по портам (если PID-файлы устарели) ──
Write-Host "[2/2] Остановка по портам..." -ForegroundColor Yellow
foreach ($port in @(8081, 8082, 8083, 3100)) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conn) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            Write-Host "  Порт :$port — PID $($conn.OwningProcess) убит" -ForegroundColor Green
        } else {
            Write-Host "  Порт :$port — свободен" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  Порт :$port — ошибка: $_" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 2

# ── Проверка ──
Write-Host "`nПроверка освобождения портов:" -ForegroundColor Yellow
$allFree = $true
foreach ($port in @(8081, 8082, 8083, 3100)) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "  ⚠️ :$port — ВСЁ ЕЩЁ ЗАНЯТ (PID $($conn.OwningProcess))" -ForegroundColor Red
        $allFree = $false
    } else {
        Write-Host "  ✅ :$port — свободен" -ForegroundColor Green
    }
}

if ($allFree) {
    Write-Host "`n══════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Все порты освобождены. Система остановлена." -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════════════" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠️ Некоторые порты не освободились." -ForegroundColor Red
    Write-Host "  Попробуйте: taskkill /F /PID <PID>" -ForegroundColor Yellow
}

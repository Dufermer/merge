<#
.SYNOPSIS
    Автоматическая установка Self-Correcting DAG-Based Autonomous Agent (v2.0.0)
.DESCRIPTION
    Скрипт проверяет зависимости, клонирует репозиторий, устанавливает Node.js
    пакеты, скачивает GGUF-модели и настраивает окружение для первого запуска.
.NOTES
    Требует: Windows 10/11, Node.js 18+, PowerShell 5.1+
#>

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$REPO_URL = "https://github.com/Dufermer/merge.git"
$INSTALL_DIR = "$HOME\Desktop\merge"
$MODELS_DIR = "$INSTALL_DIR\llama_cpp"
$LLAMA_RELEASE = "b5563"
$LLAMA_ZIP = "llama-$LLAMA_RELEASE-bin-win-vulkan-x64.zip"
$LLAMA_URL = "https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_RELEASE/$LLAMA_ZIP"

$MODELS = @(
    @{ Name = "Saiga Llama3 8B (Translator)";     File = "saiga_llama3_8b-q4_k_m.gguf";         Url = "https://huggingface.co/IlyaGusev/saiga_llama3_8b_gguf/resolve/main/saiga_llama3_8b-q4_k_m.gguf" },
    @{ Name = "Qwen2.5-Coder-7B (Compiler)";       File = "qwen2.5-coder-7b-instruct-q4_k_m.gguf"; Url = "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf" },
    @{ Name = "SmolLM2-3.6B (Executor/Critic)";    File = "smollm2-3.6b-instruct-q4_k_m.gguf";    Url = "https://huggingface.co/hugging-quants/SmolLM2-3.6B-Instruct-GGUF/resolve/main/smollm2-3.6b-instruct-q4_k_m.gguf" }
)

function Write-Step {
    param([string]$Message, [string]$Status = "info")
    $icons = @{ info = "::"; ok = "✅"; warn = "⚠️ "; err = "❌" }
    $icon = $icons[$Status]
    if (-not $icon) { $icon = "::" }
    Write-Host "$icon $Message"
}

function Test-Command {
    param([string]$Command)
    return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

# ─── Шаг 1: Проверка системы ───
Write-Host "`n╔════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Self-Correcting DAG Agent — Установка v2.0.0 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Step "Проверка системы..." "info"

# OS
if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -lt 5) {
    Write-Step "Требуется Windows 10/11" "err"
    exit 1
}
Write-Step "ОС: Windows ✓" "ok"

# Node.js
if (-not (Test-Command "node")) {
    Write-Step "Node.js не найден. Установите Node.js 18+ с https://nodejs.org" "err"
    exit 1
}
$nodeVer = node -v
Write-Step "Node.js: $nodeVer ✓" "ok"

# npm
if (-not (Test-Command "npm")) {
    Write-Step "npm не найден" "err"
    exit 1
}
$npmVer = npm -v
Write-Step "npm: $npmVer ✓" "ok"

# Python
if (-not (Test-Command "python3") -and -not (Test-Command "python")) {
    Write-Step "Python не найден (опционально, для вспомогательных скриптов)" "warn"
}

# Git
if (-not (Test-Command "git")) {
    Write-Step "Git не найден. Установите Git с https://git-scm.com" "err"
    exit 1
}
$gitVer = git --version
Write-Step "Git: $gitVer ✓" "ok"

# Vulkan (проверка через наличие DLL)
$vulkanPath = "$env:SystemRoot\System32\vulkan-1.dll"
if (-not (Test-Path $vulkanPath)) {
    Write-Step "Vulkan runtime не найден. Драйверы NVIDIA включают Vulkan автоматически." "warn"
} else {
    Write-Step "Vulkan runtime: найден ✓" "ok"
}

# GPU (NVIDIA)
try {
    $gpu = (Get-WmiObject Win32_VideoController | Where-Object { $_.Name -match "NVIDIA" } | Select-Object -First 1).Name
    if ($gpu) {
        Write-Step "GPU: $gpu ✓" "ok"
    } else {
        Write-Step "NVIDIA GPU не обнаружена. Система будет работать на CPU (медленнее)." "warn"
    }
} catch {
    Write-Step "Не удалось определить GPU" "warn"
}

# RAM
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
Write-Step "RAM: ${ramGB}GB $((16 - $ramGB) -le 0 ? '✓' : '⚠ Минимум 16GB')" "ok"

Write-Host ""

# ─── Шаг 2: Клонирование ───
if (Test-Path $INSTALL_DIR) {
    Write-Step "Директория $INSTALL_DIR уже существует. Пропускаем клонирование." "warn"
    Set-Location $INSTALL_DIR
    git pull
} else {
    Write-Step "Клонирование репозитория..." "info"
    git clone $REPO_URL $INSTALL_DIR
    Set-Location $INSTALL_DIR
}
Write-Step "Репозиторий готов ✓" "ok"

# ─── Шаг 3: Установка Paperclip ───
Write-Step "Установка Paperclip CLI..." "info"
npm install -g paperclipai 2>&1 | Out-Null
if (Test-Command "paperclipai") {
    Write-Step "Paperclip CLI установлен ✓" "ok"
} else {
    Write-Step "Paperclip CLI не установился. Попробуйте: npm install -g paperclipai" "err"
}

# ─── Шаг 4: Установка зависимостей адаптеров ───
Write-Step "Установка зависимостей адаптеров..." "info"

$adapterDirs = @(
    "$env:USERPROFILE\.paperclip\adapter-plugins\executor",
    "$env:USERPROFILE\.paperclip\adapter-plugins\critic",
    "$env:USERPROFILE\.paperclip\adapter-plugins\translator",
    "$env:USERPROFILE\.paperclip\adapter-plugins\compiler"
)

foreach ($dir in $adapterDirs) {
    $pkgJson = "$dir\package.json"
    if (Test-Path $pkgJson) {
        Write-Step "  npm install в $dir" "info"
        Push-Location $dir
        npm install 2>&1 | Out-Null
        Pop-Location
    }
}

# Дополнительно: @babel/parser для codebaseAnalyzer
$execDir = "$env:USERPROFILE\.paperclip\adapter-plugins\executor"
if (Test-Path "$execDir\package.json") {
    Push-Location $execDir
    npm install @babel/parser @babel/traverse 2>&1 | Out-Null
    Pop-Location
}

Write-Step "Зависимости адаптеров установлены ✓" "ok"

# ─── Шаг 5: Скачивание llama.cpp ───
Write-Step "Проверка llama.cpp..." "info"
$llamaExe = "$MODELS_DIR\llama-server.exe"
if (-not (Test-Path $llamaExe)) {
    Write-Step "Скачивание llama.cpp ($LLAMA_RELEASE)..." "info"
    $zipPath = "$env:TEMP\$LLAMA_ZIP"
    try {
        Invoke-WebRequest -Uri $LLAMA_URL -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $MODELS_DIR -Force
        Remove-Item $zipPath -Force
        Write-Step "llama.cpp скачан и распакован ✓" "ok"
    } catch {
        Write-Step "Не удалось скачать llama.cpp: $($_.Exception.Message). Скачайте вручную." "warn"
    }
} else {
    Write-Step "llama.cpp: найден ✓" "ok"
}

# ─── Шаг 6: Скачивание моделей ───
Write-Step "Проверка GGUF-моделей..." "info"
$allExist = $true

foreach ($model in $MODELS) {
    $modelPath = "$MODELS_DIR\$($model.File)"
    if (-not (Test-Path $modelPath)) {
        Write-Step "  $($model.Name) — не найден. Скачивание (~15-30 мин)..." "warn"
        Write-Step "  URL: $($model.Url)" "info"
        $allExist = $false
    } else {
        $size = [math]::Round((Get-Item $modelPath).Length / 1GB, 2)
        Write-Step "  $($model.Name): ${size}GB ✓" "ok"
    }
}

if (-not $allExist) {
    Write-Step "`nДля скачивания моделей выполните:" "info"
    foreach ($model in $MODELS) {
        if (-not (Test-Path "$MODELS_DIR\$($model.File)")) {
            Write-Host "  curl -L $($model.Url) -o $MODELS_DIR\$($model.File)" -ForegroundColor Gray
        }
    }
}

# ─── Шаг 7: Настройка Paperclip ───
Write-Step "Проверка Paperclip адаптеров..." "info"
$adapterConfig = "$env:USERPROFILE\.paperclip\adapter-plugins.json"
if (-not (Test-Path $adapterConfig)) {
    Write-Step "  Файл adapter-plugins.json не найден. Создаю..." "warn"
    $plugins = @(
        @{ type = "translator"; packageName = "adapter-translator"; version = "1.0.0" },
        @{ type = "compiler";   packageName = "adapter-compiler";   version = "1.0.0" },
        @{ type = "executor";   packageName = "adapter-executor";   version = "1.0.0" },
        @{ type = "critic";     packageName = "adapter-critic";     version = "1.0.0" }
    )
    $plugins | ConvertTo-Json | Set-Content $adapterConfig -Encoding UTF8
    Write-Step "  adapter-plugins.json создан ✓" "ok"
} else {
    Write-Step "  adapter-plugins.json: найден ✓" "ok"
}

# ─── Шаг 8: Результат ───
Write-Host ""
Write-Host "╔════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║        Установка завершена                     ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "▶ Запуск системы:" -ForegroundColor Cyan
Write-Host "  cd $INSTALL_DIR" -ForegroundColor White
Write-Host "  powershell -ExecutionPolicy Bypass -File start_all.ps1" -ForegroundColor White
Write-Host ""
Write-Host "▶ Остановка системы:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File stop_all.ps1" -ForegroundColor White
Write-Host ""
Write-Host "▶ Документация:" -ForegroundColor Cyan
Write-Host "  Открой docs/00_OVERVIEW.md для общей карты системы" -ForegroundColor White
Write-Host "  Открой docs/06_full_system_run.md для сквозного теста" -ForegroundColor White
Write-Host ""
Write-Host "▶ Быстрый тест:" -ForegroundColor Cyan
Write-Host "  После запуска серверов создайте задачу в Paperclip:" -ForegroundColor White
Write-Host '  curl -X POST "http://127.0.0.1:3100/api/companies/{companyId}/issues" -H "Content-Type: application/json" -d "{\"title\": \"test\", \"description\": \"прочитай файл server_config.json и скажи, какой там порт\"}"' -ForegroundColor Gray
Write-Host ""
Write-Host "▶ Если что-то пошло не так:" -ForegroundColor Cyan
Write-Host "  Проверьте, что все 3 модели скачаны в llama_cpp/" -ForegroundColor White
Write-Host "  Проверьте, что node_modules установлены (cd ~/.paperclip/adapter-plugins/executor && npm install)" -ForegroundColor White
Write-Host "  Откройте issue на https://github.com/Dufermer/merge" -ForegroundColor White

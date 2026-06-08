# Installation Guide — Self-Correcting DAG Agent v2.0.0

## Системные требования

| Компонент | Минимум | Рекомендуется |
|-----------|---------|---------------|
| **OS** | Windows 10 / Linux (Ubuntu 22.04+) / macOS 13+ | Windows 11 / Ubuntu 24.04+ |
| **GPU** | Любая с Vulkan (NVIDIA, AMD, Intel) | NVIDIA RTX 3070+ (8+ ГБ VRAM) |
| **RAM** | 16 GB | 32 GB |
| **Диск** | 30 GB свободно | 50 GB (SSD) |
| **Node.js** | 18.x | 22.x LTS |
| **Python** | 3.10 | 3.12+ |
| **Git** | 2.30+ | 2.40+ |

### Проверка совместимости

```bash
# Linux
nvidia-smi                 # GPU + VRAM
free -h                    # RAM
df -h .                    # Disk space
node -v && python3 --version && git --version

# macOS
system_profiler SPDisplaysDataType  # GPU
sysctl -n hw.memsize | awk '{print $0/1073741824 " GB"}'  # RAM

# Windows
wmic path win32_videocontroller get name  # GPU
wmic ComputerSystem get TotalPhysicalMemory  # RAM
```

---

## Быстрая установка

### Linux / macOS

```bash
git clone https://github.com/Dufermer/merge.git
cd merge
chmod +x install.sh
./install.sh
```

### Windows

```powershell
git clone https://github.com/Dufermer/merge.git
cd merge
.\install.ps1
```

Установщик автоматически:
1. Проверит зависимости
2. Клонирует репозиторий
3. Установит Paperclip CLI
4. Установит npm-пакеты адаптеров
5. Скачает llama.cpp (последний релиз)
6. Проверит наличие GGUF-моделей
7. Создаст конфиг Paperclip

---

## Ручная установка (пошагово)

### Шаг 1: Клонирование

```bash
git clone https://github.com/Dufermer/merge.git
cd merge
```

### Шаг 2: Установка Paperclip CLI

```bash
npm install -g paperclipai
```

Проверка:
```bash
paperclipai --help
```

### Шаг 3: Установка зависимостей адаптеров

```bash
# Базовые зависимости
cd ~/.paperclip/adapter-plugins/executor && npm install
cd ~/.paperclip/adapter-plugins/critic && npm install

# Для codebaseAnalyzer (AST-парсинг)
cd ~/.paperclip/adapter-plugins/executor && npm install @babel/parser @babel/traverse
```

### Шаг 4: Скачивание llama.cpp

**Linux:**
```bash
mkdir -p llama_cpp && cd llama_cpp
# Определяем последний релиз
LATEST=$(curl -s https://api.github.com/repos/ggml-org/llama.cpp/releases/latest | grep "browser_download_url.*linux-x64" | cut -d'"' -f4)
curl -L "$LATEST" -o llama.tar.gz
tar -xzf llama.tar.gz && rm llama.tar.gz && cd ..
```

**macOS:**
```bash
mkdir -p llama_cpp && cd llama_cpp
LATEST=$(curl -s https://api.github.com/repos/ggml-org/llama.cpp/releases/latest | grep "browser_download_url.*macos-x64" | cut -d'"' -f4)
curl -L "$LATEST" -o llama.zip
unzip llama.zip && rm llama.zip && cd ..
```

**Windows:**
```powershell
mkdir llama_cpp; cd llama_cpp
$latest = (Invoke-RestMethod "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest").assets | Where-Object { $_.name -like "*win-vulkan*" } | Select-Object -First 1
Invoke-WebRequest -Uri $latest.browser_download_url -OutFile "llama.zip"
Expand-Archive -Path "llama.zip" -DestinationPath "." -Force
Remove-Item "llama.zip"; cd ..
```

### Шаг 5: Скачивание GGUF-моделей

Три модели (суммарно ~12 GB):

| Модель | Роль | Размер | URL |
|--------|------|--------|-----|
| Saiga Llama3 8B (Q4_K_M) | Translator | ~4.9 GB | [HuggingFace](https://huggingface.co/IlyaGusev/saiga_llama3_8b_gguf) |
| Qwen2.5-Coder-7B (Q4_K_M) | Compiler | ~4.7 GB | [HuggingFace](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF) |
| SmolLM2-3.6B (Q4_K_M) | Executor/Critic | ~2.5 GB | [HuggingFace](https://huggingface.co/hugging-quants/SmolLM2-3.6B-Instruct-GGUF) |

```bash
cd llama_cpp

curl -L -o saiga_llama3_8b-q4_k_m.gguf \
  "https://huggingface.co/IlyaGusev/saiga_llama3_8b_gguf/resolve/main/saiga_llama3_8b-q4_k_m.gguf"

curl -L -o qwen2.5-coder-7b-instruct-q4_k_m.gguf \
  "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf"

curl -L -o smollm2-3.6b-instruct-q4_k_m.gguf \
  "https://huggingface.co/hugging-quants/SmolLM2-3.6B-Instruct-GGUF/resolve/main/smollm2-3.6b-instruct-q4_k_m.gguf"

cd ..
```

### Шаг 6: Настройка Paperclip адаптеров

```bash
mkdir -p ~/.paperclip

cat > ~/.paperclip/adapter-plugins.json << 'EOF'
[
  { "type": "translator", "packageName": "adapter-translator", "version": "1.0.0" },
  { "type": "compiler",   "packageName": "adapter-compiler",   "version": "1.0.0" },
  { "type": "executor",   "packageName": "adapter-executor",   "version": "1.0.0" },
  { "type": "critic",     "packageName": "adapter-critic",     "version": "1.0.0" }
]
EOF
```

### Шаг 7: Запуск

```bash
# Linux/macOS
./start_all.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File start_all.ps1
```

### Шаг 8: Проверка

```bash
# Проверка что серверы запущены
curl -s http://127.0.0.1:8081/v1/chat/completions -d '{"model":"saiga","messages":[{"role":"user","content":"test"}]}' | head -c 100
curl -s http://127.0.0.1:3100/api/adapters | python3 -m json.tool
```

---

## Устранение проблем

### `llama-server: command not found`

llama.cpp не скачался. Проверьте:
```bash
ls -la llama_cpp/llama-server*
```
Если отсутствует — скачайте вручную:
```bash
cd llama_cpp
curl -L -o llama.tar.gz "https://github.com/ggml-org/llama.cpp/releases/download/b5563/llama-b5563-bin-<ваша_OC>.tar.gz"
tar -xzf llama.tar.gz
```

### `GPU out of memory`

RTX 3070 (8 ГБ) работает 3 модели только с `-cram`. Убедитесь что флаг есть:
```bash
# В start_all.ps1 или start_all.sh строка запуска должна содержать -cram
grep -r "\-cram" start_all.*
```

### `ECONNREFUSED :8083`

SmolLM2 не запущен. Проверьте:
```bash
netstat -ano | grep 8083  # Windows
ss -tlnp | grep 8083       # Linux
lsof -i :8083              # macOS
```
Запустите вручную:
```bash
./llama_cpp/llama-server -m llama_cpp/smollm2-3.6b-instruct-q4_k_m.gguf --port 8083 --host 127.0.0.1 -ngl 99 -cram
```

### `npm ERR!` при установке адаптеров

```bash
# Очистите кэш npm и повторите
npm cache clean --force
cd ~/.paperclip/adapter-plugins/executor && rm -rf node_modules && npm install
```

### Paperclip не загружает адаптеры

```bash
# Проверьте конфиг
cat ~/.paperclip/adapter-plugins.json | python3 -m json.tool

# Перезапустите Paperclip
pkill -f paperclipai 2>/dev/null || taskkill /F /IM node.exe 2>/dev/null
paperclipai run --port 3100 &
```

### Медленная работа

- Убедитесь что все 3 модели используют `-ngl 99` (полная выгрузка в GPU)
- Убедитесь что флаг `-cram` присутствует (prompt caching в RAM)
- Проверьте что не запущены другие приложения, потребляющие VRAM (браузер с GPU-акселерацией, другие LLM)

---

## Uninstall

```bash
# Удаление Paperclip CLI
npm uninstall -g paperclipai

# Удаление адаптеров
rm -rf ~/.paperclip/adapter-plugins
rm -f ~/.paperclip/adapter-plugins.json

# Удаление репозитория
rm -rf ~/merge

# Удаление моделей (опционально)
rm -rf ~/merge/llama_cpp/*.gguf
```

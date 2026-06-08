#!/bin/bash
# Automatic installer for Self-Correcting DAG-Based Autonomous Agent v2.0.0
# Usage: chmod +x install.sh && ./install.sh
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}::${NC} $1"; }
ok()    { echo -e "${GREEN}✅${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠️${NC} $1"; }
err()   { echo -e "${RED}❌${NC} $1"; }

REPO_DIR="${1:-$HOME/merge}"
REPO_URL="https://github.com/Dufermer/merge.git"
MODELS_DIR="$REPO_DIR/llama_cpp"

MODELS=(
  "IlyaGusev/saiga_llama3_8b_gguf:saiga_llama3_8b-q4_k_m.gguf:Saiga Llama3 8B (Translator)"
  "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF:qwen2.5-coder-7b-instruct-q4_k_m.gguf:Qwen2.5-Coder-7B (Compiler)"
  "hugging-quants/SmolLM2-3.6B-Instruct-GGUF:smollm2-3.6b-instruct-q4_k_m.gguf:SmolLM2-3.6B (Executor/Critic)"
)

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Self-Correcting DAG Agent — Install v2.0.0  ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"
echo ""

# ─── 1. Проверка зависимостей ───
info "Проверка системы..."
OS="$(uname -s)"
ARCH="$(uname -m)"
ok "OS: $OS $ARCH"

for cmd in node python3 git curl; do
  if ! command -v "$cmd" &>/dev/null; then
    err "$cmd не найден. Установите: $cmd"
    exit 1
  fi
  ok "$(command -v "$cmd")"
done

NODE_VER=$(node -v)
PY_VER=$(python3 --version 2>&1 | cut -d' ' -f2)
GIT_VER=$(git --version | cut -d' ' -f3)
ok "Node.js: $NODE_VER | Python: $PY_VER | Git: $GIT_VER"

# Проверка RAM
if [[ "$OS" == "Linux" ]]; then
  RAM_GB=$(awk '/MemTotal/{printf "%.0f", $2/1024/1024}' /proc/meminfo)
elif [[ "$OS" == "Darwin" ]]; then
  RAM_GB=$(($(sysctl -n hw.memsize) / 1073741824))
fi
if [[ "$RAM_GB" -lt 16 ]]; then
  warn "RAM: ${RAM_GB}GB (минимум 16GB)"
else
  ok "RAM: ${RAM_GB}GB"
fi

# Vulkan или CUDA
if command -v nvidia-smi &>/dev/null; then
  GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
  ok "GPU: $GPU"
else
  warn "NVIDIA GPU не обнаружена. Система будет работать на CPU (медленнее)."
fi

# ─── 2. Клонирование ───
echo ""
info "Клонирование репозитория..."
if [[ -d "$REPO_DIR/.git" ]]; then
  warn "Репозиторий уже существует. Обновляю..."
  cd "$REPO_DIR" && git pull
else
  git clone "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi
ok "Репозиторий готов: $REPO_DIR"

# ─── 3. Установка Paperclip ───
echo ""
info "Установка Paperclip CLI..."
npm install -g paperclipai 2>/dev/null && ok "Paperclip CLI установлен" || warn "Paperclip CLI не установился. Попробуйте: npm install -g paperclipai"

# ─── 4. Установка зависимостей адаптеров ───
echo ""
info "Установка зависимостей адаптеров..."
ADAPTER_BASE="$HOME/.paperclip/adapter-plugins"
for dir in executor critic translator compiler; do
  PKG="$ADAPTER_BASE/$dir/package.json"
  if [[ -f "$PKG" ]]; then
    (cd "$ADAPTER_BASE/$dir" && npm install 2>/dev/null)
    ok "  $dir — npm install"
  fi
done
# @babel/parser для codebaseAnalyzer
if [[ -f "$ADAPTER_BASE/executor/package.json" ]]; then
  (cd "$ADAPTER_BASE/executor" && npm install @babel/parser @babel/traverse 2>/dev/null)
  ok "  executor — @babel/parser + @babel/traverse"
fi

# ─── 5. Скачивание llama.cpp ───
echo ""
info "Проверка llama.cpp..."
LLAMA_BIN="$MODELS_DIR/llama-server"
if [[ ! -f "$LLAMA_BIN" ]]; then
  info "Скачивание llama.cpp (последний релиз)..."
  mkdir -p "$MODELS_DIR"
  LATEST_JSON=$(curl -sf "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest")
  DOWNLOAD_URL=$(echo "$LATEST_JSON" | python3 -c "
import sys,json
data = json.load(sys.stdin)
for asset in data.get('assets', []):
  n = asset['name']
  if 'linux-x64' in n and n.endswith('.tar.gz'):
    print(asset['browser_download_url'])
    break
  elif 'macos-x64' in n and n.endswith('.zip'):
    print(asset['browser_download_url'])
    break
" 2>/dev/null || echo "")

  if [[ -n "$DOWNLOAD_URL" ]]; then
    curl -L "$DOWNLOAD_URL" -o "$MODELS_DIR/llama.tar.gz"
    cd "$MODELS_DIR"
    if [[ "$DOWNLOAD_URL" == *.zip ]]; then
      unzip -o llama.tar.gz 2>/dev/null
    else
      tar -xzf llama.tar.gz
    fi
    rm -f llama.tar.gz
    cd "$REPO_DIR"
    ok "llama.cpp скачан"
  else
    warn "Не удалось определить URL для скачивания. Скачайте вручную:"
    warn "https://github.com/ggml-org/llama.cpp/releases"
  fi
else
  ok "llama.cpp: найден"
fi

# ─── 6. Скачивание моделей ───
echo ""
info "Проверка GGUF-моделей..."
ALL_EXIST=true
for model_entry in "${MODELS[@]}"; do
  IFS=":" read -r repo file name <<< "$model_entry"
  if [[ ! -f "$MODELS_DIR/$file" ]]; then
    ALL_EXIST=false
    warn "  $name — не найден"
    info "  Скачивание: huggingface-cli download $repo $file --local-dir $MODELS_DIR"
    warn "  Или вручную: curl -L \"https://huggingface.co/$repo/resolve/main/$file\" -o \"$MODELS_DIR/$file\""
  else
    SIZE=$(du -h "$MODELS_DIR/$file" | cut -f1)
    ok "  $name: ${SIZE}"
  fi
done

if [[ "$ALL_EXIST" == "false" ]]; then
  echo ""
  warn "Некоторые модели отсутствуют. Для скачивания всех моделей выполните:"
  echo ""
  for model_entry in "${MODELS[@]}"; do
    IFS=":" read -r repo file name <<< "$model_entry"
    echo "  huggingface-cli download $repo $file --local-dir \"$MODELS_DIR\""
  done
  echo ""
else
  ok "Все модели на месте"
fi

# ─── 7. Настройка Paperclip ───
echo ""
info "Настройка Paperclip адаптеров..."
ADAPTER_CONFIG="$HOME/.paperclip/adapter-plugins.json"
if [[ ! -f "$ADAPTER_CONFIG" ]]; then
  mkdir -p "$HOME/.paperclip"
  cat > "$ADAPTER_CONFIG" <<'EOF'
[
  { "type": "translator", "packageName": "adapter-translator", "version": "1.0.0" },
  { "type": "compiler",   "packageName": "adapter-compiler",   "version": "1.0.0" },
  { "type": "executor",   "packageName": "adapter-executor",   "version": "1.0.0" },
  { "type": "critic",     "packageName": "adapter-critic",     "version": "1.0.0" }
]
EOF
  ok "adapter-plugins.json создан"
else
  ok "adapter-plugins.json: найден"
fi

# ─── 8. Итог ───
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        Установка завершена                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}▶ Запуск системы:${NC}"
echo "  cd $REPO_DIR"
echo "  ./start_all.sh        # Linux/macOS"
echo "  powershell -File start_all.ps1  # Windows"
echo ""
echo -e "${CYAN}▶ Документация:${NC}"
echo "  cat docs/00_OVERVIEW.md"
echo ""
echo -e "${CYAN}▶ Устранение проблем:${NC}"
echo "  cat INSTALL.md"
echo ""

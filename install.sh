#!/bin/bash
set -e

INSTALL_DIR="${BIRD_INSTALL_DIR:-$HOME/Developer/projects/bird}"

echo "🐦 Installing bird (fork)..."
echo "   Install directory: $INSTALL_DIR"
echo ""

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  echo "📁 Directory exists, pulling latest..."
  cd "$INSTALL_DIR"
  git pull
else
  echo "📥 Cloning repository..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone https://github.com/tim0120/bird.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install dependencies
echo "📦 Installing dependencies..."
if command -v pnpm &> /dev/null; then
  pnpm install
elif command -v npm &> /dev/null; then
  npm install
else
  echo "❌ Error: pnpm or npm required"
  exit 1
fi

# Build
echo "🔨 Building..."
npm run build

# Install brew dependencies (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "🍺 Installing macOS dependencies..."
  brew install pngpaste catimg 2>/dev/null || true
fi

echo ""
echo "✅ bird installed to: $INSTALL_DIR"
echo ""
echo "Add this to your ~/.zshrc:"
echo ""
cat << 'ZSHRC'
# bird - clipboard image tweeting
tweet() {
  local BIRD="node $HOME/Developer/projects/bird/dist/cli.js"
  if [[ "$1" == "--img" ]]; then
    shift
    pngpaste /tmp/clip.png 2>/dev/null
    catimg -w 100 /tmp/clip.png
    read "?Tweet this? [y/N] "
    [[ "$REPLY" =~ ^[Yy]$ ]] && $BIRD tweet "$@" --media /tmp/clip.png
  else
    $BIRD tweet "$@"
  fi
}
ZSHRC
echo ""
echo "Then run: source ~/.zshrc"
echo ""
echo "First time? Run: $INSTALL_DIR/dist/cli.js whoami"
echo "to check cookie auth is working."

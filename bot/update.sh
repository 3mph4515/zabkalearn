#!/bin/bash
# Update version and deploy Polski Daily Bot
# Usage: ./update.sh [--no-version]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML_FILE="$SCRIPT_DIR/../index.html"
BOT_FILE="$SCRIPT_DIR/bot.py"
VPS="${VPS_HOST:?Set VPS_HOST env var or SSH alias}"
REMOTE_DIR="${REMOTE_DIR:-/opt/polski-daily-bot}"

# Check if we should skip version increment
SKIP_VERSION=false
if [ "$1" == "--no-version" ]; then
    SKIP_VERSION=true
fi

# Get current version from HTML
CURRENT_VERSION=$(grep -o 'class="version">v[0-9.]*' "$HTML_FILE" | grep -o '[0-9.]*')

if [ -z "$CURRENT_VERSION" ]; then
    echo "❌ Не могу найти текущую версию"
    exit 1
fi

if [ "$SKIP_VERSION" = false ]; then
    # Increment version (simple: 1.0 -> 1.1 -> 1.2 ...)
    MAJOR=$(echo $CURRENT_VERSION | cut -d. -f1)
    MINOR=$(echo $CURRENT_VERSION | cut -d. -f2)
    NEW_MINOR=$((MINOR + 1))
    NEW_VERSION="$MAJOR.$NEW_MINOR"

    echo "🐸 Обновление версии: v$CURRENT_VERSION → v$NEW_VERSION"

    # Update HTML (macOS sed)
    sed -i '' "s/class=\"version\">v$CURRENT_VERSION/class=\"version\">v$NEW_VERSION/" "$HTML_FILE"

    # Update bot.py
    sed -i '' "s/VERSION = \"$CURRENT_VERSION\"/VERSION = \"$NEW_VERSION\"/" "$BOT_FILE"

    echo "✅ Версия обновлена в файлах"
else
    NEW_VERSION=$CURRENT_VERSION
    echo "🐸 Деплой без изменения версии: v$CURRENT_VERSION"
fi

# Deploy to VPS
echo "📦 Деплою на VPS..."
scp "$HTML_FILE" "$BOT_FILE" $VPS:$REMOTE_DIR/

# Restart bot
echo "🔄 Перезапускаю бота..."
ssh $VPS "sudo systemctl restart polski-daily-bot"

echo ""
echo "🎉 Готово! Версия: v$NEW_VERSION"
echo "   Бот перезапущен на VPS"
echo ""
echo "   Проверить статус: ssh $VPS 'sudo systemctl status polski-daily-bot'"

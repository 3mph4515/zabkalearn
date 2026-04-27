#!/bin/bash
# Update version + deploy editor + bot + scheduler to VPS.
# Usage: VPS_HOST=my-vps ./update.sh [--no-version]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML_FILE="$SCRIPT_DIR/index.html"
BOT_FILE="$SCRIPT_DIR/bot.py"
SCHED_FILE="$SCRIPT_DIR/scheduler.py"
STATIC_DIR="$SCRIPT_DIR/static"
VPS="${VPS_HOST:?Set VPS_HOST env var or SSH alias}"
REMOTE_DIR="${REMOTE_DIR:-/opt/zabka-bot}"

SKIP_VERSION=false
if [ "$1" == "--no-version" ]; then
    SKIP_VERSION=true
fi

CURRENT_VERSION=$(grep -o 'class="version">v[0-9.]*' "$HTML_FILE" | grep -o '[0-9.]*' | head -1)

if [ -z "$CURRENT_VERSION" ]; then
    echo "❌ Не могу найти текущую версию в index.html"
    exit 1
fi

if [ "$SKIP_VERSION" = false ]; then
    MAJOR=$(echo "$CURRENT_VERSION" | cut -d. -f1)
    MINOR=$(echo "$CURRENT_VERSION" | cut -d. -f2)
    NEW_MINOR=$((MINOR + 1))
    NEW_VERSION="$MAJOR.$NEW_MINOR"

    echo "🐸 Обновление версии: v$CURRENT_VERSION → v$NEW_VERSION"
    sed -i '' "s/class=\"version\">v$CURRENT_VERSION/class=\"version\">v$NEW_VERSION/" "$HTML_FILE"
    sed -i '' "s/VERSION = \"$CURRENT_VERSION\"/VERSION = \"$NEW_VERSION\"/" "$BOT_FILE"
    echo "✅ Версия обновлена"
else
    NEW_VERSION=$CURRENT_VERSION
    echo "🐸 Деплой без изменения версии: v$CURRENT_VERSION"
fi

echo "📦 Деплою на $VPS:$REMOTE_DIR ..."
scp "$HTML_FILE" "$BOT_FILE" "$SCHED_FILE" "$VPS:$REMOTE_DIR/"

echo "📁 Синкаю static/ ..."
ssh "$VPS" "mkdir -p $REMOTE_DIR/static/css $REMOTE_DIR/static/js"
scp "$STATIC_DIR"/css/*.css "$VPS:$REMOTE_DIR/static/css/"
scp "$STATIC_DIR"/js/*.js   "$VPS:$REMOTE_DIR/static/js/"

echo "🔄 Перезапускаю сервисы..."
ssh "$VPS" "sudo systemctl restart zabka-bot zabka-scheduler"

echo ""
echo "🎉 Готово! Версия: v$NEW_VERSION"
echo "   Проверить:"
echo "   ssh $VPS 'sudo systemctl status zabka-bot zabka-scheduler --no-pager'"
echo "   ssh $VPS 'sudo journalctl -u zabka-scheduler -n 50 --no-pager'"

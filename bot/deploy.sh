#!/bin/bash
# Deploy Polski Daily Bot to VPS

VPS="${VPS_HOST:?Set VPS_HOST env var or SSH alias}"
REMOTE_DIR="${REMOTE_DIR:-/opt/polski-daily-bot}"

echo "🐸 Деплой Polski Daily Bot..."

# Create remote directory
ssh $VPS "sudo mkdir -p $REMOTE_DIR && sudo chown \$USER:\$USER $REMOTE_DIR"

# Copy files
echo "📦 Копирую файлы..."
scp bot.py requirements.txt $VPS:$REMOTE_DIR/
scp ../index.html $VPS:$REMOTE_DIR/

# Install dependencies and setup service
echo "🔧 Устанавливаю зависимости..."
ssh $VPS << 'ENDSSH'
cd /opt/polski-daily-bot

# Create venv if not exists (use Python 3.8+)
if [ ! -d "venv" ]; then
    python3.8 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt

# Create systemd service
sudo tee /etc/systemd/system/polski-daily-bot.service > /dev/null << 'EOF'
[Unit]
Description=Polski Daily Telegram Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/polski-daily-bot
Environment=BOT_TOKEN=YOUR_BOT_TOKEN_HERE
ExecStart=/opt/polski-daily-bot/venv/bin/python /opt/polski-daily-bot/bot.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "✅ Файлы загружены!"
echo ""
echo "⚠️  Теперь нужно:"
echo "1. Отредактировать токен бота:"
echo "   sudo nano /etc/systemd/system/polski-daily-bot.service"
echo "   (замени YOUR_BOT_TOKEN_HERE на токен от @BotFather)"
echo ""
echo "2. Запустить бота:"
echo "   sudo systemctl daemon-reload"
echo "   sudo systemctl enable zabka-bot"
echo "   sudo systemctl start zabka-bot"
echo ""
echo "3. Проверить статус:"
echo "   sudo systemctl status zabka-bot"
ENDSSH

echo ""
echo "🎉 Деплой завершён!"

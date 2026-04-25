# Żabka Learn | Polski Daily

Telegram channel + browser tools for learning Polish (RU-speaking audience).
- Channel: [@zabka_learn](https://t.me/zabka_learn)
- Bot: Telegram quiz bot + web card editor
- Scheduler: Telethon-based card publishing tool with web UI

## Stack

- **Bot:** Python (`python-telegram-bot`) — quizzes, web editor gateway
- **Scheduler:** Python (`telethon`, `aiohttp`) — batch card publishing
- **Card editor:** vanilla HTML/JS canvas (`bot/index.html`)
- **Hosting:** VPS + nginx + systemd

## Setup

### 1. Clone

```bash
git clone https://github.com/3mph4515/zabkalearn.git
cd zabkalearn
```

### 2. Env

Copy `.env.example` → `.env` and fill:

```bash
cp .env.example .env
```

Required:
- `BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
- `TG_API_ID`, `TG_API_HASH` — from [my.telegram.org](https://my.telegram.org)
- `SCHEDULER_TOKEN` — random, e.g. `openssl rand -base64 32`
- `EDITOR_PASSWORD` — gate for web-editor access via `/editor` command in bot

### 3. Install

```bash
cd bot
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. Run

**Bot (quizzes + editor gateway):**
```bash
set -a; source ../.env; set +a
python3 bot.py
```

**Scheduler (web UI for card batch publishing):**
```bash
set -a; source ../.env; set +a
python3 scheduler.py
```

First run of `scheduler.py` requires Telethon login (phone + SMS code). Session is saved to `bot/zabka_session.session` (gitignored).

Open browser: `http://127.0.0.1:8080/` and login with `SCHEDULER_TOKEN`.

## Project files

- `DESIGN.md` — design system (colors, typography, spacing, mascot)
- `CLAUDE.md` — project context for Claude Code
- `CONTENT_PLAN_2025_2026.md` — content roadmap
- `bot/index.html` — card editor (canvas-based, drag-decoration UI)
- `bot/batch.html` — batch card editor
- `bot/scheduler.py` — Telethon publish backend + web server
- `bot/bot.py` — Telegram quiz bot + editor gateway

## Deploy

`bot/deploy.sh` — first-time VPS setup
`bot/update.sh` — push code + restart service

Set `VPS_HOST` env var or SSH alias before running.

## License

MIT

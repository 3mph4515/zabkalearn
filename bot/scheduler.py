#!/usr/bin/env python3
"""
Batch Scheduler for Zabka Learn
Telethon-based message scheduler with web UI
Hosted with basic auth + rate limiting
"""

import os
import json
import asyncio
import base64
import hashlib
import hmac
import logging
import secrets
import time
from collections import defaultdict
from datetime import datetime
from io import BytesIO

import pytz
from aiohttp import web
from telethon import TelegramClient
from telethon.tl.functions.messages import (
    GetScheduledHistoryRequest,
    DeleteScheduledMessagesRequest,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WARSAW_TZ = pytz.timezone("Europe/Warsaw")

API_ID = int(os.environ["TG_API_ID"])
API_HASH = os.environ["TG_API_HASH"]
SESSION_PATH = os.path.join(BASE_DIR, "zabka_session")

AUTH_TOKEN = os.environ["SCHEDULER_TOKEN"]

CHANNELS = {
    "debug": -1003772746301,
    "production": -1003738416290,
}

# Rate limiting: max requests per IP
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 60  # requests per window
rate_buckets = defaultdict(list)

# Failed auth tracking for brute-force protection
failed_auths = defaultdict(list)
MAX_FAILED_AUTHS = 20
FAILED_AUTH_WINDOW = 120  # 2 min lockout

client = None


# ═══════════ AUTH ═══════════

def check_auth(request):
    ip = request.remote
    now = time.time()

    # Check brute-force lockout
    failed_auths[ip] = [t for t in failed_auths[ip] if now - t < FAILED_AUTH_WINDOW]
    if len(failed_auths[ip]) >= MAX_FAILED_AUTHS:
        return False, "locked"

    # Check token from cookie or header
    token = request.cookies.get("zt")
    if not token:
        token = request.headers.get("X-Token", "")
    if not token:
        # Check query param (for initial login)
        token = request.query.get("token", "")

    if token and hmac.compare_digest(token, AUTH_TOKEN):
        return True, None

    failed_auths[ip].append(now)
    return False, "unauthorized"


def check_rate_limit(request):
    ip = request.remote
    now = time.time()
    rate_buckets[ip] = [t for t in rate_buckets[ip] if now - t < RATE_LIMIT_WINDOW]
    if len(rate_buckets[ip]) >= RATE_LIMIT_MAX:
        return False
    rate_buckets[ip].append(now)
    return True


LOGIN_PAGE = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login | Zabka Scheduler</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,system-ui,sans-serif;background:linear-gradient(135deg,#E8F5E9,#C8E6C9);
min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{background:#fff;border-radius:16px;padding:32px;width:320px;box-shadow:0 10px 40px rgba(0,0,0,.1);text-align:center}
.box h2{color:#2E7D32;font-size:1.3rem;margin-bottom:16px}
.box input{width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:8px;font-size:1rem;
outline:none;margin-bottom:12px;text-align:center}
.box input:focus{border-color:#4CAF50}
.box button{width:100%;padding:10px;border:none;border-radius:10px;background:#4CAF50;color:#fff;
font-size:1rem;font-weight:600;cursor:pointer;transition:background .15s}
.box button:hover{background:#43A047}
.err{color:#E53935;font-size:.85rem;margin-bottom:8px;display:none}
</style></head><body>
<div class="box">
<h2>Zabka Scheduler</h2>
<div class="err" id="err">Wrong password</div>
<input type="password" id="pw" placeholder="Password" autofocus
 onkeydown="if(event.key==='Enter')go()">
<button onclick="go()">Login</button>
</div>
<script>
function go(){
 const pw=document.getElementById('pw').value;
 if(!pw)return;
 document.cookie='zt='+pw+';path=/;max-age=86400;SameSite=Strict';
 fetch('/api/status').then(r=>{
  if(r.status===401||r.status===403){document.getElementById('err').style.display='';return}
  location.href=location.pathname;
 }).catch(()=>document.getElementById('err').style.display='');
}
</script></body></html>"""


# ═══════════ MIDDLEWARE ═══════════

@web.middleware
async def auth_middleware(request, handler):
    # Skip auth for login page assets
    path = request.path

    if not check_rate_limit(request):
        return web.Response(text="Rate limited", status=429)

    authed, reason = check_auth(request)

    if not authed:
        if reason == "locked":
            return web.Response(text="Too many failed attempts. Wait 5 min.", status=403)
        # Return login page for GET requests, 401 for API
        if path.startswith("/api/"):
            return web.json_response({"ok": False, "error": "Unauthorized"}, status=401)
        return web.Response(text=LOGIN_PAGE, content_type="text/html", charset="utf-8")

    response = await handler(request)

    # If auth came from query/header (not cookie), persist cookie so JS fetches work
    if not request.cookies.get("zt"):
        response.set_cookie(
            "zt", AUTH_TOKEN,
            max_age=86400, path="/", samesite="Strict", httponly=False,
        )

    return response


# ═══════════ TELETHON ═══════════

async def init_telethon():
    global client
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    log.info("Telethon connected as %s (id=%d)", me.first_name, me.id)


def format_card_text(word, translation, example):
    lines = [
        "\U0001f438 <b>S\u0142owo dnia</b>",
        "",
        f"\U0001f1f5\U0001f1f1 <b>{word}</b> - {translation}",
    ]
    if example:
        lines.append("")
        lines.append(f"\U0001f4dd <i>{example}</i>")
    lines.extend(["", "#s\u0142owodnia #polski", "@zabka_learn"])
    return "\n".join(lines)


# ═══════════ HANDLERS ═══════════

async def handle_index(request):
    with open(os.path.join(BASE_DIR, "batch.html"), "r", encoding="utf-8") as f:
        return web.Response(text=f.read(), content_type="text/html", charset="utf-8")


async def handle_editor(request):
    with open(os.path.join(BASE_DIR, "index.html"), "r", encoding="utf-8") as f:
        return web.Response(text=f.read(), content_type="text/html", charset="utf-8")


async def handle_schedule(request):
    data = await request.json()
    channel_key = data.get("channel", "debug")
    channel_id = CHANNELS.get(channel_key)
    if not channel_id:
        return web.json_response({"ok": False, "error": "Unknown channel"}, status=400)

    cards = data.get("cards", [])
    if not cards:
        return web.json_response({"ok": False, "error": "No cards"}, status=400)

    entity = await client.get_entity(channel_id)
    results = []

    for card in cards:
        publish_now = data.get("publish_now", False)
        schedule_str = card.get("schedule_time", "")

        if publish_now:
            schedule_dt = None
        else:
            schedule_dt = WARSAW_TZ.localize(datetime.fromisoformat(schedule_str))

        word = card.get("word", "")
        translation = card.get("translation", "")

        text = card.get("post_text", "")
        if not text:
            examples = card.get("examples", [])
            example_str = examples[0].get("pl", "") if examples else ""
            text = format_card_text(word, translation, example_str)

        image_b64 = card.get("image")

        try:
            if image_b64:
                raw = image_b64.split(",", 1)[-1]
                image_bytes = base64.b64decode(raw)
                buf = BytesIO(image_bytes)
                buf.name = "card.png"

                send_kwargs = dict(caption=text, parse_mode="html")
                if schedule_dt:
                    send_kwargs["schedule"] = schedule_dt
                msg = await client.send_file(entity, file=buf, **send_kwargs)
            else:
                send_kwargs = dict(parse_mode="html")
                if schedule_dt:
                    send_kwargs["schedule"] = schedule_dt
                msg = await client.send_message(entity, text, **send_kwargs)

            date_str = schedule_dt.isoformat() if schedule_dt else "now"
            results.append({"id": msg.id, "word": word, "date": date_str, "ok": True})
            log.info("Published '%s' %s (msg_id=%d)", word, date_str, msg.id)

        except Exception as e:
            log.error("Failed to publish '%s': %s", word, e)
            results.append({"word": word, "ok": False, "error": str(e)})

        await asyncio.sleep(0.3)

    return web.json_response({"ok": True, "results": results})


async def handle_scheduled_list(request):
    channel_key = request.query.get("channel", "debug")
    channel_id = CHANNELS.get(channel_key)
    if not channel_id:
        return web.json_response({"ok": False, "error": "Unknown channel"}, status=400)

    entity = await client.get_entity(channel_id)
    result = await client(GetScheduledHistoryRequest(peer=entity, hash=0))

    messages = []
    for msg in result.messages:
        messages.append({
            "id": msg.id,
            "date": msg.date.astimezone(WARSAW_TZ).isoformat(),
            "text": msg.message or "",
            "has_media": msg.media is not None,
        })

    messages.sort(key=lambda m: m["date"])
    return web.json_response({"ok": True, "messages": messages})


async def handle_delete_scheduled(request):
    data = await request.json()
    channel_key = data.get("channel", "debug")
    msg_ids = data.get("ids", [])

    channel_id = CHANNELS.get(channel_key)
    if not channel_id:
        return web.json_response({"ok": False, "error": "Unknown channel"}, status=400)

    entity = await client.get_entity(channel_id)
    await client(DeleteScheduledMessagesRequest(peer=entity, id=msg_ids))
    log.info("Deleted scheduled messages %s from %s", msg_ids, channel_key)
    return web.json_response({"ok": True})


async def handle_reschedule(request):
    data = await request.json()
    channel_key = data.get("channel", "debug")
    msg_id = data.get("id")
    new_time = data.get("new_time")

    channel_id = CHANNELS.get(channel_key)
    if not channel_id or not msg_id or not new_time:
        return web.json_response({"ok": False, "error": "Missing params"}, status=400)

    entity = await client.get_entity(channel_id)
    new_dt = WARSAW_TZ.localize(datetime.fromisoformat(new_time))

    try:
        from telethon.tl.functions.messages import GetScheduledHistoryRequest, EditMessageRequest
        result = await client(GetScheduledHistoryRequest(peer=entity, hash=0))
        target = None
        for msg in result.messages:
            if msg.id == msg_id:
                target = msg
                break

        if not target:
            return web.json_response({"ok": False, "error": "Message not found"}, status=404)

        await client.edit_message(entity, target, schedule=new_dt)
        log.info("Rescheduled msg %d to %s", msg_id, new_dt)
        return web.json_response({"ok": True})
    except Exception as e:
        log.error("Reschedule failed: %s", e)
        return web.json_response({"ok": False, "error": str(e)}, status=500)


async def handle_status(request):
    me = await client.get_me()
    return web.json_response({"ok": True, "account": me.first_name, "account_id": me.id})


# ═══════════ APP ═══════════

async def start_app():
    await init_telethon()

    app = web.Application(
        client_max_size=50 * 1024 * 1024,
        middlewares=[auth_middleware],
    )
    app.router.add_get("/", handle_index)
    app.router.add_get("/editor", handle_editor)
    app.router.add_get("/api/status", handle_status)
    app.router.add_post("/api/schedule", handle_schedule)
    app.router.add_get("/api/scheduled", handle_scheduled_list)
    app.router.add_delete("/api/scheduled", handle_delete_scheduled)
    app.router.add_post("/api/reschedule", handle_reschedule)

    runner = web.AppRunner(app)
    await runner.setup()

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8080"))
    site = web.TCPSite(runner, host, port)
    await site.start()

    log.info("Scheduler running at http://%s:%d", host, port)
    log.info("Token: %s", AUTH_TOKEN)

    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(start_app())

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
import re
import secrets
import time
from collections import defaultdict
from datetime import datetime
from io import BytesIO

import pytz
import aiohttp
from aiohttp import web
from telethon import TelegramClient
from telethon.tl.functions.messages import (
    GetScheduledHistoryRequest,
    DeleteScheduledMessagesRequest,
)
import struct as _struct
from telethon.tl.types import (
    InputMediaPoll,
    Poll,
    PollAnswer,
    TextWithEntities,
)


def _patch_input_media_poll():
    """Telethon 1.43.x serializes InputMediaPoll.correct_answers as Vector<int>,
    but Telegram MTProto expects Vector<bytes>. Override _bytes to emit bytes."""
    def _bytes(self):
        # solution + solution_entities share flag bit 1 (value=2 in mask).
        # Both must be set together (entities can be empty list, but not None/False).
        has_solution = self.solution is not None and self.solution is not False
        has_correct = self.correct_answers is not None and self.correct_answers is not False
        has_attached = self.attached_media is not None and self.attached_media is not False
        has_solmedia = self.solution_media is not None and self.solution_media is not False

        flags = (
            (1 if has_correct else 0) |
            (8 if has_attached else 0) |
            (2 if has_solution else 0) |
            (4 if has_solmedia else 0)
        )
        parts = [
            b'\x08A:\x88',
            _struct.pack('<I', flags),
            self.poll._bytes(),
        ]
        if has_correct:
            parts.append(b'\x15\xc4\xb5\x1c')
            parts.append(_struct.pack('<i', len(self.correct_answers)))
            for x in self.correct_answers:
                if isinstance(x, int):
                    x = bytes([x])
                parts.append(self.serialize_bytes(x))
        if has_attached:
            parts.append(self.attached_media._bytes())
        if has_solution:
            parts.append(self.serialize_bytes(self.solution))
            ents = self.solution_entities or []
            parts.append(b'\x15\xc4\xb5\x1c')
            parts.append(_struct.pack('<i', len(ents)))
            for ent in ents:
                parts.append(ent._bytes())
        if has_solmedia:
            parts.append(self.solution_media._bytes())
        return b''.join(parts)
    InputMediaPoll._bytes = _bytes


_patch_input_media_poll()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WARSAW_TZ = pytz.timezone("Europe/Warsaw")

API_ID = int(os.environ["TG_API_ID"])
API_HASH = os.environ["TG_API_HASH"]
SESSION_PATH = os.path.join(BASE_DIR, "zabka_session")

AUTH_TOKEN = os.environ["SCHEDULER_TOKEN"]

AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION", "westeurope")
AZURE_TTS_DEFAULT_VOICE = "pl-PL-AgnieszkaNeural"

CHANNELS = {
    "debug": -1003772746301,
    "production": -1003738416290,
}

WORD_HISTORY_FILE = os.path.join(BASE_DIR, "word_history.json")
WORD_HISTORY_TTL_SEC = 60 * 30  # 30 min cache
WORD_HISTORY_FETCH_LIMIT = 1000

# Matches a Słowo dnia card by its first line: `WORD - перевод` or `🇵🇱 WORD - перевод`.
# Polish word (latin + diacritics) + optional space, then dash, then cyrillic translation start.
# Anchoring on cyrillic right side filters out non-słowo cards (ciekawostka, news, etc).
WORD_RE = re.compile(
    r"^(?:🇵🇱\s+)?([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż\s\-']{0,80}?)\s*[-–—]\s*[А-Яа-яЁё]",
    re.UNICODE,
)

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


def format_card_text(word, translation, examples=None, transcription=None):
    if isinstance(examples, str):
        examples = [examples] if examples.strip() else []
    examples = [e for e in (examples or []) if e and e.strip()]

    head = f"\U0001f1f5\U0001f1f1 <b>{word}</b>"
    if transcription and transcription.strip():
        head += f" {transcription.strip()}"
    head += f" - {translation}"

    lines = [
        "\U0001f438 <b>S\u0142owo dnia</b>",
        "",
        head,
    ]
    for ex in examples:
        lines.append("")
        lines.append(f"\U0001f4dd <i>{ex}</i>")
    lines.extend(["", "#s\u0142owodnia #polski", "@zabka_learn"])
    return "\n".join(lines)


# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 WORD HISTORY \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

def load_word_history():
    if not os.path.exists(WORD_HISTORY_FILE):
        return {"channels": {}, "fetched_at": {}}
    try:
        with open(WORD_HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"channels": {}, "fetched_at": {}}


def save_word_history(data):
    tmp = WORD_HISTORY_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, WORD_HISTORY_FILE)


def extract_word_from_message(text):
    if not text:
        return None
    # Słowo dnia is always identified by its first line.
    first_line = text.split("\n", 1)[0].strip()
    if not first_line:
        return None
    m = WORD_RE.match(first_line)
    if not m:
        return None
    word = m.group(1).strip()
    if not word or len(word) > 80:
        return None
    return word


_PL_DIACRITICS = str.maketrans({
    "ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n",
    "ó": "o", "ś": "s", "ź": "z", "ż": "z",
    "Ą": "a", "Ć": "c", "Ę": "e", "Ł": "l", "Ń": "n",
    "Ó": "o", "Ś": "s", "Ź": "z", "Ż": "z",
})


def normalize_word(word):
    s = (word or "").strip().lower()
    s = s.translate(_PL_DIACRITICS)
    # Collapse internal whitespace so "postawić na swoim" matches "Postawić  Na Swoim"
    s = re.sub(r"\s+", " ", s)
    return s


async def fetch_channel_words(channel_key, limit=WORD_HISTORY_FETCH_LIMIT):
    channel_id = CHANNELS.get(channel_key)
    if not channel_id:
        return []
    entity = await client.get_entity(channel_id)
    found = []
    async for msg in client.iter_messages(entity, limit=limit):
        text = msg.message or ""
        word = extract_word_from_message(text)
        if not word:
            continue
        found.append({
            "word": word,
            "key": normalize_word(word),
            "msg_id": msg.id,
            "date": msg.date.astimezone(WARSAW_TZ).isoformat(),
        })
    return found


async def refresh_word_history(channel_key):
    items = await fetch_channel_words(channel_key)
    data = load_word_history()
    data.setdefault("channels", {})[channel_key] = items
    data.setdefault("fetched_at", {})[channel_key] = time.time()
    save_word_history(data)
    return items


async def get_word_history(channel_key, force_refresh=False):
    data = load_word_history()
    fetched = data.get("fetched_at", {}).get(channel_key, 0)
    if force_refresh or (time.time() - fetched) > WORD_HISTORY_TTL_SEC:
        return await refresh_word_history(channel_key)
    return data.get("channels", {}).get(channel_key, [])


# ═══════════ HANDLERS ═══════════

async def handle_index(request):
    with open(os.path.join(BASE_DIR, "batch.html"), "r", encoding="utf-8") as f:
        return web.Response(text=f.read(), content_type="text/html", charset="utf-8")


async def handle_editor(request):
    with open(os.path.join(BASE_DIR, "index.html"), "r", encoding="utf-8") as f:
        return web.Response(text=f.read(), content_type="text/html", charset="utf-8")


_EDITOR_BUNDLE_CACHE = {"mtime": 0, "body": ""}


async def handle_editor_js_bundle(request):
    """Concatenate all editor JS modules into a single response.
    Avoids the const/let-script-scoping issue across multiple <script> tags."""
    js_dir = os.path.join(BASE_DIR, "static", "js")
    files = sorted(f for f in os.listdir(js_dir) if f.endswith(".js"))
    paths = [os.path.join(js_dir, f) for f in files]
    latest_mtime = max(os.path.getmtime(p) for p in paths) if paths else 0

    cache = _EDITOR_BUNDLE_CACHE
    if cache["mtime"] != latest_mtime:
        chunks = []
        for f, p in zip(files, paths):
            with open(p, "r", encoding="utf-8") as fh:
                chunks.append(f"// === bundled: {f} ===\n{fh.read()}")
        cache["body"] = "\n".join(chunks)
        cache["mtime"] = latest_mtime

    return web.Response(
        text=cache["body"],
        content_type="application/javascript",
        charset="utf-8",
    )


POLL_QUESTION_MAX = 300
POLL_OPTION_MAX = 100
POLL_MAX_OPTIONS = 10
POLL_SOLUTION_MAX = 200


def _truncate(s, n):
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


async def _send_poll(entity, card, schedule_dt, image_b64, fallback_text, is_quiz):
    """
    Send a Telegram poll/quiz. If image_b64 present, send card image first as a
    separate scheduled message (1s before the poll), then the poll itself.

    Card schema (poll):
        question: str
        options: [str | {text, correct?}]
        multiple_choice: bool      (poll only; ignored for quiz)
        solution: str              (quiz only; explanation shown after answer)
        close_period_sec: int      (auto-close after N seconds; 0 = never)
        anonymous: bool            (default true)
    """
    raw_options = card.get("options") or []
    options_struct = []
    correct_indices = []
    for i, opt in enumerate(raw_options):
        if isinstance(opt, str):
            text = opt
            correct = False
        elif isinstance(opt, dict):
            text = opt.get("text") or opt.get("pl") or ""
            correct = bool(opt.get("correct"))
        else:
            continue
        text = _truncate(text, POLL_OPTION_MAX)
        if not text:
            continue
        if correct:
            correct_indices.append(len(options_struct))
        options_struct.append(text)
        if len(options_struct) >= POLL_MAX_OPTIONS:
            break

    if len(options_struct) < 2:
        raise ValueError("Polls need at least 2 options")
    if is_quiz and len(correct_indices) != 1:
        raise ValueError("Quiz needs exactly one correct answer")

    question_text = _truncate(card.get("question") or card.get("word") or "", POLL_QUESTION_MAX)
    if not question_text:
        raise ValueError("Empty question")

    answers = [
        PollAnswer(
            text=TextWithEntities(text=t, entities=[]),
            option=bytes([i]),
        )
        for i, t in enumerate(options_struct)
    ]

    close_period = card.get("close_period_sec") or 0
    multiple_choice = bool(card.get("multiple_choice")) and not is_quiz
    anonymous = card.get("anonymous", True)

    # Telethon 1.43.x has a schema mismatch with current Telegram for quiz polls:
    # correct_answers is rejected as not matching PollAnswer.option even though
    # bytes are identical. Fallback: send as plain opinion poll and prepend the
    # correct answer to the solution/follow-up message.
    sol_text = _truncate(card.get("solution") or "", POLL_SOLUTION_MAX)
    if is_quiz:
        correct_label = options_struct[correct_indices[0]] if correct_indices else ""
        sol_text = f"✅ Правильный ответ: {correct_label}" + (f"\n\n{sol_text}" if sol_text else "")
        # downgrade to plain poll for compatibility
        is_quiz_effective = False
    else:
        is_quiz_effective = False

    poll = Poll(
        id=0,
        question=TextWithEntities(text=question_text, entities=[]),
        answers=answers,
        hash=0,
        public_voters=(not anonymous),
        multiple_choice=multiple_choice,
        quiz=is_quiz_effective,
        close_period=(close_period or None),
    )

    media = InputMediaPoll(poll=poll)

    # If we have a card image, send it as a separate scheduled message first.
    # Use the post_text as caption so the image carries context independently.
    if image_b64:
        try:
            raw = image_b64.split(",", 1)[-1]
            image_bytes = base64.b64decode(raw)
            buf = BytesIO(image_bytes)
            buf.name = "card.png"
            img_kwargs = {"parse_mode": "html"}
            if schedule_dt:
                img_kwargs["schedule"] = schedule_dt
            caption = (fallback_text or "").strip() or None
            await client.send_file(entity, file=buf, caption=caption, **img_kwargs)
        except Exception as e:
            log.warning("Image-before-poll failed: %s", e)

    poll_kwargs = {"file": media}
    if schedule_dt:
        poll_kwargs["schedule"] = schedule_dt
    msg = await client.send_message(entity, **poll_kwargs)

    # If we have a quiz solution, send it as a follow-up message scheduled
    # at close time (or immediately for instant publishes). Hidden behind a
    # spoiler so people who haven't voted yet aren't spoiled.
    if is_quiz and sol_text:
        try:
            spoiler_text = f"<tg-spoiler>{sol_text}</tg-spoiler>"
            kw = {"parse_mode": "html"}
            if schedule_dt:
                # Schedule reveal slightly after the poll
                from datetime import timedelta
                kw["schedule"] = schedule_dt + timedelta(seconds=10)
            await client.send_message(entity, spoiler_text, reply_to=msg.id, **kw)
        except Exception as e:
            log.warning("Quiz solution follow-up failed: %s", e)

    return msg


# ═══════════ TTS (Azure Speech) ═══════════

TTS_MAX_INPUT_CHARS = 1500  # safety cap; F0 also caps overall monthly chars

def _escape_ssml(text: str) -> str:
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
    )

def _build_tts_text(card: dict) -> str:
    """Build natural-spoken sequence: word, pause, examples (Polish only)."""
    parts = []
    word = (card.get("word") or "").strip()
    if word:
        # Use only first line of word field
        parts.append(word.split("\n")[0].strip())
    for ex in card.get("examples", []) or []:
        if isinstance(ex, str):
            s = ex.strip().split("\n")[0].strip()
        elif isinstance(ex, dict):
            s = (ex.get("pl") or ex.get("text") or "").strip().split("\n")[0].strip()
        else:
            s = ""
        if s:
            parts.append(s)
    # Make sure each part ends with sentence-final punctuation so SSML splitter
    # produces separate <s> blocks (more natural intonation).
    def _terminate(s):
        return s if s and s[-1] in ".!?…" else s + "."
    return " ".join(_terminate(p) for p in parts)[:TTS_MAX_INPUT_CHARS]

def _build_ssml(text: str, voice: str = AZURE_TTS_DEFAULT_VOICE, rate_pct: int = -10) -> str:
    """Build SSML with sentence segmentation + breaks for natural intonation.

    Splits on `.`, `!`, `?` (and our internal `· ` separator) so each fragment becomes
    a <s> with a short <break> after. Avoids the flat-monotone "robot" feel of a single
    blob of text passed straight to the synthesizer.
    """
    raw = text.replace("· ", ". ").strip()
    # Split into sentences keeping punctuation
    sentences = re.split(r"(?<=[.!?])\s+", raw)
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences:
        sentences = [raw]

    body_parts = []
    for i, s in enumerate(sentences):
        safe = _escape_ssml(s)
        body_parts.append(f"<s>{safe}</s>")
        # Pause between sentences; longer after the head-word (first short fragment).
        if i < len(sentences) - 1:
            gap = 700 if i == 0 and len(s) < 40 else 450
            body_parts.append(f'<break time="{gap}ms"/>')

    body = "".join(body_parts)
    rate = f"{rate_pct:+d}%"
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pl-PL">'
        f'<voice name="{voice}">'
        f'<prosody rate="{rate}" pitch="+0%">{body}</prosody>'
        '</voice></speak>'
    )

AZURE_FMT_OGG_OPUS = "ogg-48khz-16bit-mono-opus"
AZURE_FMT_MP3 = "audio-24khz-160kbitrate-mono-mp3"

async def _synth_voice(text: str, voice: str = AZURE_TTS_DEFAULT_VOICE,
                       rate_pct: int = -10, output_format: str = AZURE_FMT_OGG_OPUS):
    """Returns audio bytes (default OGG/Opus for Telegram voice notes) or None on failure."""
    if not AZURE_SPEECH_KEY or not text.strip():
        return None
    url = f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": output_format,
        "User-Agent": "zabka-learn",
    }
    ssml = _build_ssml(text, voice=voice, rate_pct=rate_pct)
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, data=ssml.encode("utf-8"), headers=headers) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    log.warning("Azure TTS HTTP %d: %s", resp.status, body[:200])
                    return None
                return await resp.read()
    except Exception as e:
        log.warning("Azure TTS request failed: %s", e)
        return None

# Backwards-compat alias for existing callers (Telegram voice note path)
async def _synth_voice_ogg(text: str, voice: str = AZURE_TTS_DEFAULT_VOICE, rate_pct: int = -10):
    return await _synth_voice(text, voice=voice, rate_pct=rate_pct, output_format=AZURE_FMT_OGG_OPUS)


async def _maybe_send_voice_reply(entity, card: dict, reply_to_msg_id: int, schedule_dt):
    """If card.tts_enabled, synthesize Polish voice note and send as reply."""
    if not card.get("tts_enabled"):
        return
    text = (card.get("tts_text") or "").strip() or _build_tts_text(card)
    if not text:
        return
    voice = card.get("tts_voice") or AZURE_TTS_DEFAULT_VOICE
    try:
        rate_pct = int(card.get("tts_rate_pct", 0))
    except (TypeError, ValueError):
        rate_pct = 0
    audio = await _synth_voice_ogg(text, voice=voice, rate_pct=rate_pct)
    if not audio:
        log.info("TTS skipped (no audio) for '%s'", card.get("word", ""))
        return
    buf = BytesIO(audio)
    buf.name = "voice.ogg"
    kwargs = dict(file=buf, voice_note=True, reply_to=reply_to_msg_id)
    if schedule_dt:
        from datetime import timedelta
        kwargs["schedule"] = schedule_dt + timedelta(seconds=5)
    try:
        await client.send_file(entity, **kwargs)
        log.info("TTS voice sent for '%s' (%d chars)", card.get("word", ""), len(text))
    except Exception as e:
        log.warning("TTS send_file failed: %s", e)


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
            examples_raw = card.get("examples", []) or []
            example_strs = []
            for e in examples_raw:
                if isinstance(e, str):
                    if e.strip():
                        example_strs.append(e.strip())
                elif isinstance(e, dict):
                    s = (e.get("pl") or e.get("text") or "").strip()
                    if s:
                        example_strs.append(s)
            text = format_card_text(
                word,
                translation,
                examples=example_strs,
                transcription=card.get("transcription"),
            )

        image_b64 = card.get("image")
        card_type = (card.get("type") or "card").lower()

        try:
            if card_type in ("quiz", "poll"):
                msg = await _send_poll(
                    entity, card, schedule_dt, image_b64, text,
                    is_quiz=(card_type == "quiz"),
                )
            elif image_b64:
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

            # Optional voice-note follow-up (Azure TTS)
            await _maybe_send_voice_reply(entity, card, msg.id, schedule_dt)

            # Append to local word history immediately so duplicate-check stays fresh.
            if word:
                hist = load_word_history()
                ch_list = hist.setdefault("channels", {}).setdefault(channel_key, [])
                ch_list.insert(0, {
                    "word": word,
                    "key": normalize_word(word),
                    "msg_id": msg.id,
                    "date": (schedule_dt or datetime.now(WARSAW_TZ)).isoformat(),
                })
                save_word_history(hist)

        except Exception as e:
            log.error("Failed to publish '%s': %s", word, e)
            results.append({"word": word, "ok": False, "error": str(e)})

        await asyncio.sleep(0.3)

    return web.json_response({"ok": True, "results": results})


async def handle_tts_preview(request):
    """Synthesize voice for given text and return OGG/Opus bytes. Used by editor for preview."""
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Bad JSON"}, status=400)
    text = (data.get("text") or "").strip()
    if not text:
        return web.json_response({"ok": False, "error": "Empty text"}, status=400)
    voice = data.get("voice") or AZURE_TTS_DEFAULT_VOICE
    try:
        rate_pct = int(data.get("rate_pct", -10))
    except (TypeError, ValueError):
        rate_pct = -10
    if not AZURE_SPEECH_KEY:
        return web.json_response({"ok": False, "error": "AZURE_SPEECH_KEY not configured"}, status=500)
    # Browsers (esp. Windows Chrome) play MP3 universally; OGG/Opus is hit-or-miss.
    fmt = (data.get("format") or "mp3").lower()
    if fmt == "ogg":
        audio = await _synth_voice(text, voice=voice, rate_pct=rate_pct, output_format=AZURE_FMT_OGG_OPUS)
        ctype = "audio/ogg"
    else:
        audio = await _synth_voice(text, voice=voice, rate_pct=rate_pct, output_format=AZURE_FMT_MP3)
        ctype = "audio/mpeg"
    if not audio:
        return web.json_response({"ok": False, "error": "Synthesis failed"}, status=502)
    return web.Response(body=audio, content_type=ctype)


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


async def handle_word_history(request):
    channel_key = request.query.get("channel", "production")
    if channel_key not in CHANNELS:
        return web.json_response({"ok": False, "error": "Unknown channel"}, status=400)
    force = request.query.get("refresh") == "1"
    try:
        items = await get_word_history(channel_key, force_refresh=force)
        return web.json_response({"ok": True, "channel": channel_key, "items": items})
    except Exception as e:
        log.error("Word history fetch failed: %s", e)
        return web.json_response({"ok": False, "error": str(e)}, status=500)


async def handle_check_word(request):
    word = request.query.get("word", "")
    channel_key = request.query.get("channel", "production")
    if not word.strip():
        return web.json_response({"ok": False, "error": "Empty word"}, status=400)
    if channel_key not in CHANNELS:
        return web.json_response({"ok": False, "error": "Unknown channel"}, status=400)
    items = await get_word_history(channel_key)
    key = normalize_word(word)
    matches = [i for i in items if i["key"] == key]
    return web.json_response({
        "ok": True,
        "exists": len(matches) > 0,
        "matches": matches[:5],
    })


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
    app.router.add_get("/api/word-history", handle_word_history)
    app.router.add_get("/api/check-word", handle_check_word)
    app.router.add_post("/api/tts-preview", handle_tts_preview)
    app.router.add_get("/static/js/editor-bundle.js", handle_editor_js_bundle)
    app.router.add_static("/static", os.path.join(BASE_DIR, "static"), show_index=False)

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

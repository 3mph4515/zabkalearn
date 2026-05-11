#!/usr/bin/env python3
"""
Polski Daily Card Generator Bot
Telegram bot with captcha that provides the latest editor version
Auto-notifies users when new version is deployed
+ Quiz/Test functionality with progress tracking
"""

import os
import json
import random
import asyncio
import sqlite3
from datetime import datetime
from typing import Optional
import pytz
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, Bot
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

# Configuration
BOT_TOKEN = os.environ["BOT_TOKEN"]
EDITOR_FILE = os.path.join(os.path.dirname(__file__), "index.html")
USERS_FILE = os.path.join(os.path.dirname(__file__), "users.json")
VERSION_FILE = os.path.join(os.path.dirname(__file__), "last_version.txt")
DB_FILE = os.path.join(os.path.dirname(__file__), "quiz.db")

# Separate versions for editor and quiz
EDITOR_VERSION = "2.3"
QUIZ_VERSION = "2.3"  # Split into smaller quizzes + better formatting
EDITOR_CHANGELOG = """• 6 новых декораций: снежинки, точки, кольца, листья, бриллианты, волны
• Кнопка «Случайно» — выбирает 1-3 случайных декорации"""

# Editor password protection
EDITOR_PASSWORD = os.environ["EDITOR_PASSWORD"]

# Store pending captchas: {user_id: {"answer": int, "attempts": int}}
pending_captchas = {}

# Store pending editor password requests: {user_id: True}
pending_editor_password = {}

# Rate limiting for button presses: {user_id: {"last_click": timestamp, "action": str}}
rate_limit = {}
RATE_LIMIT_SECONDS = 1.5  # Minimum time between button clicks

# ============== DATABASE ==============

def init_db():
    """Initialize SQLite database for quiz progress"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Quiz topics
    c.execute('''
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            emoji TEXT DEFAULT '📚'
        )
    ''')

    # Questions
    c.execute('''
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY,
            topic_id INTEGER,
            question TEXT NOT NULL,
            correct_answer INTEGER NOT NULL,
            option_1 TEXT NOT NULL,
            option_2 TEXT NOT NULL,
            option_3 TEXT,
            option_4 TEXT,
            explanation TEXT,
            FOREIGN KEY (topic_id) REFERENCES topics(id)
        )
    ''')

    # User progress
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_progress (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            topic_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            is_correct INTEGER NOT NULL,
            answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (topic_id) REFERENCES topics(id),
            FOREIGN KEY (question_id) REFERENCES questions(id)
        )
    ''')

    # User quiz sessions (current question in progress)
    c.execute('''
        CREATE TABLE IF NOT EXISTS quiz_sessions (
            user_id INTEGER PRIMARY KEY,
            topic_id INTEGER,
            current_question_idx INTEGER DEFAULT 0,
            questions_order TEXT,
            score INTEGER DEFAULT 0,
            total_questions INTEGER DEFAULT 0,
            mistakes TEXT DEFAULT '[]',
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Add mistakes column if not exists
    try:
        c.execute("ALTER TABLE quiz_sessions ADD COLUMN mistakes TEXT DEFAULT '[]'")
    except:
        pass

    conn.commit()
    conn.close()


def seed_sample_quiz():
    """Add sample quiz data if not exists"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Check if idioms topic exists
    c.execute("SELECT COUNT(*) FROM topics WHERE name LIKE '%Idiomy%' OR name LIKE '%Wyrażenia%'")
    if c.fetchone()[0] == 0:
        # Add idioms topic
        c.execute('''
            INSERT INTO topics (name, description, emoji)
            VALUES (?, ?, ?)
        ''', ("Wyrażenia i idiomy", "Польские выражения и идиомы", "💬"))
        topic_id = c.lastrowid

        # Add questions about Polish idioms/expressions
        idiom_questions = [
            {
                "question": "**Coś jest nieczynne** oznacza:",
                "correct": 1,
                "options": ["zamknięte", "włączone do obiegu", "nieuszkodzone"],
                "explanation": "Nieczynne = zamknięte, nie działa"
            },
            {
                "question": "**Coś jest na końcu świata** oznacza:",
                "correct": 3,
                "options": ["bardzo blisko", "w miejscu dość określonym", "daleko, gdzie mało kto dotarł"],
                "explanation": "Na końcu świata = bardzo daleko"
            },
            {
                "question": "**Coś jest takie sobie** oznacza:",
                "correct": 2,
                "options": ["znakomite", "przeciętne", "wyróżniające się"],
                "explanation": "Takie sobie = przeciętne, nic szczególnego"
            },
            {
                "question": "**Ktoś zależy od kogoś** oznacza:",
                "correct": 1,
                "options": ["podlega komuś", "należy do kogoś", "wymyka się spod czyjejś władzy"],
                "explanation": "Zależeć od kogoś = podlegać komuś"
            },
            {
                "question": "**Być gotowym na wszystko** oznacza:",
                "correct": 3,
                "options": ["być zdecydowanym na coś", "lekceważyć wszystko", "być dobrze przygotowanym"],
                "explanation": "Być gotowym na wszystko = być dobrze przygotowanym"
            },
            {
                "question": "**Co panu jest?** (pot.) oznacza:",
                "correct": 1,
                "options": ["co panu dolega?", "kim pan jest?", "co nowego u pana?"],
                "explanation": "Co panu jest? = Co panu dolega? (pytanie o zdrowie)"
            },
            {
                "question": "**Być złotą rączką** oznacza:",
                "correct": 2,
                "options": ["kimś, psującym wszystko", "kimś, kto wszystko naprawi", "kimś lubiącym złoto"],
                "explanation": "Złota rączka = osoba, która potrafi wszystko naprawić"
            },
            {
                "question": "**Co u ciebie słychać?** oznacza:",
                "correct": 1,
                "options": ["jak się czujesz? / co nowego?", "czego słuchasz?", "co słyszysz?"],
                "explanation": "Co słychać? = Jak się masz? Co nowego?"
            },
            {
                "question": "**Leżeć w łóżku** (pot.) oznacza:",
                "correct": 1,
                "options": ["być chorym", "zasypiać", "przygotowywać się do snu"],
                "explanation": "Leżeć (w łóżku) = być chorym"
            },
            {
                "question": "**Mieć czas dla siebie** oznacza:",
                "correct": 2,
                "options": ["bezustannie pracować", "mieć czas na przyjemności, rozrywkę", "spieszyć się"],
                "explanation": "Czas dla siebie = czas na odpoczynek i przyjemności"
            },
            {
                "question": "**Mieć jakąś pasję** oznacza:",
                "correct": 1,
                "options": ["robić coś z entuzjazmem, mieć zamiłowanie", "odczuwać silną złość", "gniewać się, złościć"],
                "explanation": "Pasja = zamiłowanie, hobby wykonywane z entuzjazmem"
            },
            {
                "question": "**Mieć pechowy dzień** oznacza:",
                "correct": 1,
                "options": ["dzień niefortunny", "dzień szczęśliwy", "dzień udany"],
                "explanation": "Pechowy dzień = dzień, w którym wszystko idzie źle"
            },
        ]

        for q in idiom_questions:
            c.execute('''
                INSERT INTO questions (topic_id, question, correct_answer, option_1, option_2, option_3, option_4, explanation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                topic_id,
                q["question"],
                q["correct"],
                q["options"][0],
                q["options"][1],
                q["options"][2] if len(q["options"]) > 2 else None,
                q["options"][3] if len(q["options"]) > 3 else None,
                q["explanation"]
            ))

        print("✅ Idioms quiz added")

    # Check if przypadki topic exists
    c.execute("SELECT COUNT(*) FROM topics WHERE name LIKE '%Przypadki%'")
    if c.fetchone()[0] == 0:
        # Add cases topic
        c.execute('''
            INSERT INTO topics (name, description, emoji)
            VALUES (?, ?, ?)
        ''', ("Przypadki (падежи)", "Тест на польские падежи", "📝"))
        topic_id = c.lastrowid

        # Add questions about Polish cases
        case_questions = [
            {
                "question": "Какой падеж отвечает на вопрос «Kogo? Czego?»",
                "correct": 2,
                "options": ["Mianownik", "Dopełniacz", "Celownik", "Biernik"],
                "explanation": "Dopełniacz (родительный) отвечает на Kogo? Czego?"
            },
            {
                "question": "«Idę do ___» — какой падеж нужен после 'do'?",
                "correct": 1,
                "options": ["Dopełniacz", "Celownik", "Narzędnik", "Miejscownik"],
                "explanation": "После 'do' всегда идёт Dopełniacz (родительный)"
            },
            {
                "question": "«Daję książkę ___» (komu?) — это какой падеж?",
                "correct": 2,
                "options": ["Dopełniacz", "Celownik", "Biernik", "Narzędnik"],
                "explanation": "Celownik (дательный) отвечает на Komu? Czemu?"
            },
            {
                "question": "Jak poprawnie: «Widzę ___» (kobieta)?",
                "correct": 2,
                "options": ["kobieta", "kobietę", "kobiecie", "kobiety"],
                "explanation": "Biernik женского рода: kobieta → kobietę"
            },
            {
                "question": "«Jadę ___» (samochód) — jaki przypadek?",
                "correct": 3,
                "options": ["Dopełniacz", "Biernik", "Narzędnik", "Miejscownik"],
                "explanation": "Narzędnik (творительный) — jadę samochodem"
            },
        ]

        for q in case_questions:
            c.execute('''
                INSERT INTO questions (topic_id, question, correct_answer, option_1, option_2, option_3, option_4, explanation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                topic_id,
                q["question"],
                q["correct"],
                q["options"][0],
                q["options"][1],
                q["options"][2] if len(q["options"]) > 2 else None,
                q["options"][3] if len(q["options"]) > 3 else None,
                q["explanation"]
            ))

        print("✅ Cases quiz added")

    # Check if new split idiom quizzes exist
    c.execute("SELECT COUNT(*) FROM topics WHERE name LIKE '%Potoczne wyrażenia%'")
    if c.fetchone()[0] == 0:
        # Delete old "Idiomy część 2" if exists
        c.execute("SELECT id FROM topics WHERE name LIKE '%Idiomy część 2%'")
        old_topic = c.fetchone()
        if old_topic:
            c.execute("DELETE FROM questions WHERE topic_id = ?", (old_topic[0],))
            c.execute("DELETE FROM topics WHERE id = ?", (old_topic[0],))

        # Quiz 1: Potoczne wyrażenia (10 questions)
        quiz1_questions = [
            {"question": "Nie ma sprawy (pot.) oznacza:", "correct": 1,
             "options": ["dana sytuacja jest błaha, łatwa do załatwienia", "sytuacja jest nie do spełnienia", "sprawa została już załatwiona"]},
            {"question": "Nie mam o tym zielonego pojęcia oznacza:", "correct": 1,
             "options": ["nic o tym nie wiem", "nie lubię tego koloru", "nie mogę się z tym pogodzić"]},
            {"question": "Nie móc się czegoś doczekać oznacza:", "correct": 2,
             "options": ["nie mieć czasu, aby czekać", "czekać na coś z niecierpliwością", "zrezygnować z czekania"]},
            {"question": "Niedobrze mi, bo... oznacza:", "correct": 2,
             "options": ["wykonałem coś źle", "zjadłem coś nieświeżego", "coś zapowiada się nieciekawie"]},
            {"question": "Płacę gotówką oznacza:", "correct": 3,
             "options": ["płacę czekiem", "płacę kartą", "płacę pieniędzmi w banknotach"]},
            {"question": "Praca nie zając, nie ucieknie oznacza:", "correct": 2,
             "options": ["praca jest czynnością wartościową", "nie należy się przejmować pracą", "czas w pracy ucieka tak szybko jak zając"]},
            {"question": "Pracować nad sobą oznacza:", "correct": 3,
             "options": ["być sprawnym", "być zatrudnionym", "czynić siebie doskonalszym"]},
            {"question": "Stawiać komuś coś (pot.) oznacza:", "correct": 1,
             "options": ["zapraszać kogoś gdzieś i płacić np. za posiłek", "umieszczać kogoś w jakimś miejscu", "podnosić kogoś"]},
            {"question": "Umierać z ciekawości oznacza:", "correct": 3,
             "options": ["umierać w bólach", "mieć dość życia", "być czymś bardzo zainteresowanym"]},
            {"question": "Wpaść do kogoś (pot.) oznacza:", "correct": 1,
             "options": ["przyjść do kogoś na chwilę", "zagłębiać się w czyjeś życie", "osuwać się do wewnątrz"]},
        ]

        c.execute("INSERT INTO topics (name, description, emoji) VALUES (?, ?, ?)",
                  ("Potoczne wyrażenia", "Codzienne zwroty i wyrażenia", "🗣️"))
        topic_id = c.lastrowid
        for q in quiz1_questions:
            c.execute("INSERT INTO questions (topic_id, question, correct_answer, option_1, option_2, option_3, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
                      (topic_id, q["question"], q["correct"], q["options"][0], q["options"][1], q["options"][2], ""))
        print("✅ Quiz 'Potoczne wyrażenia' added (10 questions)")

        # Quiz 2: Polskie przysłowia (10 questions)
        quiz2_questions = [
            {"question": "Uparty jak osioł oznacza:", "correct": 2,
             "options": ["podobny do osła", "nieustępliwy", "niewytrwały"]},
            {"question": "Upiec dwie pieczenie przy jednym ogniu oznacza:", "correct": 1,
             "options": ["załatwić dwie sprawy jednocześnie", "spieszyć się przed kolacją", "bać się, że ogień wygaśnie"]},
            {"question": "Uzbroić się w cierpliwość oznacza:", "correct": 1,
             "options": ["cierpliwie czekać", "przygotować się do walki", "nie mieć cierpliwości"]},
            {"question": "Urodzić się pod szczęśliwą gwiazdą oznacza:", "correct": 1,
             "options": ["mieć szczęście w życiu", "przyjść na świat podczas podróży", "urodzić się w gwieździstą noc"]},
            {"question": "Ktoś jest wierny jak pies oznacza:", "correct": 1,
             "options": ["lojalny, oddany", "nielojalny", "bez charakteru"]},
            {"question": "Wigilijny wieczór oznacza:", "correct": 1,
             "options": ["wieczór przed dniem świątecznym", "każdy wieczór z przyjaciółmi", "zmierzch"]},
            {"question": "Wierzyć w przesądy oznacza:", "correct": 1,
             "options": ["wierzyć w dziwne zjawiska, być zabobonnym", "wierzyć w sprawiedliwość", "mieć zaufanie do sądownictwa"]},
            {"question": "Wolne od pracy (dni) oznacza:", "correct": 2,
             "options": ["wakacje", "sobota i niedziela", "urlop"]},
            {"question": "Wyjść za mąż (za kogoś) oznacza:", "correct": 3,
             "options": ["ukryć się za plecami męża", "wyjść po męża na dworzec", "poślubić mężczyznę"]},
            {"question": "Wyglądać w czymś dobrze oznacza:", "correct": 3,
             "options": ["czuć się dobrze", "sprawiać wrażenie dobrego człowieka", "wyglądać korzystnie w ubiorze"]},
        ]

        c.execute("INSERT INTO topics (name, description, emoji) VALUES (?, ?, ?)",
                  ("Polskie przysłowia", "Popularne powiedzenia i zwroty", "🦊"))
        topic_id = c.lastrowid
        for q in quiz2_questions:
            c.execute("INSERT INTO questions (topic_id, question, correct_answer, option_1, option_2, option_3, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
                      (topic_id, q["question"], q["correct"], q["options"][0], q["options"][1], q["options"][2], ""))
        print("✅ Quiz 'Polskie przysłowia' added (10 questions)")

        # Quiz 3: Życie codzienne (10 questions)
        quiz3_questions = [
            {"question": "Mężczyzna w średnim wieku oznacza:", "correct": 3,
             "options": ["mężczyzna średniego wzrostu", "niski mężczyzna", "mężczyzna mający około 40 lat"]},
            {"question": "Wynagrodzenie z dołu oznacza:", "correct": 1,
             "options": ["pensja po przepracowaniu miesiąca", "niskie wynagrodzenie", "niewielka nagroda"]},
            {"question": "Nie potrafić żyć bez siebie oznacza:", "correct": 2,
             "options": ["nie lubić się wzajemnie", "być nierozłącznym z kimś", "uwielbiać samotność"]},
            {"question": "Wystąpić w jakiejś roli oznacza:", "correct": 2,
             "options": ["zrezygnować z roli", "zaprezentować swoje umiejętności", "wyłaniać się z ziemi"]},
            {"question": "Syn marnotrawny oznacza:", "correct": 3,
             "options": ["człowiek, który ma apetyt", "człowiek, który lubi się bawić", "człowiek, który zawinił i się opamiętał"]},
            {"question": "Założyć rodzinę oznacza:", "correct": 2,
             "options": ["zakładać się z rodzeństwem", "zawrzeć związek małżeński", "przyjmować rodzinę"]},
            {"question": "Złożyć komuś wizytę oznacza:", "correct": 1,
             "options": ["przyjechać do kogoś w gościnę", "zamówić wizytę", "zaprosić kogoś w odwiedziny"]},
            {"question": "(Twoje) zdrowie! oznacza:", "correct": 1,
             "options": ["zachęta do wzniesienia toastu", "życzenie wytrzymałości", "życzenie powrotu do zdrowia"]},
            {"question": "Zimno mi oznacza:", "correct": 2,
             "options": ["jestem zimny", "odczuwam niską temperaturę", "ogarnia mnie lęk"]},
            {"question": "Życzyć (komuś) zdrowia! oznacza:", "correct": 2,
             "options": ["zachęcać do sportu", "życzyć powrotu do zdrowia", "zachęcać do jedzenia"]},
        ]

        c.execute("INSERT INTO topics (name, description, emoji) VALUES (?, ?, ?)",
                  ("Życie codzienne", "Wyrażenia z życia codziennego", "🏠"))
        topic_id = c.lastrowid
        for q in quiz3_questions:
            c.execute("INSERT INTO questions (topic_id, question, correct_answer, option_1, option_2, option_3, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
                      (topic_id, q["question"], q["correct"], q["options"][0], q["options"][1], q["options"][2], ""))
        print("✅ Quiz 'Życie codzienne' added (10 questions)")

    conn.commit()
    conn.close()


# ============== QUIZ FUNCTIONS ==============

def get_topics():
    """Get all quiz topics"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT id, name, emoji FROM topics")
    topics = c.fetchall()
    conn.close()
    return topics


def get_questions_for_topic(topic_id):
    """Get all questions for a topic"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        SELECT id, question, correct_answer, option_1, option_2, option_3, option_4, explanation
        FROM questions WHERE topic_id = ?
    ''', (topic_id,))
    questions = c.fetchall()
    conn.close()
    return questions


def start_quiz_session(user_id, topic_id):
    """Start a new quiz session for user"""
    questions = get_questions_for_topic(topic_id)
    if not questions:
        return None

    # Shuffle questions
    question_ids = [q[0] for q in questions]
    random.shuffle(question_ids)

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Delete existing session
    c.execute("DELETE FROM quiz_sessions WHERE user_id = ?", (user_id,))

    # Create new session
    c.execute('''
        INSERT INTO quiz_sessions (user_id, topic_id, current_question_idx, questions_order, score, total_questions, mistakes)
        VALUES (?, ?, 0, ?, 0, ?, '[]')
    ''', (user_id, topic_id, json.dumps(question_ids), len(question_ids)))

    conn.commit()
    conn.close()

    return question_ids


def get_quiz_session(user_id):
    """Get current quiz session for user"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        SELECT topic_id, current_question_idx, questions_order, score, total_questions, mistakes
        FROM quiz_sessions WHERE user_id = ?
    ''', (user_id,))
    row = c.fetchone()
    conn.close()

    if row:
        return {
            "topic_id": row[0],
            "current_idx": row[1],
            "questions_order": json.loads(row[2]),
            "score": row[3],
            "total": row[4],
            "mistakes": json.loads(row[5]) if row[5] else []
        }
    return None


def get_question_by_id(question_id):
    """Get question by ID"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        SELECT id, question, correct_answer, option_1, option_2, option_3, option_4, explanation
        FROM questions WHERE id = ?
    ''', (question_id,))
    row = c.fetchone()
    conn.close()

    if row:
        options = [row[3], row[4]]
        if row[5]:
            options.append(row[5])
        if row[6]:
            options.append(row[6])

        return {
            "id": row[0],
            "question": row[1],
            "correct": row[2],
            "options": options,
            "explanation": row[7]
        }
    return None


def record_answer(user_id, question_id, is_correct, user_answer=None):
    """Record user's answer and update session"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Get current session
    c.execute("SELECT topic_id, score, mistakes FROM quiz_sessions WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return

    topic_id = row[0]
    current_score = row[1]
    mistakes = json.loads(row[2]) if row[2] else []

    # Record in progress table
    c.execute('''
        INSERT INTO user_progress (user_id, topic_id, question_id, is_correct)
        VALUES (?, ?, ?, ?)
    ''', (user_id, topic_id, question_id, 1 if is_correct else 0))

    # Update session
    if is_correct:
        c.execute('''
            UPDATE quiz_sessions
            SET score = score + 1, current_question_idx = current_question_idx + 1
            WHERE user_id = ?
        ''', (user_id,))
    else:
        # Add mistake
        if user_answer is not None:
            mistakes.append({"question_id": question_id, "user_answer": user_answer})
        c.execute('''
            UPDATE quiz_sessions
            SET current_question_idx = current_question_idx + 1, mistakes = ?
            WHERE user_id = ?
        ''', (json.dumps(mistakes), user_id))

    conn.commit()
    conn.close()


def get_user_stats(user_id):
    """Get user's quiz statistics"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    c.execute('''
        SELECT COUNT(*), SUM(is_correct) FROM user_progress WHERE user_id = ?
    ''', (user_id,))
    row = c.fetchone()
    conn.close()

    total = row[0] or 0
    correct = row[1] or 0

    return {
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total * 100, 1) if total > 0 else 0
    }


def end_quiz_session(user_id):
    """End quiz session and return final data"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT score, total_questions, mistakes FROM quiz_sessions WHERE user_id = ?", (user_id,))
    row = c.fetchone()

    result = None
    if row:
        result = {
            "score": row[0],
            "total": row[1],
            "mistakes": json.loads(row[2]) if row[2] else []
        }

    c.execute("DELETE FROM quiz_sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return result


# ============== ORIGINAL BOT FUNCTIONS ==============

def load_users():
    """Load users from file"""
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r") as f:
                return set(json.load(f))
        except:
            return set()
    return set()


def save_users(users):
    """Save users to file"""
    with open(USERS_FILE, "w") as f:
        json.dump(list(users), f)


def add_user(user_id):
    """Add user to the list"""
    users = load_users()
    users.add(user_id)
    save_users(users)


def get_last_version():
    """Get last deployed version"""
    if os.path.exists(VERSION_FILE):
        try:
            with open(VERSION_FILE, "r") as f:
                return f.read().strip()
        except:
            return None
    return None


def save_last_version(version):
    """Save current version as last deployed"""
    with open(VERSION_FILE, "w") as f:
        f.write(version)


async def notify_new_version(bot):
    """Send notification about new EDITOR version only (not quiz updates)"""
    last_version = get_last_version()

    if last_version == EDITOR_VERSION:
        print(f"📦 Версия редактора не изменилась (v{EDITOR_VERSION}), рассылка не нужна")
        return

    users = load_users()
    if not users:
        print("📭 Нет пользователей для рассылки")
        save_last_version(EDITOR_VERSION)
        return

    print(f"🚀 Новая версия редактора v{EDITOR_VERSION} (было: {last_version or 'первый запуск'})")
    print(f"📤 Рассылка {len(users)} пользователям...")

    keyboard = [
        [InlineKeyboardButton(
            f"📥 Скачать v{EDITOR_VERSION}",
            callback_data="get_editor"
        )],
        [InlineKeyboardButton(
            "📝 Тесты",
            callback_data="quiz_menu"
        )],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    warsaw_time = datetime.now(pytz.timezone('Europe/Warsaw')).strftime('%d.%m.%Y %H:%M')

    message = (
        f"🚀 **Вышла новая версия редактора v{EDITOR_VERSION}!**\n\n"
        f"📝 **Что нового:**\n{EDITOR_CHANGELOG}\n\n"
        f"📅 {warsaw_time} (Warszawa)"
    )

    sent = 0
    failed = 0

    for uid in users:
        try:
            await bot.send_message(
                chat_id=uid,
                text=message,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
            sent += 1
        except Exception as e:
            failed += 1

        await asyncio.sleep(0.05)

    print(f"✅ Рассылка завершена: отправлено {sent}, ошибок {failed}")
    save_last_version(EDITOR_VERSION)


def check_rate_limit(user_id: int, action: str) -> bool:
    """Check if user is clicking too fast. Returns True if should block."""
    import time
    now = time.time()

    if user_id in rate_limit:
        last_data = rate_limit[user_id]
        time_diff = now - last_data.get("last_click", 0)

        # If same action clicked too fast, block
        if time_diff < RATE_LIMIT_SECONDS:
            return True

    # Update rate limit
    rate_limit[user_id] = {"last_click": now, "action": action}
    return False


def generate_captcha():
    """Generate a simple math captcha"""
    operations = [
        ("+", lambda a, b: a + b),
        ("-", lambda a, b: a - b),
        ("×", lambda a, b: a * b),
    ]

    op_symbol, op_func = random.choice(operations)

    if op_symbol == "×":
        a = random.randint(2, 9)
        b = random.randint(2, 9)
    elif op_symbol == "-":
        a = random.randint(10, 50)
        b = random.randint(1, a)
    else:
        a = random.randint(10, 50)
        b = random.randint(10, 50)

    answer = op_func(a, b)
    question = f"{a} {op_symbol} {b} = ?"

    return question, answer


# ============== HANDLERS ==============

async def start(update, context):
    """Handle /start command - show captcha"""
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name

    question, answer = generate_captcha()
    pending_captchas[user_id] = {"answer": answer, "attempts": 0}

    await update.message.reply_text(
        f"👋 Привет, {user_name}!\n\n"
        f"🐸 Добро пожаловать в Polski Daily Bot!\n\n"
        f"🔐 Для доступа реши простой пример:\n\n"
        f"**{question}**\n\n"
        f"Отправь ответ числом:",
        parse_mode="Markdown"
    )


def get_main_menu_keyboard():
    """Get main menu keyboard"""
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(
            f"📥 Редактор v{EDITOR_VERSION}",
            callback_data="get_editor"
        )],
        [InlineKeyboardButton(
            f"📝 Тесты v{QUIZ_VERSION}",
            callback_data="quiz_menu"
        )],
        [InlineKeyboardButton(
            "📊 Моя статистика",
            callback_data="my_stats"
        )],
        [InlineKeyboardButton(
            "ℹ️ О проекте",
            callback_data="about"
        )],
    ])


async def handle_message(update, context):
    """Handle text messages - captcha or editor password"""
    user_id = update.effective_user.id
    text = update.message.text.strip()

    # Check for editor password
    if user_id in pending_editor_password:
        del pending_editor_password[user_id]
        if text.lower() == EDITOR_PASSWORD.lower():
            await update.message.reply_text("✅ Пароль верный!")
            await send_editor_file(update.message, user_id)
        else:
            await update.message.reply_text(
                "❌ Неверный пароль!\n\n"
                "Попробуй ещё раз: нажми кнопку «Редактор» в меню.",
                reply_markup=get_main_menu_keyboard()
            )
        return

    # Check for captcha
    if user_id not in pending_captchas:
        if user_id in load_users():
            await update.message.reply_text(
                "Используй кнопки меню или команду /menu",
            )
        else:
            await update.message.reply_text(
                "Нажми /start чтобы начать!"
            )
        return

    try:
        user_answer = int(text)
    except ValueError:
        await update.message.reply_text("❌ Отправь число!")
        return

    captcha_data = pending_captchas[user_id]

    if user_answer == captcha_data["answer"]:
        del pending_captchas[user_id]
        add_user(user_id)

        await update.message.reply_text(
            "✅ Верно! Доступ открыт!\n\n"
            "🐸 **Polski Daily Bot** — изучай польский язык!\n\n"
            "Выбери действие:",
            reply_markup=get_main_menu_keyboard(),
            parse_mode="Markdown"
        )
    else:
        captcha_data["attempts"] += 1

        if captcha_data["attempts"] >= 3:
            question, answer = generate_captcha()
            pending_captchas[user_id] = {"answer": answer, "attempts": 0}

            await update.message.reply_text(
                f"❌ Неверно! Новый пример:\n\n**{question}**",
                parse_mode="Markdown"
            )
        else:
            remaining = 3 - captcha_data["attempts"]
            await update.message.reply_text(
                f"❌ Неверно! Осталось попыток: {remaining}"
            )


async def menu_command(update, context):
    """Handle /menu command"""
    user_id = update.effective_user.id

    if user_id not in load_users():
        await update.message.reply_text("Сначала пройди проверку: /start")
        return

    await update.message.reply_text(
        "🐸 **Polski Daily Bot**\n\nВыбери действие:",
        reply_markup=get_main_menu_keyboard(),
        parse_mode="Markdown"
    )


async def test_command(update, context):
    """Handle /test command - start quiz"""
    user_id = update.effective_user.id

    if user_id not in load_users():
        await update.message.reply_text("Сначала пройди проверку: /start")
        return

    await show_quiz_menu(update.message, user_id)


async def editor_command(update, context):
    """Handle /editor command - ask for password"""
    user_id = update.effective_user.id

    if user_id not in load_users():
        await update.message.reply_text("Сначала пройди проверку: /start")
        return

    # Ask for password
    pending_editor_password[user_id] = True
    await update.message.reply_text(
        "🔐 **Доступ к редактору**\n\n"
        "Введи пароль:",
        parse_mode="Markdown"
    )


def build_standalone_editor_html():
    """Inline split CSS/JS modules into the index.html shell so the file
    works standalone when downloaded (no server-relative /static fetches)."""
    base = os.path.dirname(__file__)
    static_dir = os.path.join(base, "static")
    with open(EDITOR_FILE, "r", encoding="utf-8") as f:
        html = f.read()

    css_link = '<link rel="stylesheet" href="/static/css/editor.css">'
    if css_link in html:
        with open(os.path.join(static_dir, "css", "editor.css"), "r", encoding="utf-8") as f:
            css = f.read()
        html = html.replace(css_link, f"<style>\n{css}\n</style>")

    import re as _re
    js_files = sorted(
        f for f in os.listdir(os.path.join(static_dir, "js"))
        if f.endswith(".js")
    )
    chunks = []
    for name in js_files:
        with open(os.path.join(static_dir, "js", name), "r", encoding="utf-8") as f:
            chunks.append(f"// === inlined: {name} ===\n{f.read()}")
    # Single <script> tag so top-level const/let bindings are shared across modules.
    bundled = "<script>\n" + "\n".join(chunks) + "\n</script>"
    replacement = "\n    " + bundled
    html = _re.sub(
        r'(?:\s*<script src="/static/js/[^"]+"></script>)+',
        lambda _m: replacement,
        html,
    )
    return html


async def send_editor_file(message, user_id):
    """Send editor file to user (inlined to single self-contained HTML)."""
    try:
        html = build_standalone_editor_html()
        from io import BytesIO
        buf = BytesIO(html.encode("utf-8"))
        buf.name = f"polski-daily-card-generator-v{EDITOR_VERSION}.html"
        await message.reply_document(
            document=buf,
            filename=buf.name,
            caption=(
                f"🐸 **Polski Daily Card Generator v{EDITOR_VERSION}**\n\n"
                f"📅 Дата: {datetime.now(pytz.timezone('Europe/Warsaw')).strftime('%d.%m.%Y %H:%M')} (Warszawa)\n\n"
                "Открой файл в браузере и создавай карточки!"
            ),
            parse_mode="Markdown"
        )
    except FileNotFoundError:
        await message.reply_text("❌ Файл редактора не найден.")


async def show_quiz_menu(message, user_id):
    """Show quiz topic selection"""
    topics = get_topics()

    if not topics:
        await message.reply_text("😔 Пока нет доступных тестов")
        return

    keyboard = []
    for topic_id, name, emoji in topics:
        keyboard.append([InlineKeyboardButton(
            f"{emoji} {name}",
            callback_data=f"quiz_start_{topic_id}"
        )])

    keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data="back_to_menu")])

    await message.reply_text(
        "📝 **Выбери тему теста:**",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )


async def send_question(query, user_id):
    """Send current question to user"""
    session = get_quiz_session(user_id)
    if not session:
        await query.message.reply_text("❌ Сессия не найдена. Начни заново: /test")
        return

    # Check if quiz is finished
    if session["current_idx"] >= session["total"]:
        await show_quiz_results(query, user_id)
        return

    # Get current question
    question_id = session["questions_order"][session["current_idx"]]
    question = get_question_by_id(question_id)

    if not question:
        await query.message.reply_text("❌ Ошибка загрузки вопроса")
        return

    # Build message
    q_num = session["current_idx"] + 1
    q_total = session["total"]
    score = session["score"]

    # Format question text - extract and bold the main expression
    q_text = question['question']
    # Remove old markdown
    q_text = q_text.replace("**", "").replace("*", "")

    # Try to bold the expression before "oznacza" or before ":"
    if " oznacza" in q_text:
        parts = q_text.split(" oznacza", 1)
        q_text = f"<b>{parts[0]}</b>\noznacza{parts[1]}"
    elif ":" in q_text and q_text.index(":") < len(q_text) - 1:
        parts = q_text.split(":", 1)
        q_text = f"<b>{parts[0]}</b>:{parts[1]}"

    # Number emojis for options
    num_emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]

    text = f"📝 <b>Вопрос {q_num} из {q_total}</b>\n"
    text += f"━━━━━━━━━━━━━━\n\n"
    text += f"{q_text}\n\n"

    for i, opt in enumerate(question["options"]):
        text += f"{num_emojis[i]}  {opt}\n\n"

    text += f"━━━━━━━━━━━━━━\n"
    text += f"✅ Правильных: {score}"

    # Build keyboard
    keyboard = []
    row = []
    for i in range(len(question["options"])):
        row.append(InlineKeyboardButton(
            str(i + 1),
            callback_data=f"quiz_answer_{question_id}_{i + 1}"
        ))
    keyboard.append(row)
    keyboard.append([InlineKeyboardButton("❌ Отменить тест", callback_data="quiz_cancel")])

    await query.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="HTML")


async def show_quiz_results(query, user_id):
    """Show final quiz results with mistakes"""
    result = end_quiz_session(user_id)

    if not result:
        await query.message.reply_text("❌ Ошибка получения результатов")
        return

    score = result["score"]
    total = result["total"]
    mistakes = result["mistakes"]
    percentage = round(score / total * 100) if total > 0 else 0

    if percentage >= 80:
        emoji = "🏆"
        comment = "Отлично!"
    elif percentage >= 60:
        emoji = "👍"
        comment = "Хорошо!"
    elif percentage >= 40:
        emoji = "📚"
        comment = "Неплохо, но стоит повторить"
    else:
        emoji = "💪"
        comment = "Нужно больше практики"

    result_text = (
        f"{emoji} <b>Тест завершён!</b>\n\n"
        f"📊 Результат: <b>{score}/{total}</b> ({percentage}%)\n"
        f"{comment}\n"
    )

    # Show mistakes if any
    if mistakes:
        result_text += f"\n❌ <b>Ошибки ({len(mistakes)}):</b>\n\n"
        for i, m in enumerate(mistakes[:5], 1):  # Show max 5 mistakes
            q = get_question_by_id(m["question_id"])
            if q:
                correct_opt = q["options"][q["correct"] - 1]
                user_opt = q["options"][m["user_answer"] - 1] if m["user_answer"] <= len(q["options"]) else "?"
                # Clean question text
                q_text = q["question"].replace("**", "").replace("*", "")[:50]
                result_text += f"{i}. {q_text}...\n"
                result_text += f"   Твой ответ: {user_opt}\n"
                result_text += f"   Правильно: <b>{correct_opt}</b>\n\n"

    keyboard = [
        [InlineKeyboardButton("🔄 Пройти ещё раз", callback_data="quiz_menu")],
        [InlineKeyboardButton("🔙 В меню", callback_data="back_to_menu")]
    ]

    await query.message.reply_text(result_text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="HTML")


async def button_callback(update, context):
    """Handle button callbacks"""
    query = update.callback_query
    user_id = update.effective_user.id
    data = query.data

    # Rate limiting - prevent spam clicking
    if check_rate_limit(user_id, data):
        await query.answer("⏳ Слишком быстро! Подожди немного.", show_alert=False)
        return

    await query.answer()

    # ===== QUIZ CALLBACKS =====

    if data == "quiz_menu":
        topics = get_topics()

        if not topics:
            await query.edit_message_text("😔 Пока нет доступных тестов")
            return

        keyboard = []
        for topic_id, name, emoji in topics:
            keyboard.append([InlineKeyboardButton(
                f"{emoji} {name}",
                callback_data=f"quiz_start_{topic_id}"
            )])

        keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data="back_to_menu")])

        await query.edit_message_text(
            "📝 **Выбери тему теста:**",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown"
        )

    elif data.startswith("quiz_start_"):
        topic_id = int(data.split("_")[2])

        # Start quiz session
        question_ids = start_quiz_session(user_id, topic_id)

        if not question_ids:
            await query.edit_message_text("❌ В этой теме пока нет вопросов")
            return

        await query.edit_message_text(
            f"🚀 **Тест начинается!**\n\nВопросов: {len(question_ids)}\n\nУдачи!",
            parse_mode="Markdown"
        )

        # Send first question
        await asyncio.sleep(1)
        await send_question(query, user_id)

    elif data.startswith("quiz_answer_"):
        parts = data.split("_")
        question_id = int(parts[2])
        answer_num = int(parts[3])

        session = get_quiz_session(user_id)
        if not session:
            await query.edit_message_text("❌ Сессия истекла. Начни заново: /test")
            return

        # Check if this question is still the current one (prevent double-click)
        current_idx = session["current_idx"]
        if current_idx >= len(session["questions_order"]):
            # Quiz already finished
            return
        current_q_id = session["questions_order"][current_idx]
        if question_id != current_q_id:
            # User clicked on an old question button
            return

        question = get_question_by_id(question_id)
        if not question:
            await query.edit_message_text("❌ Ошибка")
            return

        is_correct = (answer_num == question["correct"])

        # Record answer
        record_answer(user_id, question_id, is_correct, answer_num)

        # Show brief result
        if is_correct:
            result_text = "✅ **Правильно!**"
        else:
            correct_option = question["options"][question["correct"] - 1]
            result_text = f"❌ **Неверно!**\nПравильно: **{correct_option}**"

        if question["explanation"]:
            result_text += f"\n\n💡 {question['explanation']}"

        try:
            await query.edit_message_text(result_text, parse_mode="Markdown")
        except Exception:
            # Message already modified or deleted
            pass

        # Send next question after delay
        await asyncio.sleep(2)
        await send_question(query, user_id)

    elif data == "quiz_cancel":
        end_quiz_session(user_id)
        await query.edit_message_text(
            "❌ Тест отменён",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🔙 В меню", callback_data="back_to_menu")]
            ])
        )

    elif data == "my_stats":
        stats = get_user_stats(user_id)

        if stats["total"] == 0:
            text = "📊 **Твоя статистика**\n\nТы ещё не проходил тесты!"
        else:
            text = (
                f"📊 **Твоя статистика**\n\n"
                f"📝 Всего ответов: {stats['total']}\n"
                f"✅ Правильных: {stats['correct']}\n"
                f"📈 Точность: {stats['accuracy']}%"
            )

        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("📝 Пройти тест", callback_data="quiz_menu")],
                [InlineKeyboardButton("🔙 Назад", callback_data="back_to_menu")]
            ]),
            parse_mode="Markdown"
        )

    # ===== ORIGINAL CALLBACKS =====

    elif data == "get_editor":
        # Ask for password
        pending_editor_password[user_id] = True
        await query.message.reply_text(
            "🔐 **Доступ к редактору**\n\n"
            "Введи пароль:",
            parse_mode="Markdown"
        )

    elif data == "about":
        keyboard = [
            [InlineKeyboardButton("📝 Тесты", callback_data="quiz_menu")],
            [InlineKeyboardButton("🔙 Назад", callback_data="back_to_menu")],
        ]

        await query.edit_message_text(
            "🐸 **Polski Daily | Польский язык на каждый день**\n\n"
            "Telegram-канал для изучения польского языка.\n\n"
            "**Возможности бота:**\n"
            "• 📥 Card Generator — создание карточек\n"
            "• 📝 Тесты — проверка знаний\n"
            "• 📊 Статистика — отслеживание прогресса\n\n"
            "📱 Канал: @Polski_Daily\n"
            "👨‍💻 Уровень автора: C1",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown"
        )

    elif data == "back_to_menu":
        await query.edit_message_text(
            "🐸 **Polski Daily Bot**\n\nВыбери действие:",
            reply_markup=get_main_menu_keyboard(),
            parse_mode="Markdown"
        )


async def version_command(update, context):
    """Handle /version command"""
    await update.message.reply_text(
        f"🐸 **Версии Polski Daily Bot:**\n\n"
        f"📥 Редактор: v{EDITOR_VERSION}\n"
        f"📝 Тесты: v{QUIZ_VERSION}",
        parse_mode="Markdown"
    )


async def post_init(application):
    """Called after application is initialized"""
    # Initialize database
    init_db()
    seed_sample_quiz()

    # Send version notifications (only for editor updates)
    await notify_new_version(application.bot)


def main():
    """Start the bot"""
    print(f"🐸 Запуск Polski Daily Bot (Редактор v{EDITOR_VERSION}, Тесты v{QUIZ_VERSION})...")

    app = Application.builder().token(BOT_TOKEN).post_init(post_init).build()

    # Handlers
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("menu", menu_command))
    app.add_handler(CommandHandler("test", test_command))
    app.add_handler(CommandHandler("editor", editor_command))
    app.add_handler(CommandHandler("version", version_command))
    app.add_handler(CallbackQueryHandler(button_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("✅ Бот запущен!")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

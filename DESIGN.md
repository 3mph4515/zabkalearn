# Design System — Żabka Learn | Польский изнутри

## Product Context
- **What this is:** Telegram-канал и контент-инструменты для изучения польского языка.
- **Who it's for:** Русскоязычная аудитория в Польше/Беларуси/Украине/России. Трудовые мигранты, претенденты на Карту Поляка, студенты, беженцы, IT.
- **Space/industry:** EdTech / language learning. Конкуренты по тону: Duolingo, Drops, Memrise. По формату: Telegram-каналы об языках.
- **Project type:** Telegram-канал + браузерный инструмент создания постов-карточек (`bot/index.html`).
- **Memorable thing:** Зелёная польская лягушка с красным румянцем — дружелюбный, не-учебниковый польский «изнутри».

## Aesthetic Direction
- **Direction:** Playful + Editorial-hybrid. Округлые формы, чистая типографика, цветовые акценты.
- **Decoration level:** Intentional. Декорации (звёзды, флаги, искры) — опциональный слой, не доминанта. Текст несёт основную нагрузку.
- **Mood:** Дружелюбный, молодёжный, не-кринж. Рабочий тон — «знакомый говорит про язык», а не «учитель в классе».
- **Reference vibes:** Duolingo (округлость, цвет), Linear (типо-дисциплина), Telegram premium-каналы (плотный визуал в квадрате).

## Typography

| Role | Font | Weight | Size | Use |
|------|------|--------|------|-----|
| Display / Hero | Poppins | 700/800 | 48-72px | Главное слово на карточке, заголовки |
| Body | Inter | 400/500 | 14-18px | Описание, перевод, примеры |
| UI / Labels | Inter | 600 | 12-14px | Бейджи рубрик, подписи |
| Data / Numbers | Inter | 500 (tabular-nums) | inherit | Транскрипция, метрики |
| Code / Quote | Inter italic | 400 | inherit | Цитаты, примеры use |

- **Loading:** `https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap`
- **Fallback:** `system-ui, -apple-system, sans-serif`
- **Modular scale (1.25 × base 16px):** 12 / 14 / 16 / 20 / 24 / 32 / 40 / 56 / 72px

**Удалено из легаси:** Nunito (использовался в `assets/brand_preview.html`). Заменить на Poppins при следующем апдейте.

## Color

### Brand
| Token | Hex | Use |
|-------|-----|-----|
| `--frog-green` | `#4CAF50` | Primary, маскот, CTA |
| `--frog-light` | `#81C784` | Лицо лягушки, светлые акценты |
| `--frog-deep` | `#2E7D32` | Заголовки на светлом, контраст |
| `--frog-darker` | `#1B5E20` | Темные хедеры, hover |
| `--soft-green` | `#E8F5E9` | Фон карточек, светлая поверхность |
| `--mint-green` | `#C8E6C9` | Градиент-партнёр для soft-green |
| `--polish-red` | `#E53935` | Бейджи рубрик, румянец маскота, accent |
| `--polish-red-soft` | `#FFEBEE` | Soft-fill бейджей, выделение |
| `--dark` | `#1A1A1A` | Body text |
| `--white` | `#FFFFFF` | Card surface |

### Semantic
| Token | Hex | Use |
|-------|-----|-----|
| `--success` | `#4CAF50` | (= frog-green) |
| `--warning` | `#FFA726` | Уведомления, ошибки в `Błąd dnia` |
| `--error` | `#E53935` | (= polish-red) |
| `--info` | `#42A5F5` | Подсказки, инфо |

### Background gradients
- **Default soft:** `linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)`
- **Hero punch:** `linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)` (для CTA-блоков)

### Dark mode
- Reduce saturation 15%. Surfaces `#1A1A1A` → `#2A2A2A` → `#3A3A3A`. Text `#F5F5F5`. Frog-green остаётся, polish-red тушится до `#EF5350`.

## Spacing
- **Base unit:** 8px (совпадает с `unit = 8 * scale` в `bot/index.html`).
- **Density:** Comfortable.
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64) 4xl(96)

## Layout

### Telegram card formats
- **Square (default):** 1080×1080 (export 2160×2160 @2x)
- **Horizontal:** 1080×810 (4:3) — для двухколоночного текста
- **Vertical:** 1080×1350 (4:5) — для длинных примеров

### Card structure
- **Outer margin:** `unit × 3` (24px @ base) — gap до края экспорта
- **Card surface:** white, rounded `unit × 2.5` (20px)
- **Inner padding:** 24-40px (slider, default 24)
- **Max content width:** card width − 2 × padding

### Border radius hierarchy
| Token | Value | Use |
|-------|-------|-----|
| `--r-sm` | 8px | Inputs, маленькие чипы |
| `--r-md` | 12px | Кнопки, badge |
| `--r-lg` | 16px | Карточки в UI |
| `--r-xl` | 20px | Card surfaces (Telegram-карточки) |
| `--r-pill` | 9999px | Бейджи рубрик, чипы |

### Grid (web tools)
- Editor (`bot/index.html`): 3-col `1fr 440px 300px` (controls / preview / publish)
- Brand pages: max-width 1000px, центр

## Motion
- **Approach:** Minimal-functional. Тексty/карточки статичны, UI-инструменты получают лёгкий feedback.
- **Easing:** `ease-out` для появления, `ease-in` для скрытия, `cubic-bezier(0.4, 0, 0.2, 1)` для перемещения.
- **Duration:** micro 80ms, short 180ms, medium 280ms, long 480ms.
- **Применение:**
  - Hover на чипах декораций — 150ms transform/box-shadow
  - Drag-decoration — без анимации (instant feedback)
  - Modal/toast — 200ms fade+slide
  - Шрифты в Telegram-карточке — без motion, статика

## Mascot

Минималистичная лягушка-аватар. Конструкция (см. `bot/index.html` `drawMascot`):
- Голова: круг радиус 22 × scale, fill `--frog-green`
- Щека/морда: эллипс 13×10, fill `--frog-light`
- Глаза: 2 белых круга r=4, чёрный зрачок r=2
- Польский румянец: 2 круга `--polish-red` 30% opacity на щеках
- 22+ выражения: happy/thinking/surprised/wink/love/cool/sad/angry/sleepy/laugh/nerd/party/zany/shush/monocle/explode/salute/chef/muscle/fire/star/frog

## Voice / Tone
- **Дружелюбный**, но не сюсюкающий.
- **Молодёжный**, без зумерского сленга-перебора.
- **Не-кринж:** избегать «мемного» польского, навязчивых эмодзи-серий.
- **Сдержанно:** короткие фразы, конкретные примеры, минимум воды.
- **Контент-роли:**
  - Заголовок: одно слово/фраза, без точки
  - Подпись: 1-2 строки, перевод и контекст
  - Пример: курсив, реальная польская речь
  - Хештеги: `#słowodnia #polski` + `@zabka_learn`

## Anti-patterns (не делать)
- Purple/violet градиенты как фон (не наш цвет)
- Em-dash `—` между словом и переводом — использовать дефис `-` (см. `format_card_text`)
- Stock-photo герои с мутными BG
- Comic Sans / Lobster / Papyrus / любой decorative-display шрифт
- 3-column icon grid как в типичном SaaS
- Centered everything с одинаковыми отступами
- Шрифт `system-ui` как primary — всегда Poppins/Inter
- Фон карточки = чистый белый без soft-green margin (теряется идентичность)
- Перегруженные декорации (>5 типов на карточке = шум)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-25 | Кодифицирован существующий бренд из `CLAUDE.md` в `DESIGN.md` | Единый источник истины для UI-инструментов и контента |
| 2026-04-25 | Шрифт Nunito помечен как легаси, замена на Poppins | `brand_preview.html` использует Nunito, расходится с CLAUDE.md |
| 2026-04-25 | Дефис `-` вместо em-dash `—` в word-translation | Решение принято при разработке `bot/scheduler.py format_card_text` |
| 2026-04-25 | Спейсинг base = 8px | Совпадает с реализацией `unit = 8 * scale` в card renderer |

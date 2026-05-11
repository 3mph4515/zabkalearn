// === 05-ux-polish.js ===
// Char counters, keyboard shortcuts, focus polish, poll/quiz UI, runtime UX helpers.
// Pure additive — no modification of state/draw pipelines.

        // ═══════════ Poll / Quiz options ═══════════
        let pollOptions = [
            { text: '', correct: false },
            { text: '', correct: false },
        ];

        function isPollTemplate() {
            return typeof currentTemplate !== 'undefined' &&
                (currentTemplate === 'quiz' || currentTemplate === 'ankieta');
        }

        function isQuizTemplate() {
            return typeof currentTemplate !== 'undefined' && currentTemplate === 'quiz';
        }

        function renderPollOptions() {
            const list = document.getElementById('poll-options-list');
            if (!list) return;
            list.innerHTML = '';
            const isQuiz = isQuizTemplate();
            const isMulti = !isQuiz && document.getElementById('poll-multiple')?.checked;
            const inputType = isQuiz ? 'radio' : (isMulti ? 'checkbox' : 'hidden');

            pollOptions.forEach((opt, idx) => {
                const row = document.createElement('div');
                row.className = 'poll-option' + (opt.correct ? ' correct' : '');
                const checkboxHtml = (inputType === 'hidden')
                    ? '<span style="width:18px;flex-shrink:0;color:#bbb;font-weight:600;text-align:center;">' + (idx + 1) + '</span>'
                    : `<input type="${inputType}" name="poll-correct" data-idx="${idx}" ${opt.correct ? 'checked' : ''}>`;
                row.innerHTML = `
                    ${checkboxHtml}
                    <input type="text" class="poll-option-text" data-idx="${idx}"
                           value="${(opt.text || '').replace(/"/g, '&quot;')}"
                           maxlength="100"
                           placeholder="${isQuiz ? 'Вариант ' + (idx + 1) : 'Опция ' + (idx + 1)}">
                    <button type="button" class="poll-option-remove" data-idx="${idx}" title="Удалить">×</button>
                `;
                list.appendChild(row);
            });

            // Wire events
            list.querySelectorAll('.poll-option-text').forEach(inp => {
                inp.addEventListener('input', e => {
                    pollOptions[+e.target.dataset.idx].text = e.target.value;
                });
            });
            list.querySelectorAll('input[name="poll-correct"]').forEach(inp => {
                inp.addEventListener('change', e => {
                    const i = +e.target.dataset.idx;
                    if (isQuiz) {
                        pollOptions.forEach((o, k) => o.correct = (k === i));
                    } else {
                        pollOptions[i].correct = e.target.checked;
                    }
                    renderPollOptions();
                });
            });
            list.querySelectorAll('.poll-option-remove').forEach(btn => {
                btn.addEventListener('click', e => {
                    const i = +e.target.dataset.idx;
                    if (pollOptions.length <= 2) {
                        if (typeof pubToast === 'function') pubToast('Минимум 2 варианта', 'er');
                        return;
                    }
                    pollOptions.splice(i, 1);
                    renderPollOptions();
                });
            });
        }

        function addPollOption() {
            if (pollOptions.length >= 10) {
                if (typeof pubToast === 'function') pubToast('Максимум 10 вариантов (Telegram limit)', 'er');
                return;
            }
            pollOptions.push({ text: '', correct: false });
            renderPollOptions();
        }

        function getPollPayload() {
            // Returns null if not poll template
            if (!isPollTemplate()) return null;
            if (!document.getElementById('poll-as-tg')?.checked) return null;
            const opts = pollOptions
                .map(o => ({ text: (o.text || '').trim(), correct: !!o.correct }))
                .filter(o => o.text);
            if (opts.length < 2) return { error: 'Нужно минимум 2 варианта' };
            const isQuiz = isQuizTemplate();
            if (isQuiz) {
                const correctCount = opts.filter(o => o.correct).length;
                if (correctCount !== 1) return { error: 'Quiz: выбери ровно один правильный' };
            }
            const closePeriod = parseInt(document.getElementById('poll-close-period')?.value || '0', 10);
            const multipleChoice = !isQuiz && !!document.getElementById('poll-multiple')?.checked;
            const anonymous = !!document.getElementById('poll-anonymous')?.checked;
            const solution = (document.getElementById('poll-solution')?.value || '').trim();
            return {
                type: isQuiz ? 'quiz' : 'poll',
                question: (document.getElementById('main-word')?.value || '').trim(),
                options: opts,
                multiple_choice: multipleChoice,
                anonymous,
                close_period_sec: closePeriod,
                solution: isQuiz ? solution : '',
            };
        }

        function updatePollUIForTemplate() {
            const isPoll = isPollTemplate();
            const isQuiz = isQuizTemplate();
            const grp = document.getElementById('quiz-options-group');
            if (grp) grp.style.display = isPoll ? 'block' : 'none';
            const solGrp = document.getElementById('poll-solution-group');
            if (solGrp) solGrp.style.display = isQuiz ? 'block' : 'none';
            const multiRow = document.getElementById('poll-multi-row');
            if (multiRow) multiRow.style.display = (isPoll && !isQuiz) ? 'flex' : 'none';
            const hint = document.getElementById('poll-mode-hint');
            if (hint) {
                hint.textContent = isQuiz ? '⓵ выбери правильный'
                    : (document.getElementById('poll-multiple')?.checked ? '☑ можно несколько' : '');
            }
            if (isPoll) renderPollOptions();
        }

        // Wire multi-choice toggle to re-render
        (function() {
            const m = document.getElementById('poll-multiple');
            if (m) m.addEventListener('change', () => {
                renderPollOptions();
                updatePollUIForTemplate();
            });
        })();

        // Expose globally
        window.addPollOption = addPollOption;
        window.getPollPayload = getPollPayload;
        window.updatePollUIForTemplate = updatePollUIForTemplate;
        window.renderPollOptions = renderPollOptions;

        // ═══════════ TTS (Azure Speech preview + payload) ═══════════
        function ttsBuildAutoText() {
            const word = (document.getElementById('main-word')?.value || '').split('\n')[0].trim();
            const exEls = document.querySelectorAll('.example-input');
            const parts = [];
            if (word) parts.push(word);
            exEls.forEach(el => {
                const t = (el.value || '').split('\n')[0].trim();
                if (t) parts.push(t);
            });
            return parts.join('. ');
        }

        const TTS_VOICES = {
            elevenlabs: [
                { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (Ж, мягкий) ⭐' },
                { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (Ж, тёплый)' },
                { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Ж, молодой)' },
                { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Ж, классич.)' },
                { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (М, баритон)' },
                { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (М, живой)' },
                { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (М, мягкий)' },
            ],
            azure: [
                { id: 'pl-PL-AgnieszkaNeural', name: 'Agnieszka (Ж)' },
                { id: 'pl-PL-ZofiaNeural', name: 'Zofia (Ж)' },
                { id: 'pl-PL-MarekNeural', name: 'Marek (М)' },
            ],
        };

        function renderTtsVoices() {
            const provSel = document.getElementById('ttsProvider');
            const voiceSel = document.getElementById('ttsVoice');
            if (!provSel || !voiceSel) return;
            const list = TTS_VOICES[provSel.value] || TTS_VOICES.azure;
            voiceSel.innerHTML = list.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
            // ElevenLabs doesn't honor SSML rate — show as informational
            const rateSel = document.getElementById('ttsRate');
            if (rateSel) rateSel.disabled = (provSel.value === 'elevenlabs');
        }

        function getTtsPayload() {
            if (!document.getElementById('pubWithTts')?.checked) return null;
            const txt = (document.getElementById('ttsText')?.value || '').trim() || ttsBuildAutoText();
            if (!txt) return null;
            const provider = document.getElementById('ttsProvider')?.value || 'azure';
            const voice = document.getElementById('ttsVoice')?.value || '';
            const rate = parseInt(document.getElementById('ttsRate')?.value || '0', 10);
            return { tts_enabled: true, tts_provider: provider, tts_text: txt, tts_voice: voice, tts_rate_pct: rate };
        }

        let _ttsLastBlobUrl = null;
        async function ttsPreview() {
            const btn = document.getElementById('ttsPreviewBtn');
            const hint = document.getElementById('ttsHint');
            const audio = document.getElementById('ttsAudio');
            const text = (document.getElementById('ttsText')?.value || '').trim() || ttsBuildAutoText();
            if (!text) { hint.textContent = 'Пусто'; return; }
            btn.disabled = true; btn.textContent = '⏳';
            hint.textContent = '';
            try {
                const r = await fetch('/api/tts-preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text,
                        provider: document.getElementById('ttsProvider').value,
                        voice: document.getElementById('ttsVoice').value,
                        rate_pct: parseInt(document.getElementById('ttsRate').value, 10),
                    }),
                });
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    hint.textContent = '✗ ' + (j.error || r.status);
                    return;
                }
                const buf = await r.arrayBuffer();
                const ct = (r.headers.get('Content-Type') || 'audio/mpeg').split(';')[0].trim();
                const bytes = new Uint8Array(buf);
                const head = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                console.log('[tts] got', buf.byteLength, 'bytes, ct=' + ct + ', head=' + head);

                hint.textContent = '✓ ' + Math.round(buf.byteLength / 1024) + 'KB';

                // Primary path: Web Audio API decodes MP3 in any Chrome (no <audio> element quirks)
                try {
                    if (!window._ttsCtx) window._ttsCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const ctx = window._ttsCtx;
                    if (ctx.state === 'suspended') await ctx.resume();
                    // decodeAudioData mutates input buffer in some impls — pass a copy
                    const decoded = await ctx.decodeAudioData(buf.slice(0));
                    if (window._ttsSource) { try { window._ttsSource.stop(); } catch (_) {} }
                    const src = ctx.createBufferSource();
                    src.buffer = decoded;
                    src.connect(ctx.destination);
                    src.start(0);
                    window._ttsSource = src;
                    console.log('[tts] WebAudio play OK, duration =', decoded.duration.toFixed(2), 'sec');
                    audio.style.display = 'none';
                    return;
                } catch (we) {
                    console.warn('[tts] WebAudio failed:', we && we.message, '— falling back to <audio>');
                }

                // Fallback: blob URL on <audio>
                const blob = new Blob([buf], { type: ct });
                if (_ttsLastBlobUrl) URL.revokeObjectURL(_ttsLastBlobUrl);
                _ttsLastBlobUrl = URL.createObjectURL(blob);
                audio.onerror = () => {
                    const e = audio.error;
                    const codes = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED' };
                    const code = e ? (codes[e.code] || e.code) : '?';
                    console.error('[tts] <audio> error:', code);
                    hint.textContent = '✗ audio: ' + code;
                };
                audio.src = _ttsLastBlobUrl;
                audio.style.display = '';
                audio.load();
                const p = audio.play();
                if (p && typeof p.catch === 'function') {
                    p.catch(err => {
                        console.warn('[tts] autoplay blocked:', err && err.message);
                        hint.textContent += ' · ▶ ниже';
                    });
                }
            } catch (e) {
                console.error('[tts] preview failed:', e);
                hint.textContent = '✗ ' + e.message;
            } finally {
                btn.disabled = false; btn.textContent = '▶ Preview';
            }
        }

        // Toggle panel visibility + provider switch
        (function() {
            renderTtsVoices();
            const provSel = document.getElementById('ttsProvider');
            if (provSel) provSel.addEventListener('change', renderTtsVoices);
            const cb = document.getElementById('pubWithTts');
            const panel = document.getElementById('ttsPanel');
            if (!cb || !panel) return;
            cb.addEventListener('change', () => {
                panel.style.display = cb.checked ? 'block' : 'none';
                if (cb.checked) {
                    const ta = document.getElementById('ttsText');
                    if (ta && !ta.value.trim()) ta.placeholder = 'Авто: ' + ttsBuildAutoText().slice(0, 80);
                }
            });
        })();

        async function ttsTestAll() {
            const btn = document.getElementById('ttsTestAllBtn');
            const hint = document.getElementById('ttsHint');
            const text = (document.getElementById('ttsText')?.value || '').trim() || ttsBuildAutoText();
            if (!text) { hint.textContent = 'Пусто'; return; }
            const ch = (typeof pubChannel !== 'undefined') ? pubChannel : 'debug';
            const warn = ch === 'production'
                ? '⚠️ PRODUCTION КАНАЛ @zabka_learn!\n\n'
                : '';
            const ok = confirm(warn +
                'Отправить ' + text.length + ' символов всеми голосами (10 шт) в канал ' + ch + '?\n\n' +
                'ElevenLabs free = 10K chars/мес. Сейчас сожжёшь ~' + (text.length * 7) + ' chars.');
            if (!ok) return;
            btn.disabled = true; btn.textContent = '⏳ синтез…';
            hint.textContent = '';
            try {
                const r = await fetch('/api/tts-test-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, channel: ch }),
                });
                const j = await r.json();
                if (!j.ok) {
                    hint.textContent = '✗ ' + (j.error || r.status);
                    return;
                }
                const okCount = j.results.filter(x => x.ok).length;
                const failed = j.results.filter(x => !x.ok);
                hint.textContent = '✓ ' + okCount + '/' + j.count + ' отправлено';
                if (failed.length) {
                    console.warn('[tts-test] failures:', failed);
                }
                if (typeof pubToast === 'function') pubToast('🧪 Тест: ' + okCount + '/' + j.count + ' голосов отправлено в TG', 'ok');
            } catch (e) {
                hint.textContent = '✗ ' + e.message;
                console.error('[tts-test] failed:', e);
            } finally {
                btn.disabled = false; btn.textContent = '🧪 Все голоса → TG';
            }
        }

        window.ttsPreview = ttsPreview;
        window.ttsTestAll = ttsTestAll;
        window.getTtsPayload = getTtsPayload;

        (function uxPolish() {
            // --- Char counters ---
            // [inputId, softLimit, hardLimit] — soft = warn, hard = err
            const COUNTER_TARGETS = [
                ['main-word',     30, 60],
                ['translation',   40, 80],
                ['transcription', 40, 60],
                ['subtitle',      80, 140],
                ['badge-text',    24, 40],
            ];

            function attachCounter(input, soft, hard) {
                if (!input) return;
                const wrap = input.parentElement;
                if (!wrap || wrap.querySelector('.char-counter')) return;
                wrap.classList.add('input-with-counter');
                const c = document.createElement('span');
                c.className = 'char-counter';
                wrap.appendChild(c);
                const update = () => {
                    const n = (input.value || '').length;
                    c.textContent = n + '/' + hard;
                    c.classList.toggle('warn', n > soft && n <= hard);
                    c.classList.toggle('err', n > hard);
                };
                input.addEventListener('input', update);
                update();
            }

            function initCounters() {
                COUNTER_TARGETS.forEach(([id, soft, hard]) => {
                    attachCounter(document.getElementById(id), soft, hard);
                });
                // Examples: dynamic; hook into addExample
                document.querySelectorAll('.example-input').forEach(el => attachCounter(el, 80, 140));
            }

            // Re-attach to newly added examples
            const origAddExample = window.addExample;
            if (typeof origAddExample === 'function') {
                window.addExample = function() {
                    const r = origAddExample.apply(this, arguments);
                    document.querySelectorAll('.example-input').forEach(el => attachCounter(el, 80, 140));
                    return r;
                };
            }

            // --- Keyboard shortcuts ---
            document.addEventListener('keydown', (e) => {
                // Ignore when typing in inputs (except export shortcut)
                const tag = (e.target.tagName || '').toLowerCase();
                const inField = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
                const meta = e.metaKey || e.ctrlKey;

                // Cmd/Ctrl+S → save preset to current slot
                if (meta && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    if (typeof savePreset === 'function') savePreset();
                    return;
                }
                // Cmd/Ctrl+E → export PNG
                if (meta && e.key.toLowerCase() === 'e') {
                    e.preventDefault();
                    if (typeof exportCard === 'function') exportCard();
                    return;
                }
                // Cmd/Ctrl+D → fill example
                if (meta && e.key.toLowerCase() === 'd' && !inField) {
                    e.preventDefault();
                    if (typeof fillExample === 'function') fillExample();
                    return;
                }
                // Esc → close queue modal if open
                if (e.key === 'Escape') {
                    const qm = document.getElementById('queueModal');
                    if (qm && qm.style.display !== 'none' && typeof closeQueueModal === 'function') {
                        closeQueueModal();
                    }
                }
            });

            // --- Live word-history check (Słowo dnia) ---
            const wordInput = document.getElementById('main-word');
            if (wordInput) {
                let badge = document.getElementById('word-dup-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = 'word-dup-badge';
                    badge.className = 'word-dup-badge';
                    wordInput.parentElement.appendChild(badge);
                }
                let dupTimer = null;
                let lastChecked = '';
                const checkWord = async () => {
                    if (typeof currentTemplate !== 'undefined' && currentTemplate !== 'slowo') {
                        badge.style.display = 'none';
                        return;
                    }
                    const w = (wordInput.value || '').trim().split('\n')[0].trim();
                    if (!w || w.length < 2) { badge.style.display = 'none'; return; }
                    if (w === lastChecked) return;
                    lastChecked = w;
                    const ch = (typeof pubChannel !== 'undefined') ? pubChannel : 'production';
                    try {
                        const r = await fetch('/api/check-word?word=' + encodeURIComponent(w) + '&channel=' + ch).then(r => r.json());
                        if (r.ok && r.exists && r.matches && r.matches[0]) {
                            const m = r.matches[0];
                            badge.innerHTML = '⚠️ Уже было: <b>' + (m.word || w) + '</b> · ' + (m.date || '').slice(0, 10);
                            badge.style.display = 'block';
                        } else {
                            badge.style.display = 'none';
                        }
                    } catch (_) { /* silent */ }
                };
                wordInput.addEventListener('input', () => {
                    clearTimeout(dupTimer);
                    dupTimer = setTimeout(checkWord, 600);
                });
                // Re-check on channel toggle
                document.querySelectorAll('#pubChTog button').forEach(b => {
                    b.addEventListener('click', () => { lastChecked = ''; checkWord(); });
                });
                // Initial check
                setTimeout(checkWord, 800);
            }

            // --- Run init when DOM ready (we're already at body end) ---
            initCounters();
        })();

// === 04-publish.js ===
// Publish flow (Telethon backend), word duplicate check, scheduled list,
// queue mode (bulk JSON publishing). Initial drawCard() at end.

        // ═══════════ PUBLISH SYSTEM ═══════════

        let pubChannel = 'debug';
        let pubConnected = false;

        // Word duplicate check across debug + production. Returns {exists, matches[], channel}.
        async function checkDuplicateWord(word, primaryChannel) {
            const channels = [primaryChannel, primaryChannel === 'production' ? 'debug' : 'production'];
            for (const ch of channels) {
                try {
                    const r = await fetch('/api/check-word?word=' + encodeURIComponent(word) + '&channel=' + ch);
                    if (!r.ok) continue;
                    const d = await r.json();
                    if (d.ok && d.exists) {
                        return { exists: true, matches: d.matches, channel: ch };
                    }
                } catch (_) {}
            }
            return { exists: false, matches: [] };
        }

        const PUB_TAGS = [
            '#slowodnia', '#polski', '#polski_daily', '#polskib1',
            '#naukajezyka', '#jezykpolski', '#wyrazenie_dnia', '#quiz'
        ];
        let pubSelectedTags = ['#slowodnia', '#polski', '#polski_daily'];

        function initPublish() {
            // Check connection
            pubCheckConn();

            // Channel toggle
            document.querySelectorAll('#pubChTog button').forEach(b => {
                b.addEventListener('click', () => {
                    document.querySelectorAll('#pubChTog button').forEach(x => x.classList.remove('on'));
                    b.classList.add('on');
                    pubChannel = b.dataset.ch;
                    document.body.classList.toggle('prod-active', pubChannel === 'production');
                    if (typeof loadScheduledEditor === 'function') loadScheduledEditor();
                });
            });

            // Schedule toggle
            document.getElementById('pubWhen').addEventListener('change', (e) => {
                const dt = document.getElementById('pubDateTime');
                const btn = document.getElementById('pubBtn');
                if (e.target.value === 'schedule') {
                    dt.style.display = '';
                    // Default: tomorrow 10:00
                    const tmr = new Date();
                    tmr.setDate(tmr.getDate() + 1);
                    tmr.setHours(10, 0, 0, 0);
                    dt.value = tmr.toISOString().slice(0, 16);
                    btn.textContent = '\u23F0 \u041E\u0442\u043B\u043E\u0436\u0438\u0442\u044C';
                    btn.className = 'pub-btn sched';
                } else {
                    dt.style.display = 'none';
                    btn.textContent = '\uD83D\uDCE4 \u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C';
                    btn.className = 'pub-btn now';
                }
            });

            // Post text live preview
            document.getElementById('pubText').addEventListener('input', pubUpdatePreview);

            // Tags
            renderPubTags();

            // Auto-fill on card changes
            pubAutoText();
        }

        function renderPubTags() {
            const box = document.getElementById('pubTags');
            box.innerHTML = '';
            PUB_TAGS.forEach(tag => {
                const btn = document.createElement('button');
                btn.textContent = tag;
                btn.className = pubSelectedTags.includes(tag) ? 'on' : '';
                btn.addEventListener('click', () => {
                    if (pubSelectedTags.includes(tag)) {
                        pubSelectedTags = pubSelectedTags.filter(t => t !== tag);
                    } else {
                        pubSelectedTags.push(tag);
                    }
                    renderPubTags();
                    pubAutoText();
                });
                box.appendChild(btn);
            });
        }

        async function pubCheckConn() {
            try {
                const r = await fetch('/api/status');
                const d = await r.json();
                if (d.ok) {
                    pubConnected = true;
                    document.getElementById('pubDot').className = 'pdot ok';
                    document.getElementById('pubConnText').textContent = d.account;
                    document.getElementById('pubBtn').disabled = false;
                } else throw 0;
            } catch {
                pubConnected = false;
                document.getElementById('pubDot').className = 'pdot err';
                document.getElementById('pubConnText').textContent = '\u041D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D (\u0437\u0430\u043F\u0443\u0441\u0442\u0438 scheduler.py)';
                document.getElementById('pubBtn').disabled = true;
            }
        }

        function pubAutoText() {
            const word = document.getElementById('main-word').value || '';
            const translation = document.getElementById('translation').value || '';
            const exampleList = (typeof getExamples === 'function')
                ? getExamples()
                : [((document.getElementById('example')||{}).value || '').trim()].filter(Boolean);
            const subtitle = document.getElementById('subtitle').value || '';
            const transcription = document.getElementById('transcription').value || '';

            let lines = [];

            if (word) {
                let firstLine = word;
                if (transcription && transcription.trim()) firstLine += ' ' + transcription.trim();
                if (translation) firstLine += ' - ' + translation;
                lines.push(firstLine);
            }

            if (subtitle) {
                lines.push('');
                lines.push(subtitle);
            }

            if (exampleList.length) {
                lines.push('');
                lines.push(exampleList.length > 1 ? '\u041F\u0440\u0438\u043C\u0435\u0440\u044B:' : '\u041F\u0440\u0438\u043C\u0435\u0440:');
                exampleList.forEach((ex, idx) => {
                    const inner = ex.split('\n').map(l => l.trim()).filter(Boolean);
                    if (!inner.length) return;
                    if (idx > 0) lines.push(''); // blank line between examples
                    inner.forEach(l => lines.push(l));
                });
            }

            if (pubSelectedTags.length) {
                lines.push('');
                lines.push(pubSelectedTags.join(' '));
            }

            if (document.getElementById('pubWithSub') && document.getElementById('pubWithSub').checked) {
                lines.push('');
                lines.push('<a href="https://t.me/polski_daily">\u041F\u043E\u043B\u044C\u0441\u043A\u0438\u0439 \u044F\u0437\u044B\u043A \u043D\u0430 \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C. \u041F\u043E\u0434\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F</a>');
            }

            document.getElementById('pubText').value = lines.join('\n');
            pubUpdatePreview();
        }

        function pubUpdatePreview() {
            const text = document.getElementById('pubText').value;
            document.getElementById('pubPreview').innerHTML = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                .replace(/\n/g, '<br>');
        }

        async function publishPost() {
            if (!pubConnected) { pubToast('\u041D\u0435\u0442 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F', 'er'); return; }

            const text = document.getElementById('pubText').value.trim();
            if (!text) { pubToast('\u041D\u0430\u043F\u0438\u0448\u0438 \u0442\u0435\u043A\u0441\u0442 \u043F\u043E\u0441\u0442\u0430', 'er'); return; }

            const when = document.getElementById('pubWhen').value;
            let scheduleTime = null;
            if (when === 'schedule') {
                scheduleTime = document.getElementById('pubDateTime').value;
                if (!scheduleTime) { pubToast('\u0412\u044B\u0431\u0435\u0440\u0438 \u0434\u0430\u0442\u0443', 'er'); return; }
            }

            // Production guard: extra confirmation
            if (pubChannel === 'production') {
                const action = scheduleTime ? '\u043E\u0442\u043B\u043E\u0436\u0438\u0442\u044C' : '\u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C \u0421\u0420\u0410\u0417\u0423';
                const ok = confirm('\u26A0\uFE0F PRODUCTION CHANNEL\n\n\u0422\u044B \u0441\u043E\u0431\u0438\u0440\u0430\u0435\u0448\u044C\u0441\u044F ' + action + ' \u043F\u043E\u0441\u0442 \u0432 @zabka_learn (\u0436\u0438\u0432\u043E\u0439 \u043A\u0430\u043D\u0430\u043B).\n\n\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C?');
                if (!ok) return;
            }

            const word = (document.getElementById('main-word').value || '').trim();

            // Duplicate check (Słowo dnia template only)
            if (currentTemplate === 'slowo' && word) {
                const dup = await checkDuplicateWord(word, pubChannel);
                if (dup && dup.exists) {
                    const m = dup.matches[0];
                    const ok = confirm('Слово «' + m.word + '» уже опубликовано ' + (m.date||'').slice(0,10) + ' (msg #' + m.msg_id + '). Всё равно опубликовать?');
                    if (!ok) return;
                }
            }

            const withImage = document.getElementById('pubWithImage').checked;
            let imageData = null;
            if (withImage) {
                const exportCanvas = drawCard(true);
                imageData = exportCanvas.toDataURL('image/png');
            }

            const btn = document.getElementById('pubBtn');
            const origText = btn.textContent;
            btn.disabled = true;
            btn.textContent = '\u041E\u0442\u043F\u0440\u0430\u0432\u043A\u0430...';

            try {
                let cardPayload = {
                    word,
                    translation: document.getElementById('translation').value || '',
                    transcription: document.getElementById('transcription').value || '',
                    examples: (typeof getExamples === 'function') ? getExamples() : [],
                    post_text: text,
                    schedule_time: scheduleTime || new Date().toISOString().slice(0, 16),
                    image: imageData,
                };
                // Poll/quiz override
                if (typeof getPollPayload === 'function') {
                    const poll = getPollPayload();
                    if (poll && poll.error) {
                        pubToast(poll.error, 'er');
                        btn.disabled = false; btn.textContent = origText;
                        return;
                    }
                    if (poll) {
                        Object.assign(cardPayload, poll);
                    }
                }
                // TTS payload
                if (typeof getTtsPayload === 'function') {
                    const tts = getTtsPayload();
                    if (tts) Object.assign(cardPayload, tts);
                }
                const payload = {
                    channel: pubChannel,
                    cards: [cardPayload],
                };

                if (!scheduleTime) {
                    payload.publish_now = true;
                }

                const res = await fetch('/api/schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const r = await res.json();

                if (r.ok) {
                    const result = r.results[0];
                    if (result.ok) {
                        pubToast(scheduleTime ? '\u2705 \u041E\u0442\u043B\u043E\u0436\u0435\u043D\u043E!' : '\u2705 \u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043E!', 'ok');
                    } else {
                        pubToast('\u274C ' + (result.error || 'Error'), 'er');
                    }
                } else {
                    pubToast(r.error || 'Failed', 'er');
                }
            } catch (e) {
                pubToast(e.message, 'er');
            } finally {
                btn.disabled = false;
                btn.textContent = origText;
            }
        }

        function pubToast(msg, type) {
            const el = document.createElement('div');
            el.className = 'pub-toast ' + (type || 'ok');
            el.textContent = msg;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 3000);
        }

        // Listen for card field changes to update post text
        ['main-word', 'translation', 'example', 'subtitle', 'transcription'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => {
                // Only auto-update if user hasn't manually edited
                if (!document.getElementById('pubText').dataset.manual) {
                    pubAutoText();
                }
            });
        });
        document.getElementById('pubText').addEventListener('keydown', function() {
            this.dataset.manual = '1';
        });

        // Sub checkbox triggers auto-text refresh
        const subCb = document.getElementById('pubWithSub');
        if (subCb) subCb.addEventListener('change', () => {
            if (!document.getElementById('pubText').dataset.manual) pubAutoText();
        });

        // ═══════════ SCHEDULED PANEL ═══════════
        async function loadScheduledEditor() {
            const panel = document.getElementById('schedPanel');
            panel.innerHTML = '<div class="sched-state">⏳ Загрузка…</div>';
            try {
                const res = await fetch('/api/scheduled?channel=' + pubChannel);
                const d = await res.json();
                if (!d.ok || !d.messages.length) {
                    const chLabel = pubChannel === 'production' ? 'Production' : 'Debug';
                    panel.innerHTML = `<div class="sched-state sched-empty">📤 Нет отложенных постов<br><span class="sched-empty-hint">Канал: ${chLabel}</span></div>`;
                    return;
                }
                panel.innerHTML = '';
                d.messages.forEach(m => {
                    const dt = new Date(m.date);
                    const ds = dt.toLocaleString('pl-PL', {weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
                    const preview = (m.text || '').substring(0, 60);
                    const div = document.createElement('div');
                    div.className = 'sched-item';
                    div.dataset.msgId = m.id;
                    div.innerHTML = `
                        <div class="sched-date">${ds}</div>
                        <div class="sched-preview">${preview || '(media)'}</div>
                        ${m.has_media ? '<span class="sched-img-badge">IMG</span>' : ''}
                        <button onclick="reschedMsg(${m.id})" title="Перенести" class="sched-action-btn">📅</button>
                        <button onclick="delSchedMsg(${m.id})" title="Удалить" class="sched-action-btn">🗑</button>
                    `;
                    panel.appendChild(div);
                });
            } catch(e) {
                panel.innerHTML = '<div class="sched-state sched-error">⚠️ Ошибка: ' + (e.message || '') + '</div>';
            }
        }

        async function delSchedMsg(id) {
            if (!confirm('Удалить отложенный пост?')) return;
            try {
                await fetch('/api/scheduled', {
                    method: 'DELETE',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({channel: pubChannel, ids: [id]}),
                });
                pubToast('🗑 Удалено', 'ok');
                loadScheduledEditor();
            } catch(e) { pubToast(e.message, 'er'); }
        }

        async function reschedMsg(id) {
            const item = document.querySelector(`.sched-item[data-msg-id="${id}"]`);
            if (!item) return;
            if (item.querySelector('.sched-resched-row')) return;
            const row = document.createElement('div');
            row.className = 'sched-resched-row';
            const defaultDt = new Date(Date.now() + 60 * 60 * 1000);
            const local = new Date(defaultDt.getTime() - defaultDt.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 16);
            row.innerHTML = `
                <input type="datetime-local" class="sched-resched-input" value="${local}">
                <button class="sched-resched-ok">✓</button>
                <button class="sched-resched-cancel">✕</button>
            `;
            item.appendChild(row);
            const input = row.querySelector('.sched-resched-input');
            input.focus();
            row.querySelector('.sched-resched-cancel').onclick = () => row.remove();
            row.querySelector('.sched-resched-ok').onclick = async () => {
                const newTime = input.value;
                if (!newTime) return;
                try {
                    const res = await fetch('/api/reschedule', {
                        method: 'POST',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({channel: pubChannel, id: id, new_time: newTime}),
                    });
                    const d = await res.json();
                    if (d.ok) { pubToast('📅 Перенесено', 'ok'); loadScheduledEditor(); }
                    else pubToast(d.error || 'Ошибка', 'er');
                } catch(e) { pubToast(e.message, 'er'); }
            };
        }

        // Init publish on load
        initPublish();

        // ═══════════ QUEUE (multi-card pipeline) ═══════════
        const queueState = {
            cards: [],         // parsed input cards
            schedule: [],      // ISO datetime strings, parallel to cards
            channel: 'debug',
            template: 'slowo',
            skipDup: true,
            idx: 0,            // current card index
            doneCount: 0,
            skippedCount: 0,
            skippedList: [],   // [{word, date, channel}]
            active: false,
        };

        function openQueueModal() {
            const today = new Date();
            today.setDate(today.getDate() + 1); // default tomorrow
            document.getElementById('qStartDate').value = today.toISOString().slice(0, 10);
            document.getElementById('queueModal').style.display = 'flex';
        }

        function closeQueueModal() {
            document.getElementById('queueModal').style.display = 'none';
        }

        function loadQueueExample() {
            const sample = [
                { word: 'rozsądny', transcription: '[розсо́ндны]', translation: 'разумный, здравый', examples: ['To rozsądna decyzja.\nЭто разумное решение.', 'Bądź rozsądny!\nБудь разумным!'], subtitle: 'Poziom: B1' },
                { word: 'cegła', translation: 'кирпич', examples: ['Dom z czerwonej cegły.\nДом из красного кирпича.'], subtitle: 'Słowotwórstwo' },
                { word: 'usterka', translation: 'неисправность, поломка', examples: ['Mała usterka w samochodzie.\nМелкая поломка в машине.', 'Zgłoś usterkę.\nСообщи о неисправности.'] },
            ];
            document.getElementById('queueJson').value = JSON.stringify(sample, null, 2);
            previewQueueJson();
        }

        function loadQueueFromFile() {
            document.getElementById('queueFile').click();
        }

        function onQueueFileSelected(ev) {
            const f = ev.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = e => {
                document.getElementById('queueJson').value = e.target.result;
                previewQueueJson();
            };
            reader.readAsText(f);
        }

        function parseQueueJson(text) {
            const j = JSON.parse(text);
            const arr = Array.isArray(j) ? j : (Array.isArray(j.cards) ? j.cards : null);
            if (!arr) throw new Error('Ожидается массив или {cards: [...]}');
            return arr.map((c, i) => {
                if (!c.word) throw new Error(`Карточка #${i + 1}: отсутствует "word"`);
                return {
                    word: String(c.word).trim(),
                    transcription: c.transcription || '',
                    translation: c.translation || '',
                    examples: Array.isArray(c.examples) ? c.examples.filter(e => e && e.trim()) : (c.example ? [c.example] : []),
                    subtitle: c.subtitle || '',
                    badgeText: c.badgeText || '',
                };
            });
        }

        function previewQueueJson() {
            const txt = document.getElementById('queueJson').value.trim();
            const hint = document.getElementById('queueParsedHint');
            if (!txt) { hint.textContent = ''; return; }
            try {
                const cards = parseQueueJson(txt);
                hint.textContent = '✓ ' + cards.length + ' карточек';
                hint.style.color = '#2E7D32';
            } catch (e) {
                hint.textContent = '✗ ' + e.message;
                hint.style.color = '#E53935';
            }
        }

        document.getElementById('queueJson')?.addEventListener('input', previewQueueJson);

        function computeScheduleDates(start, time, intervalDays, count) {
            const [h, m] = time.split(':').map(Number);
            const dates = [];
            const base = new Date(start + 'T00:00:00');
            for (let i = 0; i < count; i++) {
                const d = new Date(base);
                d.setDate(base.getDate() + i * intervalDays);
                d.setHours(h, m, 0, 0);
                dates.push(d);
            }
            return dates;
        }

        function dateToWarsawIso(d) {
            // Format as local YYYY-MM-DDTHH:MM:SS (no timezone) for backend; backend localizes to Warsaw.
            const pad = n => String(n).padStart(2, '0');
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
                + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
        }

        async function startQueue() {
            const txt = document.getElementById('queueJson').value.trim();
            if (!txt) { pubToast('Вставь JSON со словами', 'er'); return; }
            let cards;
            try { cards = parseQueueJson(txt); }
            catch (e) { pubToast('Ошибка JSON: ' + e.message, 'er'); return; }
            if (!cards.length) { pubToast('Список пуст', 'er'); return; }

            const startDate = document.getElementById('qStartDate').value;
            const startTime = document.getElementById('qStartTime').value;
            const interval = parseInt(document.getElementById('qInterval').value, 10);
            if (!startDate || !startTime || !interval) { pubToast('Заполни план расписания', 'er'); return; }

            queueState.cards = cards;
            queueState.schedule = computeScheduleDates(startDate, startTime, interval, cards.length);
            queueState.channel = document.getElementById('qChannel').value;
            queueState.template = document.getElementById('qTemplate').value;
            queueState.skipDup = document.getElementById('qSkipDupCb').checked;
            queueState.idx = 0;
            queueState.doneCount = 0;
            queueState.skippedCount = 0;
            queueState.skippedList = [];
            queueState.active = true;

            closeQueueModal();
            document.getElementById('queueBar').style.display = 'block';
            document.body.style.paddingBottom = '90px';
            document.body.classList.add('queue-active');
            await loadCurrentQueueCard();
        }

        async function loadCurrentQueueCard() {
            if (!queueState.active || queueState.idx >= queueState.cards.length) {
                endQueue('Все карточки обработаны');
                return;
            }
            const card = queueState.cards[queueState.idx];
            const date = queueState.schedule[queueState.idx];

            // Switch template
            document.querySelector('[data-template="' + queueState.template + '"]')?.click();

            // Fill fields
            document.getElementById('main-word').value = card.word || '';
            document.getElementById('translation').value = card.translation || '';
            document.getElementById('transcription').value = card.transcription || '';
            document.getElementById('subtitle').value = card.subtitle || '';
            if (card.badgeText) document.getElementById('badge-text').value = card.badgeText;
            setExamples(card.examples && card.examples.length ? card.examples : ['']);
            drawCard();
            // Refresh post text from new card data
            if (typeof pubAutoText === 'function') pubAutoText();

            // Switch publish channel
            const chBtn = document.querySelector('#pubChTog button[data-ch="' + queueState.channel + '"]');
            if (chBtn) chBtn.click();

            // Update bar
            document.getElementById('qbProgress').textContent = (queueState.idx + 1) + ' / ' + queueState.cards.length;
            document.getElementById('qbDate').textContent = date.toLocaleString('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            document.getElementById('qbChannel').textContent = queueState.channel === 'production' ? '🔴 Prod' : '🟢 Debug';
            document.getElementById('qbStats').textContent = queueState.doneCount + ' / ' + queueState.skippedCount;

            // Duplicate warn
            const dupEl = document.getElementById('qbDupWarn');
            dupEl.style.display = 'none';
            if (card.word) {
                try {
                    const dup = await checkDuplicateWord(card.word, queueState.channel);
                    if (dup.exists) {
                        const m = dup.matches[0];
                        const prevDate = (m.date || '').slice(0, 10);
                        dupEl.textContent = '⚠️ дубликат (' + prevDate + ', ' + dup.channel + ')';
                        dupEl.style.display = '';
                        if (queueState.skipDup) {
                            queueState.skippedCount++;
                            queueState.skippedList.push({ word: card.word, date: prevDate, channel: dup.channel });
                            pubToast('⏭ скип: ' + card.word + ' — уже было ' + prevDate, 'er');
                            queueState.idx++;
                            await new Promise(r => setTimeout(r, 700));
                            return loadCurrentQueueCard();
                        }
                    }
                } catch (_) {}
            }
        }

        async function queueAction(action) {
            if (!queueState.active) return;

            if (action === 'end') {
                endQueue('Очередь завершена пользователем');
                return;
            }

            if (action === 'skip') {
                queueState.skippedCount++;
                queueState.idx++;
                await loadCurrentQueueCard();
                return;
            }

            if (action === 'schedule') {
                const card = queueState.cards[queueState.idx];
                const date = queueState.schedule[queueState.idx];
                const btn = document.getElementById('qbSchedBtn');
                btn.disabled = true;
                btn.textContent = 'Отправка…';
                try {
                    const exportCanvas = drawCard(true);
                    const imageData = exportCanvas.toDataURL('image/png');
                    // Use editor's current values (user may have edited) for safety
                    const word = document.getElementById('main-word').value.trim() || card.word;
                    const translation = document.getElementById('translation').value.trim() || card.translation;
                    const transcription = document.getElementById('transcription').value.trim() || card.transcription;
                    const examples = (typeof getExamples === 'function') ? getExamples() : card.examples;
                    const post_text = document.getElementById('pubText')?.value.trim() || '';

                    let qCard = {
                        word, translation, transcription, examples,
                        post_text,
                        schedule_time: dateToWarsawIso(date),
                        image: imageData,
                    };
                    if (typeof getPollPayload === 'function') {
                        const poll = getPollPayload();
                        if (poll && poll.error) {
                            pubToast(poll.error, 'er');
                            btn.disabled = false; btn.textContent = 'В отложку → след.';
                            return;
                        }
                        if (poll) Object.assign(qCard, poll);
                    }
                    if (typeof getTtsPayload === 'function') {
                        const tts = getTtsPayload();
                        if (tts) Object.assign(qCard, tts);
                    }
                    const payload = {
                        channel: queueState.channel,
                        publish_now: false,
                        cards: [qCard],
                    };
                    const r = await fetch('/api/schedule', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    }).then(r => r.json());

                    if (r.ok && r.results[0].ok) {
                        queueState.doneCount++;
                        queueState.idx++;
                        pubToast('✓ ' + word + ' → ' + date.toLocaleDateString('pl-PL'), 'ok');
                        await loadCurrentQueueCard();
                    } else {
                        const err = (r.results && r.results[0] && r.results[0].error) || r.error || 'Ошибка';
                        pubToast('✗ ' + err, 'er');
                    }
                } catch (e) {
                    pubToast('✗ ' + e.message, 'er');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'В отложку → след.';
                }
            }
        }

        function endQueue(reason) {
            queueState.active = false;
            document.getElementById('queueBar').style.display = 'none';
            document.body.style.paddingBottom = '';
            document.body.classList.remove('queue-active');
            pubToast(reason + '. Готово: ' + queueState.doneCount + ', пропущено: ' + queueState.skippedCount, 'ok');
            if (queueState.skippedList.length) {
                const lines = queueState.skippedList
                    .map(s => '• ' + s.word + ' — был ' + s.date + ' (' + s.channel + ')')
                    .join('\n');
                console.warn('[queue] skipped duplicates:\n' + lines);
                showSkippedModal(queueState.skippedList);
            }
            // Refresh scheduled list
            if (typeof loadScheduledEditor === 'function') loadScheduledEditor();
        }

        function showSkippedModal(list) {
            let m = document.getElementById('skippedModal');
            if (!m) {
                m = document.createElement('div');
                m.id = 'skippedModal';
                m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
                m.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:520px;width:100%;padding:24px;max-height:80vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.3);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
                    '<h2 style="font-family:Poppins,sans-serif;color:#e65100;margin:0;font-size:1.15rem;">⏭ Пропущенные дубликаты</h2>' +
                    '<button onclick="document.getElementById(\'skippedModal\').remove()" style="border:none;background:transparent;font-size:1.4rem;cursor:pointer;color:#999;">×</button>' +
                    '</div>' +
                    '<div id="skippedListBody" style="font-size:.92rem;line-height:1.6;"></div>' +
                    '<div style="margin-top:16px;text-align:right;">' +
                    '<button onclick="document.getElementById(\'skippedModal\').remove()" style="padding:8px 16px;border:none;background:#4CAF50;color:#fff;border-radius:7px;cursor:pointer;font-weight:600;">OK</button>' +
                    '</div></div>';
                document.body.appendChild(m);
            }
            const body = m.querySelector('#skippedListBody');
            body.innerHTML = list.map(s =>
                '<div style="padding:6px 0;border-bottom:1px solid #eee;">' +
                '<b>' + s.word + '</b> — был <span style="color:#666;">' + s.date + '</span> ' +
                '<span style="color:#999;font-size:.85rem;">(' + s.channel + ')</span></div>'
            ).join('');
        }

        // Initial draw
        drawCard();

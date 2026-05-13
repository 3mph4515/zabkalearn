// === 03-state.js ===
// exportCard, examples list management, image upload, getCardState/applyCardState,
// preset slots, copy-to-clipboard, fillExample, randomStyle.

        function exportCard() {
            const exportCanvas = drawCard(true);
            const link = document.createElement('a');
            link.download = `zabka-${currentTemplate}-${new Date().toISOString().slice(0, 10)}.png`;
            link.href = exportCanvas.toDataURL('image/png', 1.0);
            link.click();
        }

        // Event handlers
        document.querySelectorAll('.template-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.template-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTemplate = btn.dataset.template;

                // Show/hide fields
                document.getElementById('transcription-group').style.display = currentTemplate === 'slowo' ? 'block' : 'none';
                document.getElementById('translation-group').style.display = currentTemplate === 'slowo' ? 'block' : 'none';
                document.getElementById('example-group').style.display = ['slowo', 'blad', 'podsluchano'].includes(currentTemplate) ? 'block' : 'none';

                if (btn.dataset.badge !== undefined && currentTemplate !== 'custom') {
                    document.getElementById('badge-text').value = btn.dataset.badge;
                }

                // Quiz / Słuchanie / Ankieta: poll-only posts → no card image by default
                if (['quiz', 'ankieta', 'sluchanie'].includes(currentTemplate)) {
                    const imgCb = document.getElementById('pubWithImage');
                    if (imgCb) imgCb.checked = false;
                }

                // Słuchanie: auto-enable TTS dialog mode + pre-fill defaults
                if (currentTemplate === 'sluchanie') {
                    const word = document.getElementById('main-word');
                    if (word && !word.value.replace(/\s/g, '')) {
                        word.value = 'Posłuchaj. Wybierz najlepszą odpowiedź:';
                    }
                    const sub = document.getElementById('subtitle');
                    if (sub && !sub.value.trim()) sub.value = 'Poziom: A2-B1 · Słuchanie';
                    const ttsCb = document.getElementById('pubWithTts');
                    if (ttsCb && !ttsCb.checked) { ttsCb.checked = true; ttsCb.dispatchEvent(new Event('change')); }
                    const provSel = document.getElementById('ttsProvider');
                    if (provSel && provSel.value !== 'elevenlabs') {
                        provSel.value = 'elevenlabs';
                        provSel.dispatchEvent(new Event('change'));
                    }
                    const dlg = document.getElementById('ttsDialog');
                    if (dlg) dlg.checked = true;
                    const ta = document.getElementById('ttsText');
                    if (ta && !ta.value.trim()) {
                        ta.value = 'Klient: Dzień dobry, szukam czegoś dla żony na urodziny.\n' +
                                   'Sprzedawczyni: A co ona lubi? Może perfumy albo biżuteria?\n' +
                                   'Klient: Hmm, ona zawsze narzeka, że nie mam dobrego gustu.\n' +
                                   'Sprzedawczyni: To proszę wziąć kartę podarunkową — niech sama wybierze.';
                    }
                    // Seed 3 poll options
                    if (typeof pollOptions !== 'undefined' && pollOptions.every(o => !o.text.trim())) {
                        pollOptions.length = 0;
                        pollOptions.push({ text: 'Klient chce kupić perfumy dla żony.', correct: false });
                        pollOptions.push({ text: 'Sprzedawczyni proponuje kartę podarunkową, bo żona ma swój gust.', correct: true });
                        pollOptions.push({ text: 'Klient i żona razem wybierają prezent.', correct: false });
                        if (typeof renderPollOptions === 'function') renderPollOptions();
                    }
                }

                if (typeof updatePollUIForTemplate === 'function') updatePollUIForTemplate();
                drawCard();
            });
        });

        document.querySelectorAll('.mascot-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mascot-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMascot = btn.dataset.mascot;
                drawCard();
            });
        });

        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('bg-color').value = btn.dataset.color;
                document.getElementById('bg-color-text').value = btn.dataset.color;
                drawCard();
            });
        });

        document.getElementById('bg-color').addEventListener('input', (e) => {
            document.getElementById('bg-color-text').value = e.target.value;
            drawCard();
        });

        document.getElementById('bg-color-text').addEventListener('input', (e) => {
            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                document.getElementById('bg-color').value = e.target.value;
                drawCard();
            }
        });

        document.getElementById('badge-color').addEventListener('input', (e) => {
            document.getElementById('badge-color-text').value = e.target.value;
            drawCard();
        });

        document.getElementById('badge-color-text').addEventListener('input', (e) => {
            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                document.getElementById('badge-color').value = e.target.value;
                drawCard();
            }
        });

        document.querySelectorAll('.decor-option input, #no-bg').forEach(cb => {
            cb.addEventListener('change', () => drawCard());
        });

        // Init decor UI + drag
        initDecorUI();
        initDecorDrag();

        // Init existing example item (idx 0)
        (function initExamples() {
            const list = document.getElementById('examples-list');
            const first = list && list.querySelector('.example-item');
            if (first) rebuildExampleListItem(first, 0);
            updateAddExampleBtn();
        })();

        document.querySelectorAll('input, textarea').forEach(el => {
            el.addEventListener('input', () => drawCard());
        });

        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFormat = btn.dataset.format;
                setupCanvas();
                drawCard();
            });
        });

        // Spacing sliders value display
        const spacingSliders = ['card-padding', 'top-gap', 'badge-gap', 'title-gap', 'line-gap', 'title-size', 'block-gap', 'blocks-top'];
        spacingSliders.forEach(id => {
            const slider = document.getElementById(id);
            const valSpan = document.getElementById(id + '-val');
            slider.addEventListener('input', () => {
                valSpan.textContent = slider.value;
            });
        });

        function resetSpacing() {
            const defaults = {
                'card-padding': 24,
                'top-gap': 0,
                'badge-gap': 24,
                'title-gap': 16,
                'line-gap': 8,
                'title-size': 100
            };
            Object.entries(defaults).forEach(([id, val]) => {
                document.getElementById(id).value = val;
                document.getElementById(id + '-val').textContent = val;
            });
            drawCard();
        }

        // Image upload handling
        const imageUploadArea = document.getElementById('image-upload-area');
        const imageInput = document.getElementById('bg-image');
        const uploadPlaceholder = document.getElementById('upload-placeholder');
        const uploadPreview = document.getElementById('upload-preview');
        const previewThumb = document.getElementById('preview-thumb');
        const removeImageBtn = document.getElementById('remove-image');
        const imageOptions = document.getElementById('image-options');

        function handleImageFile(file) {
            if (!file || !file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    bgImage = img;
                    previewThumb.src = e.target.result;
                    uploadPlaceholder.style.display = 'none';
                    uploadPreview.style.display = 'flex';
                    imageOptions.style.display = 'block';
                    drawCard();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        imageUploadArea.addEventListener('click', () => imageInput.click());

        imageInput.addEventListener('change', (e) => {
            if (e.target.files[0]) handleImageFile(e.target.files[0]);
        });

        imageUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageUploadArea.classList.add('dragover');
        });

        imageUploadArea.addEventListener('dragleave', () => {
            imageUploadArea.classList.remove('dragover');
        });

        imageUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            imageUploadArea.classList.remove('dragover');
            if (e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
        });

        removeImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            bgImage = null;
            imageInput.value = '';
            uploadPlaceholder.style.display = 'flex';
            uploadPreview.style.display = 'none';
            imageOptions.style.display = 'none';
            drawCard();
        });

        document.getElementById('overlay-opacity').addEventListener('input', (e) => {
            document.getElementById('overlay-value').textContent = e.target.value + '%';
            drawCard();
        });

        document.getElementById('text-shadow-intensity').addEventListener('input', (e) => {
            document.getElementById('text-shadow-value').textContent = e.target.value + '%';
            drawCard();
        });

        document.getElementById('text-outline').addEventListener('change', () => drawCard());

        document.querySelectorAll('.overlay-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.overlay-color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                overlayColor = btn.dataset.overlay;
                drawCard();
            });
        });

        document.querySelectorAll('.fit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.fit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                imageFit = btn.dataset.fit;
                drawCard();
            });
        });

        // Font selector
        document.querySelectorAll('.font-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFont = btn.dataset.font;
                drawCard();
            });
        });

        // Align selector
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                textAlign = btn.dataset.align;
                drawCard();
            });
        });

        // Mascot size slider
        document.getElementById('mascot-size').addEventListener('input', (e) => {
            document.getElementById('mascot-size-val').textContent = e.target.value;
            drawCard();
        });

        // Border width slider
        document.getElementById('border-width').addEventListener('input', (e) => {
            document.getElementById('border-width-val').textContent = e.target.value;
            drawCard();
        });

        // Gradient checkbox
        document.getElementById('use-gradient').addEventListener('change', (e) => {
            document.getElementById('gradient-controls').style.display = e.target.checked ? 'block' : 'none';
            drawCard();
        });

        document.getElementById('bg-color-2').addEventListener('input', () => drawCard());
        document.getElementById('gradient-direction').addEventListener('change', () => drawCard());
        document.getElementById('border-color').addEventListener('input', () => drawCard());

        // Dark theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            document.getElementById('theme-toggle').textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem('darkTheme', isDark);
        });

        // Restore dark theme preference
        if (localStorage.getItem('darkTheme') === 'true') {
            document.body.classList.add('dark-theme');
            document.getElementById('theme-toggle').textContent = '☀️';
        }

        // Presets
        function getCardState() {
            return {
                template: currentTemplate,
                mascot: currentMascot,
                font: currentFont,
                align: textAlign,
                format: currentFormat,
                headerTitle: document.getElementById('header-title').value,
                footerUsername: document.getElementById('footer-username').value,
                badgeText: document.getElementById('badge-text').value,
                mainWord: document.getElementById('main-word').value,
                subtitle: document.getElementById('subtitle').value,
                transcription: document.getElementById('transcription').value,
                translation: document.getElementById('translation').value,
                example: document.getElementById('example')?.value || '',
                examples: (typeof getExamples === 'function') ? getExamples() : [],
                badgeColor: document.getElementById('badge-color').value,
                bgColor: document.getElementById('bg-color').value,
                useGradient: document.getElementById('use-gradient').checked,
                bgColor2: document.getElementById('bg-color-2').value,
                gradientDirection: document.getElementById('gradient-direction').value,
                borderColor: document.getElementById('border-color').value,
                borderWidth: document.getElementById('border-width').value,
                exampleBlockColor: document.getElementById('example-block-color').value,
                mascotSize: document.getElementById('mascot-size').value,
                cardPadding: document.getElementById('card-padding').value,
                topGap: document.getElementById('top-gap').value,
                badgeGap: document.getElementById('badge-gap').value,
                titleGap: document.getElementById('title-gap').value,
                lineGap: document.getElementById('line-gap').value,
                titleSize: document.getElementById('title-size').value,
                noBg: document.getElementById('no-bg').checked,
                decorState: JSON.parse(JSON.stringify(decorState)),
                decorPositions: JSON.parse(JSON.stringify(decorPositions)),
                contentBlocks: JSON.parse(JSON.stringify(contentBlocks)),
                blockGap: document.getElementById('block-gap').value,
                blocksTop: document.getElementById('blocks-top').value
            };
        }

        function applyCardState(state) {
            if (!state) return;

            // Set template
            currentTemplate = state.template || 'ciekawostka';
            document.querySelectorAll('.template-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.template === currentTemplate);
            });

            // Set mascot
            currentMascot = state.mascot || 'happy';
            document.querySelectorAll('.mascot-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mascot === currentMascot);
            });

            // Set font
            currentFont = state.font || 'Poppins';
            document.querySelectorAll('.font-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.font === currentFont);
            });

            // Set align
            textAlign = state.align || 'center';
            document.querySelectorAll('.align-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.align === textAlign);
            });

            // Set format
            currentFormat = state.format || 'square';
            document.querySelectorAll('.format-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.format === currentFormat);
            });

            // Set text fields
            document.getElementById('header-title').value = state.headerTitle || 'Польский язык на каждый день';
            document.getElementById('footer-username').value = state.footerUsername || '@Polski_Daily';
            document.getElementById('badge-text').value = state.badgeText || 'CIEKAWOSTKA DNIA';
            document.getElementById('main-word').value = state.mainWord || '';
            document.getElementById('subtitle').value = state.subtitle || '';
            document.getElementById('transcription').value = state.transcription || '';
            document.getElementById('translation').value = state.translation || '';
            if (Array.isArray(state.examples) && state.examples.length) {
                setExamples(state.examples);
            } else if (state.example) {
                setExamples([state.example]);
            } else {
                setExamples(['']);
            }

            // Set colors
            document.getElementById('badge-color').value = state.badgeColor || '#E53935';
            document.getElementById('badge-color-text').value = state.badgeColor || '#E53935';
            document.getElementById('bg-color').value = state.bgColor || '#E8F5E9';
            document.getElementById('bg-color-text').value = state.bgColor || '#E8F5E9';
            document.getElementById('use-gradient').checked = state.useGradient || false;
            document.getElementById('gradient-controls').style.display = state.useGradient ? 'block' : 'none';
            document.getElementById('bg-color-2').value = state.bgColor2 || '#C8E6C9';
            document.getElementById('gradient-direction').value = state.gradientDirection || 'to bottom';
            document.getElementById('border-color').value = state.borderColor || '#4CAF50';
            document.getElementById('border-width').value = state.borderWidth || 0;
            document.getElementById('border-width-val').textContent = state.borderWidth || 0;
            document.getElementById('example-block-color').value = state.exampleBlockColor || '#E8F5E9';

            // Set sliders
            document.getElementById('mascot-size').value = state.mascotSize || 100;
            document.getElementById('mascot-size-val').textContent = state.mascotSize || 100;
            document.getElementById('card-padding').value = state.cardPadding || 24;
            document.getElementById('card-padding-val').textContent = state.cardPadding || 24;
            document.getElementById('top-gap').value = state.topGap || 0;
            document.getElementById('top-gap-val').textContent = state.topGap || 0;
            document.getElementById('badge-gap').value = state.badgeGap || 24;
            document.getElementById('badge-gap-val').textContent = state.badgeGap || 24;
            document.getElementById('title-gap').value = state.titleGap || 16;
            document.getElementById('title-gap-val').textContent = state.titleGap || 16;
            document.getElementById('line-gap').value = state.lineGap || 8;
            document.getElementById('line-gap-val').textContent = state.lineGap || 8;
            document.getElementById('title-size').value = state.titleSize || 100;
            document.getElementById('title-size-val').textContent = state.titleSize || 100;

            // Set checkboxes
            document.getElementById('no-bg').checked = state.noBg || false;
            // Restore decor state (handles both old checkbox format and new format)
            if (state.decorState) {
                decorState = state.decorState;
                decorPositions = state.decorPositions || {};
                // Ensure positions exist for all active decors
                Object.entries(decorState).forEach(([k, v]) => { if (v) ensureDecorPositions(k, v); });
            } else {
                // Migrate from old checkbox format
                decorState = {};
                if (state.decorFlag) decorState.flag = 1;
                if (state.decorStars) decorState.stars = 3;
                if (state.decorFire) decorState.fire = 2;
                if (state.decorHearts) decorState.hearts = 3;
                if (state.decorConfetti) decorState.confetti = 12;
                if (state.decorLightning) decorState.lightning = 2;
                if (state.decorSnowflakes) decorState.snowflakes = 4;
                if (state.decorDots) decorState.dots = 15;
                if (state.decorRings) decorState.rings = 3;
                if (state.decorLeaves) decorState.leaves = 4;
                if (state.decorDiamonds) decorState.diamonds = 3;
                if (state.decorWaves) decorState.waves = 1;
            }
            initDecorUI();

            // Show/hide fields based on template
            document.getElementById('transcription-group').style.display = currentTemplate === 'slowo' ? 'block' : 'none';
            document.getElementById('translation-group').style.display = currentTemplate === 'slowo' ? 'block' : 'none';
            document.getElementById('example-group').style.display = ['slowo', 'blad', 'podsluchano'].includes(currentTemplate) ? 'block' : 'none';
            document.getElementById('quiz-options-group').style.display = currentTemplate === 'quiz' ? 'block' : 'none';

            // Restore content blocks
            contentBlocks = state.contentBlocks || [];
            document.getElementById('block-gap').value = state.blockGap || 12;
            document.getElementById('block-gap-val').textContent = state.blockGap || 12;
            document.getElementById('blocks-top').value = state.blocksTop || 0;
            document.getElementById('blocks-top-val').textContent = state.blocksTop || 0;
            renderBlocksUI();

            setupCanvas();
            drawCard();
        }

        function savePreset() {
            const state = getCardState();
            localStorage.setItem('cardPreset_' + currentPresetSlot, JSON.stringify(state));
            if (typeof pubToast === 'function') pubToast('💾 Пресет ' + currentPresetSlot + ' сохранён', 'ok');
            else alert('Пресет ' + currentPresetSlot + ' сохранён!');
        }

        function loadPreset(slot) {
            currentPresetSlot = slot;
            const saved = localStorage.getItem('cardPreset_' + slot);
            if (saved) {
                applyCardState(JSON.parse(saved));
                if (typeof pubToast === 'function') pubToast('📂 Пресет ' + slot + ' загружен', 'ok');
            } else {
                if (typeof pubToast === 'function') pubToast('Пресет ' + slot + ' пуст', 'er');
                else alert('Пресет ' + slot + ' пуст');
            }
        }

        function clearPresets() {
            if (confirm('Удалить все пресеты?')) {
                for (let i = 1; i <= 3; i++) {
                    localStorage.removeItem('cardPreset_' + i);
                }
                if (typeof pubToast === 'function') pubToast('🗑 Пресеты удалены', 'ok');
                else alert('Пресеты удалены');
            }
        }

        // Copy to clipboard
        async function copyToClipboard() {
            try {
                const exportCanvas = drawCard(true);
                exportCanvas.toBlob(async (blob) => {
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);
                        if (typeof pubToast === 'function') pubToast('📋 Скопировано в буфер', 'ok');
                        else alert('Скопировано в буфер обмена!');
                    } catch (err) {
                        // Fallback: download
                        const link = document.createElement('a');
                        link.download = 'card.png';
                        link.href = URL.createObjectURL(blob);
                        link.click();
                        if (typeof pubToast === 'function') pubToast('💾 Сохранено как файл (clipboard заблокирован)', 'ok');
                    }
                }, 'image/png');
            } catch (err) {
                if (typeof pubToast === 'function') pubToast('Ошибка копирования: ' + err.message, 'er');
                else alert('Ошибка копирования: ' + err.message);
            }
        }

        // Fill example content
        function fillExample() {
            const examples = {
                ciekawostka: {
                    mainWord: 'Zmierzchnica trupia główka',
                    subtitle: 'Jak myślicie, co to jest?',
                    badgeText: 'CIEKAWOSTKA DNIA'
                },
                slowo: {
                    mainWord: 'rozsądny',
                    transcription: '[розсо\u0301ндны]',
                    translation: 'разумный, здравый',
                    subtitle: 'Poziom: B1',
                    examples: [
                        'To bardzo rozsądna decyzja.\nЭто очень разумное решение.',
                        'Bądź rozsądny!\nБудь разумным!',
                    ],
                    badgeText: 'S\u0141OWO DNIA'
                },
                quiz: {
                    mainWord: 'Co znaczy "sklep"?',
                    subtitle: 'Выбери правильный ответ:',
                    badgeText: 'QUIZ TIME'
                },
                blad: {
                    mainWord: 'на магазин ❌\ndo sklepu ✓',
                    subtitle: 'Частая ошибка русскоязычных',
                    example: 'Правильно: Idę do sklepu\nНеправильно: Idę na sklep',
                    badgeText: 'BŁĄD DNIA'
                },
                podsluchano: {
                    mainWord: '— Poproszę hot-doga\n— Z ketchupem?',
                    subtitle: 'Реальный диалог в Żabce',
                    example: 'poproszę — попрошу (вежливая форма)\nhot-dog — хот-дог',
                    badgeText: 'PODSLUCHANO W ŻABCE'
                },
                gramatyka: {
                    mainWord: 'Biernik (винительный)',
                    subtitle: 'Kogo? Co? — Кого? Что?',
                    badgeText: 'GRAMATYKA'
                },
                custom: {
                    mainWord: 'Twój tekst tutaj',
                    subtitle: 'Подзаголовок',
                    badgeText: 'СВОЯ РУБРИКА'
                }
            };

            const ex = examples[currentTemplate] || examples.ciekawostka;
            document.getElementById('main-word').value = ex.mainWord || '';
            document.getElementById('subtitle').value = ex.subtitle || '';
            document.getElementById('badge-text').value = ex.badgeText || '';
            if (ex.transcription) document.getElementById('transcription').value = ex.transcription;
            if (ex.translation) document.getElementById('translation').value = ex.translation;
            if (ex.examples) setExamples(ex.examples);
            else if (ex.example) setExamples([ex.example]);

            drawCard();
        }

        function setExBlockColor(color) {
            document.getElementById('example-block-color').value = color;
            drawCard();
        }

        // ═══════════ EXAMPLES (dynamic list) ═══════════
        // 3 = 3 (literal below to avoid TDZ)

        function rebuildExampleListItem(div, idx) {
            div.dataset.idx = idx;
            div.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;align-items:flex-start;';
            const ta = div.querySelector('textarea');
            if (ta) {
                ta.placeholder = idx === 0
                    ? 'Przepraszam, gdzie jest Żabka?'
                    : 'Пример ' + (idx + 1);
                if (idx === 0) ta.id = 'example';
                else ta.removeAttribute('id');
            }
            // Remove previous control buttons (we re-add)
            div.querySelectorAll('.rm-ex-btn').forEach(b => b.remove());
            if (idx > 0) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'rm-ex-btn';
                btn.textContent = '×';
                btn.title = 'Удалить пример';
                btn.style.cssText = 'flex:0 0 auto;width:28px;height:28px;border:1px solid #ddd;background:#fff;color:#999;border-radius:6px;cursor:pointer;font-size:1rem;line-height:1;';
                btn.addEventListener('click', () => removeExample(div));
                div.appendChild(btn);
            }
        }

        function addExample() {
            const list = document.getElementById('examples-list');
            const items = list.querySelectorAll('.example-item');
            if (items.length >= 3) return;
            const idx = items.length;
            const div = document.createElement('div');
            div.className = 'example-item';
            const ta = document.createElement('textarea');
            ta.className = 'example-input';
            ta.rows = 2;
            ta.addEventListener('input', drawCard);
            div.appendChild(ta);
            list.appendChild(div);
            rebuildExampleListItem(div, idx);
            updateAddExampleBtn();
            drawCard();
        }

        function removeExample(div) {
            const list = document.getElementById('examples-list');
            div.remove();
            // Re-index remaining
            list.querySelectorAll('.example-item').forEach((d, i) => rebuildExampleListItem(d, i));
            updateAddExampleBtn();
            drawCard();
        }

        function updateAddExampleBtn() {
            const list = document.getElementById('examples-list');
            const count = list.querySelectorAll('.example-item').length;
            const btn = document.getElementById('add-example-btn');
            if (btn) btn.style.display = count >= 3 ? 'none' : '';
        }

        function getExamples() {
            return [...document.querySelectorAll('.example-input')]
                .map(t => t.value.trim())
                .filter(Boolean);
        }

        function setExamples(arr) {
            const list = document.getElementById('examples-list');
            list.innerHTML = '';
            const values = (arr && arr.length) ? arr : [''];
            values.slice(0, 3).forEach((val, idx) => {
                const div = document.createElement('div');
                div.className = 'example-item';
                const ta = document.createElement('textarea');
                ta.className = 'example-input';
                ta.rows = 2;
                ta.value = val;
                ta.addEventListener('input', drawCard);
                div.appendChild(ta);
                list.appendChild(div);
                rebuildExampleListItem(div, idx);
            });
            updateAddExampleBtn();
        }

        // ═══════════ RANDOM STYLE ═══════════
        const STYLE_PALETTES = [
            { bg: '#E8F5E9', bg2: null, badge: '#E53935', exBlock: '#E8F5E9' },
            { bg: '#FFF3E0', bg2: null, badge: '#E65100', exBlock: '#FFF3E0' },
            { bg: '#E3F2FD', bg2: null, badge: '#1565C0', exBlock: '#E3F2FD' },
            { bg: '#FCE4EC', bg2: null, badge: '#C62828', exBlock: '#FCE4EC' },
            { bg: '#F3E5F5', bg2: null, badge: '#7B1FA2', exBlock: '#F3E5F5' },
            { bg: '#FFFDE7', bg2: null, badge: '#F57F17', exBlock: '#FFFDE7' },
            { bg: '#E0F7FA', bg2: null, badge: '#00838F', exBlock: '#E0F7FA' },
            { bg: '#FBE9E7', bg2: null, badge: '#BF360C', exBlock: '#FBE9E7' },
            { bg: '#EDE7F6', bg2: null, badge: '#4527A0', exBlock: '#EDE7F6' },
            { bg: '#E0F2F1', bg2: null, badge: '#00695C', exBlock: '#E0F2F1' },
            { bg: '#FAFAFA', bg2: null, badge: '#424242', exBlock: '#F5F5F5' },
            // Gradients
            { bg: '#E8F5E9', bg2: '#C8E6C9', badge: '#E53935', exBlock: '#E8F5E9' },
            { bg: '#E3F2FD', bg2: '#BBDEFB', badge: '#1565C0', exBlock: '#E3F2FD' },
            { bg: '#FFF8E1', bg2: '#FFECB3', badge: '#FF8F00', exBlock: '#FFF8E1' },
            { bg: '#F3E5F5', bg2: '#E1BEE7', badge: '#7B1FA2', exBlock: '#F3E5F5' },
            { bg: '#E0F7FA', bg2: '#B2EBF2', badge: '#00695C', exBlock: '#E0F7FA' },
            { bg: '#FCE4EC', bg2: '#F8BBD0', badge: '#AD1457', exBlock: '#FCE4EC' },
            { bg: '#ECEFF1', bg2: '#CFD8DC', badge: '#37474F', exBlock: '#ECEFF1' },
            { bg: '#FFF9C4', bg2: '#FFF176', badge: '#E91E63', exBlock: '#FFF9C4' },
            // Dark
            { bg: '#263238', bg2: '#37474F', badge: '#4CAF50', exBlock: '#37474F' },
            { bg: '#1A237E', bg2: '#283593', badge: '#FFD740', exBlock: '#1A237E' },
        ];

        function randomStyle() {
            const p = STYLE_PALETTES[Math.floor(Math.random() * STYLE_PALETTES.length)];
            document.getElementById('bg-color').value = p.bg;
            document.getElementById('bg-color-text').value = p.bg;
            document.getElementById('badge-color').value = p.badge;
            document.getElementById('badge-color-text').value = p.badge;
            document.getElementById('example-block-color').value = p.exBlock;
            // Gradient
            if (p.bg2) {
                document.getElementById('use-gradient').checked = true;
                document.getElementById('gradient-controls').style.display = 'block';
                document.getElementById('bg-color-2').value = p.bg2;
                const dirs = ['to bottom', 'to bottom right', 'to right'];
                document.getElementById('gradient-direction').value = dirs[Math.floor(Math.random() * dirs.length)];
            } else {
                document.getElementById('use-gradient').checked = false;
                document.getElementById('gradient-controls').style.display = 'none';
            }
            // Random mascot
            const mascots = ['happy','thinking','wink','love','cool','laugh','nerd','party','zany','shush','monocle','star','frog'];
            currentMascot = mascots[Math.floor(Math.random() * mascots.length)];
            document.querySelectorAll('.mascot-btn').forEach(b => b.classList.toggle('active', b.dataset.mascot === currentMascot));
            drawCard();
        }


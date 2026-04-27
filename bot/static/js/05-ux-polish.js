// === 05-ux-polish.js ===
// Char counters, keyboard shortcuts, focus polish, runtime UX helpers.
// Pure additive — no modification of state/draw pipelines.

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
                input.addEventListener('focus', update);
                input.addEventListener('blur', () => {
                    // Hide when empty + unfocused for cleaner look
                    if (!input.value) c.textContent = '';
                });
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

            // --- Run init when DOM ready (we're already at body end) ---
            initCounters();
        })();

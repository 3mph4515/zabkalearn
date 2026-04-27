// === 02-draw.js ===
// Text wrapping (splitLines, wrapText, splitByChar), main drawCard pipeline,
// drawCardContent (3-phase: measure, layout, draw), content blocks system.

        function splitLines(text) {
            return text ? text.split('\n').filter(l => l.trim() !== '' || text.includes('\n')) : [];
        }

        // Wrap text for long lines (uses current context.font for measuring)
        function wrapText(context, text, maxWidth, fontSize) {
            // Font should be set before calling this function.
            // Falls back to character-level splitting when a single token doesn't fit.
            function splitByChar(token) {
                const out = [];
                let buf = '';
                for (const ch of token) {
                    const test = buf + ch;
                    if (buf && context.measureText(test).width > maxWidth) {
                        out.push(buf);
                        buf = ch;
                    } else {
                        buf = test;
                    }
                }
                if (buf) out.push(buf);
                return out;
            }

            const paragraphs = text.split('\n');
            const lines = [];

            for (const paragraph of paragraphs) {
                if (paragraph === '') {
                    lines.push('');
                    continue;
                }
                const words = paragraph.split(' ');
                let currentLine = '';

                for (const word of words) {
                    const testLine = currentLine ? currentLine + ' ' + word : word;
                    if (context.measureText(testLine).width > maxWidth) {
                        if (currentLine) lines.push(currentLine);
                        // If single word still doesn't fit, break by char.
                        if (context.measureText(word).width > maxWidth) {
                            const parts = splitByChar(word);
                            for (let i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
                            currentLine = parts[parts.length - 1] || '';
                        } else {
                            currentLine = word;
                        }
                    } else {
                        currentLine = testLine;
                    }
                }
                if (currentLine) lines.push(currentLine);
            }
            return lines;
        }

        // Compute required content height by drawing into an off-screen canvas.
        // Returns desired card height (in CSS pixels for display, or canvas pixels for export).
        function probeCardHeight(w, h) {
            const probe = document.createElement('canvas');
            probe.width = w;
            probe.height = h;
            const pctx = probe.getContext('2d');
            try {
                drawCardContent(pctx, w, h);
            } catch (e) {
                return h;
            }
            return window._lastRequiredCardHeight || h;
        }

        function setOverflowWarning(visible, msg) {
            let el = document.getElementById('overflow-warn');
            if (!el) {
                el = document.createElement('div');
                el.id = 'overflow-warn';
                el.style.cssText = 'position:absolute;top:8px;right:8px;background:#fff3e0;color:#e65100;border:1px solid #ffb74d;padding:6px 10px;border-radius:6px;font-size:.78rem;font-weight:600;z-index:50;box-shadow:0 2px 8px rgba(0,0,0,.1);max-width:240px;';
                const wrap = document.querySelector('.preview-panel') || canvas.parentElement;
                if (wrap) {
                    wrap.style.position = wrap.style.position || 'relative';
                    wrap.appendChild(el);
                }
            }
            el.style.display = visible ? '' : 'none';
            if (msg) el.textContent = msg;
        }

        function drawCard(exportMode = false) {
            if (exportMode) {
                const size = getCanvasSize(true);
                const required = probeCardHeight(size.w, size.h);
                const cap = size.w * 1.65;
                const finalH = Math.min(Math.max(size.h, required), cap);
                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = size.w;
                exportCanvas.height = finalH;
                const context = exportCanvas.getContext('2d');
                drawCardContent(context, size.w, finalH);
                return exportCanvas;
            } else {
                const size = getCanvasSize();
                const required = probeCardHeight(size.w, size.h);
                const cap = size.w * 1.65;
                const finalH = Math.min(Math.max(size.h, required), cap);
                if (Math.abs(parseFloat(canvas.style.height || '0') - finalH) > 1) {
                    canvas.width = size.w * dpr;
                    canvas.height = finalH * dpr;
                    canvas.style.width = size.w + 'px';
                    canvas.style.height = finalH + 'px';
                    ctx = canvas.getContext('2d');
                    ctx.scale(dpr, dpr);
                }
                drawCardContent(ctx, size.w, finalH);
                // Overflow warning if cap reached
                const overflowed = required > cap + 1;
                setOverflowWarning(
                    overflowed,
                    overflowed
                        ? '⚠️ Контент не влез — сократи текст или примеры (нужно ' + Math.ceil(required) + 'px, доступно ' + Math.ceil(cap) + 'px)'
                        : ''
                );
                return null;
            }
        }

        function drawCardContent(context, w, h) {
            const scale = w / 540;
            const unit = 8 * scale; // Base unit for spacing (8px grid)

            // Get all values
            const bgColor = document.getElementById('bg-color').value;
            const noBg = document.getElementById('no-bg').checked;
            const badgeText = document.getElementById('badge-text').value.trim();
            const mainWord = document.getElementById('main-word').value.trim();
            const transcription = document.getElementById('transcription').value.trim();
            const translation = document.getElementById('translation').value.trim();
            const subtitle = document.getElementById('subtitle').value.trim();
            const examples = (typeof getExamples === 'function') ? getExamples() : [document.getElementById('example').value.trim()].filter(Boolean);
            const example = examples[0] || '';
            const badgeColor = document.getElementById('badge-color').value;
            const quizOptionsEl = document.getElementById('quiz-options');
            // Legacy textarea removed in poll/quiz refactor — fall back to dynamic poll-options-list inputs.
            let quizOptions = [];
            if (quizOptionsEl) {
                quizOptions = quizOptionsEl.value.split('\n').filter(o => o.trim());
            } else {
                quizOptions = Array.from(document.querySelectorAll('#poll-options-list .poll-option-text'))
                    .map(i => (i.value || '').trim()).filter(Boolean);
            }

            // Spacing values from sliders
            const cardPaddingVal = parseInt(document.getElementById('card-padding').value) * scale;
            const topGapVal = parseInt(document.getElementById('top-gap').value) * scale;
            const badgeGapVal = parseInt(document.getElementById('badge-gap').value) * scale;
            const titleGapVal = parseInt(document.getElementById('title-gap').value) * scale;
            const lineGapVal = parseInt(document.getElementById('line-gap').value) * scale;
            const titleSizeVal = parseInt(document.getElementById('title-size').value) / 100;
            const mascotSizeVal = parseInt(document.getElementById('mascot-size')?.value || 100) / 100;
            const borderWidth = parseInt(document.getElementById('border-width')?.value || 0) * scale;
            const borderColor = document.getElementById('border-color')?.value || '#4CAF50';
            const useGradient = document.getElementById('use-gradient')?.checked || false;
            const bgColor2 = document.getElementById('bg-color-2')?.value || '#C8E6C9';
            const gradientDirection = document.getElementById('gradient-direction')?.value || 'to bottom';

            // Clear and draw background
            context.clearRect(0, 0, w, h);
            if (!noBg) {
                if (useGradient) {
                    let grd;
                    switch(gradientDirection) {
                        case 'to bottom': grd = context.createLinearGradient(0, 0, 0, h); break;
                        case 'to top': grd = context.createLinearGradient(0, h, 0, 0); break;
                        case 'to right': grd = context.createLinearGradient(0, 0, w, 0); break;
                        case 'to left': grd = context.createLinearGradient(w, 0, 0, 0); break;
                        case 'to bottom right': grd = context.createLinearGradient(0, 0, w, h); break;
                        case 'to top right': grd = context.createLinearGradient(0, h, w, 0); break;
                        default: grd = context.createLinearGradient(0, 0, 0, h);
                    }
                    grd.addColorStop(0, bgColor);
                    grd.addColorStop(1, bgColor2);
                    context.fillStyle = grd;
                } else {
                    context.fillStyle = bgColor;
                }
                context.fillRect(0, 0, w, h);
            }

            // Card dimensions
            const cardMargin = unit * 3;
            const cardRadius = unit * 2.5;
            const cardX = cardMargin;
            const cardY = cardMargin;
            const cardW = w - cardMargin * 2;
            const cardH = h - cardMargin * 2;
            const padding = cardPaddingVal;
            const maxTextWidth = cardW - padding * 2;
            const centerX = w / 2;

            // Draw card shadow and background
            context.shadowColor = 'rgba(0, 0, 0, 0.1)';
            context.shadowBlur = unit * 2;
            context.shadowOffsetY = unit * 0.5;
            context.beginPath();
            context.roundRect(cardX, cardY, cardW, cardH, cardRadius);
            context.fillStyle = colors.white;
            context.fill();
            context.shadowColor = 'transparent';
            context.shadowBlur = 0;
            context.shadowOffsetY = 0;

            // Draw background image inside card if present
            if (bgImage) {
                const overlayOpacity = parseInt(document.getElementById('overlay-opacity').value) / 100;

                // Clip to card shape
                context.save();
                context.beginPath();
                context.roundRect(cardX, cardY, cardW, cardH, cardRadius);
                context.clip();

                // Calculate image dimensions based on fit mode
                const imgRatio = bgImage.width / bgImage.height;
                const cardRatio = cardW / cardH;
                let drawW, drawH, drawX, drawY;

                if (imageFit === 'cover') {
                    if (imgRatio > cardRatio) {
                        drawH = cardH;
                        drawW = cardH * imgRatio;
                        drawX = cardX + (cardW - drawW) / 2;
                        drawY = cardY;
                    } else {
                        drawW = cardW;
                        drawH = cardW / imgRatio;
                        drawX = cardX;
                        drawY = cardY + (cardH - drawH) / 2;
                    }
                } else {
                    // contain
                    if (imgRatio > cardRatio) {
                        drawW = cardW;
                        drawH = cardW / imgRatio;
                        drawX = cardX;
                        drawY = cardY + (cardH - drawH) / 2;
                    } else {
                        drawH = cardH;
                        drawW = cardH * imgRatio;
                        drawX = cardX + (cardW - drawW) / 2;
                        drawY = cardY;
                    }
                }

                context.drawImage(bgImage, drawX, drawY, drawW, drawH);

                // Draw overlay on top of image
                const overlayColors = {
                    black: `rgba(0, 0, 0, ${overlayOpacity})`,
                    green: `rgba(46, 125, 50, ${overlayOpacity})`,
                    white: `rgba(255, 255, 255, ${overlayOpacity})`
                };
                context.fillStyle = overlayColors[overlayColor];
                context.fillRect(cardX, cardY, cardW, cardH);

                context.restore();
            }

            // Draw card border if enabled
            if (borderWidth > 0) {
                context.strokeStyle = borderColor;
                context.lineWidth = borderWidth;
                context.beginPath();
                context.roundRect(cardX + borderWidth/2, cardY + borderWidth/2, cardW - borderWidth, cardH - borderWidth, cardRadius);
                context.stroke();
            }

            // === PHASE 1: Measure all content heights ===
            let headerHeight = 0;
            let badgeHeight = 0;
            let mainContentHeight = 0;
            let exampleHeight = 0;
            const footerHeight = unit * 5;

            // Header height
            if (currentMascot !== 'none') {
                headerHeight = unit * 8 * mascotSizeVal; // mascot area + divider
            }

            // Badge height
            if (badgeText) {
                badgeHeight = unit * 4.5;
            }

            // Main word height — shrink font until widest line fits AND total
            // line count stays reasonable (≤2 for slowo, ≤3 for others).
            let mainWordFontSize = unit * 5.5 * titleSizeVal;
            let mainWordLines = [];
            if (mainWord) {
                const minSize = unit * 2.5;
                const maxLinesAllowed = currentTemplate === 'slowo' ? 2 : 3;
                const widestLine = (lines) => lines.reduce((m, l) => Math.max(m, context.measureText(l).width), 0);
                while (mainWordFontSize > minSize) {
                    context.font = `700 ${mainWordFontSize}px ${currentFont}, sans-serif`;
                    const probe = wrapText(context, mainWord, maxTextWidth, mainWordFontSize);
                    if (widestLine(probe) <= maxTextWidth && probe.length <= maxLinesAllowed) {
                        mainWordLines = probe;
                        break;
                    }
                    mainWordFontSize -= unit * 0.25;
                }
                if (!mainWordLines.length) {
                    context.font = `700 ${mainWordFontSize}px ${currentFont}, sans-serif`;
                    mainWordLines = wrapText(context, mainWord, maxTextWidth, mainWordFontSize);
                }
                const lineHeight = 1 + (lineGapVal / mainWordFontSize);
                mainContentHeight += mainWordLines.length * mainWordFontSize * lineHeight;
            }

            // Transcription height (with auto-wrap)
            const transcriptionFontSize = unit * 2;
            let transcriptionLines = [];
            if (transcription && currentTemplate === 'slowo') {
                context.font = `400 ${transcriptionFontSize}px Inter, sans-serif`;
                transcriptionLines = wrapText(context, transcription, maxTextWidth, transcriptionFontSize);
            }
            mainContentHeight += transcriptionLines.length * transcriptionFontSize * 1.5;

            // Translation height (with auto-wrap)
            const translationFontSize = unit * 2.5;
            let translationLines = [];
            if (translation && currentTemplate === 'slowo') {
                context.font = `600 ${translationFontSize}px Inter, sans-serif`;
                translationLines = wrapText(context, translation, maxTextWidth, translationFontSize);
            }
            mainContentHeight += translationLines.length * translationFontSize * 1.5;

            // Subtitle height (with auto-wrap)
            const subtitleFontSize = unit * 2.25;
            let subtitleLines = [];
            if (subtitle) {
                context.font = `500 ${subtitleFontSize}px Inter, sans-serif`;
                subtitleLines = wrapText(context, subtitle, maxTextWidth, subtitleFontSize);
            }
            mainContentHeight += subtitleLines.length * subtitleFontSize * 1.5;

            // Quiz options height
            let quizHeight = 0;
            if (currentTemplate === 'quiz' && quizOptions.length > 0) {
                const optionH = unit * 5;
                quizHeight = Math.min(quizOptions.length, 4) * (optionH + unit);
                mainContentHeight += quizHeight;
            }

            // Example height (supports up to 3 stacked example blocks for slowo)
            const _exFontSize = unit * 1.75;
            const _exPadding = unit * 1.5;
            const _exGap = unit * 1.2;
            let _measuredExamples = [];
            if (['slowo', 'blad', 'podsluchano'].includes(currentTemplate)) {
                context.font = `400 ${_exFontSize}px Inter, sans-serif`;
                const exList = (currentTemplate === 'slowo') ? examples : (example ? [example] : []);
                exList.forEach(ex => {
                    const lines = wrapText(context, ex, maxTextWidth - unit * 4, _exFontSize);
                    const h = lines.length * _exFontSize * 1.5 + _exPadding * 2;
                    _measuredExamples.push({ lines, h });
                    exampleHeight += h + _exGap;
                });
                if (_measuredExamples.length) exampleHeight += unit * 1.5; // outer top spacing
            }

            // === PHASE 2: Calculate vertical distribution ===
            const fixedHeight = headerHeight + badgeHeight + badgeGapVal + footerHeight + exampleHeight + topGapVal;
            const availableForContent = cardH - fixedHeight - padding * 2;
            const contentGap = Math.max(unit * 2, Math.min((availableForContent - mainContentHeight) / 4, unit * 4));

            // Auto-grow probe: how much vertical space the content really wants.
            // Used by drawCard to optionally resize canvas before the visible draw.
            window._lastRequiredCardHeight = (
                fixedHeight + mainContentHeight + padding * 2 + unit * 4 // small breathing room
            ) + cardMargin * 2; // outer margin

            // === PHASE 3: Draw everything ===
            let y = cardY + padding + topGapVal;

            // Text visibility settings
            const textShadowIntensity = bgImage ? parseInt(document.getElementById('text-shadow-intensity')?.value || 70) / 100 : 0;
            const useTextOutline = bgImage && (document.getElementById('text-outline')?.checked ?? true);

            // Helper: draw text with enhanced visibility for image backgrounds
            function drawTextWithEffects(text, x, y, fontSize) {
                if (!bgImage || textShadowIntensity === 0) {
                    context.fillText(text, x, y);
                    return;
                }

                const savedShadow = context.shadowColor;
                const savedBlur = context.shadowBlur;

                // Layer 1: Outer glow (soft, wide)
                context.shadowColor = `rgba(0, 0, 0, ${0.25 * textShadowIntensity})`;
                context.shadowBlur = unit * 2.5;
                context.shadowOffsetX = 0;
                context.shadowOffsetY = 0;
                context.fillText(text, x, y);

                // Layer 2: Middle glow
                context.shadowColor = `rgba(0, 0, 0, ${0.4 * textShadowIntensity})`;
                context.shadowBlur = unit * 1.2;
                context.fillText(text, x, y);

                // Layer 3: Inner shadow (sharp)
                context.shadowColor = `rgba(0, 0, 0, ${0.7 * textShadowIntensity})`;
                context.shadowBlur = unit * 0.4;
                context.shadowOffsetY = unit * 0.08;
                context.fillText(text, x, y);

                // Text outline/stroke for extra contrast
                if (useTextOutline && fontSize) {
                    context.shadowColor = 'transparent';
                    context.shadowBlur = 0;
                    context.shadowOffsetY = 0;
                    context.strokeStyle = `rgba(0, 0, 0, ${0.35 * textShadowIntensity})`;
                    context.lineWidth = Math.max(1, fontSize * 0.025);
                    context.lineJoin = 'round';
                    context.strokeText(text, x, y);
                }

                // Final clean fill
                context.shadowColor = 'transparent';
                context.shadowBlur = 0;
                context.shadowOffsetY = 0;
                context.fillText(text, x, y);
            }

            // Legacy helper for simpler cases
            function setTextShadow(enabled) {
                if (enabled && bgImage && textShadowIntensity > 0) {
                    context.shadowColor = `rgba(0, 0, 0, ${0.6 * textShadowIntensity})`;
                    context.shadowBlur = unit * 1;
                    context.shadowOffsetX = 0;
                    context.shadowOffsetY = unit * 0.1;
                } else {
                    context.shadowColor = 'transparent';
                    context.shadowBlur = 0;
                    context.shadowOffsetX = 0;
                    context.shadowOffsetY = 0;
                }
            }

            // Header with mascot
            if (currentMascot !== 'none') {
                const mascotSize = unit * 6 * mascotSizeVal;
                const headerBlockHeight = unit * 5 * mascotSizeVal;
                const headerCenterY = y + headerBlockHeight / 2;

                // Mascot centered vertically
                drawMascot(context, cardX + padding + mascotSize / 2, headerCenterY, mascotSize, currentMascot);

                // Text block: single line centered vertically relative to mascot
                const titleFontSize = unit * 2;

                setTextShadow(true);
                context.font = `700 ${titleFontSize}px Poppins, sans-serif`;
                context.fillStyle = bgImage ? '#fff' : colors.dark;
                context.textAlign = 'left';
                const headerTitle = document.getElementById('header-title').value || 'Польский язык на каждый день';
                context.fillText(headerTitle, cardX + padding + mascotSize + unit * 1.5, headerCenterY + titleFontSize * 0.35);
                setTextShadow(false);

                y += unit * 6 * mascotSizeVal;

                // Divider
                context.beginPath();
                context.moveTo(cardX + padding, y);
                context.lineTo(cardX + cardW - padding, y);
                context.strokeStyle = bgImage ? 'rgba(255,255,255,0.3)' : '#EEEEEE';
                context.lineWidth = 1;
                context.stroke();
                y += unit * 2;
            }

            // Badge
            if (badgeText) {
                const badgePadding = unit * 2;
                const badgeH = unit * 4;
                context.font = `600 ${unit * 1.5}px Inter, sans-serif`;
                const badgeW = context.measureText('🐸 ' + badgeText).width + badgePadding * 2;

                context.beginPath();
                context.roundRect(cardX + padding, y, badgeW, badgeH, badgeH / 2);
                context.fillStyle = badgeColor;
                context.fill();

                context.fillStyle = colors.white;
                context.textAlign = 'left';
                context.fillText('🐸 ' + badgeText, cardX + padding + badgePadding, y + badgeH / 2 + unit * 0.5);
                y += badgeH + badgeGapVal;
            } else {
                // No badge - still apply gap after header for spacing control
                y += badgeGapVal;
            }

            // Main word (with enhanced visibility for image backgrounds)
            if (mainWord) {
                context.fillStyle = bgImage ? '#fff' : '#2E7D32';
                context.textAlign = textAlign;

                // Calculate x position based on alignment
                let textX = centerX;
                if (textAlign === 'left') textX = cardX + padding;
                else if (textAlign === 'right') textX = cardX + cardW - padding;

                const lineHeight = 1 + (lineGapVal / mainWordFontSize);
                mainWordLines.forEach(line => {
                    context.font = `700 ${mainWordFontSize}px ${currentFont}, sans-serif`;
                    drawTextWithEffects(line, textX, y + mainWordFontSize * 0.85, mainWordFontSize);
                    y += mainWordFontSize * lineHeight;
                });
                y += titleGapVal;
            }

            // Transcription
            if (transcriptionLines.length > 0) {
                setTextShadow(true);
                context.font = `400 ${transcriptionFontSize}px Inter, sans-serif`;
                context.fillStyle = bgImage ? 'rgba(255,255,255,0.85)' : '#888';
                context.textAlign = 'center';

                transcriptionLines.forEach(line => {
                    context.fillText(line, centerX, y + transcriptionFontSize * 0.85);
                    y += transcriptionFontSize * 1.5;
                });
                setTextShadow(false);
                y += contentGap * 0.3;
            }

            // Translation
            if (translationLines.length > 0) {
                setTextShadow(true);
                context.font = `600 ${translationFontSize}px Inter, sans-serif`;
                context.fillStyle = bgImage ? '#fff' : colors.polishRed;
                context.textAlign = 'center';

                translationLines.forEach(line => {
                    context.fillText(line, centerX, y + translationFontSize * 0.85);
                    y += translationFontSize * 1.5;
                });
                setTextShadow(false);
                y += contentGap * 0.3;
            }

            // Subtitle (with enhanced visibility)
            if (subtitleLines.length > 0) {
                context.font = `500 ${subtitleFontSize}px Inter, sans-serif`;
                context.fillStyle = bgImage ? 'rgba(255,255,255,0.95)' : '#444';
                context.textAlign = 'center';

                subtitleLines.forEach(line => {
                    drawTextWithEffects(line, centerX, y + subtitleFontSize * 0.85, subtitleFontSize);
                    y += subtitleFontSize * 1.5;
                });
            }

            // Quiz options
            if (currentTemplate === 'quiz' && quizOptions.length > 0) {
                const letters = ['🅰️', '🅱️', '🅲️', '🅳️'];
                const optionH = unit * 5;
                const optionW = cardW - padding * 2;

                y += contentGap * 0.5;
                context.textAlign = 'left';

                quizOptions.forEach((option, i) => {
                    if (i >= 4) return;

                    context.beginPath();
                    context.roundRect(cardX + padding, y, optionW, optionH, unit);
                    context.fillStyle = bgImage ? 'rgba(255,255,255,0.9)' : '#f5f5f5';
                    context.fill();

                    context.font = `500 ${unit * 1.75}px Inter, sans-serif`;
                    context.fillStyle = colors.dark;
                    context.fillText(letters[i] + ' ' + option.trim(), cardX + padding + unit * 1.5, y + optionH / 2 + unit * 0.5);

                    y += optionH + unit;
                });
            }

            // Example blocks (stacked from bottom, up to 3) - for specific templates
            if (_measuredExamples.length && ['slowo', 'blad', 'podsluchano'].includes(currentTemplate)) {
                const exFontSize = _exFontSize;
                const exPadding = _exPadding;
                const exGap = _exGap;
                const exWidth = cardW - padding * 2;

                const exBlockColor = document.getElementById('example-block-color')?.value || colors.softGreen;
                const badgeColor = document.getElementById('badge-color')?.value || colors.frogGreen;

                // Stack up from bottom: last example sits at bottom-most position
                const totalStackH = _measuredExamples.reduce((s, m) => s + m.h, 0)
                    + (_measuredExamples.length - 1) * exGap;
                let curY = cardY + cardH - footerHeight - totalStackH - unit * 2;

                _measuredExamples.forEach(meas => {
                    context.beginPath();
                    context.roundRect(cardX + padding, curY, exWidth, meas.h, unit);
                    context.fillStyle = bgImage ? 'rgba(255,255,255,0.9)' : exBlockColor;
                    context.fill();

                    context.beginPath();
                    context.roundRect(cardX + padding, curY, unit * 0.5, meas.h, unit * 0.25);
                    context.fillStyle = badgeColor;
                    context.fill();

                    context.font = `400 ${exFontSize}px Inter, sans-serif`;
                    context.fillStyle = colors.dark;
                    context.textAlign = 'left';
                    meas.lines.forEach((line, i) => {
                        context.fillText(
                            line,
                            cardX + padding + exPadding + unit,
                            curY + exPadding + exFontSize + i * exFontSize * 1.5,
                        );
                    });
                    curY += meas.h + exGap;
                });
            }

            // Content blocks (universal - works in any template)
            drawContentBlocks(context, cardX, cardY, cardW, cardH, padding, unit, bgImage);

            // Draw decorations
            drawDecor(context, cardX, cardY, cardW, cardH, scale);

            // Footer brand with Telegram
            setTextShadow(true);
            const footerText = document.getElementById('footer-username').value || '@Polski_Daily';
            const footerFontSize = unit * 1.6;
            context.font = `600 ${footerFontSize}px Poppins, sans-serif`;
            const footerTextWidth = context.measureText(footerText).width;
            const tgIconSize = unit * 2.5;
            const totalFooterWidth = tgIconSize + unit * 0.8 + footerTextWidth;
            const footerStartX = centerX - totalFooterWidth / 2;
            const footerCenterY = cardY + cardH - unit * 2.5;

            // Draw Telegram icon centered vertically with text
            const tgX = footerStartX;
            const tgY = footerCenterY - tgIconSize / 2;
            const useLogo = bgImage ? tgLogoWhiteImg : tgLogoImg;
            if (useLogo && useLogo.complete) {
                context.drawImage(useLogo, tgX, tgY, tgIconSize, tgIconSize);
            }

            // Footer text aligned with icon center
            context.fillStyle = bgImage ? '#fff' : colors.frogGreen;
            context.textAlign = 'left';
            context.fillText(footerText, footerStartX + tgIconSize + unit * 0.8, footerCenterY + footerFontSize * 0.35);
            setTextShadow(false);

            context.textAlign = 'left';
        }

        // ============ CONTENT BLOCKS SYSTEM ============

        function addBlock() {
            if (contentBlocks.length >= 4) {
                if (typeof pubToast === 'function') pubToast('Максимум 4 блока', 'er');
                else alert('Максимум 4 блока');
                return;
            }
            contentBlocks.push({ color: 'green', text: '' });
            renderBlocksUI();
            drawCard();
        }

        function removeBlock(index) {
            contentBlocks.splice(index, 1);
            renderBlocksUI();
            drawCard();
        }

        function updateBlockColor(index, color) {
            contentBlocks[index].color = color;
            renderBlocksUI();
            drawCard();
        }

        function updateBlockText(index, text) {
            contentBlocks[index].text = text;
            drawCard();
        }

        function renderBlocksUI() {
            const container = document.getElementById('blocks-container');
            container.innerHTML = '';

            contentBlocks.forEach((block, index) => {
                const blockEl = document.createElement('div');
                blockEl.className = 'block-item';
                blockEl.innerHTML = `
                    <div class="block-header">
                        <div class="block-colors">
                            <button type="button" class="block-color-btn ${block.color === 'green' ? 'active' : ''}"
                                    style="background: #4CAF50;" onclick="updateBlockColor(${index}, 'green')">🟢</button>
                            <button type="button" class="block-color-btn ${block.color === 'red' ? 'active' : ''}"
                                    style="background: #E53935;" onclick="updateBlockColor(${index}, 'red')">🔴</button>
                            <button type="button" class="block-color-btn ${block.color === 'blue' ? 'active' : ''}"
                                    style="background: #2196F3;" onclick="updateBlockColor(${index}, 'blue')">🔵</button>
                            <button type="button" class="block-color-btn ${block.color === 'orange' ? 'active' : ''}"
                                    style="background: #FF9800;" onclick="updateBlockColor(${index}, 'orange')">🟠</button>
                            <button type="button" class="block-color-btn ${block.color === 'none' ? 'active' : ''}"
                                    style="background: #f5f5f5;" onclick="updateBlockColor(${index}, 'none')">⬜</button>
                        </div>
                        <button type="button" class="block-delete" onclick="removeBlock(${index})">🗑️</button>
                    </div>
                    <textarea placeholder="Текст блока..." oninput="updateBlockText(${index}, this.value)">${block.text}</textarea>
                `;
                container.appendChild(blockEl);
            });
        }

        function drawContentBlocks(context, cardX, cardY, cardW, cardH, padding, unit, bgImage) {
            if (contentBlocks.length === 0) return 0;

            const blockGap = parseInt(document.getElementById('block-gap')?.value || 12) * (cardW / 540);
            const blocksTopOffset = parseInt(document.getElementById('blocks-top')?.value || 0) * (cardW / 540);
            const footerHeight = unit * 5;
            let totalHeight = 0;

            // Calculate total height of all blocks first
            const blockHeights = [];
            contentBlocks.forEach(block => {
                if (!block.text.trim()) return;
                const fontSize = unit * 1.75;
                context.font = `400 ${fontSize}px Inter, sans-serif`;
                const lines = wrapText(context, block.text, cardW - padding * 2 - unit * 4, fontSize);
                const blockH = lines.length * fontSize * 1.5 + unit * 3;
                blockHeights.push({ block, lines, height: blockH, fontSize });
                totalHeight += blockH;
            });

            if (blockHeights.length > 1) {
                totalHeight += blockGap * (blockHeights.length - 1);
            }

            // Draw blocks - position from bottom, but offset up by blocksTopOffset
            let y = cardY + cardH - footerHeight - unit * 2 - totalHeight - blocksTopOffset;

            blockHeights.forEach(({ block, lines, height, fontSize }, i) => {
                const blockPadding = unit * 1.5;
                const blockWidth = cardW - padding * 2;
                const borderColor = blockColors[block.color] || 'transparent';

                // Block background
                context.beginPath();
                context.roundRect(cardX + padding, y, blockWidth, height, unit);
                context.fillStyle = bgImage ? 'rgba(255,255,255,0.9)' : colors.softGreen;
                context.fill();

                // Left border
                if (block.color !== 'none') {
                    context.beginPath();
                    context.roundRect(cardX + padding, y, unit * 0.5, height, unit * 0.25);
                    context.fillStyle = borderColor;
                    context.fill();
                }

                // Text
                context.font = `400 ${fontSize}px Inter, sans-serif`;
                context.fillStyle = colors.dark;
                context.textAlign = 'left';
                lines.forEach((line, lineIdx) => {
                    context.fillText(line, cardX + padding + blockPadding + unit, y + blockPadding + fontSize + lineIdx * fontSize * 1.5);
                });

                y += height + blockGap;
            });

            return totalHeight + unit * 2;
        }


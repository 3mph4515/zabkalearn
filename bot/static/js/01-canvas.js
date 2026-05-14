// === 01-canvas.js ===
// Canvas setup, mascot rendering, decoration positions/drag, decor shape primitives.
// Globals exposed: canvas, ctx, dpr, baseWidth, currentMascot, decorPositions, etc.

        const canvas = document.getElementById('card-preview');
        let ctx = canvas.getContext('2d');

        const dpr = window.devicePixelRatio || 1;
        const baseWidth = 540;

        let currentFormat = 'square';
        let currentTemplate = 'slowo';
        let currentMascot = 'happy';
        let bgImage = null;
        let overlayColor = 'black';
        let imageFit = 'cover';
        let currentFont = 'Poppins';
        let textAlign = 'center';
        let currentPresetSlot = 1;

        // Content blocks system
        let contentBlocks = [];
        const blockColors = {
            'green': '#4CAF50',
            'red': '#E53935',
            'blue': '#2196F3',
            'orange': '#FF9800',
            'none': 'transparent'
        };

        // Telegram icons (just the plane shape, no circle)
        const tgLogoImg = new Image();
        tgLogoImg.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#2AABEE" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.97 9.293c-.146.658-.537.818-1.084.508l-3-2.211-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.582-4.461c.537-.194 1.006.131.821.93z"/></svg>');
        tgLogoImg.onload = () => drawCard();

        const tgLogoWhiteImg = new Image();
        tgLogoWhiteImg.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.97 9.293c-.146.658-.537.818-1.084.508l-3-2.211-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.582-4.461c.537-.194 1.006.131.821.93z"/></svg>');

        const colors = {
            frogGreen: '#4CAF50',
            lightFrog: '#81C784',
            softGreen: '#E8F5E9',
            polishRed: '#E53935',
            dark: '#1A1A1A',
            white: '#FFFFFF'
        };

        // Format sizes - increased horizontal height
        function getCanvasSize(forExport = false) {
            const formats = {
                horizontal: { w: 2160, h: 1620 },   // 4:3 (2x)
                square: { w: 2160, h: 2160 },       // 1:1 (2x)
                vertical: { w: 2160, h: 2700 }      // 4:5 (2x)
            };
            const size = formats[currentFormat] || formats.square;

            if (forExport) return size;
            const scale = baseWidth / 2160;
            return { w: size.w * scale, h: size.h * scale };
        }

        function setupCanvas() {
            const size = getCanvasSize();
            canvas.width = size.w * dpr;
            canvas.height = size.h * dpr;
            ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
        }

        setupCanvas();

        // Draw mascot
        function drawMascot(context, x, y, size, expression = 'happy') {
            const s = size / 44;

            context.beginPath();
            context.arc(x, y, 22 * s, 0, Math.PI * 2);
            context.fillStyle = colors.frogGreen;
            context.fill();

            context.beginPath();
            context.ellipse(x, y + 2 * s, 13 * s, 10 * s, 0, 0, Math.PI * 2);
            context.fillStyle = colors.lightFrog;
            context.fill();

            context.beginPath();
            context.arc(x - 6 * s, y - 4 * s, 4 * s, 0, Math.PI * 2);
            context.arc(x + 6 * s, y - 4 * s, 4 * s, 0, Math.PI * 2);
            context.fillStyle = colors.white;
            context.fill();

            context.fillStyle = colors.dark;
            context.strokeStyle = colors.dark;
            context.lineWidth = 1.5 * s;
            context.lineCap = 'round';

            // Eyes based on expression
            if (expression === 'thinking') {
                context.beginPath();
                context.arc(x - 7 * s, y - 5 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 5 * s, y - 5 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
            } else if (expression === 'surprised') {
                context.beginPath();
                context.arc(x - 6 * s, y - 4 * s, 2.5 * s, 0, Math.PI * 2);
                context.arc(x + 6 * s, y - 4 * s, 2.5 * s, 0, Math.PI * 2);
                context.fill();
            } else if (expression === 'wink') {
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                context.beginPath();
                context.moveTo(x + 3 * s, y - 3 * s);
                context.lineTo(x + 9 * s, y - 3 * s);
                context.stroke();
            } else if (expression === 'love') {
                // Heart eyes
                context.fillStyle = '#E53935';
                [x - 6 * s, x + 6 * s].forEach(hx => {
                    context.beginPath();
                    context.moveTo(hx, y - 2 * s);
                    context.bezierCurveTo(hx - 3 * s, y - 6 * s, hx - 6 * s, y - 2 * s, hx, y + 2 * s);
                    context.bezierCurveTo(hx + 6 * s, y - 2 * s, hx + 3 * s, y - 6 * s, hx, y - 2 * s);
                    context.fill();
                });
                context.fillStyle = colors.dark;
            } else if (expression === 'cool') {
                // Sunglasses
                context.fillStyle = colors.dark;
                context.beginPath();
                context.roundRect(x - 11 * s, y - 6 * s, 9 * s, 6 * s, 1.5 * s);
                context.roundRect(x + 2 * s, y - 6 * s, 9 * s, 6 * s, 1.5 * s);
                context.fill();
                context.beginPath();
                context.moveTo(x - 2 * s, y - 3 * s);
                context.lineTo(x + 2 * s, y - 3 * s);
                context.lineWidth = 1.5 * s;
                context.stroke();
            } else if (expression === 'sad') {
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 7 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                // Tear
                context.fillStyle = '#64B5F6';
                context.beginPath();
                context.ellipse(x + 10 * s, y + 2 * s, 1.5 * s, 2.5 * s, 0, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = colors.dark;
            } else if (expression === 'angry') {
                context.beginPath();
                context.arc(x - 5 * s, y - 2 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 7 * s, y - 2 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                // Angry eyebrows
                context.lineWidth = 2 * s;
                context.beginPath();
                context.moveTo(x - 9 * s, y - 7 * s);
                context.lineTo(x - 2 * s, y - 5 * s);
                context.moveTo(x + 11 * s, y - 7 * s);
                context.lineTo(x + 4 * s, y - 5 * s);
                context.stroke();
                context.lineWidth = 1.5 * s;
            } else if (expression === 'sleepy') {
                // Closed eyes (lines)
                context.beginPath();
                context.moveTo(x - 8 * s, y - 3 * s);
                context.lineTo(x - 2 * s, y - 3 * s);
                context.moveTo(x + 4 * s, y - 3 * s);
                context.lineTo(x + 10 * s, y - 3 * s);
                context.stroke();
                // Zzz
                context.font = `bold ${6 * s}px sans-serif`;
                context.fillText('z', x + 14 * s, y - 8 * s);
                context.font = `bold ${4 * s}px sans-serif`;
                context.fillText('z', x + 17 * s, y - 12 * s);
            } else if (expression === 'laugh') {
                // Closed happy eyes (arcs)
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 3 * s, Math.PI, 0);
                context.arc(x + 7 * s, y - 3 * s, 3 * s, Math.PI, 0);
                context.stroke();
            } else if (expression === 'nerd') {
                // Glasses
                context.strokeStyle = colors.dark;
                context.lineWidth = 1.5 * s;
                context.beginPath();
                context.arc(x - 6 * s, y - 3 * s, 5 * s, 0, Math.PI * 2);
                context.arc(x + 6 * s, y - 3 * s, 5 * s, 0, Math.PI * 2);
                context.stroke();
                context.beginPath();
                context.moveTo(x - 1 * s, y - 3 * s);
                context.lineTo(x + 1 * s, y - 3 * s);
                context.stroke();
                // Eyes behind glasses
                context.fillStyle = colors.dark;
                context.beginPath();
                context.arc(x - 6 * s, y - 3 * s, 1.5 * s, 0, Math.PI * 2);
                context.arc(x + 6 * s, y - 3 * s, 1.5 * s, 0, Math.PI * 2);
                context.fill();
            } else if (expression === 'party') {
                // Party hat + excited eyes
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 7 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                // Party hat
                context.fillStyle = '#FFD700';
                context.beginPath();
                context.moveTo(x, y - 22 * s);
                context.lineTo(x - 8 * s, y - 10 * s);
                context.lineTo(x + 8 * s, y - 10 * s);
                context.closePath();
                context.fill();
                context.fillStyle = '#E53935';
                context.beginPath();
                context.arc(x, y - 22 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = colors.dark;
            } else if (expression === 'zany') {
                // One big eye, one small, tongue out
                context.beginPath();
                context.arc(x - 6 * s, y - 4 * s, 3 * s, 0, Math.PI * 2);
                context.fill();
                context.beginPath();
                context.arc(x + 6 * s, y - 2 * s, 1.5 * s, 0, Math.PI * 2);
                context.fill();
            } else if (expression === 'shush') {
                // Shh eyes + finger
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 7 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
            } else if (expression === 'monocle') {
                // One eye with monocle
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                context.strokeStyle = '#795548';
                context.lineWidth = 1.5 * s;
                context.beginPath();
                context.arc(x + 6 * s, y - 3 * s, 5 * s, 0, Math.PI * 2);
                context.stroke();
                context.fillStyle = colors.dark;
                context.beginPath();
                context.arc(x + 6 * s, y - 3 * s, 1.5 * s, 0, Math.PI * 2);
                context.fill();
                // Chain
                context.strokeStyle = '#795548';
                context.lineWidth = 0.8 * s;
                context.beginPath();
                context.moveTo(x + 11 * s, y - 1 * s);
                context.lineTo(x + 14 * s, y + 10 * s);
                context.stroke();
                context.strokeStyle = colors.dark;
                context.lineWidth = 1.5 * s;
            } else if (expression === 'explode') {
                // Mind blown - big eyes, explosion lines
                context.beginPath();
                context.arc(x - 6 * s, y - 4 * s, 3 * s, 0, Math.PI * 2);
                context.arc(x + 6 * s, y - 4 * s, 3 * s, 0, Math.PI * 2);
                context.fill();
                // Explosion lines above head
                context.strokeStyle = '#FF9800';
                context.lineWidth = 1.5 * s;
                for (let i = 0; i < 5; i++) {
                    const angle = (-0.8 + i * 0.4);
                    context.beginPath();
                    context.moveTo(x + Math.cos(angle) * 14 * s, y - 14 * s + Math.sin(angle) * 3 * s);
                    context.lineTo(x + Math.cos(angle) * 20 * s, y - 18 * s + Math.sin(angle) * 5 * s);
                    context.stroke();
                }
                context.strokeStyle = colors.dark;
            } else if (expression === 'salute') {
                // Saluting - one eye wink, hand at forehead
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                context.beginPath();
                context.moveTo(x + 3 * s, y - 3 * s);
                context.lineTo(x + 9 * s, y - 3 * s);
                context.stroke();
                // Hand salute
                context.fillStyle = colors.lightFrog;
                context.beginPath();
                context.roundRect(x + 10 * s, y - 14 * s, 8 * s, 5 * s, 2 * s);
                context.fill();
                context.fillStyle = colors.dark;
            } else if (expression === 'chef') {
                // Chef hat + happy eyes
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 7 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                // Chef hat
                context.fillStyle = '#fff';
                context.beginPath();
                context.ellipse(x, y - 20 * s, 12 * s, 8 * s, 0, 0, Math.PI * 2);
                context.fill();
                context.fillRect(x - 10 * s, y - 15 * s, 20 * s, 5 * s);
                context.fillStyle = colors.dark;
            } else if (expression === 'muscle') {
                // Determined eyes
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 7 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
                // Thick eyebrows
                context.lineWidth = 2.5 * s;
                context.beginPath();
                context.moveTo(x - 9 * s, y - 6 * s);
                context.lineTo(x - 2 * s, y - 7 * s);
                context.moveTo(x + 3 * s, y - 7 * s);
                context.lineTo(x + 10 * s, y - 6 * s);
                context.stroke();
                context.lineWidth = 1.5 * s;
            } else if (expression === 'fire') {
                // Intense eyes
                context.fillStyle = '#FF5722';
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2.5 * s, 0, Math.PI * 2);
                context.arc(x + 7 * s, y - 3 * s, 2.5 * s, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = colors.dark;
            } else if (expression === 'star') {
                // Star eyes
                context.fillStyle = '#FFD700';
                [x - 5 * s, x + 7 * s].forEach(sx => {
                    const ss = 3 * s;
                    context.beginPath();
                    for (let i = 0; i < 5; i++) {
                        const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
                        const r = i % 2 === 0 ? ss : ss * 0.4;
                        if (i === 0) context.moveTo(sx + r * Math.cos(a), y - 3 * s + r * Math.sin(a));
                        else context.lineTo(sx + r * Math.cos(a), y - 3 * s + r * Math.sin(a));
                    }
                    context.closePath();
                    context.fill();
                });
                context.fillStyle = colors.dark;
            } else if (expression === 'frog') {
                // Extra froggy - bigger eyes on top
                context.fillStyle = colors.frogGreen;
                context.beginPath();
                context.arc(x - 8 * s, y - 12 * s, 6 * s, 0, Math.PI * 2);
                context.arc(x + 8 * s, y - 12 * s, 6 * s, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = '#fff';
                context.beginPath();
                context.arc(x - 8 * s, y - 12 * s, 4 * s, 0, Math.PI * 2);
                context.arc(x + 8 * s, y - 12 * s, 4 * s, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = colors.dark;
                context.beginPath();
                context.arc(x - 8 * s, y - 12 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 8 * s, y - 12 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
            } else {
                // Default happy
                context.beginPath();
                context.arc(x - 5 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.arc(x + 7 * s, y - 3 * s, 2 * s, 0, Math.PI * 2);
                context.fill();
            }

            // Blush (skip for cool/angry/fire/explode)
            if (!['cool', 'angry', 'fire', 'explode'].includes(expression)) {
                context.beginPath();
                context.ellipse(x - 12 * s, y + 4 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
                context.ellipse(x + 12 * s, y + 4 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
                context.fillStyle = 'rgba(229, 57, 53, 0.35)';
                context.fill();
            }

            context.strokeStyle = colors.dark;
            context.lineWidth = 1.5 * s;
            context.lineCap = 'round';

            // Mouth based on expression
            if (expression === 'surprised') {
                context.beginPath();
                context.ellipse(x, y + 8 * s, 3 * s, 4 * s, 0, 0, Math.PI * 2);
                context.stroke();
            } else if (expression === 'thinking') {
                context.beginPath();
                context.moveTo(x - 5 * s, y + 7 * s);
                context.quadraticCurveTo(x - 2 * s, y + 5 * s, x, y + 7 * s);
                context.quadraticCurveTo(x + 2 * s, y + 9 * s, x + 5 * s, y + 7 * s);
                context.stroke();
            } else if (expression === 'sad') {
                context.beginPath();
                context.moveTo(x - 5 * s, y + 9 * s);
                context.quadraticCurveTo(x, y + 5 * s, x + 5 * s, y + 9 * s);
                context.stroke();
            } else if (expression === 'angry') {
                context.beginPath();
                context.moveTo(x - 4 * s, y + 8 * s);
                context.lineTo(x + 4 * s, y + 8 * s);
                context.stroke();
            } else if (expression === 'sleepy') {
                context.beginPath();
                context.ellipse(x, y + 8 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
                context.stroke();
            } else if (expression === 'laugh') {
                // Big open smile
                context.beginPath();
                context.moveTo(x - 7 * s, y + 5 * s);
                context.quadraticCurveTo(x, y + 14 * s, x + 7 * s, y + 5 * s);
                context.stroke();
                context.beginPath();
                context.moveTo(x - 6 * s, y + 6 * s);
                context.lineTo(x + 6 * s, y + 6 * s);
                context.stroke();
            } else if (expression === 'cool' || expression === 'monocle') {
                // Smirk
                context.beginPath();
                context.moveTo(x - 3 * s, y + 7 * s);
                context.quadraticCurveTo(x + 2 * s, y + 10 * s, x + 6 * s, y + 6 * s);
                context.stroke();
            } else if (expression === 'zany') {
                // Tongue out
                context.beginPath();
                context.moveTo(x - 4 * s, y + 6 * s);
                context.quadraticCurveTo(x, y + 10 * s, x + 4 * s, y + 6 * s);
                context.stroke();
                context.fillStyle = '#E91E63';
                context.beginPath();
                context.ellipse(x + 2 * s, y + 11 * s, 3 * s, 4 * s, 0.2, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = colors.dark;
            } else if (expression === 'shush') {
                // Small closed mouth + finger
                context.beginPath();
                context.ellipse(x, y + 7 * s, 2 * s, 1.5 * s, 0, 0, Math.PI * 2);
                context.stroke();
                // Finger over mouth
                context.fillStyle = colors.lightFrog;
                context.beginPath();
                context.roundRect(x - 1.5 * s, y + 2 * s, 3 * s, 10 * s, 1.5 * s);
                context.fill();
                context.fillStyle = colors.dark;
            } else if (expression === 'explode') {
                // Open mouth shocked
                context.beginPath();
                context.ellipse(x, y + 8 * s, 4 * s, 5 * s, 0, 0, Math.PI * 2);
                context.stroke();
            } else if (expression === 'party' || expression === 'star') {
                // Big happy grin
                context.beginPath();
                context.moveTo(x - 7 * s, y + 5 * s);
                context.quadraticCurveTo(x, y + 14 * s, x + 7 * s, y + 5 * s);
                context.stroke();
            } else if (expression === 'muscle' || expression === 'fire' || expression === 'salute') {
                // Determined grin
                context.beginPath();
                context.moveTo(x - 5 * s, y + 6 * s);
                context.lineTo(x + 5 * s, y + 6 * s);
                context.quadraticCurveTo(x + 3 * s, y + 9 * s, x, y + 9 * s);
                context.quadraticCurveTo(x - 3 * s, y + 9 * s, x - 5 * s, y + 6 * s);
                context.stroke();
            } else {
                // Default smile
                context.beginPath();
                context.moveTo(x - 6 * s, y + 6 * s);
                context.quadraticCurveTo(x, y + 11 * s, x + 6 * s, y + 6 * s);
                context.stroke();
            }
        }

        // ═══ DECOR SYSTEM ═══
        const DECOR_TYPES = {
            flag:       { emoji: '\uD83C\uDDF5\uD83C\uDDF1', name: 'Flag',       max: 2 },
            stars:      { emoji: '\u2728',   name: 'Stars',      max: 8 },
            fire:       { emoji: '\uD83D\uDD25',   name: 'Fire',       max: 6 },
            hearts:     { emoji: '\uD83D\uDC96',   name: 'Hearts',     max: 8 },
            confetti:   { emoji: '\uD83C\uDF89',   name: 'Confetti',   max: 20 },
            lightning:  { emoji: '\u26A1',   name: 'Lightning',  max: 5 },
            snowflakes: { emoji: '\u2744\uFE0F',   name: 'Snow',       max: 8 },
            dots:       { emoji: '\uD83D\uDD35',   name: 'Dots',       max: 20 },
            rings:      { emoji: '\uD83D\uDCAB',   name: 'Rings',      max: 6 },
            leaves:     { emoji: '\uD83C\uDF43',   name: 'Leaves',     max: 8 },
            diamonds:   { emoji: '\uD83D\uDC8E',   name: 'Diamonds',   max: 6 },
            waves:      { emoji: '\uD83C\uDF0A',   name: 'Waves',      max: 3 },
        };

        // decorState: { type: count }
        // decorPositions: { type: [{nx, ny, nsize, rotation}] } - normalized 0-1
        let decorState = {};
        let decorPositions = {};
        let decorDragInfo = null; // {type, idx} for drag

        function ensureDecorPositions(type, count) {
            if (!decorPositions[type]) decorPositions[type] = [];
            const arr = decorPositions[type];
            // Add missing
            while (arr.length < count) {
                arr.push({
                    nx: 0.1 + Math.random() * 0.8,
                    ny: 0.1 + Math.random() * 0.8,
                    nsize: 0.3 + Math.random() * 0.7,
                    rotation: Math.random() * 360,
                });
            }
            // Trim excess
            if (arr.length > count) arr.length = count;
        }

        function initDecorUI() {
            const grid = document.getElementById('decorGrid');
            grid.innerHTML = '';
            Object.entries(DECOR_TYPES).forEach(([key, dt]) => {
                const count = decorState[key] || 0;
                const chip = document.createElement('div');
                chip.className = 'decor-chip' + (count > 0 ? ' on' : '');
                chip.dataset.key = key;
                chip.innerHTML = `<span class="de">${dt.emoji}</span><span class="dc">${count || ''}</span><div class="darr"><button data-dir="up">&#9650;</button><button data-dir="down">&#9660;</button></div>`;
                chip.addEventListener('click', (e) => {
                    if (e.target.closest('.darr')) return;
                    if (decorState[key]) { decorState[key] = 0; }
                    else { decorState[key] = Math.ceil(dt.max / 3); ensureDecorPositions(key, decorState[key]); }
                    initDecorUI(); drawCard();
                });
                chip.querySelector('[data-dir="up"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    decorState[key] = Math.min((decorState[key] || 0) + 1, dt.max);
                    ensureDecorPositions(key, decorState[key]);
                    initDecorUI(); drawCard();
                });
                chip.querySelector('[data-dir="down"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    decorState[key] = Math.max((decorState[key] || 0) - 1, 0);
                    ensureDecorPositions(key, decorState[key]);
                    initDecorUI(); drawCard();
                });
                grid.appendChild(chip);
            });
        }

        function shuffleDecorPositions() {
            Object.entries(decorState).forEach(([type, count]) => {
                if (!count) return;
                decorPositions[type] = [];
                ensureDecorPositions(type, count);
            });
            drawCard();
        }

        function randomDecor() {
            decorState = {};
            decorPositions = {};
            const keys = Object.keys(DECOR_TYPES);
            const count = 1 + Math.floor(Math.random() * 3);
            const shuffled = keys.sort(() => Math.random() - 0.5);
            for (let i = 0; i < count; i++) {
                const k = shuffled[i];
                const dt = DECOR_TYPES[k];
                decorState[k] = 1 + Math.floor(Math.random() * Math.ceil(dt.max * 0.6));
                ensureDecorPositions(k, decorState[k]);
            }
            initDecorUI();
            drawCard();
        }

        function clearDecor() {
            decorState = {};
            decorPositions = {};
            initDecorUI();
            drawCard();
        }

        // Drag decorations on canvas
        // Uses CSS-pixel space matching drawCardContent (cardX + nx*cardW).
        // Hit radius is per-decor based on actual rendered size.
        function getCardCssDims(canvas) {
            const rect = canvas.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;
            const scale = w / 540;
            const unit = 8 * scale;
            const cardMargin = unit * 3;
            return {
                rect, w, h, scale,
                cardX: cardMargin,
                cardY: cardMargin,
                cardW: w - cardMargin * 2,
                cardH: h - cardMargin * 2,
            };
        }

        function findDecorAt(canvas, clientX, clientY) {
            const dims = getCardCssDims(canvas);
            const mx = clientX - dims.rect.left;
            const my = clientY - dims.rect.top;
            let best = null;
            let bestDist = Infinity;
            Object.entries(decorState).forEach(([type, count]) => {
                if (!count || !decorPositions[type]) return;
                decorPositions[type].slice(0, count).forEach((p, idx) => {
                    const px = dims.cardX + p.nx * dims.cardW;
                    const py = dims.cardY + p.ny * dims.cardH;
                    // Visible size: drawDecor uses (5 + nsize*10) * scale.
                    // Flag uses fixed 44x28; waves are span-wide so skip.
                    let r;
                    if (type === 'waves') return;
                    else if (type === 'flag') r = 26 * dims.scale;
                    else r = (5 + p.nsize * 10) * dims.scale;
                    // Slack so small decor is still grabbable, cap so giants don't swallow neighbors.
                    const hit = Math.max(14 * dims.scale, Math.min(r * 1.6, 28 * dims.scale));
                    const d = Math.hypot(mx - px, my - py);
                    if (d < hit && d < bestDist) { bestDist = d; best = {type, idx}; }
                });
            });
            return best;
        }

        function initDecorDrag() {
            const canvas = document.getElementById('card-preview');

            const startDrag = (clientX, clientY, ev) => {
                const hit = findDecorAt(canvas, clientX, clientY);
                if (hit) {
                    decorDragInfo = hit;
                    canvas.style.cursor = 'grabbing';
                    ev.preventDefault();
                }
            };

            const moveDrag = (clientX, clientY) => {
                if (!decorDragInfo) return;
                const dims = getCardCssDims(canvas);
                if (dims.cardW <= 0 || dims.cardH <= 0) return;
                const nx = (clientX - dims.rect.left - dims.cardX) / dims.cardW;
                const ny = (clientY - dims.rect.top - dims.cardY) / dims.cardH;
                const p = decorPositions[decorDragInfo.type] && decorPositions[decorDragInfo.type][decorDragInfo.idx];
                if (p) {
                    p.nx = Math.max(0.02, Math.min(0.98, nx));
                    p.ny = Math.max(0.02, Math.min(0.98, ny));
                    drawCard();
                }
            };

            const endDrag = () => {
                if (decorDragInfo) {
                    decorDragInfo = null;
                    canvas.style.cursor = '';
                }
            };

            canvas.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY, e));
            canvas.addEventListener('mousemove', (e) => {
                if (decorDragInfo) {
                    moveDrag(e.clientX, e.clientY);
                } else {
                    // Hover feedback
                    const hit = findDecorAt(canvas, e.clientX, e.clientY);
                    canvas.style.cursor = hit ? 'grab' : '';
                }
            });
            window.addEventListener('mouseup', endDrag);
            canvas.addEventListener('mouseleave', () => {
                if (!decorDragInfo) canvas.style.cursor = '';
            });

            // Touch support
            canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                const t = e.touches[0];
                startDrag(t.clientX, t.clientY, e);
            }, { passive: false });
            canvas.addEventListener('touchmove', (e) => {
                if (!decorDragInfo || e.touches.length !== 1) return;
                e.preventDefault();
                const t = e.touches[0];
                moveDrag(t.clientX, t.clientY);
            }, { passive: false });
            canvas.addEventListener('touchend', endDrag);
            canvas.addEventListener('touchcancel', endDrag);
        }

        function getDecorAbsPositions(type, count, cardX, cardY, cardW, cardH, scale) {
            ensureDecorPositions(type, count);
            const dt = DECOR_TYPES[type];
            return decorPositions[type].map(p => ({
                x: cardX + p.nx * cardW,
                y: cardY + p.ny * cardH,
                size: (5 + p.nsize * 10) * scale,
                rotation: p.rotation,
            }));
        }

        function drawDecor(context, cardX, cardY, cardW, cardH, scale) {
            Object.entries(decorState).forEach(([type, count]) => {
                if (!count) return;
                const positions = getDecorAbsPositions(type, count, cardX, cardY, cardW, cardH, scale);

                switch (type) {
                    case 'flag':
                        positions.slice(0, count).forEach(p => {
                            const flagW = 44 * scale;
                            const flagH = 28 * scale;
                            context.save();
                            context.shadowColor = 'rgba(0,0,0,0.15)';
                            context.shadowBlur = 4 * scale;
                            context.shadowOffsetY = 2 * scale;
                            context.beginPath();
                            context.roundRect(p.x - flagW/2, p.y - flagH/2, flagW, flagH, 4 * scale);
                            context.fillStyle = '#fff';
                            context.fill();
                            context.shadowColor = 'transparent';
                            context.beginPath();
                            context.roundRect(p.x - flagW/2, p.y, flagW, flagH/2, [0, 0, 4 * scale, 4 * scale]);
                            context.fillStyle = '#DC143C';
                            context.fill();
                            context.restore();
                        });
                        break;
                    case 'stars':
                        positions.forEach(p => drawSparkle(context, p.x, p.y, p.size, p.rotation));
                        break;
                    case 'fire':
                        positions.forEach(p => drawFire(context, p.x, p.y, p.size));
                        break;
                    case 'hearts':
                        positions.forEach(p => drawHeart(context, p.x, p.y, p.size, '#FF6B9D'));
                        break;
                    case 'confetti':
                        const confettiColors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181', '#AA96DA'];
                        positions.forEach((p, i) => drawConfettiPiece(context, p.x, p.y, p.size * 0.6, confettiColors[i % confettiColors.length], p.rotation));
                        break;
                    case 'lightning':
                        positions.forEach(p => drawLightning(context, p.x, p.y, p.size));
                        break;
                    case 'snowflakes':
                        positions.forEach(p => drawSnowflake(context, p.x, p.y, p.size));
                        break;
                    case 'dots':
                        const dotColors = ['#4CAF50', '#81C784', '#2E7D32', '#A5D6A7', '#66BB6A', '#43A047'];
                        positions.forEach((p, i) => {
                            context.globalAlpha = 0.3 + (i % 3) * 0.15;
                            context.fillStyle = dotColors[i % dotColors.length];
                            context.beginPath();
                            context.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
                            context.fill();
                        });
                        context.globalAlpha = 1;
                        break;
                    case 'rings':
                        positions.forEach(p => drawRing(context, p.x, p.y, p.size));
                        break;
                    case 'leaves':
                        positions.forEach(p => drawLeaf(context, p.x, p.y, p.size, p.rotation));
                        break;
                    case 'diamonds':
                        positions.forEach(p => drawDiamond(context, p.x, p.y, p.size));
                        break;
                    case 'waves':
                        for (let i = 0; i < count; i++) {
                            drawWaves(context, cardX, cardY + cardH - (30 + i * 12) * scale, cardW, 20 * scale);
                        }
                        break;
                }
            });
        }

        // Draw sparkle/star shape
        function drawSparkle(context, x, y, size, rotation = 0) {
            context.save();
            context.translate(x, y);
            context.rotate(rotation * Math.PI / 180);

            // 4-point star
            const gradient = context.createRadialGradient(0, 0, 0, 0, 0, size);
            gradient.addColorStop(0, '#FFFFFF');
            gradient.addColorStop(0.3, '#FFE066');
            gradient.addColorStop(1, '#FFD700');
            context.fillStyle = gradient;

            context.beginPath();
            context.moveTo(0, -size);
            context.quadraticCurveTo(size * 0.15, -size * 0.15, size, 0);
            context.quadraticCurveTo(size * 0.15, size * 0.15, 0, size);
            context.quadraticCurveTo(-size * 0.15, size * 0.15, -size, 0);
            context.quadraticCurveTo(-size * 0.15, -size * 0.15, 0, -size);
            context.fill();

            context.restore();
        }

        // Draw fire flame
        function drawFire(context, x, y, size) {
            context.save();
            context.translate(x, y);

            // Outer flame (orange)
            const gradientOuter = context.createRadialGradient(0, size * 0.3, 0, 0, 0, size);
            gradientOuter.addColorStop(0, '#FFEB3B');
            gradientOuter.addColorStop(0.4, '#FF9800');
            gradientOuter.addColorStop(1, '#F44336');
            context.fillStyle = gradientOuter;

            context.beginPath();
            context.moveTo(0, -size);
            context.bezierCurveTo(size * 0.5, -size * 0.5, size * 0.6, size * 0.2, size * 0.3, size * 0.5);
            context.quadraticCurveTo(0, size * 0.3, -size * 0.3, size * 0.5);
            context.bezierCurveTo(-size * 0.6, size * 0.2, -size * 0.5, -size * 0.5, 0, -size);
            context.fill();

            // Inner flame (yellow)
            const gradientInner = context.createRadialGradient(0, size * 0.2, 0, 0, 0, size * 0.5);
            gradientInner.addColorStop(0, '#FFFFFF');
            gradientInner.addColorStop(0.5, '#FFEB3B');
            gradientInner.addColorStop(1, '#FF9800');
            context.fillStyle = gradientInner;

            context.beginPath();
            context.moveTo(0, -size * 0.5);
            context.bezierCurveTo(size * 0.25, -size * 0.2, size * 0.3, size * 0.1, size * 0.15, size * 0.3);
            context.quadraticCurveTo(0, size * 0.15, -size * 0.15, size * 0.3);
            context.bezierCurveTo(-size * 0.3, size * 0.1, -size * 0.25, -size * 0.2, 0, -size * 0.5);
            context.fill();

            context.restore();
        }

        // Draw heart shape
        function drawHeart(context, x, y, size, color) {
            context.save();
            context.translate(x, y);

            const gradient = context.createRadialGradient(0, -size * 0.2, 0, 0, 0, size * 1.2);
            gradient.addColorStop(0, '#FFB6C1');
            gradient.addColorStop(0.5, color);
            gradient.addColorStop(1, '#FF1493');
            context.fillStyle = gradient;

            context.beginPath();
            context.moveTo(0, size * 0.3);
            context.bezierCurveTo(-size, -size * 0.3, -size * 0.5, -size, 0, -size * 0.5);
            context.bezierCurveTo(size * 0.5, -size, size, -size * 0.3, 0, size * 0.3);
            context.fill();

            // Shine
            context.fillStyle = 'rgba(255,255,255,0.4)';
            context.beginPath();
            context.ellipse(-size * 0.3, -size * 0.4, size * 0.15, size * 0.1, -30 * Math.PI / 180, 0, Math.PI * 2);
            context.fill();

            context.restore();
        }

        // Draw confetti piece
        function drawConfettiPiece(context, x, y, size, color, rotation) {
            context.save();
            context.translate(x, y);
            context.rotate(rotation * Math.PI / 180);
            context.fillStyle = color;

            // Random shape: rectangle, circle, or triangle
            const shape = Math.floor(rotation) % 3;
            if (shape === 0) {
                context.fillRect(-size/2, -size/4, size, size/2);
            } else if (shape === 1) {
                context.beginPath();
                context.arc(0, 0, size/2, 0, Math.PI * 2);
                context.fill();
            } else {
                context.beginPath();
                context.moveTo(0, -size/2);
                context.lineTo(size/2, size/2);
                context.lineTo(-size/2, size/2);
                context.closePath();
                context.fill();
            }

            context.restore();
        }

        // Draw lightning bolt
        function drawLightning(context, x, y, size) {
            context.save();
            context.translate(x, y);

            const gradient = context.createLinearGradient(0, -size, 0, size);
            gradient.addColorStop(0, '#FFEB3B');
            gradient.addColorStop(1, '#FFC107');
            context.fillStyle = gradient;

            context.beginPath();
            context.moveTo(size * 0.1, -size);
            context.lineTo(size * 0.4, -size);
            context.lineTo(size * 0.05, -size * 0.1);
            context.lineTo(size * 0.35, -size * 0.1);
            context.lineTo(-size * 0.2, size);
            context.lineTo(size * 0.05, size * 0.05);
            context.lineTo(-size * 0.25, size * 0.05);
            context.closePath();
            context.fill();

            // Glow
            context.shadowColor = '#FFEB3B';
            context.shadowBlur = size * 0.3;
            context.fill();
            context.shadowColor = 'transparent';

            context.restore();
        }

        // Draw snowflake
        function drawSnowflake(context, x, y, size) {
            context.save();
            context.translate(x, y);
            context.strokeStyle = '#90CAF9';
            context.lineWidth = size * 0.12;
            context.lineCap = 'round';

            for (let i = 0; i < 6; i++) {
                context.save();
                context.rotate((i * 60) * Math.PI / 180);
                // Main arm
                context.beginPath();
                context.moveTo(0, 0);
                context.lineTo(0, -size);
                context.stroke();
                // Branch left
                context.beginPath();
                context.moveTo(0, -size * 0.55);
                context.lineTo(-size * 0.3, -size * 0.8);
                context.stroke();
                // Branch right
                context.beginPath();
                context.moveTo(0, -size * 0.55);
                context.lineTo(size * 0.3, -size * 0.8);
                context.stroke();
                context.restore();
            }

            // Center dot
            context.fillStyle = '#BBDEFB';
            context.beginPath();
            context.arc(0, 0, size * 0.12, 0, Math.PI * 2);
            context.fill();

            context.restore();
        }

        // Draw ring/circle decoration
        function drawRing(context, x, y, size) {
            context.save();
            context.translate(x, y);

            // Outer ring
            context.strokeStyle = '#FFD700';
            context.lineWidth = size * 0.15;
            context.globalAlpha = 0.6;
            context.beginPath();
            context.arc(0, 0, size, 0, Math.PI * 2);
            context.stroke();

            // Inner ring
            context.strokeStyle = '#FFF176';
            context.lineWidth = size * 0.08;
            context.globalAlpha = 0.4;
            context.beginPath();
            context.arc(0, 0, size * 0.6, 0, Math.PI * 2);
            context.stroke();

            // Center sparkle
            context.globalAlpha = 0.8;
            context.fillStyle = '#FFD700';
            context.beginPath();
            context.arc(0, 0, size * 0.15, 0, Math.PI * 2);
            context.fill();

            context.globalAlpha = 1;
            context.restore();
        }

        // Draw leaf
        function drawLeaf(context, x, y, size, rotation) {
            context.save();
            context.translate(x, y);
            context.rotate(rotation * Math.PI / 180);

            const gradient = context.createRadialGradient(0, 0, 0, 0, 0, size);
            gradient.addColorStop(0, '#81C784');
            gradient.addColorStop(1, '#388E3C');
            context.fillStyle = gradient;

            context.beginPath();
            context.moveTo(0, -size);
            context.bezierCurveTo(size * 0.6, -size * 0.6, size * 0.5, size * 0.3, 0, size * 0.5);
            context.bezierCurveTo(-size * 0.5, size * 0.3, -size * 0.6, -size * 0.6, 0, -size);
            context.fill();

            // Vein
            context.strokeStyle = 'rgba(255,255,255,0.35)';
            context.lineWidth = size * 0.06;
            context.beginPath();
            context.moveTo(0, -size * 0.8);
            context.lineTo(0, size * 0.35);
            context.stroke();

            context.restore();
        }

        // Draw diamond
        function drawDiamond(context, x, y, size) {
            context.save();
            context.translate(x, y);

            const gradient = context.createLinearGradient(-size, -size, size, size);
            gradient.addColorStop(0, '#E1F5FE');
            gradient.addColorStop(0.3, '#4FC3F7');
            gradient.addColorStop(0.6, '#0288D1');
            gradient.addColorStop(1, '#B3E5FC');
            context.fillStyle = gradient;

            // Diamond shape
            context.beginPath();
            context.moveTo(0, -size);
            context.lineTo(size * 0.7, 0);
            context.lineTo(0, size);
            context.lineTo(-size * 0.7, 0);
            context.closePath();
            context.fill();

            // Shine line
            context.strokeStyle = 'rgba(255,255,255,0.5)';
            context.lineWidth = size * 0.08;
            context.beginPath();
            context.moveTo(-size * 0.3, -size * 0.4);
            context.lineTo(size * 0.1, -size * 0.1);
            context.stroke();

            context.restore();
        }

        // Draw waves at bottom of card
        function drawWaves(context, x, y, width, height) {
            context.save();
            context.globalAlpha = 0.15;

            const colors = ['#4CAF50', '#81C784', '#2E7D32'];
            for (let w = 0; w < 3; w++) {
                context.fillStyle = colors[w];
                context.beginPath();
                context.moveTo(x, y + w * height * 0.3);

                const segments = 8;
                const segW = width / segments;
                for (let i = 0; i <= segments; i++) {
                    const sx = x + i * segW;
                    const sy = y + w * height * 0.3 + Math.sin(i * 0.8 + w * 1.2) * height * 0.4;
                    if (i === 0) context.moveTo(sx, sy);
                    else context.lineTo(sx, sy);
                }

                context.lineTo(x + width, y + height);
                context.lineTo(x, y + height);
                context.closePath();
                context.fill();
            }

            context.globalAlpha = 1;
            context.restore();
        }


        // Split text into lines

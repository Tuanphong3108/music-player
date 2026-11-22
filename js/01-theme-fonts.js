        let customPipWindow = null;

        // --- HỆ THỐNG MÃ MÀU ACCENT M3 THEO CHỦ ĐỀ SÁNG/TỐI (10 MÀU) ---
        const accents = {
            purple: {
                dark: { 
                    primary: '#D0BCFF', onPrimary: '#381E72', primaryContainer: '#4F378B', onPrimaryContainer: '#EADDFF', secondaryContainer: '#332D41',
                    surface: '#1C1B1F', onSurface: '#E6E1E5', surfaceVariant: '#49454F', onSurfaceVariant: '#CAC4D0', outline: '#938F99',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #2b1d42 0%, #1c1b1f 60%, #000 100%)'
                },
                light: { 
                    primary: '#6750A4', onPrimary: '#FFFFFF', primaryContainer: '#EADDFF', onPrimaryContainer: '#21005D', secondaryContainer: '#E8DEF8',
                    surface: '#FEF7FF', onSurface: '#1D1B20', surfaceVariant: '#E7E0EB', onSurfaceVariant: '#49454F', outline: '#79747E',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #eaddff 0%, #fef7ff 60%, #fff 100%)'
                }
            },
            lime: {
                dark: { 
                    primary: '#B9F147', onPrimary: '#2B3900', primaryContainer: '#3F5200', onPrimaryContainer: '#D4FF77', secondaryContainer: '#434A35',
                    surface: '#12140E', onSurface: '#E3E3DC', surfaceVariant: '#45483F', onSurfaceVariant: '#C5C8BC', outline: '#8F9287',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #1c2409 0%, #12140e 60%, #000 100%)'
                },
                light: { 
                    primary: '#506700', onPrimary: '#FFFFFF', primaryContainer: '#C6FA59', onPrimaryContainer: '#161F00', secondaryContainer: '#E3EAD2',
                    surface: '#FDFCF4', onSurface: '#1A1C16', surfaceVariant: '#E1E4D5', onSurfaceVariant: '#45483F', outline: '#75796C',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #e2f4be 0%, #fdfcf4 60%, #fff 100%)'
                }
            },
            cyan: {
                dark: { 
                    primary: '#80E8FF', onPrimary: '#003541', primaryContainer: '#004F5D', onPrimaryContainer: '#C4F3FF', secondaryContainer: '#344B50',
                    surface: '#0E1416', onSurface: '#E0E3E3', surfaceVariant: '#3F484B', onSurfaceVariant: '#BFC8CA', outline: '#899294',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #092128 0%, #0e1416 60%, #000 100%)'
                },
                light: { 
                    primary: '#00687A', onPrimary: '#FFFFFF', primaryContainer: '#C4F3FF', onPrimaryContainer: '#001F26', secondaryContainer: '#D5E5E9',
                    surface: '#F4FAFB', onSurface: '#161D1E', surfaceVariant: '#DAE4E6', onSurfaceVariant: '#3F484B', outline: '#6F797B',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #bee8f3 0%, #f4fafb 60%, #fff 100%)'
                }
            },
            white: {
                dark: { 
                    primary: '#E6E1E5', onPrimary: '#313033', primaryContainer: '#48474A', onPrimaryContainer: '#F4EFF4', secondaryContainer: '#414043',
                    surface: '#161616', onSurface: '#EEEEEE', surfaceVariant: '#404040', onSurfaceVariant: '#CCCCCC', outline: '#888888',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #2c2c2c 0%, #161616 60%, #000 100%)'
                },
                light: { 
                    primary: '#605D62', onPrimary: '#FFFFFF', primaryContainer: '#E6E1E5', onPrimaryContainer: '#1C1B1F', secondaryContainer: '#E7E2E6',
                    surface: '#FAFAFA', onSurface: '#111111', surfaceVariant: '#E0E0E0', onSurfaceVariant: '#404040', outline: '#777777',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #e8e8e8 0%, #fafafa 60%, #fff 100%)'
                }
            },
            green: {
                dark: { 
                    primary: '#79DD97', onPrimary: '#00391B', primaryContainer: '#00522A', onPrimaryContainer: '#96FABA', secondaryContainer: '#324E3C',
                    surface: '#0E1611', onSurface: '#DFE4E0', surfaceVariant: '#3E4941', onSurfaceVariant: '#BEC9BF', outline: '#89938B',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #092615 0%, #0e1611 60%, #000 100%)'
                },
                light: { 
                    primary: '#006D3B', onPrimary: '#FFFFFF', primaryContainer: '#96FABA', onPrimaryContainer: '#00210E', secondaryContainer: '#D4E8DC',
                    surface: '#F4FAF5', onSurface: '#161D18', surfaceVariant: '#DAE5DD', onSurfaceVariant: '#3E4941', outline: '#6E7971',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #bdf3d5 0%, #f4faf5 60%, #fff 100%)'
                }
            },
            blue: {
                dark: { 
                    primary: '#A4C9FE', onPrimary: '#00315D', primaryContainer: '#004784', onPrimaryContainer: '#D4E3FF', secondaryContainer: '#35485E',
                    surface: '#0E1216', onSurface: '#DFE2E6', surfaceVariant: '#3E474F', onSurfaceVariant: '#BEC7D0', outline: '#89919A',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #091a2b 0%, #0e1216 60%, #000 100%)'
                },
                light: { 
                    primary: '#005FAF', onPrimary: '#FFFFFF', primaryContainer: '#D4E3FF', onPrimaryContainer: '#001C3A', secondaryContainer: '#DCE2E9',
                    surface: '#F4F8FA', onSurface: '#161B1E', surfaceVariant: '#DAE2E7', onSurfaceVariant: '#3E474F', outline: '#6E7780',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #bddcf3 0%, #f4f8fa 60%, #fff 100%)'
                }
            },
            yellow: {
                dark: { 
                    primary: '#E7C349', onPrimary: '#3C2F00', primaryContainer: '#564500', onPrimaryContainer: '#FFE17B', secondaryContainer: '#4B4637',
                    surface: '#15140E', onSurface: '#E5E2DA', surfaceVariant: '#48463E', onSurfaceVariant: '#CAC6BA', outline: '#949185',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #252009 0%, #15140e 60%, #000 100%)'
                },
                light: { 
                    primary: '#725C00', onPrimary: '#FFFFFF', primaryContainer: '#FFE17B', onPrimaryContainer: '#241A00', secondaryContainer: '#E8E2D0',
                    surface: '#FCFAF3', onSurface: '#1D1C16', surfaceVariant: '#E8E2D2', onSurfaceVariant: '#48463E', outline: '#79776E',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #f4eea7 0%, #fcfaf3 60%, #fff 100%)'
                }
            },
            orange: {
                dark: { 
                    primary: '#FFB68D', onPrimary: '#532200', primaryContainer: '#763300', onPrimaryContainer: '#FFDBC9', secondaryContainer: '#544137',
                    surface: '#16120E', onSurface: '#E6E1DC', surfaceVariant: '#4E443F', onSurfaceVariant: '#D1C3BD', outline: '#9B8E88',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #2b1609 0%, #16120e 60%, #000 100%)'
                },
                light: { 
                    primary: '#9B4500', onPrimary: '#FFFFFF', primaryContainer: '#FFDBC9', onPrimaryContainer: '#331200', secondaryContainer: '#F7DFD4',
                    surface: '#FCF8F5', onSurface: '#201A16', surfaceVariant: '#F3DFD6', onSurfaceVariant: '#4E443F', outline: '#81746E',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #f7dfbe 0%, #fcf8f5 60%, #fff 100%)'
                }
            },
            red: {
                dark: { 
                    primary: '#FFB4A9', onPrimary: '#690005', primaryContainer: '#93000A', onPrimaryContainer: '#FFDAD6', secondaryContainer: '#583E3B',
                    surface: '#160E0E', onSurface: '#E6DAD8', surfaceVariant: '#4E3E3C', onSurfaceVariant: '#D1BEBC', outline: '#9B8987',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #2b0909 0%, #160e0e 60%, #000 100%)'
                },
                light: { 
                    primary: '#BA1A1A', onPrimary: '#FFFFFF', primaryContainer: '#FFDAD6', onPrimaryContainer: '#410002', secondaryContainer: '#F9DDD9',
                    surface: '#FCF5F5', onSurface: '#201615', surfaceVariant: '#F4DAD7', onSurfaceVariant: '#4E3E3C', outline: '#817371',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #f7bebe 0%, #fcf5f5 60%, #fff 100%)'
                }
            },
            pink: {
                dark: { 
                    primary: '#FFB1C8', onPrimary: '#5E112F', primaryContainer: '#7C2945', onPrimaryContainer: '#FFD9E2', secondaryContainer: '#563F44',
                    surface: '#160E11', onSurface: '#E6DAE0', surfaceVariant: '#4E3F43', onSurfaceVariant: '#D1BEC4', outline: '#9B898F',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #2b0918 0%, #160e11 60%, #000 100%)'
                },
                light: { 
                    primary: '#9C4060', onPrimary: '#FFFFFF', primaryContainer: '#FFD9E2', onPrimaryContainer: '#3E001D', secondaryContainer: '#F2DDE2',
                    surface: '#FCF5F8', onSurface: '#201619', surfaceVariant: '#F4DAE2', onSurfaceVariant: '#4E3F43', outline: '#817376',
                    ambientGradient: 'radial-gradient(circle at 80% 20%, #f7bed7 0%, #fcf5f8 60%, #fff 100%)'
                }
            }
        };

        // --- HIỆU NĂNG & HIỆU ỨNG ---
        const PERF_PRESETS = {
            default:  { motion: true,  glass: true,  albumBlur: true,  visualizer: true  },
            balanced: { motion: true,  glass: false, albumBlur: true,  visualizer: true  },
            low:      { motion: false, glass: false, albumBlur: false, visualizer: true  },
            max:      { motion: false, glass: false, albumBlur: false, visualizer: false }
        };
        function loadPerf() {
            try {
                const raw = localStorage.getItem('settings_perf');
                if (raw) { const o = JSON.parse(raw), r = {}; for (const k of Object.keys(PERF_PRESETS.default)) r[k] = o[k] !== undefined ? !!o[k] : PERF_PRESETS.default[k]; return r; }
            } catch (e) {}
            // Chuyển từ 2 công tắc cũ: "Nâng cao" = Hiệu năng tối đa; "Giảm chuyển động" = tắt riêng chuyển động
            if (localStorage.getItem('settings_reduce_effects') === 'true') return Object.assign({}, PERF_PRESETS.max);
            if (localStorage.getItem('settings_reduce_motion') === 'true') return Object.assign({}, PERF_PRESETS.default, { motion: false });
            // Máy yếu (RAM ≤ 4GB hoặc ít nhân CPU) và chưa từng chỉnh: mặc định tắt kính mờ cho nhẹ; người dùng vẫn đổi lại được trong Cài đặt
            try {
                const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
                if ((mem && mem <= 4) || (cores && cores <= 4)) return Object.assign({}, PERF_PRESETS.balanced);
            } catch (e) {}
            return Object.assign({}, PERF_PRESETS.default);
        }
        function perfPresetOf(p) {
            for (const [name, v] of Object.entries(PERF_PRESETS)) if (Object.keys(v).every(k => !!p[k] === v[k])) return name;
            return 'custom';
        }

        // --- CẤU HÌNH BAN ĐẦU HỆ THỐNG ---
        let settings = {
            showMainLyric: localStorage.getItem('settings_show_main_lyric') !== 'false',
            showPipLyric: localStorage.getItem('settings_show_pip_lyric') !== 'false',
            showFsLyric: localStorage.getItem('settings_show_fs_lyric') !== 'false',
            perf: loadPerf(),   // Hiệu năng & hiệu ứng: bật/tắt từng thành phần
            wakeLockEnabled: localStorage.getItem('settings_wake_lock') !== 'false', // Mặc định ON
            theme: localStorage.getItem('settings_theme') || 'dark',
            accent: localStorage.getItem('settings_accent') || (window.IS_ANDROID_APP ? 'system' : 'purple'),
            dynamicAccent: localStorage.getItem('settings_dynamic_accent') !== 'false' // Mặc định ON
        };


        // ===== Kích thước giao diện + Phông chữ =====
        const tF = (k, f) => (typeof currentLangDict !== 'undefined' && currentLangDict[k]) || f;
        const BUILTIN_FONTS = [
            ['Arial','sans-serif','system','Helvetica, '],['Segoe UI','sans-serif','system','system-ui, '],
            ['Roboto','sans-serif'],['Open Sans','sans-serif'],['Noto Sans','sans-serif'],['Inter','sans-serif'],
            ['Montserrat','sans-serif'],['Nunito','sans-serif'],['Quicksand','sans-serif'],['Be Vietnam Pro','sans-serif'],
            ['Lexend','sans-serif'],['Raleway','sans-serif'],['Source Sans 3','sans-serif'],['Work Sans','sans-serif'],
            ['Space Grotesk','sans-serif'],['Comfortaa','sans-serif'],['Times New Roman','serif','system','Times, '],['Roboto Slab','serif'],['Noto Serif','serif'],
            ['Lora','serif'],['Merriweather','serif'],['Playfair Display','serif'],['Dancing Script','cursive'],
            ['Roboto Mono','monospace'],['JetBrains Mono','monospace']
        ].map(f => ({ name: f[0], kind: 'builtin', generic: f[1], system: f[2] === 'system', fb: f[3] || '' }));

        // Danh sách phông chữ (có thứ tự) lưu trong localStorage; phông "file" tải lên lưu blob trong IndexedDB
        function loadFontEntries() {
            try {
                const arr = JSON.parse(localStorage.getItem('settings_font_entries'));
                if (Array.isArray(arr) && arr.every(e => e && typeof e.name === 'string' && e.kind)) {
                    // Phông mặc định không xoá được -> luôn đảm bảo đủ (bổ sung phông mặc định mới ở bản cập nhật)
                    BUILTIN_FONTS.forEach((b, bi) => {
                        if (arr.some(e => e.name.toLowerCase() === b.name.toLowerCase())) return;
                        let at = 0;
                        for (let k = bi - 1; k >= 0; k--) { const j = arr.findIndex(e => e.name === BUILTIN_FONTS[k].name); if (j >= 0) { at = j + 1; break; } }
                        arr.splice(at, 0, Object.assign({}, b));
                    });
                    return arr;
                }
            } catch (e) {}
            return BUILTIN_FONTS.map(f => Object.assign({}, f));
        }
        let fontEntries = loadFontEntries();
        function saveFontEntries() { try { localStorage.setItem('settings_font_entries', JSON.stringify(fontEntries)); } catch (e) {} }
        const fontKey = n => String(n).trim().toLowerCase();
        const cleanFontName = n => String(n || '').replace(/['"\\<>{};]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
        function findEntry(name) { return fontEntries.find(e => fontKey(e.name) === fontKey(name)); }
        const famOf = e => (e && (e.family || e.name)) || '';   // tên font-family thật (tên hiển thị có thể được đổi)
        const fontBlobUrls = {};   // font-family của phông "file" -> blob URL (tạo lúc khởi động)

        function fontStack(name) {
            const f = findEntry(name);
            if (!f) return "'Google Sans Flex', sans-serif";
            const def = BUILTIN_FONTS.find(b => b.name === f.name);
            return `'${famOf(f)}', ${f.system ? ((def && def.fb) || '') : ''}'Google Sans Flex', ${f.generic || 'sans-serif'}`;
        }
        // Kiểm tra phông đã cài sẵn trong máy chưa (so độ rộng chữ với phông dự phòng mặc định)
        const _localFontCache = {};
        function fontIsLocal(name) {
            if (name in _localFontCache) return _localFontCache[name];
            let found = false;
            try {
                const ctx = document.createElement('canvas').getContext('2d');
                const sample = 'mmmmmmmmmmlliWÀỆẶ0123456789';
                found = ['monospace', 'serif', 'sans-serif'].some(base => {
                    ctx.font = `72px ${base}`; const w0 = ctx.measureText(sample).width;
                    ctx.font = `72px '${name}', ${base}`; return ctx.measureText(sample).width !== w0;
                });
            } catch (e) {}
            return (_localFontCache[name] = found);
        }
        function fontHref(name) {
            return `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
        }
        // Link CSS cần tải cho 1 phông (null nếu có sẵn trong máy / phông hệ thống / phông "file")
        function entryHref(e) {
            if (!e) return null;
            if (e.kind === 'builtin') return (e.system || fontIsLocal(e.name)) ? null : fontHref(e.name);
            if (e.kind === 'google') return fontIsLocal(famOf(e)) ? null : e.href;
            if (e.kind === 'css') return e.href;
            return null;
        }
        // CSS @font-face cho phông nạp từ tệp (liên kết trực tiếp / tải lên)
        function entryFaceCss(e) {
            if (!e) return '';
            const src = e.kind === 'url' ? e.src : (e.kind === 'file' ? fontBlobUrls[famOf(e)] : null);
            return src ? `@font-face{font-family:'${famOf(e)}';src:url("${src}");font-display:swap}` : '';
        }
        function selectedFontName() {
            const n = localStorage.getItem('settings_font') || 'default';
            return findEntry(n) ? findEntry(n).name : 'default';
        }
        function fontPayload() {
            const name = selectedFontName();
            const e = name === 'default' ? null : findEntry(name);
            return { name, stack: fontStack(name), href: entryHref(e), faceCss: entryFaceCss(e) };
        }
        const slugF = s => String(s).replace(/[^a-z0-9]+/gi, '-');
        function loadFontIntoDoc(doc, e) {
            const href = entryHref(e);
            if (href) {
                const id = 'gfont-' + slugF(famOf(e));
                const existing = doc.getElementById(id);
                if (existing && existing.getAttribute('href') !== href) existing.setAttribute('href', href);
                if (!existing) {
                    const link = doc.createElement('link');
                    link.id = id; link.rel = 'stylesheet'; link.href = href;
                    if (e.kind === 'builtin') {
                        // Một số phông không có đủ các độ đậm -> thử lại chỉ với bản thường
                        link.onerror = () => { link.onerror = null; link.href = `https://fonts.googleapis.com/css2?family=${e.name.replace(/ /g, '+')}&display=swap`; };
                    }
                    doc.head.appendChild(link);
                }
            }
            const face = entryFaceCss(e);
            if (face) {
                const id = 'gface-' + slugF(famOf(e));
                let st = doc.getElementById(id);
                if (!st) { st = doc.createElement('style'); st.id = id; doc.head.appendChild(st); }
                if (st.textContent !== face) st.textContent = face;
            }
        }

        // --- Google Sans Flex: bo tròn (trục ROND) cho chữ in đậm và tiêu đề ---
        // Chỉ áp dụng khi đang dùng phông mặc định (không có class custom-font). Quét các luật CSS có font-weight >= 600
        // và thêm font-variation-settings tương ứng, nên chữ đậm tạo bằng bất kỳ class/inline style nào cũng được bo tròn.
        function applyRoundedBold(doc) {
            try {
                if (!doc || doc.__roundedBold) return;
                doc.__roundedBold = true;
                const sels = new Set(['h1','h2','h3','h4','h5','h6','b','strong','th','[slot="headline"]',
                    '[style*="font-weight: 6"]','[style*="font-weight:6"]','[style*="font-weight: 7"]','[style*="font-weight:7"]',
                    '[style*="font-weight: 8"]','[style*="font-weight:8"]','[style*="font-weight: 9"]','[style*="font-weight:9"]',
                    '[style*="font-weight: bold"]','[style*="font-weight:bold"]']);
                const heavy = w => w === 'bold' || w === 'bolder' || (parseInt(w, 10) >= 600);
                const scan = rules => { for (const r of rules) {
                    if (r.cssRules && !r.selectorText) { scan(r.cssRules); continue; }
                    if (r.style && r.selectorText && heavy(r.style.fontWeight)) r.selectorText.split(',').forEach(x => { x = x.trim(); if (x && !/::?(before|after|placeholder)/.test(x)) sels.add(x); });
                } };
                for (const sh of doc.styleSheets) { try { scan(sh.cssRules); } catch (e) {} }
                const st = doc.createElement('style');
                st.textContent = [...sels].map(x => ':root:not(.custom-font) ' + x).join(',\n') + ' { font-variation-settings: "ROND" 100; }';
                doc.head.appendChild(st);
            } catch (e) { console.warn('rounded bold:', e); }
        }
        function applyFontToDoc(doc) {
            if (!doc || !doc.documentElement) return;
            const name = selectedFontName();
            doc.documentElement.classList.toggle('custom-font', name !== 'default');
            applyRoundedBold(doc);
            if (name !== 'default') loadFontIntoDoc(doc, findEntry(name));
            doc.documentElement.style.setProperty('--app-font', fontStack(name));
        }
        function applyFontEverywhere() {
            applyFontToDoc(document);
            try { if (customPipWindow) applyFontToDoc(customPipWindow.document); } catch (e) {}
            try { if (typeof sendThemeToChangelog === 'function' && typeof clLoaded !== 'undefined' && clLoaded) sendThemeToChangelog(); } catch (e) {}
        }
        // Cỡ chữ cuối cùng = cỡ gốc x % thanh trượt "Cỡ chữ". Vì cả trang đang bị zoom theo
        // "Kích thước giao diện", hệ số áp dụng trong trang chính / iframe = fontPct / uiPct;
        // riêng cửa sổ PiP không bị zoom nên dùng thẳng fontPct.
        function getFontScaleState() {
            let uiPct = parseInt(localStorage.getItem('settings_ui_scale'), 10);
            if (!(uiPct >= 50 && uiPct <= 200)) uiPct = 100;
            let fontPct;
            if (localStorage.getItem('settings_font_scale_sync') !== 'false') fontPct = uiPct;
            else {
                fontPct = parseInt(localStorage.getItem('settings_font_scale'), 10);
                if (!(fontPct >= 50 && fontPct <= 200)) fontPct = 100;
            }
            return { ui: uiPct / 100, font: fontPct / 100, factor: fontPct / uiPct };
        }
        function updateFontScaleFactor() {
            const st = getFontScaleState();
            const root = document.documentElement;
            root.style.setProperty('--font-scale', String(st.font));
            root.style.setProperty('--font-scale-factor', String(st.factor));
            // PiP (không zoom)
            try {
                if (typeof customPipWindow !== 'undefined' && customPipWindow && customPipWindow.document) {
                    customPipWindow.document.documentElement.style.setProperty('--font-scale-factor', String(st.font));
                }
            } catch (e) {}
            // Metadata Editor (iframe srcdoc cùng origin, nằm trong vùng zoom của trang chính)
            try {
                const mi = document.getElementById('metadata-iframe');
                if (mi && mi.contentDocument && mi.contentDocument.documentElement) mi.contentDocument.documentElement.style.setProperty('--font-scale-factor', String(st.factor));
            } catch (e) {}
            // About / Changelog
            try {
                const ci = document.querySelector('.st-pane-about .cl-iframe');
                if (ci && ci.contentWindow) ci.contentWindow.postMessage({ fontScale: st.factor }, '*');
            } catch (e) {}
        }
        function applyUiScale(pct) {
            let uiPct = parseInt(pct, 10);
            if (!(uiPct >= 50 && uiPct <= 200)) uiPct = 100;
            document.documentElement.style.setProperty('--ui-scale', String(uiPct / 100));
            updateFontScaleFactor();
        }
        function applyFontScale(pct) {
            let fontPct = parseInt(pct, 10);
            if (!(fontPct >= 50 && fontPct <= 200)) fontPct = 100;
            document.documentElement.style.setProperty('--font-scale', String(fontPct / 100));
            updateFontScaleFactor();
        }
        {
            let uiPct = parseInt(localStorage.getItem('settings_ui_scale'), 10);
            if (!(uiPct >= 50 && uiPct <= 200)) uiPct = 100;
            let fontPct = parseInt(localStorage.getItem('settings_font_scale'), 10);
            if (!(fontPct >= 50 && fontPct <= 200)) fontPct = 100;
            applyUiScale(uiPct);
            applyFontScale(fontPct);
            applyFontEverywhere();
        }

        // ===== Ctrl + cuộn chuột: chỉnh Kích thước giao diện (giống Settings > Kích thước giao diện) =====
        let uiWheelAcc = 0, uiWheelTimer = 0;
        window.__uiScaleWheel = function (e) {
            uiWheelAcc += e.deltaY;
            clearTimeout(uiWheelTimer);
            uiWheelTimer = setTimeout(() => { uiWheelAcc = 0; }, 200);
            // chuột: mỗi nấc ~100 -> 1 bước; touchpad/pinch gửi delta nhỏ nên cộng dồn
            const steps = Math.trunc(Math.abs(uiWheelAcc) / 40);
            if (!steps) return;
            const dir = uiWheelAcc < 0 ? 1 : -1;      // cuộn lên = phóng to
            uiWheelAcc = 0;
            let cur = parseInt(localStorage.getItem('settings_ui_scale'), 10);
            if (!(cur >= 50 && cur <= 200)) cur = 100;
            const next = Math.max(50, Math.min(200, cur + dir * 5 * Math.min(steps, 3)));
            if (next === cur) return;
            localStorage.setItem('settings_ui_scale', String(next));
            const sl = document.getElementById('setting-ui-scale'), lb = document.getElementById('ui-scale-value');
            if (sl) sl.value = next;
            if (lb) lb.textContent = next + '%';
            applyUiScale(next);
            if (localStorage.getItem('settings_font_scale_sync') !== 'false') {
                localStorage.setItem('settings_font_scale', String(next));
                const fsl = document.getElementById('setting-font-scale'), flb = document.getElementById('font-scale-value');
                if (fsl) fsl.value = next;
                if (flb) flb.textContent = next + '%';
                applyFontScale(next);
            }
            try { showToast((window.__tr && window.__tr('settings.ui_scale')) ? window.__tr('settings.ui_scale') + ': ' + next + '%' : 'Kích thước giao diện: ' + next + '%', 'zoom_in', 1200); } catch (e) {}
        };
        window.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();                 // chặn zoom của trình duyệt
            window.__uiScaleWheel(e);
        }, { passive: false });

        // ----- IndexedDB lưu tệp phông chữ tải lên -----
        function fontDB() {
            return new Promise((res, rej) => {
                const r = indexedDB.open('audioplayer_fonts', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('fonts');
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
        }
        async function fontIdb(mode, fn) {
            const db = await fontDB();
            return new Promise((res, rej) => {
                const tx = db.transaction('fonts', mode);
                const rq = fn(tx.objectStore('fonts'));
                tx.oncomplete = () => { db.close(); res(rq && rq.result); };
                tx.onerror = () => { db.close(); rej(tx.error); };
            });
        }
        async function restoreFileFonts() {
            let changed = false;
            for (const e of fontEntries) {
                if (e.kind !== 'file' || fontBlobUrls[famOf(e)]) continue;
                try {
                    const blob = await fontIdb('readonly', st => st.get(famOf(e)));
                    if (blob) { fontBlobUrls[famOf(e)] = URL.createObjectURL(blob); changed = true; }
                } catch (err) {}
            }
            if (changed) applyFontEverywhere();
        }
        restoreFileFonts();

        // ----- Phân tích mã nhúng Google Fonts: lấy danh sách phông + link riêng cho từng phông -----
        function parseGoogleEmbed(text) {
            const urls = [];
            const re = /href\s*=\s*["']([^"']*fonts\.googleapis\.com\/css[^"']*)["']/gi;
            let m;
            while ((m = re.exec(text))) urls.push(m[1].replace(/&amp;/g, '&'));
            if (!urls.length) {
                const t = String(text).trim();
                if (/^https:\/\/fonts\.googleapis\.com\/css/i.test(t)) urls.push(t);
            }
            const out = [];
            urls.forEach(u => {
                let url; try { url = new URL(u); } catch (e) { return; }
                const isV2 = /\/css2/.test(url.pathname);
                url.search.replace(/^\?/, '').split('&').forEach(item => {
                    if (!/^family=/i.test(item)) return;
                    const val = item.slice(7);
                    const parts = isV2 ? [val] : val.split('|');
                    parts.forEach(part => {
                        const rawName = part.split(':')[0];
                        const name = cleanFontName(decodeURIComponent(rawName.replace(/\+/g, ' ')));
                        if (!name || out.some(o => fontKey(o.name) === fontKey(name))) return;
                        out.push({ name, href: `https://fonts.googleapis.com/${isV2 ? 'css2' : 'css'}?family=${part}&display=swap` });
                    });
                });
            });
            return out;
        }
        async function fetchCssText(href) {
            const r = await fetch(href);
            if (!r.ok) throw new Error('http ' + r.status);
            return r.text();
        }
        class FontErr extends Error { constructor(key, fb) { super(key); this.key = key; this.fb = fb; } }

        async function importGoogle(text) {
            const parsed = parseGoogleEmbed(text);
            if (!parsed.length) throw new FontErr('font.err_no_link', 'Không tìm thấy liên kết Google Fonts hợp lệ trong mã bạn dán');
            // Phông đã có trong danh sách thì bỏ qua bước tải
            for (const p of parsed) {
                if (findEntry(p.name)) continue;
                try { await fetchCssText(p.href); }
                catch (e) { throw new FontErr('font.err_fetch', 'Không tải được phông chữ. Hãy kiểm tra liên kết và kết nối mạng'); }
            }
            return parsed.map(p => ({ name: p.name, family: p.name, kind: 'google', generic: 'sans-serif', href: p.href }));
        }
        async function importUrl(raw, nameInput) {
            let u;
            try { u = new URL(String(raw).trim()); } catch (e) {}
            if (!u || u.protocol !== 'https:') throw new FontErr('font.err_url', 'Liên kết không hợp lệ (cần bắt đầu bằng https://)');
            const path = u.pathname.toLowerCase();
            if (/\.(woff2?|ttf|otf)$/.test(path)) {
                const base = decodeURIComponent(u.pathname.split('/').pop().replace(/\.[^.]+$/, ''));
                const name = cleanFontName(nameInput || base);
                if (!name) throw new FontErr('font.err_no_family', 'Không tìm thấy tên phông chữ trong liên kết');
                if (findEntry(name)) throw new FontErr('font.err_exists', 'Đã có phông chữ tên này trong danh sách, hãy đặt tên khác');
                try { const f = new FontFace(name, `url("${u.href}")`); await f.load(); }
                catch (e) { throw new FontErr('font.err_fetch', 'Không tải được phông chữ. Hãy kiểm tra liên kết và kết nối mạng'); }
                return [{ name, family: name, kind: 'url', src: u.href }];
            }
            let css;
            try { css = await fetchCssText(u.href); }
            catch (e) { throw new FontErr('font.err_fetch', 'Không tải được phông chữ. Hãy kiểm tra liên kết và kết nối mạng'); }
            const names = [];
            const re = /font-family\s*:\s*(['"]?)([^;'"}]+)\1/gi;
            let m;
            while ((m = re.exec(css))) { const n = cleanFontName(m[2]); if (n && !names.some(x => fontKey(x) === fontKey(n))) names.push(n); }
            if (!names.length) throw new FontErr('font.err_no_family', 'Không tìm thấy tên phông chữ trong liên kết');
            return names.map(n => ({ name: n, family: n, kind: 'css', href: u.href }));
        }
        async function importFile(file, nameInput) {
            if (!file) throw new FontErr('font.err_no_file', 'Hãy chọn một tệp phông chữ');
            const name = cleanFontName(nameInput || file.name.replace(/\.[^.]+$/, ''));
            if (!name) throw new FontErr('font.err_no_family', 'Không tìm thấy tên phông chữ trong liên kết');
            if (findEntry(name)) throw new FontErr('font.err_exists', 'Đã có phông chữ tên này trong danh sách, hãy đặt tên khác');
            const buf = await file.arrayBuffer();
            try { const f = new FontFace(name, buf); await f.load(); }
            catch (e) { throw new FontErr('font.err_invalid_file', 'Tệp phông chữ không hợp lệ hoặc không đọc được'); }
            const blob = new Blob([buf], { type: file.type || 'font/ttf' });
            try { await fontIdb('readwrite', st => st.put(blob, name)); } catch (e) {}
            fontBlobUrls[name] = URL.createObjectURL(blob);
            return [{ name, family: name, kind: 'file' }];
        }

        // ----- Thêm vào danh sách / chọn / xoá / sắp xếp -----
        function selectFont(name) {
            localStorage.setItem('settings_font', name);
            syncFontSelect();   // chỉ cập nhật lựa chọn, KHÔNG dựng lại danh sách (dựng lại khi menu đang đóng làm ô chọn bị trống)
            applyFontEverywhere();
        }
        // Đồng bộ giá trị + chữ hiển thị của ô chọn với phông đang dùng
        function syncFontSelect() {
            const sel = document.getElementById('setting-font');
            if (!sel) return;
            const val = selectedFontName();
            const run = () => {
                const opts = Array.from(sel.querySelectorAll('md-select-option'));
                const idx = opts.findIndex(o => o.value === val);
                try { if (idx >= 0) sel.selectIndex(idx); else sel.value = val; } catch (e) { sel.value = val; }
            };
            run();
            // Menu có thể đang chạy hiệu ứng đóng -> đồng bộ lại sau khi xong
            requestAnimationFrame(run);
            setTimeout(run, 350);
        }
        // Trả về { names: [tất cả phông trong liên kết], added: [phông mới] }
        function addFontEntries(entries) {
            const names = [], added = [];
            entries.forEach(e => {
                const ex = findEntry(e.name);
                if (ex) { names.push(ex.name); return; }
                fontEntries.push(e); added.push(e.name); names.push(e.name);
            });
            saveFontEntries();
            return { names, added };
        }
        async function deleteFontEntry(name) {
            const e = findEntry(name); if (!e || e.kind === 'builtin') return;
            fontEntries = fontEntries.filter(x => x !== e);
            saveFontEntries();
            if (e.kind === 'file') {
                try { await fontIdb('readwrite', st => st.delete(famOf(e))); } catch (err) {}
                if (fontBlobUrls[famOf(e)]) { URL.revokeObjectURL(fontBlobUrls[famOf(e)]); delete fontBlobUrls[famOf(e)]; }
            }
            if (fontKey(localStorage.getItem('settings_font') || '') === fontKey(name)) { localStorage.setItem('settings_font', 'default'); applyFontEverywhere(); }
            renderFontSelect();
            showToast(tF('toast.font_deleted', 'Đã xóa phông chữ {name}').replace('{name}', name), 'delete', 3500);
        }
        function moveFontEntry(name, dir) {
            const i = fontEntries.findIndex(e => fontKey(e.name) === fontKey(name)), j = i + dir;
            if (i < 0 || j < 0 || j >= fontEntries.length) return;
            [fontEntries[i], fontEntries[j]] = [fontEntries[j], fontEntries[i]];
            saveFontEntries(); renderFontSelect();
        }
        function sortFontEntries() {
            fontEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
            saveFontEntries(); renderFontSelect();
        }
        async function resetFontEntries() {
            for (const e of fontEntries.filter(x => x.kind === 'file')) {
                try { await fontIdb('readwrite', st => st.delete(famOf(e))); } catch (err) {}
                if (fontBlobUrls[famOf(e)]) { URL.revokeObjectURL(fontBlobUrls[famOf(e)]); delete fontBlobUrls[famOf(e)]; }
            }
            fontEntries = BUILTIN_FONTS.map(f => Object.assign({}, f));
            saveFontEntries();
            if (!findEntry(localStorage.getItem('settings_font') || '')) localStorage.setItem('settings_font', 'default');
            renderFontSelect(); applyFontEverywhere();
            showToast(tF('toast.font_reset', 'Đã khôi phục danh sách phông chữ mặc định'), 'restart_alt', 3500);
        }

        // ----- Dropdown phông chữ trong Cài đặt -----
        function renderFontSelect() {
            const sel = document.getElementById('setting-font');
            if (!sel) return;
            sel.innerHTML = '';
            const mk = (value, text, i18n, icon) => {
                const o = document.createElement('md-select-option');
                o.value = value;
                if (icon) { const ic = document.createElement('span'); ic.slot = 'start'; ic.className = 'material-symbols-rounded'; ic.style.fontSize = '20px'; ic.textContent = icon; o.appendChild(ic); }
                const h = document.createElement('div'); h.slot = 'headline'; h.textContent = text;
                if (i18n) h.setAttribute('data-i18n', i18n);
                o.appendChild(h); return o;
            };
            sel.appendChild(mk('__custom', tF('settings.font_custom', 'Tùy chỉnh...'), 'settings.font_custom', 'add'));
            sel.appendChild(mk('__manage', tF('settings.font_manage', 'Quản lý phông chữ'), 'settings.font_manage', 'tune'));
            const div = document.createElement('md-divider'); div.setAttribute('role', 'separator'); div.tabIndex = -1; sel.appendChild(div);
            sel.appendChild(mk('default', tF('settings.font_default', 'Google Sans Flex (Mặc định)'), 'settings.font_default'));
            fontEntries.forEach(e => sel.appendChild(mk(e.name, e.name)));
            sel.value = selectedFontName();
            syncFontSelect();
            renderFontManageList();
        }

        // ----- Dialog: Thêm phông chữ tùy chỉnh / Chọn phông / Quản lý phông chữ -----
        function initFontUI() {
            const sel = document.getElementById('setting-font');
            const addDlg = document.getElementById('font-add-dialog');
            const pickDlg = document.getElementById('font-pick-dialog');
            const manageOv = document.getElementById('font-manage-overlay');
            const manageDlg = {
                show() { manageOv.classList.add('open'); },
                close() { manageOv.classList.remove('open'); }
            };
            manageOv.addEventListener('click', (ev) => { if (ev.target === manageOv) manageDlg.close(); });
            document.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape' && manageOv.classList.contains('open') && !document.querySelector('md-dialog[open]')) manageDlg.close();
            });
            const radios = () => Array.from(addDlg.querySelectorAll('md-radio[name="font-src"]'));
            const curSrc = () => (radios().find(r => r.checked) || {}).value || 'google';
            const errEl = document.getElementById('font-add-error');
            const okBtn = document.getElementById('font-add-ok');
            const fileInput = document.getElementById('font-file-input');
            const fileLabel = document.getElementById('font-file-label');
            const googleInput = document.getElementById('font-google-input');
            const urlInput = document.getElementById('font-url-input');
            const urlName = document.getElementById('font-url-name');
            const fileName = document.getElementById('font-file-name');
            let reopenManage = false;

            function syncPanels() {
                const s = curSrc();
                addDlg.querySelectorAll('.fnt-panel').forEach(p => { p.hidden = p.dataset.panel !== s; });
                errEl.textContent = '';
            }
            radios().forEach(r => r.addEventListener('change', syncPanels));

            function openAdd(fromManage) {
                reopenManage = !!fromManage;
                googleInput.value = ''; urlInput.value = ''; urlName.value = ''; fileName.value = ''; fileInput.value = '';
                fileLabel.textContent = tF('font.file_none', 'Chưa chọn tệp nào');
                const first = radios().find(r => r.value === 'google'); if (first) first.checked = true;
                syncPanels(); okBtn.disabled = false; okBtn.textContent = tF('font.add_ok', 'Thêm');
                addDlg.show();
            }
            addDlg.addEventListener('closed', () => {
                if (reopenManage) { reopenManage = false; renderFontManageList(); manageDlg.show(); }
            });
            document.getElementById('font-add-cancel').addEventListener('click', () => addDlg.close());
            document.getElementById('font-file-btn').addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => {
                const f = fileInput.files[0];
                fileLabel.textContent = f ? f.name : tF('font.file_none', 'Chưa chọn tệp nào');
                if (f && !fileName.value) fileName.value = cleanFontName(f.name.replace(/\.[^.]+$/, ''));
            });

            function openPick(names) {
                const list = document.getElementById('font-pick-list');
                list.innerHTML = '';
                names.forEach((n, i) => {
                    const lab = document.createElement('label');
                    const r = document.createElement('md-radio'); r.name = 'font-pick'; r.value = n; if (i === 0) r.checked = true;
                    const sp = document.createElement('span'); sp.textContent = n;
                    lab.appendChild(r); lab.appendChild(sp); list.appendChild(lab);
                });
                document.getElementById('font-pick-desc').textContent = tF('font.pick_desc', 'Đã thêm {n} phông chữ từ liên kết. Bạn muốn dùng phông nào?').replace('{n}', names.length);
                pickDlg.show();
            }
            document.getElementById('font-pick-ok').addEventListener('click', () => {
                const r = Array.from(pickDlg.querySelectorAll('md-radio')).find(x => x.checked);
                pickDlg.close();
                if (r) selectFont(r.value);
            });
            document.getElementById('font-pick-later').addEventListener('click', () => pickDlg.close());

            async function submitAdd() {
                const s = curSrc();
                errEl.textContent = ''; okBtn.disabled = true; okBtn.textContent = tF('font.adding', 'Đang tải...');
                try {
                    let entries;
                    if (s === 'google') entries = await importGoogle(googleInput.value);
                    else if (s === 'url') entries = await importUrl(urlInput.value, urlName.value);
                    else entries = await importFile(fileInput.files[0], fileName.value);
                    const { names, added } = addFontEntries(entries);
                    renderFontSelect();
                    // Chờ phông tải xong một chút để lần chọn đầu hiển thị đúng ngay
                    try { await Promise.race([document.fonts.load(`16px '${famOf(findEntry(names[0]))}'`), new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
                    if (names.length === 1) {
                        selectFont(names[0]);
                        showToast(added.length
                            ? tF('toast.font_added', 'Đã thêm phông chữ {name}').replace('{name}', names[0])
                            : tF('toast.font_exists_selected', 'Phông chữ {name} đã có trong danh sách, đã chọn lại').replace('{name}', names[0]), 'font_download', 4000);
                        addDlg.close();
                    } else {
                        reopenManage = false;
                        addDlg.close();
                        setTimeout(() => openPick(names), 350);
                    }
                } catch (e) {
                    const key = e && e.key;
                    errEl.textContent = key ? tF(key, e.fb) : tF('font.err_fetch', 'Không tải được phông chữ. Hãy kiểm tra liên kết và kết nối mạng');
                } finally {
                    okBtn.disabled = false; okBtn.textContent = tF('font.add_ok', 'Thêm');
                }
            }
            okBtn.addEventListener('click', submitAdd);

            // ----- Sửa phông chữ nhập ngoài (phông tải từ tệp chỉ được đổi tên) -----
            const editDlg = document.getElementById('font-edit-dialog');
            const editName = document.getElementById('font-edit-name');
            const editLink = document.getElementById('font-edit-link');
            const editLinkWrap = document.getElementById('font-edit-link-wrap');
            const editHelp = document.getElementById('font-edit-help');
            const editErr = document.getElementById('font-edit-error');
            const editOk = document.getElementById('font-edit-ok');
            let editing = null, reopenFromEdit = false;
            window.openFontEdit = function (name) {
                const e = findEntry(name); if (!e || e.kind === 'builtin') return;
                editing = e; editErr.textContent = '';
                editName.value = e.name;
                const isFile = e.kind === 'file';
                editLinkWrap.hidden = isFile;
                editHelp.textContent = isFile ? tF('font.edit_file_help', 'Phông chữ tải lên từ tệp chỉ có thể đổi tên.')
                    : (e.kind === 'google' ? tF('font.edit_google_help', 'Có thể dán mã nhúng <link> hoặc liên kết Google Fonts.') : tF('font.edit_url_help', 'Liên kết https:// tới tệp CSS hoặc tệp phông chữ.'));
                editLink.value = e.kind === 'url' ? e.src : (e.href || '');
                editOk.disabled = false; editOk.textContent = tF('font.edit_save', 'Lưu');
                reopenFromEdit = true;
                editDlg.show();
            };
            editDlg.addEventListener('closed', () => { if (reopenFromEdit) { reopenFromEdit = false; renderFontManageList(); manageDlg.show(); } });
            document.getElementById('font-edit-cancel').addEventListener('click', () => editDlg.close());
            async function saveEdit() {
                const e = editing; if (!e) return;
                editErr.textContent = ''; editOk.disabled = true; editOk.textContent = tF('font.adding', 'Đang tải...');
                try {
                    const newName = cleanFontName(editName.value);
                    if (!newName) throw new FontErr('font.err_name_empty', 'Hãy nhập tên phông chữ');
                    const other = findEntry(newName);
                    if (other && other !== e) throw new FontErr('font.err_exists', 'Đã có phông chữ tên này trong danh sách, hãy đặt tên khác');
                    const patch = {};
                    const fam = famOf(e);
                    if (e.kind === 'google') {
                        const p = parseGoogleEmbed(editLink.value)[0];
                        if (!p) throw new FontErr('font.err_no_link', 'Không tìm thấy liên kết Google Fonts hợp lệ trong mã bạn dán');
                        if (p.href !== e.href) {
                            try { await fetchCssText(p.href); } catch (er) { throw new FontErr('font.err_fetch', 'Không tải được phông chữ. Hãy kiểm tra liên kết và kết nối mạng'); }
                            patch.href = p.href; patch.family = p.name;
                        }
                    } else if (e.kind === 'css') {
                        let u; try { u = new URL(editLink.value.trim()); } catch (er) {}
                        if (!u || u.protocol !== 'https:') throw new FontErr('font.err_url', 'Liên kết không hợp lệ (cần bắt đầu bằng https://)');
                        if (u.href !== e.href) {
                            let css; try { css = await fetchCssText(u.href); } catch (er) { throw new FontErr('font.err_fetch', 'Không tải được phông chữ. Hãy kiểm tra liên kết và kết nối mạng'); }
                            const names = []; const re = /font-family\s*:\s*(['"]?)([^;'"}]+)\1/gi; let m;
                            while ((m = re.exec(css))) { const n = cleanFontName(m[2]); if (n && !names.includes(n)) names.push(n); }
                            if (!names.length) throw new FontErr('font.err_no_family', 'Không tìm thấy tên phông chữ trong liên kết hoặc tệp');
                            patch.href = u.href; patch.family = names.includes(fam) ? fam : names[0];
                        }
                    } else if (e.kind === 'url') {
                        let u; try { u = new URL(editLink.value.trim()); } catch (er) {}
                        if (!u || u.protocol !== 'https:') throw new FontErr('font.err_url', 'Liên kết không hợp lệ (cần bắt đầu bằng https://)');
                        if (u.href !== e.src) {
                            try { await new FontFace(fam, `url("${u.href}")`).load(); } catch (er) { throw new FontErr('font.err_fetch', 'Không tải được phông chữ. Hãy kiểm tra liên kết và kết nối mạng'); }
                            patch.src = u.href;
                        }
                    }
                    const wasSelected = fontKey(localStorage.getItem('settings_font') || '') === fontKey(e.name);
                    e.family = patch.family || fam;
                    Object.assign(e, patch);
                    e.name = newName;
                    saveFontEntries();
                    if (wasSelected) localStorage.setItem('settings_font', newName);
                    renderFontSelect(); applyFontEverywhere();
                    editDlg.close();
                } catch (er) {
                    editErr.textContent = er && er.key ? tF(er.key, er.fb) : tF('font.err_fetch', 'Không tải được phông chữ. Hãy kiểm tra liên kết và kết nối mạng');
                } finally { editOk.disabled = false; editOk.textContent = tF('font.edit_save', 'Lưu'); }
            }
            editOk.addEventListener('click', saveEdit);

            // Quản lý phông chữ
            document.getElementById('font-manage-add').addEventListener('click', () => {
                openAdd(true);
            });
            document.getElementById('font-manage-sort').addEventListener('click', sortFontEntries);
            document.getElementById('font-manage-reset').addEventListener('click', async () => {
                if (await confirmDialog(tF('font.reset_confirm', 'Khôi phục danh sách phông chữ về mặc định? Các phông chữ tùy chỉnh đã thêm sẽ bị xóa.'))) resetFontEntries();
            });
            document.getElementById('font-manage-done').addEventListener('click', () => manageDlg.close());

            // Dropdown
            renderFontSelect();
            sel.addEventListener('change', (e) => {
                const v = e.target.value;
                if (v === '__custom' || v === '__manage') {
                    syncFontSelect();
                    if (v === '__custom') openAdd(false); else { renderFontManageList(); manageDlg.show(); }
                    return;
                }
                selectFont(v);
            });
        }

        function renderFontManageList() {
            const list = document.getElementById('font-manage-list');
            if (!list) return;
            list.innerHTML = '';
            const sample = tF('font.sample', 'Xin chào thế giới — The quick brown fox 0123');
            const cur = selectedFontName();
            const row = (name, tag, entry, idx) => {
                const d = document.createElement('div'); d.className = 'fnt-row';
                if ((entry ? entry.name : 'default') === cur) d.classList.add('current');
                const main = document.createElement('div'); main.className = 'fnt-row-main';
                const top = document.createElement('div'); top.className = 'fnt-row-top';
                const n = document.createElement('span'); n.className = 'fnt-row-name'; n.textContent = name; top.appendChild(n);
                const addTag = (t) => { const k = document.createElement('span'); k.className = 'fnt-row-tag'; k.textContent = t; top.appendChild(k); };
                if (entry && entry.kind !== 'builtin') addTag(entry.kind === 'google' ? 'Google Fonts' : (entry.kind === 'file' ? tF('font.src_file_short', 'Tệp tải lên') : tF('font.src_url_short', 'Liên kết')));
                if (tag) addTag(tag);
                const sm = document.createElement('span'); sm.className = 'fnt-row-sample'; sm.textContent = sample;
                sm.style.fontFamily = fontStack(entry ? entry.name : 'default');
                if (entry) { try { loadFontIntoDoc(document, entry); } catch (e) {} }
                main.appendChild(top); main.appendChild(sm); d.appendChild(main);
                const act = document.createElement('div'); act.className = 'fnt-row-actions';
                if (entry) {
                    const ib = (icon, title, fn, dis) => {
                        const b = document.createElement('md-icon-button'); b.title = title; b.disabled = !!dis;
                        const s = document.createElement('span'); s.className = 'material-symbols-rounded'; s.textContent = icon; b.appendChild(s);
                        b.addEventListener('click', fn); act.appendChild(b);
                    };
                    const imported = entry.kind !== 'builtin';
                    if (imported) ib('edit', tF('font.edit', 'Sửa'), () => window.openFontEdit(entry.name));
                    ib('arrow_upward', tF('font.move_up', 'Lên'), () => moveFontEntry(entry.name, -1), idx === 0);
                    ib('arrow_downward', tF('font.move_down', 'Xuống'), () => moveFontEntry(entry.name, 1), idx === fontEntries.length - 1);
                    if (imported) ib('delete', tF('font.delete', 'Xóa'), () => deleteFontEntry(entry.name));
                }
                d.appendChild(act);
                list.appendChild(d);
            };
            row('Google Sans Flex', tF('font.manage_default_tag', 'Mặc định'), null);
            fontEntries.forEach((e, i) => row(e.name, '', e, i));
            const cnt = document.getElementById('font-manage-count');
            if (cnt) cnt.textContent = tF('font.manage_count', '{n} phông chữ').replace('{n}', fontEntries.length + 1);
        }

        // Màu chủ đạo động (trích từ album art bài đang phát). null = dùng màu người dùng chọn
        let dynamicAccentHex = null;
        // Màu accent của hệ thống Android (Material You) do app native cung cấp
        let systemAccentHex = null;
        function readSystemAccent() {
            try {
                const h = window.AndroidBridge && AndroidBridge.getSystemAccent && AndroidBridge.getSystemAccent();
                systemAccentHex = /^#[0-9a-f]{6}$/i.test(h || '') ? h : null;
            } catch (e) { systemAccentHex = null; }
        }
        readSystemAccent();
        window.__systemAccentChanged = () => { readSystemAccent(); try { applyAccentColor(); } catch (e) {} };
        let dynamicAccentResetTimer = null;

        // Áp các class hiệu năng lên <html> theo đúng settings.perf hiện tại
        function applyMotionEffectSettings() {
            const root = document.documentElement, p = settings.perf;
            root.classList.toggle('reduce-motion', !p.motion);
            root.classList.toggle('no-glass', !p.glass);
            root.classList.toggle('no-album-blur', !p.albumBlur);
            root.classList.toggle('no-visualizer', !p.visualizer);
        }
        applyMotionEffectSettings();

        // --- ÁP DỤNG MÀU SẮC CHỦ ĐẠO DỰA TRÊN THIẾT LẬP ---
        // --- Tạo bảng màu M3 (xấp xỉ bằng HSL) từ 1 mã hex bất kỳ ---
        function hexToHsl(hex) {
            const n = parseInt(hex.slice(1), 16);
            const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const l = (max + min) / 2; let h = 0, sat = 0;
            const d = max - min;
            if (d > 0) {
                sat = d / (1 - Math.abs(2 * l - 1));
                if (max === r) h = ((g - b) / d) % 6;
                else if (max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h *= 60; if (h < 0) h += 360;
            }
            return [h, sat, l];
        }
        function hslToHex(h, sat, l) {
            sat = Math.max(0, Math.min(1, sat)); l = Math.max(0, Math.min(1, l));
            const c = (1 - Math.abs(2 * l - 1)) * sat;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = l - c / 2;
            let r = 0, g = 0, b = 0;
            if (h < 60) [r, g, b] = [c, x, 0];
            else if (h < 120) [r, g, b] = [x, c, 0];
            else if (h < 180) [r, g, b] = [0, c, x];
            else if (h < 240) [r, g, b] = [0, x, c];
            else if (h < 300) [r, g, b] = [x, 0, c];
            else [r, g, b] = [c, 0, x];
            const to = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
            return '#' + to(r) + to(g) + to(b);
        }
        function buildPaletteFromHex(hex, mode) {
            const [h, s0] = hexToHsl(hex);
            const sp = s0 < 0.12 ? s0 : Math.max(0.3, Math.min(0.9, s0));   // màu chính
            const sn = Math.min(0.14, s0 * 0.3);                           // nền/neutral nhuốm nhẹ
            const sm = Math.min(0.28, s0 * 0.5);                           // secondary muted
            if (mode === 'dark') {
                return {
                    primary: hslToHex(h, sp, 0.80), onPrimary: hslToHex(h, sp, 0.20),
                    primaryContainer: hslToHex(h, sp, 0.30), onPrimaryContainer: hslToHex(h, sp, 0.90),
                    secondaryContainer: hslToHex(h, sm, 0.23),
                    surface: hslToHex(h, sn, 0.105), onSurface: hslToHex(h, sn, 0.90),
                    surfaceVariant: hslToHex(h, sn, 0.29), onSurfaceVariant: hslToHex(h, sn, 0.80),
                    outline: hslToHex(h, sn, 0.60),
                    ambientGradient: `radial-gradient(circle at 80% 20%, ${hslToHex(h, Math.min(0.5, sp), 0.17)} 0%, ${hslToHex(h, sn, 0.105)} 60%, #000 100%)`
                };
            }
            return {
                primary: hslToHex(h, sp, 0.40), onPrimary: '#FFFFFF',
                primaryContainer: hslToHex(h, Math.min(1, sp + 0.1), 0.90), onPrimaryContainer: hslToHex(h, sp, 0.14),
                secondaryContainer: hslToHex(h, Math.min(0.5, sm + 0.2), 0.89),
                surface: hslToHex(h, Math.min(1, sn + 0.3), 0.98), onSurface: hslToHex(h, sn, 0.11),
                surfaceVariant: hslToHex(h, Math.min(0.3, sn + 0.1), 0.90), onSurfaceVariant: hslToHex(h, sn, 0.29),
                outline: hslToHex(h, sn, 0.47),
                ambientGradient: `radial-gradient(circle at 80% 20%, ${hslToHex(h, Math.min(1, sp + 0.1), 0.90)} 0%, ${hslToHex(h, Math.min(1, sn + 0.3), 0.98)} 60%, #fff 100%)`
            };
        }

        // Lấy bảng màu đang hiệu lực (ưu tiên màu động nếu đang bật và có)
        function getActivePalette(resolvedMode) {
            if (settings.dynamicAccent && dynamicAccentHex) return buildPaletteFromHex(dynamicAccentHex, resolvedMode);
            if (settings.accent === 'system' && systemAccentHex) return buildPaletteFromHex(systemAccentHex, resolvedMode);
            return accents[settings.accent] ? accents[settings.accent][resolvedMode] : accents.purple[resolvedMode];
        }

        // PiP luôn nền tối -> luôn dùng bảng màu dark của accent đang hiệu lực
        function applyPipAccent() {
            if (typeof customPipWindow === 'undefined' || !customPipWindow) return;
            try {
                const c = getActivePalette('dark');
                const r = customPipWindow.document.documentElement.style;
                r.setProperty('--pip-primary', c.primary);
                r.setProperty('--pip-on-primary', c.onPrimary);
                r.setProperty('--pip-container', c.primaryContainer);
                r.setProperty('--pip-on-container', c.onPrimaryContainer);
                r.setProperty('--pip-surface', c.surface);
            } catch (e) {}
        }

        // --- ÁP DỤNG MÀU SẮC CHỦ ĐẠO DỰA TRÊN THIẾT LẬP ---
        function applyAccentColor(themeOverride) {
            const activeTheme = themeOverride || settings.theme;
            const resolvedMode = resolveThemeMode(activeTheme);
            
            const colors = getActivePalette(resolvedMode);
            const root = document.documentElement;
            
            root.style.setProperty('--md-sys-color-primary', colors.primary);
            root.style.setProperty('--md-sys-color-on-primary', colors.onPrimary);
            root.style.setProperty('--md-sys-color-primary-container', colors.primaryContainer);
            root.style.setProperty('--md-sys-color-on-primary-container', colors.onPrimaryContainer);
            root.style.setProperty('--md-sys-color-secondary-container', colors.secondaryContainer);
            
            // Cải tiến: Đổi toàn bộ màu sắc nền, màu top bar và ambient gradient động
            root.style.setProperty('--md-sys-color-surface', colors.surface);
            root.style.setProperty('--md-sys-color-on-surface', colors.onSurface);
            root.style.setProperty('--md-sys-color-surface-variant', colors.surfaceVariant);
            root.style.setProperty('--md-sys-color-on-surface-variant', colors.onSurfaceVariant);
            root.style.setProperty('--md-sys-color-outline', colors.outline);
            root.style.setProperty('--ambient-gradient', colors.ambientGradient);

            // Đồng bộ màu thanh header trình duyệt/PWA (theme-color) đúng theo accent đang chọn
            document.getElementById('theme-meta').setAttribute('content', colors.surface);

            applyPipAccent();
            // Đồng bộ luôn màu cho trang What's New (nếu đã tải xong)
            try { if (typeof sendThemeToChangelog === 'function' && typeof clLoaded !== 'undefined' && clLoaded) sendThemeToChangelog(); } catch (e) {}
        }

        // --- TRÍCH MÀU CHỦ ĐẠO TỪ ALBUM ART ---
        function extractDominantColor(src) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const S = 48;
                        const cv = document.createElement('canvas');
                        cv.width = S; cv.height = S;
                        const cx = cv.getContext('2d', { willReadFrequently: true });
                        cx.drawImage(img, 0, 0, S, S);
                        const d = cx.getImageData(0, 0, S, S).data;
                        const BINS = 24;
                        const bins = Array.from({ length: BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
                        let tr = 0, tg = 0, tb = 0, tn = 0;
                        for (let i = 0; i < d.length; i += 4) {
                            if (d[i + 3] < 128) continue;
                            const r = d[i], g = d[i + 1], b = d[i + 2];
                            tr += r; tg += g; tb += b; tn++;
                            const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
                            const [h, sat, l] = hexToHsl(hex);
                            if (l < 0.12 || l > 0.92 || sat < 0.2) continue; // bỏ đen/trắng/xám
                            const w = sat * (1 - Math.abs(2 * l - 1));
                            const bin = bins[Math.floor(h / 360 * BINS) % BINS];
                            bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
                        }
                        let best = null;
                        for (const b of bins) if (b.w > 0 && (!best || b.w > best.w)) best = b;
                        let r, g, b;
                        if (best && best.w > 0.5) { r = best.r / best.w; g = best.g / best.w; b = best.b / best.w; }
                        else if (tn > 0) { r = tr / tn; g = tg / tn; b = tb / tn; } // ảnh gần như đơn sắc/xám
                        else return resolve(null);
                        resolve('#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
                    } catch (e) { resolve(null); }
                };
                img.onerror = () => resolve(null);
                img.src = src;
            });
        }

        function clearDynamicAccentTimer() {
            if (dynamicAccentResetTimer) { clearTimeout(dynamicAccentResetTimer); dynamicAccentResetTimer = null; }
        }
        function setDynamicAccent(hex) {
            if (dynamicAccentHex === hex) return;
            dynamicAccentHex = hex;
            applyAccentColor(document.body.classList.contains('fullscreen-active') ? 'dark' : undefined);
        }
        // Gọi mỗi khi đổi bài / đổi ảnh bìa
        async function refreshDynamicAccent(track) {
            clearDynamicAccentTimer();
            if (!settings.dynamicAccent || !track || !track.cover) { setDynamicAccent(null); return; }
            const cover = track.cover;
            if (track.accentFor !== cover) { track.accentHex = await extractDominantColor(cover); track.accentFor = cover; }
            // Bỏ kết quả cũ nếu người dùng đã chuyển sang bài khác trong lúc phân tích
            if (playlist[currentIndex] !== track) return;
            setDynamicAccent(track.accentHex || null);
        }

        // --- ÁP DỤNG CHỦ ĐỀ SÁNG/TỐI THÍCH ỨNG ---
        function resolveThemeMode(themeValue) {
            if (themeValue === 'light') return 'light';
            if (themeValue === 'dark') return 'dark';
            try {
                if (window.AndroidBridge && typeof window.AndroidBridge.isSystemDarkMode === 'function') {
                    return window.AndroidBridge.isSystemDarkMode() ? 'dark' : 'light';
                }
            } catch (e) {}
            return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        window.__systemThemeChanged = () => {
            if (settings.theme === 'system') {
                applyTheme('system');
                if (typeof sendThemeToChangelog === 'function') sendThemeToChangelog();
            }
        };

        function applyTheme(themeValue) {
            const root = document.documentElement;
            const resolved = resolveThemeMode(themeValue);
            root.classList.remove('theme-light', 'theme-dark');
            root.classList.add(resolved === 'light' ? 'theme-light' : 'theme-dark');
            
            // Đồng bộ màu sắc điểm nhấn (và theme-color header) ngay khi đổi giao diện —
            // truyền thẳng themeValue xuống để các lần ép theme tạm thời (VD: vào Full
            // screen) tính đúng bảng màu, không bị đọc nhầm lại settings.theme gốc
            applyAccentColor(themeValue);
        }

        function applyLyricVisibility() {
            const topLyricEl = document.getElementById('top-active-lyric');
            if (topLyricEl) {
                topLyricEl.style.display = settings.showMainLyric ? 'block' : 'none';
            }
            if (customPipWindow) {
                const pipLyricEl = customPipWindow.document.getElementById('pip-lyric');
                if (pipLyricEl) {
                    pipLyricEl.style.display = settings.showPipLyric ? 'flex' : 'none';
                }
            }
            const fsLyricEl2 = document.getElementById('fs-lyric');
            if (fsLyricEl2) {
                fsLyricEl2.style.display = settings.showFsLyric ? 'flex' : 'none';
            }
        }

        // Thực thi cấu hình tức thì
        applyTheme(settings.theme);
        applyLyricVisibility();

        function removeVietnameseTones(str) {
            if (!str) return "";
            str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
            str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
            str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
            str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
            str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
            str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
            str = str.replace(/đ/g,"d");
            str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
            str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
            str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
            str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
            str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
            str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
            str = str.replace(/Đ/g, "D");
            str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
            str = str.replace(/\u02C6|\u0306|\u031B/g, "");
            return str;
        }


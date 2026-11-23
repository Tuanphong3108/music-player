        // --- STREAMING_CHUNK:Linking DOM nodes for audio interaction... ---
        // --- KHỞI TẠO ĐỐI TƯỢNG DOM & STATE GỐC ---
        const audio = document.getElementById('audio-element');
        const fileInput = document.getElementById('file-input');
        const lrcManualInput = document.getElementById('lrc-manual-input');
        const playlistContainer = document.getElementById('playlist-container');
        const playlistCard = document.getElementById('playlist-card');
        const playBtn = document.getElementById('play-btn');
        const pauseOverlay = document.getElementById('pause-overlay');
        const visualizer = document.getElementById('visualizer');
        const seekSlider = document.getElementById('seek-slider');
        const volumeSlider = document.getElementById('volume-slider');
        const nameContainer = document.getElementById('name-container');
        const nameWrapper = document.getElementById('track-name-wrapper');
        const trackNameEl = document.getElementById('track-name');
        const trackArtistEl = document.getElementById('track-artist');
        const bgPreview = document.getElementById('bg-preview');
        const dropZone = document.getElementById('drop-zone');
        const contextMenu = document.getElementById('context-menu');
        const cmDelete = document.getElementById('cm-delete');
        const cmAddLrc = document.getElementById('cm-add-lrc');
        const lyricOverlay = document.getElementById('lyric-overlay');
        const lyricBtn = document.getElementById('lyric-btn');
        const artImg = document.getElementById('art-img');
        const artPlaceholder = document.getElementById('art-placeholder');
        const playlistSearch = document.getElementById('playlist-search');

        let playlist = [];
        // Bài mới -> { at: thời điểm hiện lần đầu, delay: độ trễ so le }. Giữ lại để nếu danh sách bị vẽ lại ngay
        // (vd. playTrack gọi updatePlaylistUI liền sau khi thêm) thì hiệu ứng zoom-in vẫn chạy tiếp thay vì bị huỷ.
        const trackEnter = new WeakMap();
        const trackNum = new WeakMap();      // số thứ tự đang hiển thị của từng bài (để làm hiệu ứng khi số đổi)
        const PL_CHUNK = 40;                 // số bài vẽ mỗi đợt (lazy-loading)
        let plLimit = PL_CHUNK, plObserver = null;
        const ENTER_MS = 500;
        let currentIndex = -1;
        let isShuffle = localStorage.getItem('settings_shuffle') === 'true';
        let repeatMode = parseInt(localStorage.getItem('settings_repeat_mode')) || 0;
        let targetMenuIndex = -1;
        let isLyricVisible = false;
        let searchQuery = "";
        let isReorderMode = false;
        let dragSourceIndex = -1;

        // --- HỆ THỐNG THỨ TỰ PHÁT NGẪU NHIÊN (SHUFFLE) ---
        let shuffleOrder = [];        // Mảng các INDEX trỏ vào playlist, thứ tự phát khi Shuffle bật
        let shuffleInitialized = false; // Đã từng tạo shuffleOrder chưa (để biết lúc nào cần random lại)
        let activePlTab = 'playlist';   // Tab đang xem trong khung playlist: 'playlist' | 'shuffle'

        function generateShuffleOrder() {
            // Bài đang phát (nếu có) được đặt cố định ở VỊ TRÍ 0 thật sự trong mảng, còn
            // lại toàn bộ được xáo trộn ngẫu nhiên -> Next tự nhiên chạy xuống đúng bài
            // kế tiếp thật (shuffleOrder[1]), không cần "làm giả" lúc hiển thị nữa, và
            // logic dừng ở cuối danh sách khi tắt Repeat luôn đúng vì đây là thứ tự thật.
            const rest = playlist.map((_, i) => i).filter(i => i !== currentIndex);
            for (let i = rest.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [rest[i], rest[j]] = [rest[j], rest[i]];
            }
            shuffleOrder = currentIndex !== -1 ? [currentIndex, ...rest] : rest;
            shuffleInitialized = true;
        }

        // Khôi phục giao diện nút Shuffle/Repeat theo trạng thái đã lưu ở lần dùng trước
        (function restorePlaybackModesUI() {
            const shuffleBtnEl = document.getElementById('shuffle-btn');
            const repeatBtnEl = document.getElementById('repeat-btn');
            if (shuffleBtnEl) shuffleBtnEl.classList.toggle('active', isShuffle);
            if (isShuffle) {
                activePlTab = 'shuffle';
                const plTabs = document.getElementById('pl-tabs');
                if (plTabs) plTabs.classList.add('expanded');
                const tabPlaylistEl = document.getElementById('pl-tab-playlist');
                const tabShuffleEl = document.getElementById('pl-tab-shuffle');
                if (tabPlaylistEl) tabPlaylistEl.classList.remove('active');
                if (tabShuffleEl) tabShuffleEl.classList.add('active');
                const reshuffleBtnEl = document.getElementById('reshuffle-btn');
                if (reshuffleBtnEl) reshuffleBtnEl.style.display = 'flex';
            }
            if (repeatBtnEl) {
                repeatBtnEl.classList.toggle('active', repeatMode > 0);
                repeatBtnEl.classList.toggle('repeat-one', repeatMode === 2);
                const badge = repeatBtnEl.querySelector('.repeat-badge');
                { const ic = repeatBtnEl.querySelector('.material-symbols-rounded'); if (ic) ic.textContent = repeatMode === 2 ? 'repeat_one' : 'repeat'; }
            }
        })();

        // Tự động chuyển đổi màu chủ đề hệ thống khi cấu hình hệ thống thay đổi
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
            if (settings.theme === 'system') {
                applyTheme('system');
                if (typeof sendThemeToChangelog === 'function') sendThemeToChangelog();
            }
        });


        // Đặt menu (position: fixed) tại toạ độ chuột, tự né cạnh màn hình (lật sang trái/lên trên khi tràn).
        // Chú ý html { zoom } (Kích thước giao diện): toạ độ chuột & getBoundingClientRect tính bằng px thật,
        // còn left/top CSS tính theo đơn vị đã zoom -> chia cho zoom khi gán.
        window.__placeMenu = function (el, x, y, margin) {
            margin = margin == null ? 8 : margin;
            const d = el.ownerDocument, w = d.defaultView;
            const z = parseFloat(w.getComputedStyle(d.documentElement).zoom) || 1;
            const vw = w.innerWidth, vh = w.innerHeight;
            const r = { width: el.offsetWidth * z, height: el.offsetHeight * z };   // không dùng getBoundingClientRect: đang chạy animation scale
            let nx = x, ny = y;
            if (x + r.width > vw - margin) nx = x - r.width;     // tràn phải -> lật sang trái con trỏ
            if (y + r.height > vh - margin) ny = y - r.height;   // tràn dưới -> lật lên trên con trỏ
            nx = Math.max(margin, Math.min(nx, vw - r.width - margin));
            ny = Math.max(margin, Math.min(ny, vh - r.height - margin));
            el.style.left = (nx / z) + 'px';
            el.style.top = (ny / z) + 'px';
        };

        // ===== Menu chuột phải tuỳ chỉnh (thay menu mặc định của trình duyệt) =====
        // Dùng chung cho trang chính và Ore UI chỉnh sửa metadata: window.__installCtxMenu(document, 'm3' | 'ore', getExtraItems)
        window.__installCtxMenu = function (doc, theme, extra) {
            if (!doc || doc.__ctxInstalled) return;
            doc.__ctxInstalled = true;
            const win = doc.defaultView || window;
            const tr = (k, f) => { try { return (window.__tr && window.__tr(k)) || f; } catch (e) { return f; } };
            const ore = theme === 'ore';
            // Icon pixel 1-bit cho Ore UI (vẽ bằng SVG hình vuông, không dùng emoji hay Material Symbols)
            const PIXEL = {
                cut: ['#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....', '...#.#...', '.###.###.', '.#.#.#.#.', '.###.###.'],
                copy: ['#####....', '#...#....', '#...#####', '#...#...#', '#####...#', '....#...#', '....#####'],
                paste: ['...###...', '.#######.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#######.'],
                all: ['#.#.#.#.#', '.........', '#.......#', '.........', '#.......#', '.........', '#.......#', '.........', '#.#.#.#.#']
            };
            const pixelIcon = (name) => {
                const g = PIXEL[name]; if (!g) return null;
                const NS = 'http://www.w3.org/2000/svg';
                const svg = doc.createElementNS(NS, 'svg');
                svg.setAttribute('viewBox', '0 0 9 ' + g.length);
                svg.setAttribute('width', '18'); svg.setAttribute('height', String(2 * g.length));
                svg.setAttribute('shape-rendering', 'crispEdges');
                svg.style.cssText = 'flex-shrink:0;image-rendering:pixelated;';
                g.forEach((row, y) => [...row].forEach((c, x) => {
                    if (c !== '#') return;
                    const r = doc.createElementNS(NS, 'rect');
                    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 1); r.setAttribute('height', 1); r.setAttribute('fill', 'currentColor');
                    svg.appendChild(r);
                }));
                return svg;
            };
            // Chọn họ font Material Symbols mà trang này thực sự đã nạp (không có thì bỏ icon)
            let iconFam = '';
            try {
                const hrefs = [...doc.querySelectorAll('link[href*="Material+Symbols"]')].map(l => l.href).join(' ');
                if (/Symbols\+Outlined/.test(hrefs)) iconFam = "'Material Symbols Rounded'";
                else if (/Symbols\+Rounded/.test(hrefs)) iconFam = "'Material Symbols Rounded'";
            } catch (e) {}
            const st = doc.createElement('style');
            st.textContent = ore ? `
                .ctxl { position: fixed; z-index: 2147483000; display: none; flex-direction: column; min-width: 150px; padding: 4px; background: #313233; border: 2px solid #1A1A1A; box-shadow: inset 0 -3px 0 #1E1E1F, inset 0 2px 0 rgba(255,255,255,.12), 0 6px 18px rgba(0,0,0,.5); font-family: 'Minecraft', monospace; font-size: 12px; color: #fff; user-select: none; }
                .ctxl.open { display: flex; }
                .ctxl .ci { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; }
                .ctxl .ci .grow { flex: 1; }
                .ctxl .ci:hover { background: #3C8527; }
                .ctxl .ci.off { opacity: .4; pointer-events: none; }
                .ctxl .sep { height: 2px; background: #1A1A1A; margin: 4px 0; }
                .ctxl .ci small { opacity: .6; font-size: 10px; }
            ` : `
                .ctxl { position: fixed; z-index: 2147483000; display: none; flex-direction: column; min-width: 190px; padding: 8px 0; background: var(--md-sys-color-surface-variant, #49454F); color: var(--md-sys-color-on-surface-variant, #CAC4D0); border-radius: 12px; border: 1px solid rgba(255,255,255,.1); box-shadow: 0 8px 32px rgba(0,0,0,.4); backdrop-filter: blur(10px); font-size: calc(14px * var(--font-scale-factor, 1)); user-select: none; transform-origin: top left; }
                .ctxl.open { display: flex; animation: ctxlIn .14s ease-out; }
                @keyframes ctxlIn { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
                .ctxl .ci { padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 12px; }
                .ctxl .ci:hover, .ctxl .ci.on { background: rgba(255,255,255,.1); }
                .ctxl .ci.off { opacity: .4; pointer-events: none; }
                .ctxl .ci .mso { font-family: ${iconFam || 'inherit'}; font-size: 20px; line-height: 1; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; white-space: nowrap; font-feature-settings: 'liga'; -webkit-font-feature-settings: 'liga'; flex-shrink: 0; width: 20px; overflow: hidden; }
                .ctxl .ci small { margin-left: auto; opacity: .6; font-size: .8em; padding-left: 16px; }
                .ctxl .sep { height: 1px; background: rgba(255,255,255,.12); margin: 6px 0; }
            `;
            (doc.head || doc.documentElement).appendChild(st);
            const menu = doc.createElement('div');
            menu.className = 'ctxl';
            (doc.body || doc.documentElement).appendChild(menu);
            const subMenu = doc.createElement('div');       // menu phụ (flyout)
            subMenu.className = 'ctxl';
            (doc.body || doc.documentElement).appendChild(subMenu);

            const textTypes = ['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number'];
            const findEditable = (e) => {
                for (const n of (e.composedPath ? e.composedPath() : [e.target])) {
                    if (!n || n.nodeType !== 1) continue;
                    const tag = n.tagName;
                    if (tag === 'TEXTAREA' || (tag === 'INPUT' && textTypes.includes((n.getAttribute('type') || '').toLowerCase())) || n.isContentEditable) return n;
                }
                return null;
            };
            const isField = el => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
            const selText = el => {
                if (isField(el)) { try { return el.value.substring(el.selectionStart, el.selectionEnd); } catch (e) { return ''; } }
                return (win.getSelection() || '').toString();
            };
            const writeClip = async (t) => {
                try { await win.navigator.clipboard.writeText(t); }
                catch (e) { try { doc.execCommand('copy'); } catch (e2) {} }
            };
            const fire = (el) => el.dispatchEvent(new win.Event('input', { bubbles: true }));
            const doCopy = async (el) => { const t = selText(el); if (t) await writeClip(t); };
            const doCut = async (el) => {
                const t = selText(el); if (!t) return;
                await writeClip(t);
                if (isField(el)) { el.setRangeText('', el.selectionStart, el.selectionEnd, 'end'); fire(el); }
                else doc.execCommand('delete');
            };
            const doPaste = async (el) => {
                let t = '';
                try { t = await win.navigator.clipboard.readText(); } catch (e) { return; }
                if (!t) return;
                el.focus();
                if (isField(el)) { el.setRangeText(t, el.selectionStart, el.selectionEnd, 'end'); fire(el); }
                else doc.execCommand('insertText', false, t);
            };
            const doSelectAll = (el) => { el.focus(); if (isField(el)) el.select(); else doc.execCommand('selectAll'); };

            const closeSub = () => { subMenu.classList.remove('open'); subMenu.__owner = null; };
            const close = () => { menu.classList.remove('open'); closeSub(); };
            const openSub = (row, items) => {
                if (subMenu.__owner === row && subMenu.classList.contains('open')) { closeSub(); return; }
                menu.querySelectorAll('.ci.on').forEach(n => n.classList.remove('on'));
                row.classList.add('on');
                subMenu.__owner = row;
                render(subMenu, items, true);
                subMenu.classList.add('open');
                const rr = row.getBoundingClientRect(), sr = subMenu.getBoundingClientRect(), vw = win.innerWidth, vh = win.innerHeight;
                const z = parseFloat(win.getComputedStyle(doc.documentElement).zoom) || 1;
                let x = rr.right + 2; if (x + sr.width > vw - 8) x = Math.max(8, rr.left - sr.width - 2);   // hết chỗ bên phải -> mở sang trái
                const y = Math.max(8, Math.min(rr.top - 8, vh - sr.height - 8));
                subMenu.style.left = (x / z) + 'px';
                subMenu.style.top = (y / z) + 'px';
            };
            const render = (el, items, isSub) => {
                el.textContent = '';
                items.forEach(it => {
                    if (it === '-') { const d = doc.createElement('div'); d.className = 'sep'; el.appendChild(d); return; }
                    const d = doc.createElement('div');
                    d.className = 'ci' + (it.off ? ' off' : '');
                    if (ore) { const px = it.px && pixelIcon(it.px); if (px) d.appendChild(px); }
                    else if (iconFam && (it.icon || it.checked !== undefined)) { const ic = doc.createElement('span'); ic.className = 'mso'; ic.textContent = it.checked !== undefined ? (it.checked ? 'check' : '') : it.icon; d.appendChild(ic); }
                    const lb = doc.createElement('span'); lb.textContent = it.label; if (ore) lb.className = 'grow'; d.appendChild(lb);
                    if (it.hint) { const h = doc.createElement('small'); h.textContent = it.hint; d.appendChild(h); }
                    if (it.sub && !ore && iconFam) { const ch = doc.createElement('span'); ch.className = 'mso'; ch.style.marginLeft = it.hint ? '0' : 'auto'; ch.textContent = 'chevron_right'; d.appendChild(ch); }
                    // mousedown không cướp focus/vùng chọn của ô nhập liệu
                    d.addEventListener('mousedown', ev => ev.preventDefault());
                    if (it.sub) {
                        d.addEventListener('click', (ev) => { ev.stopPropagation(); openSub(d, it.sub); });
                        if (!isSub) d.addEventListener('mouseenter', () => { if (!subMenu.classList.contains('open')) return; openSub(d, it.sub); });
                    } else {
                        if (!isSub) d.addEventListener('mouseenter', () => { if (subMenu.classList.contains('open') && subMenu.__owner !== d) { closeSub(); menu.querySelectorAll('.ci.on').forEach(n => n.classList.remove('on')); } });
                        d.addEventListener('click', async (ev) => { ev.stopPropagation(); close(); try { await it.run(); } catch (e) {} });
                    }
                    el.appendChild(d);
                });
            };
            const open = (items, x, y) => {
                render(menu, items, false);
                menu.classList.add('open');
                window.__placeMenu(menu, x, y);
            };

            doc.addEventListener('contextmenu', (e) => {
                const el = findEditable(e);
                if (el) { close(); return; }
                e.preventDefault();                       // luôn chặn menu mặc định
                if (e.target.closest && e.target.closest('.song-item')) { close(); return; }   // bài trong playlist có menu riêng
                const items = [];
                const sel = (win.getSelection() || '').toString();
                if (sel) items.push({ label: tr('contextmenu.copy', 'Sao chép'), icon: 'content_copy', px: 'copy', hint: 'Ctrl+C', run: () => writeClip(sel) });
                if (extra) {
                    const more = extra(e) || [];
                    if (more.length && items.length) items.push('-');
                    items.push(...more);
                }
                if (!items.length) { close(); return; }
                open(items, e.clientX, e.clientY);
            }, true);
            ['mousedown', 'wheel', 'blur', 'resize', 'keydown'].forEach(t => doc.addEventListener(t, (ev) => {
                if (t === 'mousedown' && (menu.contains(ev.target) || subMenu.contains(ev.target))) return;
                if (t === 'keydown' && ev.key !== 'Escape') return;
                close();
            }, true));
            win.addEventListener('blur', close);
            // Ctrl + cuộn trong iframe (About, Metadata Editor...) cũng chỉnh kích thước giao diện của app
            if (doc !== document) doc.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); window.__uiScaleWheel && window.__uiScaleWheel(e); } }, { passive: false });
        };
        window.__installCtxMenu(document, 'm3', () => {
            const qs = (id, label) => {
                const sw = document.getElementById(id);
                if (!sw) return null;
                const row = sw.closest('div[style*="justify-content"]');
                const lab = row && row.querySelector('span');
                return { label: (lab && lab.textContent.trim()) || label, checked: !!sw.selected, run: () => sw.click() };
            };
            const quick = [
                qs('setting-main-lyric'), ...(document.documentElement.classList.contains('m-ui') ? [] : [qs('setting-pip-lyric'), qs('setting-fs-lyric')]), '-',
                qs('setting-dynamic-accent'), qs('perf-motion'), qs('perf-glass'), qs('perf-visualizer'), qs('setting-wake-lock'), '-',
                qs('mixer-eq-on'), qs('mixer-mono'), qs('mixer-comp')
            ].filter(Boolean);
            return [
                { label: tr2('contextmenu.play_pause', 'Phát / Tạm dừng'), icon: audio.paused ? 'play_arrow' : 'pause', hint: 'Space', run: () => playBtn.click() },
                { label: tr2('contextmenu.add_media', 'Thêm nhạc / video'), icon: 'add_circle', sub: [
                    { label: tr2('topbar.addmusic_file', 'Chọn tệp nhạc hoặc video'), icon: 'file_open', hint: 'Ctrl+O', run: () => document.getElementById('btn-fs-pick-files').click() },
                    { label: tr2('topbar.addmusic_folder', 'Chọn thư mục nhạc hoặc video'), icon: 'folder_open', run: () => document.getElementById('btn-fs-pick-directory').click() }
                ] },
                { label: tr2('contextmenu.share_current', 'Chia sẻ tệp đang phát'), icon: 'share', run: () => shareCurrentFile() },
                ...(document.documentElement.classList.contains('m-ui') ? [] : [{ label: tr2('contextmenu.fullscreen', 'Toàn màn hình'), icon: document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen', hint: 'F11', run: () => toggleFullscreen() }]),
                '-',
                { label: tr2('contextmenu.quick_settings', 'Cài đặt nhanh'), icon: 'tune', sub: quick }
            ];
        });
        // Chia sẻ tệp đang phát qua Web Share (nút Share trên thanh trên và mục trong menu chuột phải)
        const shareSheetEl = document.getElementById('share-sheet');
        const shareSheetTextEl = document.getElementById('share-sheet-text');
        let shareSheetCloseTimer = null;
        function setShareSheetStep(step) {
            if (!shareSheetEl || !shareSheetTextEl) return;
            const map = {
                locating: ['share.locating', 'Đang xác định vị trí tệp...'],
                preparing: ['share.preparing', 'Đang chuẩn bị tệp...'],
                sharing: ['share.sharing', 'Đang chia sẻ...']
            };
            const item = map[step];
            shareSheetTextEl.textContent = item ? tr2(item[0], item[1]) : String(step || '');
        }
        function openShareSheet(step) {
            if (!shareSheetEl) return;
            clearTimeout(shareSheetCloseTimer);
            setShareSheetStep(step || 'locating');
            shareSheetEl.classList.add('open');
            requestAnimationFrame(() => requestAnimationFrame(() => shareSheetEl.classList.add('show')));
        }
        function closeShareSheet() {
            if (!shareSheetEl) return;
            clearTimeout(shareSheetCloseTimer);
            shareSheetEl.classList.remove('show');
            shareSheetCloseTimer = setTimeout(() => shareSheetEl.classList.remove('open'), 300);
        }
        window.__onAndroidShareStatus = function (status) {
            if (!status) return;
            if (status === 'done' || status === 'error') {
                closeShareSheet();
                return;
            }
            setShareSheetStep(status);
        };

        async function shareCurrentFile() {
            const track = playlist[currentIndex];
            if (!track || (!track.file && !track.nativeId && !track.nativeLocation)) { showToast(tr2('share.no_file', 'Chưa có tệp nào đang phát để chia sẻ'), 'share'); return; }
            const isMobileUI = document.documentElement.classList.contains('m-ui');
            try {
                const fileName = track.nativeName || (track.file && track.file.name) || ((track.name || 'media') + '.' + (track.ext || 'mp3').toLowerCase());
                const fileMime = (track.file && track.file.type) || '';
                if (window.AndroidBridge && typeof AndroidBridge.shareNativeFile === 'function' && (track.nativeId || track.nativeLocation) && !track._unsavedLocalEdit) {
                    if (isMobileUI) openShareSheet('locating');
                    const err = AndroidBridge.shareNativeFile(
                        String(track.nativeId || ''),
                        String(track.nativeLocation || ''),
                        String(fileName),
                        String(fileMime)
                    );
                    if (!err) return;
                    if (err !== 'NOT_FOUND') {
                        if (isMobileUI) closeShareSheet();
                        showToast('Chia sẻ lỗi: ' + err, 'error');
                        return;
                    }
                }
                if (window.AndroidBridge && AndroidBridge.shareChunk) {
                    if (isMobileUI) openShareSheet('locating');
                    await new Promise(r => setTimeout(r, 80));
                    // Dự phòng cho bản APK cũ hoặc tệp mới sửa trong RAM chưa ghi đè xuống máy
                    let f = track.file;
                    if (f && f.__fromLibrary && track.nativeStreamUrl) {
                        const r = await fetch(track.nativeStreamUrl);
                        if (!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : 0));
                        const bl = await r.blob();
                        f = new File([bl], fileName, { type: fileMime || bl.type || 'audio/mpeg' });
                    }
                    if (!f) throw new Error('File unavailable');
                    const CH = 768 * 1024;
                    const sid = String(Date.now());
                    if (isMobileUI) setShareSheetStep('preparing');
                    for (let o = 0; o < f.size || o === 0; o += CH) {
                        const buf = new Uint8Array(await f.slice(o, o + CH).arrayBuffer());
                        let bin = ''; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
                        const err = AndroidBridge.shareChunk(sid, btoa(bin), o + CH >= f.size, f.name || 'media', f.type || '');
                        if (err) {
                            if (isMobileUI) closeShareSheet();
                            showToast('Chia sẻ lỗi: ' + err, 'error');
                            return;
                        }
                        if (f.size === 0) break;
                    }
                    return;
                }
                const data = { files: [track.file], title: track.name || fileName };
                if (navigator.canShare && navigator.canShare(data)) {
                    if (isMobileUI) openShareSheet('preparing');
                    try {
                        if (isMobileUI) setShareSheetStep('sharing');
                        await navigator.share(data);
                    } finally {
                        if (isMobileUI) closeShareSheet();
                    }
                } else showToast(tr2('share.unsupported', 'Trình duyệt này chưa hỗ trợ chia sẻ tệp'), 'share');
            } catch (e) {
                if (isMobileUI) closeShareSheet();
                if (e && e.name !== 'AbortError') showToast(tr2('share.failed', 'Không chia sẻ được tệp này') + (window.AndroidBridge ? ' (' + e + ')' : ''), 'error');
            }
        }
        document.getElementById('share-btn').addEventListener('click', shareCurrentFile);
        window.showToast = window.showToast || ((m) => showToast(m));
        function tr2(k, f) { try { return (window.__tr && window.__tr(k)) || f; } catch (e) { return f; } }

        document.addEventListener('contextmenu', (e) => {
            const songItem = e.target.closest('.song-item');
            if (songItem) {
                e.preventDefault();
                targetMenuIndex = parseInt(songItem.dataset.index);
                contextMenu.style.display = 'flex';
                window.__placeMenu(contextMenu, e.clientX, e.clientY);
            } else {
                contextMenu.style.display = 'none';
            }
        });

        document.addEventListener('click', () => contextMenu.style.display = 'none');

        // Xoá bài: zoom-out bài đó, thu gọn chỗ trống rồi mới đẩy các bài bên dưới lên
        function animateRemoveSongItem(index) {
            return new Promise(resolve => {
                const el = playlistContainer.querySelector('.song-item[data-index="' + index + '"]');
                if (!el || document.documentElement.classList.contains('reduce-motion')) return resolve();
                const h = el.offsetHeight;
                el.classList.add('song-exit');
                setTimeout(() => {
                    el.style.overflow = 'hidden'; el.style.height = h + 'px'; el.style.boxSizing = 'border-box';
                    void el.offsetHeight;
                    el.style.setProperty('transition', 'height .22s ease, padding .22s ease, margin .22s ease', 'important');
                    el.style.height = '0px'; el.style.paddingTop = '0px'; el.style.paddingBottom = '0px'; el.style.marginBottom = '0px';
                    setTimeout(resolve, 230);
                }, 290);
            });
        }
        let cmDeleting = false;
        cmDelete.addEventListener('click', async () => {
            if (cmDeleting) return;
            if (targetMenuIndex > -1) {
                const idxToDelete = targetMenuIndex;
                cmDeleting = true;
                await animateRemoveSongItem(idxToDelete);
                cmDeleting = false;
                targetMenuIndex = idxToDelete;
                const isPlayingDeleted = (currentIndex === targetMenuIndex);

                // Giải phóng blob URL của bài bị xoá, nếu không nó rò rỉ bộ nhớ vĩnh viễn
                // (không tự động dọn cho tới khi tải lại trang) -> càng xoá/thêm nhạc nhiều
                // trong 1 phiên càng ngốn RAM, khiến cả trang ì đi kể cả lúc mở Metadata Editor
                const removedTrack = playlist[targetMenuIndex];
                const keepInMobileLib = Array.isArray(window.__mobileLibrary) && window.__mobileLibrary.includes(removedTrack);
                if (removedTrack && removedTrack.url && removedTrack.url.startsWith('blob:') && !keepInMobileLib) URL.revokeObjectURL(removedTrack.url);

                playlist.splice(targetMenuIndex, 1);

                // Đồng bộ shuffleOrder theo đúng thay đổi vừa xảy ra trên playlist: bỏ
                // index bị xoá, và lùi lại 1 mọi index đứng sau nó (vì mảng đã dịch)
                if (shuffleInitialized) {
                    shuffleOrder = shuffleOrder
                        .filter(i => i !== targetMenuIndex)
                        .map(i => i > targetMenuIndex ? i - 1 : i);
                }

                if (isPlayingDeleted) {
                    audio.pause(); audio.src = ''; currentIndex = -1;
                    trackNameEl.innerText = "Studio Standby";
                    trackArtistEl.innerText = "ENGINE IDLE | SYSTEM";
                    artImg.classList.add('hidden');
                    artPlaceholder.classList.remove('hidden');
                    bgPreview.style.backgroundImage = 'none';
                    playBtn.querySelector('span').innerText = 'play_arrow';
                    pauseOverlay.classList.remove('visible');
                    renderLyrics();
                    updateMediaSession();
                    if(typeof updatePiPUI === 'function') updatePiPUI();
                } else if (currentIndex > targetMenuIndex) currentIndex--;
                updatePlaylistUI();
                targetMenuIndex = -1;
                if (playlist.length === 0) dropZone.style.display = 'flex';
            }
        });

        cmAddLrc.addEventListener('click', () => {
             if (targetMenuIndex > -1) lrcManualInput.click();
        });

        lrcManualInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && targetMenuIndex > -1) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    playlist[targetMenuIndex].lyrics = parseLRC(ev.target.result);
                    playlist[targetMenuIndex].lyricsRaw = ev.target.result;
                    if (currentIndex === targetMenuIndex) renderLyrics();
                    lrcManualInput.value = ""; 
                };
                reader.readAsText(file);
            }
        });

        function updateSliderFill(slider) {
            const val = slider.value;
            const percent = ((val - slider.min) / (slider.max - slider.min)) * 100;
            const fillCol = 'var(--md-sys-color-primary)';
            const isLight = document.documentElement.classList.contains('theme-light') || 
                            (!document.documentElement.classList.contains('theme-dark') && window.matchMedia('(prefers-color-scheme: light)').matches);
            const bgCol = slider.id === 'seek-slider' ? (isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)') : 'var(--md-sys-color-surface-variant)';
            slider.style.background = `linear-gradient(to right, ${fillCol} 0%, ${fillCol} ${percent}%, ${bgCol} ${percent}%, ${bgCol} 100%)`;
        }

        let marqueeTimer = 0;
        function applyMarquee() {
            clearTimeout(marqueeTimer);
            nameContainer.classList.remove('is-scrolling');
            nameWrapper.style.animationDuration = '';
            nameWrapper.style.animation = '';
            nameWrapper.querySelectorAll('.clone').forEach(c => c.remove());
            marqueeTimer = setTimeout(() => {
                const availW = nameContainer.clientWidth || nameContainer.offsetWidth;
                if (!availW) return;
                // Bỏ phần padding-right 50px của .track-name-text khi đo độ rộng chữ thật để xác định chữ có vừa khung hay không
                const padRight = parseFloat(getComputedStyle(trackNameEl).paddingRight) || 0;
                const textW = Math.max(0, trackNameEl.scrollWidth - padRight);
                if (textW > availW + 1) {
                    const clone = trackNameEl.cloneNode(true);
                    clone.classList.add('clone');
                    nameWrapper.appendChild(clone);
                    // Quãng đường 1 vòng lặp = textW + padRight; giữ tốc độ cố định ~38px/s cho mọi bài
                    const distance = textW + padRight;
                    const durationSec = Math.max(3, distance / 38);
                    nameWrapper.style.animationDuration = durationSec.toFixed(2) + 's';
                    nameContainer.classList.add('is-scrolling');
                }
            }, 100);
        }
        window.addEventListener('resize', applyMarquee, { passive: true });

        function togglePlaylist() { playlistCard.classList.toggle('collapsed'); }

        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            const items = e.dataTransfer.items;

            // Chrome/Edge: lấy FileSystemHandle thật từ item kéo-thả để có thể ghi thẳng
            // vào file gốc trên đĩa (giống hệt flow bấm nút "Chọn file"), thay vì chỉ nhận
            // một bản sao File "chết" không ghi lại đĩa được.
            if (items && items.length > 0 && typeof items[0].getAsFileSystemHandle === 'function') {
                try {
                    const handlePromises = [];
                    for (const item of items) {
                        if (item.kind === 'file') handlePromises.push(item.getAsFileSystemHandle());
                    }
                    const handles = await Promise.all(handlePromises);
                    const files = [];
                    for (const handle of handles) {
                        if (handle && handle.kind === 'file') {
                            const file = await handle.getFile();
                            file.fileHandle = handle;
                            files.push(file);
                        }
                    }
                    if (files.length > 0) {
                        handleFiles(files);
                        return;
                    }
                } catch (err) {
                    console.warn("Không lấy được FileSystemHandle khi kéo-thả, dùng File thường (chỉ lưu tạm):", err);
                }
            }

            // Trình duyệt không hỗ trợ (Firefox, Safari...): fallback về File thường như cũ
            handleFiles(e.dataTransfer.files);
        });

        // --- STREAMING_CHUNK:Reading audio metadata with Lyric Embed support... ---
        async function handleFiles(files, opts) {
            const before = playlist.length;
            const hadFiles = files && files.length > 0;
            if (!hadFiles) { if (window.addBtnArrow) addBtnCancel(); return; }
            addBtnBusy();
            try { await handleFilesInner(files, opts); }
            finally { if (playlist.length > before) addBtnDone(); else addBtnCancel(); }
        }
        // Tệp phát được: nhạc hoặc video (mp4, webm, mkv, mov...). Trình duyệt giải mã được codec nào thì phát codec đó.
        const VIDEO_EXTS = ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'ogv', '3gp', 'avi'];
        const fileExt = f => (f.name.split('.').pop() || '').toLowerCase();
        const isVideoFile = f => (f.type || '').startsWith('video/') || VIDEO_EXTS.includes(fileExt(f));
        // Chụp 1 khung hình của video để làm ảnh bìa trong danh sách phát (tối đa ~4 giây, lỗi thì bỏ qua)
        function captureVideoFrame(url) {
            return new Promise(resolve => {
                const v = document.createElement('video');
                v.muted = true; v.preload = 'auto'; v.playsInline = true;
                let done = false;
                const finish = val => { if (done) return; done = true; clearTimeout(t); v.removeAttribute('src'); v.load(); resolve(val); };
                const t = setTimeout(() => finish(null), 4000);
                v.addEventListener('error', () => finish(null));
                v.addEventListener('loadedmetadata', () => { try { v.currentTime = Math.min(1, (v.duration || 2) * 0.1); } catch (e) { finish(null); } });
                v.addEventListener('seeked', () => {
                    try {
                        if (!v.videoWidth) return finish(null);
                        const w = 480, h = Math.max(1, Math.round(w * v.videoHeight / v.videoWidth));
                        const c = document.createElement('canvas'); c.width = w; c.height = h;
                        c.getContext('2d').drawImage(v, 0, 0, w, h);
                        finish(c.toDataURL('image/jpeg', 0.8));
                    } catch (e) { finish(null); }
                });
                v.src = url;
            });
        }
        async function handleFilesInner(files, opts) {
            const audioFiles = [];
            const lrcFiles = [];
            let lastAutoPlayIndex = -1;
            const disallowVideoOnAndroid = !!(window.IS_ANDROID_APP || /[?&]android=true/.test(location.search) || document.documentElement.classList.contains('is-android-app'));

            Array.from(files).forEach(file => {
                if (file.name.toLowerCase().endsWith('.lrc')) lrcFiles.push(file);
                else if (disallowVideoOnAndroid && isVideoFile(file)) return;
                else if (file.__fromLibrary || file.type.startsWith('audio/') || isVideoFile(file) || /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|wma|amr|m4b|alac)$/i.test(file.name)) audioFiles.push(file);
            });

            // Bảng tra bài trùng (ưu tiên đường dẫn tệp gốc nếu có, tránh gộp nhầm 2 bài khác nhau trùng tên)
            const dupMap = new Map();
            const dupKey = (n, a, loc) => loc ? ('loc:' + String(loc).toLowerCase()) : (String(n || '').toLowerCase() + '\u0001' + String(a || '').toLowerCase());
            playlist.forEach((t, i) => { const k = dupKey(t.name, t.artist, t.nativeLocation); if (!dupMap.has(k)) dupMap.set(k, i); });
            for (const file of audioFiles) {
                let title = file.__metaTitle || file.name.replace(/\.[^/.]+$/, "");
                let artist = file.__metaArtist || "UNKNOWN ARTIST";
                let album = file.__metaAlbum || "Unknown Album";
                let year = file.__metaYear || "";
                let genre = "";
                let composer = "";
                let cover = null;
                let lyricsRaw = "";
                
                await new Promise((resolve) => {
                    if (file.__nativeUrl || file.__fromLibrary || !window.jsmediatags) return resolve();   // tệp thư viện (virtual File) hoặc stream URL: bỏ qua jsmediatags ở bước nạp danh sách, metadata đầy đủ sẽ đọc qua native/hydrate
                    try {
                        window.jsmediatags.read(file, {
                            onSuccess: function(tag) {
                                if (tag.tags.title) title = tag.tags.title;
                                if (tag.tags.artist) artist = tag.tags.artist;
                                if (tag.tags.album) album = tag.tags.album;
                                if (tag.tags.year) year = tag.tags.year;
                                if (tag.tags.genre) genre = tag.tags.genre;
                                {
                                    // jsmediatags không có shortcut "composer": ID3 nằm ở frame TCOM, MP4 ở ©wrt
                                    const c = tag.tags.composer || tag.tags.TCOM || tag.tags['©wrt'] || tag.tags.COMPOSER;
                                    if (c) composer = (typeof c === 'object' ? (c.data != null ? c.data : '') : c);
                                    if (Array.isArray(composer)) composer = composer.join(', ');
                                    composer = String(composer || '');
                                }
                                // Hỗ trợ Lyric Embed cho các tệp nhạc phổ biến
                                if (tag.tags.USLT) {
                                    lyricsRaw = typeof tag.tags.USLT.data === 'object' ? tag.tags.USLT.data.lyrics : tag.tags.USLT.data;
                                }
                                if (tag.tags.picture) {
                                    const { data, format } = tag.tags.picture;
                                    let base64String = "";
                                    for (let i = 0; i < data.length; i++) {
                                        base64String += String.fromCharCode(data[i]);
                                    }
                                    cover = `data:${format};base64,${window.btoa(base64String)}`;
                                }
                                resolve();
                            },
                            onError: function() { resolve(); }
                        });
                    } catch (e) { resolve(); }
                });

                const url = file.__nativeUrl || URL.createObjectURL(file);
                const videoFile = isVideoFile(file);
                if (videoFile && !cover && !file.__nativeUrl && !window.IS_ANDROID_APP) cover = await captureVideoFrame(url);
                if (videoFile && !lyricsRaw) lyricsRaw = loadVideoSubtitle(file);
                if (!lyricsRaw && file.__nativeLrcText) lyricsRaw = file.__nativeLrcText;

                const existingIndex = dupMap.has(dupKey(title, artist, file.__nativeLocation)) ? dupMap.get(dupKey(title, artist, file.__nativeLocation)) : -1;

                if (existingIndex !== -1) {
                    lastAutoPlayIndex = existingIndex;
                } else {
                    const newTrack = { 
                        name: title,
                        artist: artist,
                        album: album,
                        year: year,
                        genre: genre,
                        composer: composer,
                        cover: cover,
                        url: url,
                        isVideo: videoFile,
                        ext: file.name.split('.').pop().toUpperCase(),
                        lyrics: lyricsRaw ? parseLRC(lyricsRaw) : null,
                        lyricsRaw: lyricsRaw || "",
                        file: file,
                        fileHandle: file.fileHandle || null,
                        nativeId: file.__nativeId || null,
                        nativeLocation: file.__nativeLocation || '',
                        nativeName: file.__nativeName || file.name,
                        nativeStreamUrl: file.__nativeStreamUrl || '',
                        nativeLrcUrl: file.__nativeLrcUrl || '',
                        fromLibrary: !!file.__fromLibrary,
                        rawName: file.name.replace(/\.[^/.]+$/, "") 
                    };
                    playlist.push(newTrack);
                    lastAutoPlayIndex = playlist.length - 1;
                    dupMap.set(dupKey(title, artist, file.__nativeLocation), lastAutoPlayIndex);

                    // Bài mới thêm: ném xuống cuối trong tab Playlist (đã đúng do .push ở
                    // trên), còn trong tab Shuffle thì chèn vào 1 vị trí NGẪU NHIÊN trong
                    // shuffleOrder (chỉ áp dụng nếu shuffleOrder đã từng được khởi tạo)
                    if (shuffleInitialized) {
                        const insertPos = Math.floor(Math.random() * (shuffleOrder.length + 1));
                        shuffleOrder.splice(insertPos, 0, lastAutoPlayIndex);
                    }
                }
            }

            for (const file of lrcFiles) {
                const reader = new FileReader();
                const content = await new Promise(r => {
                    reader.onload = (e) => r(e.target.result);
                    reader.readAsText(file);
                });
                
                const parsed = parseLRC(content);
                const baseName = file.name.replace(/\.[^/.]+$/, "");
                const targetTrack = playlist.find(t => t.rawName === baseName);
                
                if (targetTrack) {
                    targetTrack.lyrics = parsed;
                    targetTrack.lyricsRaw = content;
                } else if (audioFiles.length > 0 && playlist.length > 0) {
                    playlist[playlist.length - 1].lyrics = parsed;
                    playlist[playlist.length - 1].lyricsRaw = content;
                }
            }

            if (document.documentElement.classList.contains('m-ui') && typeof window.__syncMobileLibraryFromPlaylist === 'function') {
                window.__syncMobileLibraryFromPlaylist();
            }
            updatePlaylistUI();
            if (lastAutoPlayIndex !== -1 && !(opts && opts.noPlay)) { playTrack(lastAutoPlayIndex); requestAnimationFrame(() => locateCurrentTrack(true)); }
            if (playlist.length > 0) dropZone.style.display = 'none';
            bgPreview.classList.add('visible');
            initVisualizer();
            if (currentIndex !== -1) renderLyrics();
        }

        const LRC_HEADER_TAG = /^\s*\[(?:audioplayer:LRCLIB|(?:ti|ar|al|au|by|la|ve|length|offset|re|tool):[^\]]*)\]\s*$/i;
        // Chú thích nguồn lyric: "Lyric by <tên>" (tag [by:...]) và/hoặc "Lyric powered by LRCLIB" (tag [audioplayer:LRCLIB])
        function lyricCreditText(track) {
            if (!track || !track.lyrics || !track.lyrics.length) return '';
            const raw = track.lyricsRaw || '';
            const parts = [];
            const by = /^\s*\[by:([^\]]*)\]/im.exec(raw);
            if (by && by[1].trim()) parts.push('Lyric by ' + by[1].trim());
            if (/\[audioplayer:LRCLIB\]/i.test(raw)) parts.push('Lyric powered by LRCLIB');
            return parts.join(' • ');
        }
        // Mọi thẻ thông tin trong file LRC ([ti:], [ar:], [al:], [au:], [by:], [la:], [ve:]...) -> chỉ hiện ở Lyric View
        const LRC_INFO_ICONS = { ti: 'edit', ar: 'person', al: 'album', au: 'edit_note', by: 'lyrics', la: 'translate', ve: 'tag', length: 'schedule', offset: 'timer', re: 'edit', tool: 'build' };
        const LRC_INFO_LABELS = { ti: 'Title', ar: 'Artist', al: 'Album', au: 'Author', by: 'Lyric by', la: 'Language', ve: 'Version', length: 'Length', offset: 'Offset', re: 'Editor', tool: 'Tool' };
        function lyricInfoList(track) {
            const out = [];
            if (!track || !track.lyricsRaw) return out;
            const seen = new Set();
            track.lyricsRaw.split(/\r?\n/).forEach(line => {
                const m = /^\s*\[(ti|ar|al|au|by|la|ve|length|offset|re|tool):([^\]]*)\]/i.exec(line);
                if (!m) return;
                const k = m[1].toLowerCase(), v = m[2].trim();
                if (!v || seen.has(k)) return;
                seen.add(k); out.push([k, v]);
            });
            return out;
        }
        const escHtml = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        // Bọc dòng lyric (kèm chú thích nhỏ bên dưới nếu bài có tag)
        function lyricHtml(text, track, clamp) {
            const box = clamp ? 'display:-webkit-box;-webkit-line-clamp:' + clamp + ';-webkit-box-orient:vertical;overflow:hidden;' : '';
            const ct = lyricCreditText(track);
            const credit = ct
                ? '<small style="display:block;font-size:.5em;font-weight:500;opacity:.65;margin-top:4px;letter-spacing:.3px;text-shadow:none;">' + escHtml(ct) + '</small>' : '';
            return '<span style="' + box + '">' + text + '</span>' + credit;
        }
        function updateLyricCredit() {
            const el = document.getElementById('lyric-credit');
            if (!el) return;
            const ct = lyricCreditText(playlist[currentIndex]);
            el.textContent = ct;
            el.classList.toggle('on', !!ct);
        }
        function parseLRC(lrcText) {
            const lines = lrcText.split('\n').filter(l => !LRC_HEADER_TAG.test(l));
            const result = [];
            const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/; 
            const hasTime = lines.some(line => timeReg.test(line));

            if (!hasTime) {
                return lines.map(line => ({ time: -1, text: line.trim() })).filter(l => l.text);
            }

            lines.forEach(line => {
                const match = timeReg.exec(line);
                if (match) {
                    const min = parseInt(match[1]);
                    const sec = parseInt(match[2]);
                    const msStr = match[3];
                    const ms = parseInt(msStr);
                    const time = min * 60 + sec + (msStr.length === 2 ? ms / 100 : ms / 1000);
                    const txt = line.replace(timeReg, '').trim();
                    result.push({ time, text: txt });
                }
            });
            return result.sort((a,b) => a.time - b.time);
        }

        function formatLyricLine(text) {
            if (text === "") return '<div class="bouncing-dots"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>';
            return text;
        }

        function renderLyrics() {
            lyricOverlay.innerHTML = '';
            updateLyricCredit();
            const track = playlist[currentIndex];
            if (!track || !track.lyrics || track.lyrics.length === 0) {
                const noLyricText = currentLangDict['lyric.no_lyric'] || 'BÀI HÁT NÀY CHƯA CÓ LỜI (.LRC)';
                const hintText = currentLangDict['lyric.right_click_hint'] || 'Chuột phải vào bài hát để nạp lẻ';
                lyricOverlay.innerHTML = `<div class="lyric-placeholder">${noLyricText}<br><small style="font-size: calc(8px * var(--font-scale-factor, 1))">${hintText}</small></div>`;
                return;
            }

            const isStatic = track.lyrics[0]?.time === -1;
            if (!isStatic) {
                const spacerTop = document.createElement('div'); spacerTop.style.height = '40vh';
                lyricOverlay.appendChild(spacerTop);
            }

            track.lyrics.forEach((l, i) => {
                const div = document.createElement('div');
                div.className = `lyric-line ${isStatic ? 'static' : ''}`; 
                div.innerHTML = formatLyricLine(l.text);
                if (!isStatic) {
                    div.onclick = () => { audio.currentTime = l.time; audio.play(); };
                }
                lyricOverlay.appendChild(div);
            });

            if (!isStatic) {
                const spacerBottom = document.createElement('div'); spacerBottom.style.height = '40vh';
                lyricOverlay.appendChild(spacerBottom);
            } else {
                lyricOverlay.style.padding = '100px 20px';
            }
        }

        // --- STREAMING_CHUNK:Synchronizing audio playhead with visual lyrics... ---
        function syncLyrics() {
            const track = playlist[currentIndex];
            if (!track || !track.lyrics || track.lyrics[0]?.time === -1) {
                if (customPipWindow) {
                    const pipLyricEl = customPipWindow.document.getElementById('pip-lyric');
                    if (pipLyricEl) { pipLyricEl.innerHTML = ''; pipLyricEl.dataset.currentIdx = ''; }
                }
                const topLyricEl = document.getElementById('top-active-lyric');
                if (topLyricEl) { topLyricEl.innerHTML = ''; topLyricEl.dataset.currentIdx = ''; }

                // Xoá luôn lyric đang hiển thị ở Full screen, tránh giữ lại dòng cũ của bài trước
                const fsLyricElEmpty = document.getElementById('fs-lyric');
                if (fsLyricElEmpty) { fsLyricElEmpty.innerHTML = ''; fsLyricElEmpty.dataset.currentIdx = ''; }
                return;
            }
            
            const time = audio.currentTime;
            let activeIdx = -1;
            for (let i = 0; i < track.lyrics.length; i++) {
                if (time >= track.lyrics[i].time - 0.2) activeIdx = i;
                else break;
            }
            
            const creditKey = lyricCreditText(track);
            const line = activeIdx !== -1 ? formatLyricLine(track.lyrics[activeIdx].text) : '';
            const htmlTop = activeIdx !== -1 ? lyricHtml(line, track, document.documentElement.classList.contains('m-ui') ? 5 : 2) : '';
            const htmlPip = activeIdx !== -1 ? lyricHtml(line, track, 3) : '';
            const htmlFs = activeIdx !== -1 ? lyricHtml(line, track, 0) : '';
            const idxStr = activeIdx.toString() + (creditKey ? '|' + creditKey : '');
            
            if (customPipWindow) {
                const pipLyricEl = customPipWindow.document.getElementById('pip-lyric');
                if (pipLyricEl && settings.showPipLyric) {
                    if (pipLyricEl.dataset.currentIdx !== idxStr) {
                        pipLyricEl.innerHTML = htmlPip;
                        pipLyricEl.dataset.currentIdx = idxStr;
                    }
                } else if (pipLyricEl) {
                    pipLyricEl.innerHTML = '';
                    pipLyricEl.dataset.currentIdx = '';
                }
            }
            
            const topLyricEl = document.getElementById('top-active-lyric');
            if (topLyricEl && settings.showMainLyric) {
                if (topLyricEl.dataset.currentIdx !== idxStr) {
                    topLyricEl.innerHTML = htmlTop;
                    topLyricEl.dataset.currentIdx = idxStr;
                }
            }

            // Đồng bộ lyrics lên màn hình Toàn màn hình (Fullscreen) mới
            if (document.body.classList.contains('fullscreen-active')) {
                const fsLyricEl = document.getElementById('fs-lyric');
                if (fsLyricEl && fsLyricEl.dataset.currentIdx !== idxStr) {
                    fsLyricEl.innerHTML = htmlFs || lyricHtml(formatLyricLine(""), track, 0);
                    fsLyricEl.dataset.currentIdx = idxStr;
                }
            }

            if (!isLyricVisible) return;
            if (document.body.classList.contains('lyric-static')) return;

            if (activeIdx !== -1) {
                const lines = lyricOverlay.querySelectorAll('.lyric-line');
                const currentActive = lyricOverlay.querySelector('.lyric-line.active');
                const newActive = lines[activeIdx];
                if (currentActive !== newActive) {
                    if (currentActive) currentActive.classList.remove('active');
                    if (newActive) {
                        newActive.classList.add('active');
                        const offset = newActive.offsetTop - lyricOverlay.clientHeight / 2 + newActive.clientHeight / 2;
                        lyricOverlay.scrollTo({ top: offset, behavior: 'smooth' });
                    }
                }
            }
        }

        lyricBtn.addEventListener('click', function() {
            isLyricVisible = !isLyricVisible;
            this.classList.toggle('active', isLyricVisible);
            lyricOverlay.classList.toggle('visible', isLyricVisible);
            document.body.classList.toggle('lyrics-open', isLyricVisible);
            if (isLyricVisible) {
                 renderLyrics();
                 syncLyrics();
            }
        });

        // --- Bảng điều khiển lyric (điện thoại): luôn hiển thị khi mở Lyric View ---
        (function () {
            const body = document.body, panel = document.getElementById('m-lyric-panel');
            const playB = document.getElementById('m-lyric-play'), seek = document.getElementById('m-lyric-seek');
            let dragging = false;
            const show = () => { body.classList.add('m-lyric-ui'); };
            lyricOverlay.addEventListener('click', () => { if (document.documentElement.classList.contains('m-ui')) show(); });
            seek.addEventListener('pointerdown', () => { dragging = true; });
            window.addEventListener('pointerup', () => { if (dragging) { dragging = false; } });
            seek.addEventListener('input', () => { if (isFinite(audio.duration)) audio.currentTime = seek.value / 100 * audio.duration; });
            audio.addEventListener('timeupdate', () => { if (!dragging && isFinite(audio.duration) && audio.duration > 0) seek.value = audio.currentTime / audio.duration * 100; });
            const icon = () => { playB.firstElementChild.textContent = audio.paused ? 'play_arrow' : 'pause'; };
            audio.addEventListener('play', icon); audio.addEventListener('pause', icon); icon();
            playB.addEventListener('click', () => document.getElementById('play-btn').click());
            document.getElementById('m-lyric-back').addEventListener('click', () => { body.classList.remove('m-lyric-ui'); if (isLyricVisible) lyricBtn.click(); });
            window.__mLyricBackClose = () => {
                body.classList.remove('m-lyric-ui');
                const lb = document.getElementById('lyric-btn') || (typeof lyricBtn !== 'undefined' ? lyricBtn : null);
                if (typeof isLyricVisible !== 'undefined' && isLyricVisible && lb) {
                    lb.click();
                } else {
                    if (typeof isLyricVisible !== 'undefined') isLyricVisible = false;
                    body.classList.remove('lyrics-open', 'm-lyric-ui');
                    const lo = document.getElementById('lyric-overlay') || (typeof lyricOverlay !== 'undefined' ? lyricOverlay : null);
                    if (lo) {
                        lo.classList.remove('visible');
                        lo.style.opacity = '';
                        lo.style.visibility = '';
                        lo.style.display = '';
                        lo.style.pointerEvents = '';
                    }
                    if (lb) lb.classList.remove('active');
                }
            };
            const syncB = document.getElementById('m-lyric-synced'), statB = document.getElementById('m-lyric-static');
            const setMode = (st) => {
                body.classList.toggle('lyric-static', st);
                syncB.classList.toggle('on', !st); statB.classList.toggle('on', st);
                if (st) { const a = lyricOverlay.querySelector('.lyric-line.active'); if (a) a.classList.remove('active'); }
                else { try { syncLyrics(); } catch (e) {} }
            };
            syncB.addEventListener('click', () => setMode(false));
            statB.addEventListener('click', () => setMode(true));
            document.getElementById('m-lyric-more').addEventListener('click', () => { try { openLyricSearchFromView(); } catch (e) {} });
            lyricBtn.addEventListener('click', () => { if (!isLyricVisible) body.classList.remove('m-lyric-ui'); else show(); });
        })();

        // Thanh tìm kiếm trong Lyric View -> mở Metadata Editor + giao diện tìm lời
        let openLrcSearchPending = false;
        function openLyricSearchFromView() {
            if (currentIndex === -1 || !playlist[currentIndex] || playlist[currentIndex].isVideo) return;
            if (typeof isEditorOpen === 'function' && isEditorOpen()) return;
            btnEditMetadataFields.click();
            if (metadataEditorReady) metadataIframe.contentWindow.postMessage({ type: 'openLrcSearch' }, '*');
            else openLrcSearchPending = true;
        }
        {
            const sb = document.getElementById('lyric-search-bar');
            sb.addEventListener('click', openLyricSearchFromView);
            sb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLyricSearchFromView(); } });
        }

        playlistSearch.addEventListener('input', (e) => {
            if (isReorderMode) { findQuery = removeVietnameseTones(e.target.value.toLowerCase().trim()); findIdx = 0; applyFind(true); return; }
            searchQuery = removeVietnameseTones(e.target.value.toLowerCase().trim());
            plLimit = PL_CHUNK;
            updatePlaylistUI();
        });

        document.getElementById('reorder-btn').addEventListener('click', (e) => {
            e.stopPropagation(); 
            const anchor = captureListAnchor();
            isReorderMode = true;
            document.body.classList.add('reorder-active');
            if (playlistCard.classList.contains('collapsed')) {
                togglePlaylist(); 
            }
            // Trong chế độ sắp xếp, ô tìm kiếm hoạt động như Ctrl + F (bôi vàng, không lọc)
            playlistSearch.value = ''; searchQuery = ''; findQuery = ''; findIdx = 0;
            playlistSearch.placeholder = __trf('playlist.find_placeholder', 'Tìm trong danh sách...');
            updatePlaylistUI(); 
            restoreListAnchor(anchor);
        });

        document.getElementById('reorder-done-btn').addEventListener('click', () => {
            const anchor = captureListAnchor();
            isReorderMode = false;
            document.body.classList.remove('reorder-active');
            // Đảm bảo đợt vẽ lazy-load đủ dài để chứa vị trí đang xem (không bị cắt ngắn rồi nhảy lên đầu)
            if (anchor) {
                const pos = anchor.pos;
                if (pos >= 0) plLimit = Math.max(plLimit, pos + PL_CHUNK);
            }
            playlistSearch.value = ''; searchQuery = ''; findQuery = ''; findIdx = 0;
            playlistSearch.placeholder = __trf('playlist.search_placeholder', 'Tìm tên bài, ca sĩ...');
            updatePlaylistUI(); 
            restoreListAnchor(anchor);
        });

        // ----- Tìm kiểu Ctrl + F trong chế độ sắp xếp (bôi vàng + nút chuyển, không có thay thế) -----
        let findQuery = '', findIdx = 0;
        const __trf = (k, f) => { try { return (window.__tr && window.__tr(k)) || f; } catch (e) { return f; } };
        function clearFindMarks() {
            playlistContainer.querySelectorAll('mark.find-hit').forEach(m => {
                const par = m.parentNode;
                par.replaceChild(document.createTextNode(m.textContent), m);
                par.normalize();
            });
        }
        function highlightIn(div) {
            const text = div.textContent;
            let norm = '';
            for (const ch of text) {
                const n = removeVietnameseTones(ch).toLowerCase();
                norm += (n.length === ch.length) ? n : ch.toLowerCase().slice(0, ch.length).padEnd(ch.length, ' ');
            }
            if (norm.length !== text.length) return;
            const hits = [];
            let from = 0, at;
            while ((at = norm.indexOf(findQuery, from)) >= 0) { hits.push(at); from = at + findQuery.length; }
            if (!hits.length) return;
            div.textContent = '';
            let pos = 0;
            hits.forEach(h => {
                if (h > pos) div.appendChild(document.createTextNode(text.slice(pos, h)));
                const m = document.createElement('mark');
                m.className = 'find-hit';
                m.textContent = text.slice(h, h + findQuery.length);
                div.appendChild(m);
                pos = h + findQuery.length;
            });
            if (pos < text.length) div.appendChild(document.createTextNode(text.slice(pos)));
        }
        function updateFindUI(n) {
            const cnt = document.getElementById('find-count');
            if (cnt) cnt.textContent = (n ? (findIdx + 1) : 0) + '/' + n;
            ['find-prev', 'find-next'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = n < 1; });
        }
        function applyFind(scroll) {
            clearFindMarks();
            if (!isReorderMode || !findQuery) { updateFindUI(0); return; }
            playlistContainer.querySelectorAll('.song-item .track-text > div').forEach(highlightIn);
            const marks = playlistContainer.querySelectorAll('mark.find-hit');
            if (findIdx >= marks.length) findIdx = 0;
            marks.forEach((m, i) => m.classList.toggle('find-current', i === findIdx));
            updateFindUI(marks.length);
            if (scroll && marks[findIdx]) {
                // Chỉ cuộn bên trong playlist, không cuộn cả trang
                const c = playlistContainer, r = marks[findIdx].getBoundingClientRect(), cr = c.getBoundingClientRect();
                c.scrollTo({ top: c.scrollTop + (r.top - cr.top) - c.clientHeight / 2 + r.height / 2, behavior: 'smooth' });
            }
        }
        function stepFind(d) {
            const marks = playlistContainer.querySelectorAll('mark.find-hit');
            if (!marks.length) return;
            findIdx = (findIdx + d + marks.length) % marks.length;
            applyFind(true);
        }
        document.getElementById('find-next').addEventListener('click', () => stepFind(1));
        document.getElementById('find-prev').addEventListener('click', () => stepFind(-1));
        playlistSearch.addEventListener('keydown', (e) => {
            if (!isReorderMode) return;
            if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
        });

        // Giữ nguyên vị trí cuộn của danh sách khi vào/thoát chế độ sắp xếp:
        // ghi nhớ bài đang nằm ở mép trên + độ lệch, rồi đặt lại sau khi vẽ và sau khi layout đổi xong.
        function captureListAnchor() {
            const c = playlistContainer;
            if (!c) return null;
            const top = c.getBoundingClientRect().top;
            const items = c.querySelectorAll('.song-item');
            let pos = 0;
            for (const el of items) {
                const r = el.getBoundingClientRect();
                if (r.bottom > top + 1) return { index: +el.dataset.index, pos, offset: r.top - top, scrollTop: c.scrollTop };
                pos++;
            }
            return { index: -1, pos: -1, offset: 0, scrollTop: c.scrollTop };
        }
        function restoreListAnchor(a) {
            if (!a) return;
            const c = playlistContainer;
            const apply = () => {
                if (a.index < 0) { c.scrollTop = a.scrollTop; return; }
                const el = c.querySelector('.song-item[data-index="' + a.index + '"]');
                if (!el) return;
                c.scrollTop += (el.getBoundingClientRect().top - c.getBoundingClientRect().top) - a.offset;
            };
            apply();
            requestAnimationFrame(apply);
            // giữ đúng vị trí suốt lúc khung playlist đang đổi kích thước (transition)
            const t0 = performance.now();
            const tick = () => { apply(); if (performance.now() - t0 < 600) requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
        }

        // Di chuyển track ở playlist-index "fromIndex" tới ngay trước track ở "toIndex",
        // NHƯNG chỉ đổi vị trí bên trong shuffleOrder (không đụng gì tới mảng playlist
        // thật) -> dùng khi kéo-thả sắp xếp lại đang ở tab Shuffle
        function moveInShuffleOrder(fromIndex, toIndex) {
            const posFrom = shuffleOrder.indexOf(fromIndex);
            if (posFrom === -1) return;
            const [moved] = shuffleOrder.splice(posFrom, 1);
            let posTo = shuffleOrder.indexOf(toIndex);
            if (posTo === -1) posTo = shuffleOrder.length;
            shuffleOrder.splice(posTo, 0, moved);
        }

        // Thực hiện việc chuyển bài từ index nguồn tới index đích (dùng chung cho kéo-thả)
        function commitReorder(srcIdx, targetIdx) {
            if (srcIdx === targetIdx || srcIdx < 0 || targetIdx < 0) return;
            if (activePlTab === 'shuffle') {
                moveInShuffleOrder(srcIdx, targetIdx);
            } else {
                const playingTrack = currentIndex !== -1 ? playlist[currentIndex] : null;
                const draggedTrack = playlist.splice(srcIdx, 1)[0];
                playlist.splice(targetIdx, 0, draggedTrack);
                if (playingTrack) currentIndex = playlist.indexOf(playingTrack);
                if (shuffleInitialized) {
                    shuffleOrder = shuffleOrder.map(idx => {
                        if (idx === srcIdx) return targetIdx;
                        if (srcIdx < targetIdx) {
                            if (idx > srcIdx && idx <= targetIdx) return idx - 1;
                        } else if (srcIdx > targetIdx) {
                            if (idx >= targetIdx && idx < srcIdx) return idx + 1;
                        }
                        return idx;
                    });
                }
            }
        }

        // Kéo-thả sắp xếp kiểu "dính" vào playlist (không dùng HTML5 drag-and-drop nên không có ảnh ma của Chrome):
        // bài đang kéo chạy theo con trỏ trong phạm vi danh sách, các bài khác tự né ra chỗ trống.
        function startReorderDrag(e, item, srcIndex) {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.pointerType !== 'mouse' && !e.target.closest('.icon-drag')) return; // cảm ứng: chỉ kéo bằng tay nắm
            const container = playlistContainer;
            const items = Array.from(container.querySelectorAll('.song-item'));
            const i0 = items.indexOf(item);
            if (i0 < 0) return;
            e.preventDefault();
            const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
            const tops = items.map(el => el.offsetTop), hs = items.map(el => el.offsetHeight);
            const gap = items.length > 1 ? Math.max(0, (tops[1] - tops[0]) - hs[0]) : 0;
            const step = hs[i0] + gap;                          // quãng đường các bài khác phải né
            const centers = items.map((el, k) => tops[k] + hs[k] / 2);
            const minDy = tops[0] - tops[i0];
            const maxDy = tops[items.length - 1] + hs[items.length - 1] - (tops[i0] + hs[i0]);
            const startY = e.clientY, startScroll = container.scrollTop;
            let pointerY = e.clientY, target = i0, raf = null, dy = 0;

            item.classList.add('dragging');
            item.style.transition = 'none';
            item.style.zIndex = '5';
            item.style.position = 'relative';
            items.forEach((el, k) => { if (k !== i0) el.style.transition = 'transform .22s cubic-bezier(.2,0,0,1)'; });
            try { item.setPointerCapture(e.pointerId); } catch (err) {}

            function layout() {
                dy = (pointerY - startY) / scale + (container.scrollTop - startScroll);
                dy = Math.max(minDy, Math.min(maxDy, dy));
                item.style.transform = 'translateY(' + dy + 'px) scale(1.02)';
                // So mép trên/dưới của bài đang kéo với tâm các bài khác -> kéo sát mép là tới được vị trí đầu/cuối
                const dTop = tops[i0] + dy, dBottom = dTop + hs[i0];
                let t = i0;
                for (let k = 0; k < items.length; k++) {
                    if (k === i0) continue;
                    if (k > i0 && dBottom > centers[k]) t = Math.max(t, k);
                    if (k < i0 && dTop < centers[k]) t = Math.min(t, k);
                }
                target = t;
                items.forEach((el, k) => {
                    if (k === i0) return;
                    let shift = 0;
                    if (k > i0 && k <= t) shift = -step;
                    else if (k < i0 && k >= t) shift = step;
                    el.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
                });
            }
            // Tự cuộn khi kéo sát mép trên/dưới của danh sách
            function autoScroll() {
                const r = container.getBoundingClientRect();
                const zone = 48 * scale;
                let v = 0;
                if (pointerY < r.top + zone) v = -Math.min(14, (r.top + zone - pointerY) / 3);
                else if (pointerY > r.bottom - zone) v = Math.min(14, (pointerY - (r.bottom - zone)) / 3);
                if (v) { container.scrollTop += v; layout(); }
                raf = requestAnimationFrame(autoScroll);
            }
            raf = requestAnimationFrame(autoScroll);
            layout();

            const onMove = (ev) => { pointerY = ev.clientY; layout(); };
            const finish = (ev, cancel) => {
                item.removeEventListener('pointermove', onMove);
                item.removeEventListener('pointerup', onUp);
                item.removeEventListener('pointercancel', onCancel);
                cancelAnimationFrame(raf);
                try { item.releasePointerCapture(e.pointerId); } catch (err) {}
                const finalT = cancel ? i0 : target;
                // Trượt bài vừa thả vào đúng ô trống rồi mới ghi nhận thứ tự mới
                let slotDy = 0;
                if (finalT > i0) { for (let k = i0 + 1; k <= finalT; k++) slotDy += hs[k] + gap; }
                else if (finalT < i0) { for (let k = finalT; k < i0; k++) slotDy -= hs[k] + gap; }
                item.style.transition = 'transform .2s cubic-bezier(.2,0,0,1)';
                item.style.transform = 'translateY(' + slotDy + 'px)';
                setTimeout(() => {
                    const fromData = parseInt(items[i0].dataset.index, 10);
                    const toData = parseInt(items[finalT].dataset.index, 10);
                    if (!cancel) commitReorder(fromData, toData);
                    updatePlaylistUI();
                }, 210);
            };
            const onUp = (ev) => finish(ev, false);
            const onCancel = (ev) => finish(ev, true);
            item.addEventListener('pointermove', onMove);
            item.addEventListener('pointerup', onUp);
            item.addEventListener('pointercancel', onCancel);
        }

        // Đang nạp hàng loạt thư viện: hoãn dựng danh sách (dựng một lần khi nạp xong hoặc khi người dùng mở danh sách)
        window.__plDefer = false; window.__plDirty = false;
        window.__plFlush = function () {
            window.__plDefer = false;
            if (window.__plDirty) { window.__plDirty = false; updatePlaylistUI(); }
        };
        const plNorm = (track) => {
            const n = track.name || '', a = track.artist || '', g = track.genre || '', c = track.composer || '';
            const c0 = track._pn;
            if (c0 && c0[0] === n && c0[1] === a && c0[2] === g && c0[3] === c) return c0;
            return (track._pn = [n, a, g, c, removeVietnameseTones(n).toLowerCase(), removeVietnameseTones(a).toLowerCase(), removeVietnameseTones(g).toLowerCase(), removeVietnameseTones(c).toLowerCase()]);
        };
        function updatePlaylistUI() {
            if (window.__plDefer) { window.__plDirty = true; return; }
            playlistContainer.innerHTML = '';
            let count = 0;

            // Xác định thứ tự index (thật, trỏ vào playlist) sẽ render, tuỳ tab đang xem
            let renderOrder;
            if (activePlTab === 'shuffle') {
                if (!shuffleInitialized) generateShuffleOrder();
                // Hiện thẳng đúng thứ tự thật của shuffleOrder -> bài đang phát nằm ở
                // đúng vị trí thật của nó (vị trí 0 ngay sau khi vừa reshuffle), Next là
                // chạy xuống đúng bài kế tiếp thật sự đang hiển thị ngay bên dưới
                renderOrder = [...shuffleOrder];
            } else {
                renderOrder = playlist.map((_, i) => i);
            }

            // Lọc các bài khớp tìm kiếm (hoặc tất cả khi đang sắp xếp)
            const matched = [];
            renderOrder.forEach((index) => {
                const track = playlist[index];
                if (!track) return; // an toàn, phòng lệch dữ liệu nhất thời
                const pn = plNorm(track);
                const normalizedName = pn[4], normalizedArtist = pn[5], normalizedGenre = pn[6], normalizedComposer = pn[7];
                const matches = isReorderMode || normalizedName.includes(searchQuery) || normalizedArtist.includes(searchQuery)
                    || normalizedGenre.includes(searchQuery) || normalizedComposer.includes(searchQuery);
                if (matches) matched.push(index);
            });
            count = matched.length;

            let enterN = 0;
            const makeItem = (index) => {
                const track = playlist[index];
                if (!trackEnter.has(track)) trackEnter.set(track, { at: isReorderMode ? -1e9 : performance.now(), delay: Math.min(enterN++ * 30, 450) });
                const enterInfo = trackEnter.get(track);
                const enterLeft = enterInfo.delay + ENTER_MS - (performance.now() - enterInfo.at);
                    const item = document.createElement('div');
                    item.className = `song-item ${index === currentIndex ? 'active' : ''}`;
                    item.dataset.index = index;
                    if (!isReorderMode && enterLeft > 30) { item.classList.add('song-enter'); item.style.animationDelay = (enterInfo.delay - (performance.now() - enterInfo.at)) + 'ms'; }
                    
                    item.innerHTML = `
                        <span class="icon-play" style="font-family: inherit; font-size: calc(14px * var(--font-scale-factor, 1)); font-weight:800; width:22px; text-align:center; opacity:0.6; flex-shrink:0;">${index + 1}</span>
                        <span class="material-symbols-rounded icon-drag" style="font-size:20px" title="Nắm để kéo thả">drag_handle</span>
                        <div class="track-text">
                            <div style="font-weight:700; font-size: calc(14px * var(--font-scale-factor, 1)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${track.name}</div>
                            <div style="font-family:'Minecraft'; font-size: calc(8px * var(--font-scale-factor, 1)); opacity: 0.6; margin-top: 2px;">${track.artist} | ${track.ext} ${track.lyrics ? (track.lyrics[0].time === -1 ? '• TXT' : '• LRC') : ''} ${track.fileHandle ? '• FS' : ''}</div>
                        </div>
                        <button type="button" class="btn-m3 song-more-btn" title="${tr2('contextmenu.more_options', 'Tùy chọn')}" aria-label="${tr2('contextmenu.more_options', 'Tùy chọn')}">
                            <span class="material-symbols-rounded" style="font-size:20px;">more_vert</span>
                        </button>
                        <span class="reorder-num">${index + 1}</span>
                    `;
                    // Số thứ tự đổi -> số cũ zoom-out rồi số mới zoom-in
                    {
                        const num = index + 1, prev = trackNum.get(track);
                        trackNum.set(track, num);
                        if (prev !== undefined && prev !== num && !isReorderMode && !document.documentElement.classList.contains('reduce-motion')) {
                            const sp = item.querySelector('.icon-play');
                            if (sp) {
                                sp.textContent = prev;
                                const out = sp.animate([{ transform: 'scale(1)', opacity: 0.6 }, { transform: 'scale(0)', opacity: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
                                out.onfinish = () => {
                                    sp.textContent = num; out.cancel();
                                    sp.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.6 }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
                                };
                            }
                        }
                    }

                    
                    const moreBtn = item.querySelector('.song-more-btn');
                    if (moreBtn) {
                        moreBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (isReorderMode) return;
                            const isSameOpen = contextMenu.style.display === 'flex' && targetMenuIndex === index;
                            if (isSameOpen) {
                                contextMenu.style.display = 'none';
                                return;
                            }
                            targetMenuIndex = index;
                            if (cmDelete) cmDelete.style.display = '';
                            contextMenu.style.display = 'flex';
                            const r = moreBtn.getBoundingClientRect();
                            window.__placeMenu(contextMenu, r.right, r.bottom + 4);
                        });
                    }

                    if (isReorderMode) {
                        item.addEventListener('pointerdown', (e) => startReorderDrag(e, item, index));
                    } else if (!isReorderMode) {
                        item.onclick = () => playTrack(index);
                    }

                return item;
            };

            // Lazy-loading: chỉ vẽ từng đợt, cuộn gần tới cuối mới vẽ thêm
            if (plObserver) { plObserver.disconnect(); plObserver = null; }
            let limit = isReorderMode ? matched.length : Math.max(PL_CHUNK, plLimit);
            const activePos = matched.indexOf(currentIndex);
            if (!isReorderMode && activePos >= limit) limit = activePos + 1;   // bài đang phát luôn có mặt
            plLimit = limit;
            let rendered = 0;
            const renderUpTo = (n) => {
                const end = Math.min(n, matched.length);
                while (rendered < end) playlistContainer.appendChild(makeItem(matched[rendered++]));
            };
            renderUpTo(limit);
            if (rendered < matched.length) {
                const sentinel = document.createElement('div');
                sentinel.id = 'pl-sentinel';
                sentinel.style.cssText = 'height:1px; flex-shrink:0;';
                playlistContainer.appendChild(sentinel);
                plObserver = new IntersectionObserver((entries) => {
                    if (!entries.some(en => en.isIntersecting)) return;
                    plLimit += PL_CHUNK;
                    renderUpTo(plLimit);
                    if (rendered >= matched.length) { plObserver.disconnect(); plObserver = null; sentinel.remove(); return; }
                    playlistContainer.appendChild(sentinel);   // đẩy mốc xuống cuối, quan sát lại để nạp tiếp nếu vẫn còn trống
                    plObserver.unobserve(sentinel); plObserver.observe(sentinel);
                }, { root: playlistContainer, rootMargin: '240px 0px' });
                plObserver.observe(sentinel);
            }

            if (isReorderMode && findQuery) applyFind(false);
            document.getElementById('track-count').innerText = searchQuery && !isReorderMode ? `${count}/${playlist.length}` : playlist.length;
            const mPlBadge = document.getElementById('m-playlist-badge');
            if (mPlBadge) mPlBadge.textContent = playlist.length > 0 ? (playlist.length > 99 ? '99+' : String(playlist.length)) : '';

            if (typeof renderPipPlaylist === 'function' && customPipWindow) {
                renderPipPlaylist();
            }
            if (typeof window.__renderMobileLibrary === 'function') window.__renderMobileLibrary();
            if (typeof window.__syncPldActive === 'function') window.__syncPldActive();
            if (typeof window.__syncLikeBtn === 'function') window.__syncLikeBtn();
            if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
        }

        function locateCurrentTrack(smooth = true) {
            if (currentIndex < 0 || !playlist[currentIndex]) return;
            if (isReorderMode) return;
            const find = () => playlistContainer.querySelector('.song-item.active');
            let el = find();
            if (!el && searchQuery) {   // bài đang phát bị bộ lọc ẩn -> bỏ lọc
                const si = document.getElementById('playlist-search');
                if (si) si.value = '';
                searchQuery = '';
                updatePlaylistUI();
                el = find();
            }
            if (!el) return;
            if (playlistCard.classList.contains('collapsed') && typeof togglePlaylist === 'function') togglePlaylist();
            el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
            if (smooth && !document.documentElement.classList.contains('reduce-motion')) {
                el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
            }
        }
        document.getElementById('locate-btn').addEventListener('click', (e) => { e.stopPropagation(); locateCurrentTrack(true); });

        // Cơ chế nhường luồng: khi người dùng chọn bài, tạm dừng quét nền 3 luồng để dồn toàn bộ I/O + CPU đọc full metadata & lyric embed cho bài đang chọn
        let priorityMetaCount = 0;
        let priorityMetaWaiters = [];
        window.__enterPriorityMeta = function () { priorityMetaCount++; };
        window.__leavePriorityMeta = function () {
            priorityMetaCount = Math.max(0, priorityMetaCount - 1);
            if (priorityMetaCount === 0 && priorityMetaWaiters.length) {
                const ws = priorityMetaWaiters.splice(0);
                ws.forEach(fn => { try { fn(); } catch (e) {} });
            }
        };
        window.__waitPriorityMeta = function () {
            if (priorityMetaCount <= 0) return Promise.resolve();
            return new Promise(res => priorityMetaWaiters.push(res));
        };

        function extractJsMediaTagsLyrics(t) {
            if (!t) return '';
            const candidates = [t.USLT, t.lyrics, t['©lyr'], t.LYRICS, t.UNSYNCEDLYRICS, t.unsyncedlyrics];
            for (const c of candidates) {
                if (!c) continue;
                let v = '';
                if (typeof c === 'string') v = c;
                else if (typeof c.data === 'string') v = c.data;
                else if (c.data && typeof c.data === 'object') v = c.data.lyrics || c.data.text || '';
                else if (typeof c.lyrics === 'string') v = c.lyrics;
                if (v && v.trim()) return v;
            }
            return '';
        }

        function readTagsWithJsMediaTags(targetFile) {
            if (!targetFile || !window.jsmediatags) return Promise.resolve(null);
            return new Promise((resolve) => {
                try {
                    window.jsmediatags.read(targetFile, {
                        onSuccess: function (tag) {
                            const t = (tag && tag.tags) || {};
                            const c = t.composer || t.TCOM || t['©wrt'] || t.COMPOSER;
                            let comp = c ? (typeof c === 'object' ? (c.data != null ? c.data : '') : c) : '';
                            if (Array.isArray(comp)) comp = comp.join(', ');
                            const ly = extractJsMediaTagsLyrics(t);
                            let picUrl = null;
                            if (t.picture) {
                                const { data, format } = t.picture;
                                const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
                                let bin = '';
                                for (let i = 0; i < bytes.length; i += 8192) {
                                    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
                                }
                                picUrl = `data:${format || 'image/jpeg'};base64,${window.btoa(bin)}`;
                            }
                            resolve({
                                title: t.title || '',
                                artist: t.artist || '',
                                album: t.album || '',
                                year: t.year || '',
                                genre: t.genre || '',
                                composer: String(comp || ''),
                                lyrics: ly || '',
                                pictureDataUrl: picUrl,
                                hasPicture: !!picUrl,
                                source: 'jsmediatags'
                            });
                        },
                        onError: function () { resolve(null); }
                    });
                } catch (e) { resolve(null); }
            });
        }

        let nativeMetaEndpointSupported = true;
        async function readCompleteTrackTags(track, opts) {
            if (!track) return null;
            const preferThumb = !!(opts && opts.preferThumb);
            const includeLyrics = !!(opts && opts.includeLyrics);
            let nativeResult = null;

            // 1. Trên Android native: gọi endpoint bất đồng bộ /meta/<id> (chạy trên luồng IO của WebView)
            if (track.nativeId && window.IS_ANDROID_APP) {
                let m = null;
                if (nativeMetaEndpointSupported) {
                    try {
                        const mr = await fetch('https://appassets.local/meta/' + encodeURIComponent(String(track.nativeId)));
                        if (mr && mr.ok) {
                            m = await mr.json();
                        } else if (mr && mr.status === 404 && !track.nativeStreamUrl) {
                            nativeMetaEndpointSupported = false;
                        }
                    } catch (e) {}
                }
                if (!m && window.AndroidBridge && typeof window.AndroidBridge.readTrackMetadataJson === 'function') {
                    try {
                        const raw = window.AndroidBridge.readTrackMetadataJson(String(track.nativeId));
                        if (raw) m = JSON.parse(raw);
                    } catch (e) {}
                }
                if (m && typeof m === 'object') {
                    let coverDataUrl = null;
                    if (m.hasPicture) {
                        if (preferThumb && m.thumb && m.thumb.startsWith('data:')) {
                            coverDataUrl = m.thumb;
                        } else if (m.artUrl) {
                            try {
                                const r = await fetch(m.artUrl);
                                if (r && r.ok) {
                                    const bl = await r.blob();
                                    coverDataUrl = await new Promise((res) => {
                                        const fr = new FileReader();
                                        fr.onload = () => res(typeof fr.result === 'string' ? fr.result : null);
                                        fr.onerror = () => res(null);
                                        fr.readAsDataURL(bl);
                                    });
                                }
                            } catch (e) {}
                        }
                        if (!coverDataUrl && m.thumb && m.thumb.startsWith('data:')) {
                            coverDataUrl = m.thumb;
                        }
                    }
                    nativeResult = {
                        title: m.title || '',
                        artist: m.artist || '',
                        album: m.album || '',
                        year: m.year || '',
                        genre: m.genre || '',
                        composer: m.composer || '',
                        lyrics: m.lyrics || '',
                        pictureDataUrl: coverDataUrl,
                        hasPicture: !!m.hasPicture,
                        source: 'native'
                    };
                    // Nếu chỉ quét nhanh nền danh sách hoặc tầng native đã đọc xong lyric embed -> trả về ngay lập tức
                    if (!includeLyrics || nativeResult.lyrics) return nativeResult;
                }
            }

            // 2. Đọc bằng jsmediatags trên TOÀN BỘ tệp để lấy đủ Lyric Embed (USLT/©lyr/LYRICS) và mọi tag còn thiếu
            let jsResult = null;
            try {
                let targetFile = (track.file && track.file.size > 0 && !track.file.__fromLibrary) ? track.file : null;
                if (!targetFile && track.nativeStreamUrl) {
                    const res = await fetch(track.nativeStreamUrl);
                    if (res && res.ok) {
                        const bl = await res.blob();
                        targetFile = new File([bl], track.nativeName || (track.name + '.' + (track.ext || 'mp3').toLowerCase()), { type: bl.type || 'audio/mpeg' });
                    }
                }
                if (targetFile) {
                    jsResult = await readTagsWithJsMediaTags(targetFile);
                }
            } catch (e) {}

            if (nativeResult && jsResult) {
                return {
                    title: nativeResult.title || jsResult.title || '',
                    artist: nativeResult.artist || jsResult.artist || '',
                    album: nativeResult.album || jsResult.album || '',
                    year: nativeResult.year || jsResult.year || '',
                    genre: nativeResult.genre || jsResult.genre || '',
                    composer: nativeResult.composer || jsResult.composer || '',
                    lyrics: nativeResult.lyrics || jsResult.lyrics || '',
                    pictureDataUrl: nativeResult.pictureDataUrl || jsResult.pictureDataUrl || null,
                    hasPicture: !!(nativeResult.hasPicture || jsResult.hasPicture),
                    source: 'native+jsmediatags'
                };
            }
            return nativeResult || jsResult || null;
        }
        window.__readCompleteTrackTags = readCompleteTrackTags;

        async function hydrateTrackTags(track, index, src, onFail) {
            if (!track) return;
            window.__enterPriorityMeta();
            try {
                const meta = await readCompleteTrackTags(track, { includeLyrics: true, preferThumb: false });
                if (!meta) {
                    if (typeof onFail === 'function') onFail();
                    return;
                }
                let changed = false;
                if (meta.title && (!track.name || track.name === track.rawName)) { track.name = meta.title; changed = true; }
                if (meta.artist && (!track.artist || track.artist === 'UNKNOWN ARTIST')) { track.artist = meta.artist; changed = true; }
                if (meta.album && (!track.album || track.album === 'Unknown Album')) { track.album = meta.album; changed = true; }
                if (meta.year && !track.year) { track.year = meta.year; changed = true; }
                if (meta.genre && !track.genre) { track.genre = meta.genre; changed = true; }
                if (meta.composer && !track.composer) { track.composer = meta.composer; changed = true; }
                if (meta.lyrics && !track.lyricsRaw) {
                    track.lyricsRaw = meta.lyrics;
                    track.lyrics = parseLRC(meta.lyrics);
                    changed = true;
                }
                if (meta.pictureDataUrl) {
                    if (track.cover !== meta.pictureDataUrl || !track._hasRealCover) {
                        track.cover = meta.pictureDataUrl;
                        track._hasRealCover = true;
                        changed = true;
                    }
                } else if (!meta.hasPicture && !track._hasRealCover && track.cover) {
                    track.cover = null;
                    changed = true;
                }
                track._fullTagsHydrated = true;
                if (typeof window.__saveTrackMetaToCache === 'function') {
                    window.__saveTrackMetaToCache(track);
                }
                if (changed && playlist[currentIndex] === track) {
                    trackNameEl.innerText = track.name;
                    trackArtistEl.innerText = `${track.artist} | ${track.ext}`;
                    if (track.cover) {
                        artImg.src = track.cover;
                        artImg.classList.remove('hidden');
                        artPlaceholder.classList.add('hidden');
                        bgPreview.style.backgroundImage = `url(${track.cover})`;
                        refreshDynamicAccent(track);
                    }
                    renderLyrics();
                    if (typeof syncLyrics === 'function') syncLyrics();
                    updatePlaylistUI();
                    updateMediaSession();
                    updateFsUI();
                    if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
                }
            } finally {
                window.__leavePriorityMeta();
            }
        }

        let libraryPlaySeq = 0;
        let lastLibraryBlobTrack = null;

        async function hydrateAndPlayLibraryTrack(track, index, seq) {
            setPlayBtnLoading(true);
            try {
                if (lastLibraryBlobTrack && lastLibraryBlobTrack !== track && lastLibraryBlobTrack._blobLoaded && lastLibraryBlobTrack.url && lastLibraryBlobTrack.url.startsWith('blob:')) {
                    try { URL.revokeObjectURL(lastLibraryBlobTrack.url); } catch (e) {}
                    lastLibraryBlobTrack.url = lastLibraryBlobTrack.nativeStreamUrl;
                    lastLibraryBlobTrack._blobLoaded = false;
                }
                const res = await fetch(track.nativeStreamUrl);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const blob = await res.blob();
                if (seq !== libraryPlaySeq || playlist[currentIndex] !== track) return;
                const realFile = new File([blob], track.nativeName || (track.name + '.' + (track.ext || 'mp3').toLowerCase()), {
                    type: blob.type || (track.file && track.file.type) || 'audio/mpeg',
                    lastModified: (track.file && track.file.lastModified) || Date.now()
                });
                realFile.__nativeId = track.nativeId || null;
                realFile.__nativeLocation = track.nativeLocation || '';
                realFile.__nativeName = track.nativeName || realFile.name;
                realFile.__fromLibrary = true;
                const blobUrl = URL.createObjectURL(realFile);
                track.file = realFile;
                track.url = blobUrl;
                track._blobLoaded = true;
                lastLibraryBlobTrack = track;

                audio.src = blobUrl;
                if (track._resumeAt > 0) {
                    const at = track._resumeAt; track._resumeAt = 0;
                    audio.addEventListener('loadedmetadata', () => { if (seq === libraryPlaySeq) { try { audio.currentTime = at; } catch (e) {} } }, { once: true });
                }
                audio.play().catch(() => {});

                // Nạp thêm thẻ nhúng (USLT lyrics, genre, composer, cover) & tệp .lrc cùng thư mục ở nền (không chặn phát nhạc)
                if (!track._tagsHydrated) {
                    track._tagsHydrated = true;
                    hydrateTrackTags(track, index, realFile);
                    if (track.nativeLrcUrl && !track.lyricsRaw) {
                        fetch(track.nativeLrcUrl).then(r => r.ok ? r.text() : '').then(txt => {
                            if (txt && !track.lyricsRaw) {
                                track.lyricsRaw = txt;
                                track.lyrics = parseLRC(txt);
                                if (playlist[currentIndex] === track) { renderLyrics(); updatePlaylistUI(); }
                            }
                        }).catch(() => {});
                    }
                }
            } catch (err) {
                if (seq === libraryPlaySeq && playlist[currentIndex] === track) {
                    setPlayBtnLoading(false);
                    audio.src = track.nativeStreamUrl;
                    audio.play().catch(() => {});
                }
            }
        }

        function playTrack(index) {
            if (index < 0 || index >= playlist.length) return;
            const prevIdx = currentIndex;
            currentIndex = index;
            const track = playlist[index];
            const mySeq = ++libraryPlaySeq;
            window.__lastPos = 0;
            // Khôi phục sau khi WebView bị tải lại: nạp đúng bài + vị trí cũ, có thể chưa tự phát
            const restoreOpts = window.__restoreOnce || null;
            window.__restoreOnce = null;
            if (restoreOpts && restoreOpts.pos > 0) {
                const at0 = restoreOpts.pos;
                track._resumeAt = at0;
                audio.addEventListener('loadedmetadata', () => { if (mySeq === libraryPlaySeq) { try { audio.currentTime = at0; } catch (e) {} } }, { once: true });
            }
            if (restoreOpts && restoreOpts.dur > 0 && track.fromLibrary && track.nativeStreamUrl && !track._blobLoaded) {
                const durEl = document.getElementById('duration');
                if (durEl && typeof formatTime === 'function' && (!audio.duration || !isFinite(audio.duration))) {
                    durEl.innerText = formatTime(restoreOpts.dur, restoreOpts.dur);
                }
                if (typeof window.__setRestoreDurationHint === 'function') {
                    window.__setRestoreDurationHint(track.nativeStreamUrl, restoreOpts.dur);
                }
            }
            // Dừng ngay bài đang phát trước khi nạp bài mới
            if (prevIdx !== index || !audio.paused) {
                // Đang chuyển bài: báo cho Android biết là "đang nạp" (không phải tạm dừng) để dịch vụ nền không bị tụt khỏi trạng thái foreground
                window.__trackSwitchUntil = Date.now() + 6000;
                try { audio.pause(); } catch (e) {}
            }
            document.body.classList.toggle('is-video-track', !!track.isVideo);
            document.body.classList.remove('has-video');   // sẽ bật lại khi loadedmetadata báo tệp có hình
            // Phát stream trực tiếp ngay lập tức để không bị khựng/load lâu; chỉ fallback sang blob nếu stream báo lỗi
            const isDirectLibStream = !!(track.fromLibrary && track.nativeStreamUrl && !track._blobLoaded);
            audio.src = isDirectLibStream ? track.nativeStreamUrl : track.url;
            if (isDirectLibStream) {
                const onStreamErr = () => {
                    audio.removeEventListener('error', onStreamErr);
                    if (mySeq !== libraryPlaySeq || playlist[currentIndex] !== track) return;
                    const at = window.__lastPos || 0;   // vị trí đang nghe trước khi lỗi (để tiếp tục đúng chỗ, không phát lại từ đầu)
                    const seekBack = () => { if (at > 0 && mySeq === libraryPlaySeq) { try { audio.currentTime = at; } catch (e) {} } };
                    if (!track._streamRetried) {
                        // Lỗi mạng (code 2) sau khi tạm dừng/để nền lâu: nối lại luồng cũ và tua về đúng vị trí trước, chưa cần tải nguyên tệp
                        track._streamRetried = true;
                        audio.addEventListener('error', onStreamErr, { once: true });
                        audio.addEventListener('playing', () => { track._streamRetried = false; }, { once: true });
                        audio.src = track.nativeStreamUrl;
                        audio.addEventListener('loadedmetadata', seekBack, { once: true });
                        audio.play().catch(() => {});
                        return;
                    }
                    if (track._blobFallbackTried) return;
                    track._blobFallbackTried = true;
                    track._resumeAt = at;
                    hydrateAndPlayLibraryTrack(track, index, mySeq);
                };
                audio.addEventListener('error', onStreamErr, { once: true });
                if (!track._fullTagsHydrated || (!track.lyricsRaw && !track._lyricNativeTried)) {
                    track._tagsHydrated = true;
                    track._lyricNativeTried = true;
                    // Khi bài được chọn -> tạm nhường quét nền để dồn sức đọc full metadata (kể cả lyric embed + ảnh gốc) cho bài này trước
                    setTimeout(() => {
                        if (mySeq !== libraryPlaySeq || playlist[currentIndex] !== track) return;
                        hydrateTrackTags(track, index);
                    }, 0);
                }
                if (track.nativeLrcUrl && !track.lyricsRaw && !track._lrcTried) {
                    track._lrcTried = true;
                    setTimeout(() => {
                        fetch(track.nativeLrcUrl).then(r => r.ok ? r.text() : '').then(txt => {
                            if (txt && !track.lyricsRaw) {
                                track.lyricsRaw = txt;
                                track.lyrics = parseLRC(txt);
                                if (playlist[currentIndex] === track) { renderLyrics(); updatePlaylistUI(); }
                            }
                        }).catch(() => {});
                    }, 200);
                }
            }
            trackNameEl.innerText = track.name;
            trackArtistEl.innerText = `${track.artist} | ${track.ext}`;

            // Chưa xác nhận bài mới có mở được không -> xám nút "Thông tin khác" cho tới
            // khi audio báo loadedmetadata (thành công) hoặc error (thất bại)
            track.canOpen = false;
            if (typeof updateMoreInfoBtnState === 'function') updateMoreInfoBtnState();
            
            if (track.cover) {
                artImg.classList.add('hidden');
                artPlaceholder.classList.remove('hidden');
                bgPreview.style.backgroundImage = 'none';
                artImg.onload = () => {
                    artImg.classList.remove('hidden');
                    artPlaceholder.classList.add('hidden');
                    bgPreview.style.backgroundImage = `url(${track.cover})`;
                };
                artImg.onerror = () => {
                    artImg.classList.add('hidden');
                    artPlaceholder.classList.add('hidden');
                    artPlaceholder.classList.remove('hidden');
                    bgPreview.style.backgroundImage = 'none';
                };
                artImg.src = track.cover;
            } else {
                artImg.onload = null;
                artImg.onerror = null;
                artImg.classList.add('hidden');
                artPlaceholder.classList.remove('hidden');
                bgPreview.style.backgroundImage = 'none';
            }

            refreshDynamicAccent(track);

            if (customPipWindow) {
                const pipLyricEl = customPipWindow.document.getElementById('pip-lyric');
                if (pipLyricEl) { pipLyricEl.innerHTML = ''; pipLyricEl.dataset.currentIdx = ''; }
            }
            const topLyricEl = document.getElementById('top-active-lyric');
            if (topLyricEl) { topLyricEl.innerHTML = ''; topLyricEl.dataset.currentIdx = ''; }
            const fsLyricElReset = document.getElementById('fs-lyric');
            if (fsLyricElReset) { fsLyricElReset.innerHTML = ''; fsLyricElReset.dataset.currentIdx = ''; }
            
            renderLyrics();
            applyMarquee();
            updatePlaylistUI();
            updateMediaSession();
            updateFsUI(); // Cập nhật màn hình toàn cảnh fullscreen
            
            // Phát bài mới; nếu bị từ chối (AbortError do đổi nguồn nhanh / chặn tự phát ở nền) thì thử lại tối đa 3 lần thay vì lặng lẽ dừng
            const startPlay = (tries) => {
                let pr; try { pr = audio.play(); } catch (e) { pr = null; }
                if (pr && pr.catch) pr.catch(() => {
                    if (mySeq !== libraryPlaySeq || playlist[currentIndex] !== track) return;
                    if (tries < 3) setTimeout(() => { if (mySeq === libraryPlaySeq && playlist[currentIndex] === track && audio.paused) startPlay(tries + 1); }, 350 * (tries + 1));
                    else window.__trackSwitchUntil = 0;
                });
            };
            if (restoreOpts && !restoreOpts.play) {
                try { audio.pause(); } catch (e) {}
                window.__trackSwitchUntil = 0;
                playBtn.querySelector('span').innerText = 'play_arrow';
            } else {
                startPlay(0);
                playBtn.querySelector('span').innerText = 'pause';
            }
            pauseOverlay.classList.remove('visible');
            if (document.documentElement.classList.contains('m-ui')) {
                document.body.classList.add('m-mini-visible');
                if (typeof window.__recordMobilePlayStat === 'function') window.__recordMobilePlayStat(track);
                if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
            }
            
            if(typeof updatePiPUI === 'function') updatePiPUI(); 
        }

        // --- HÀM REFRESH UI PHỤC VỤ SAU KHI SỬA METADATA XONG (CHỈ UPDATE THƯ VIỆN GIAO DIỆN) ---
        function refreshCurrentTrackUI() {
            if (currentIndex === -1) return;
            const track = playlist[currentIndex];
            trackNameEl.innerText = track.name;
            trackArtistEl.innerText = `${track.artist} | ${track.ext}`;
            
            renderLyrics();
            applyMarquee();
            updatePlaylistUI();
            updateMediaSession();
            updateFsUI();
            if (typeof updatePiPUI === 'function') updatePiPUI();
        }

        // MediaSession của trình duyệt: trạng thái + vị trí chính xác (cập nhật mỗi giây khi đang phát và mỗi khi đổi trạng thái)
        function syncMediaSessionState() {
            try {
                if (!('mediaSession' in navigator)) return;
                const has = !!(playlist[currentIndex] && audio.currentSrc);
                navigator.mediaSession.playbackState = !has ? 'none' : (audio.paused || audio.ended ? 'paused' : 'playing');
                if (has && navigator.mediaSession.setPositionState && isFinite(audio.duration) && audio.duration > 0) {
                    navigator.mediaSession.setPositionState({
                        duration: audio.duration,
                        playbackRate: audio.playbackRate || 1,
                        position: Math.min(Math.max(0, audio.currentTime || 0), audio.duration)
                    });
                }
            } catch (e) {}
        }
        ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'seeked', 'ratechange', 'emptied'].forEach(ev => audio.addEventListener(ev, syncMediaSessionState));
        setInterval(() => { if (!audio.paused && !audio.ended) syncMediaSessionState(); }, 1000);

        function updateMediaSession() {
            if ('mediaSession' in navigator) {
                const track = playlist[currentIndex];
                if (!track) return;

                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.name,
                    artist: track.artist,
                    album: track.album || "Unknown Album",
                    artwork: track.cover ? [
                        { src: track.cover, sizes: '96x96', type: 'image/png' },
                        { src: track.cover, sizes: '512x512', type: 'image/png' }
                    ] : []
                });

                if (!(window.IS_ANDROID_APP && window.__nativeAudioState && window.__nativeAudioState.mode === 'native')) {
                    navigator.mediaSession.setActionHandler('play', () => playBtn.click());
                    navigator.mediaSession.setActionHandler('pause', () => playBtn.click());
                    navigator.mediaSession.setActionHandler('previoustrack', () => document.getElementById('prev-btn').click());
                    navigator.mediaSession.setActionHandler('nexttrack', () => document.getElementById('next-btn').click());
                    navigator.mediaSession.setActionHandler('seekto', (details) => {
                        if (details && typeof details.seekTime === 'number') { audio.currentTime = details.seekTime; syncMediaSessionState(); }
                    });
                }
                try {
                    navigator.mediaSession.setActionHandler('seekbackward', (d) => { audio.currentTime = Math.max(0, audio.currentTime - ((d && d.seekOffset) || 10)); });
                    navigator.mediaSession.setActionHandler('seekforward', (d) => { audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + ((d && d.seekOffset) || 10)); });
                } catch (e) {}
                
                try {
                    navigator.mediaSession.setActionHandler('enterpictureinpicture', () => {
                        document.getElementById('pip-btn').click();
                    });
                } catch (error) {
                    console.warn("Trình duyệt chưa support action enterpictureinpicture cho MediaSession.");
                }
            }
        }

        // Video: icon tạm dừng chỉ hiện ~1 giây rồi zoom-out (nhạc thì giữ nguyên như cũ)
        let pauseFlashTimer = 0;
        function flashPauseIcon() {
            clearTimeout(pauseFlashTimer);
            pauseOverlay.classList.add('visible');
            pauseFlashTimer = setTimeout(() => pauseOverlay.classList.remove('visible'), 1000);
        }
        audio.addEventListener('pause', () => {
            // Tạm dừng bằng phím media / bấm vào khung / PiP cũng hiện icon (bỏ qua khi hết bài)
            if (document.body.classList.contains('has-video') && !audio.ended && !pauseOverlay.classList.contains('visible')) flashPauseIcon();
        });
        audio.addEventListener('play', () => { try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} clearTimeout(pauseFlashTimer); if (document.body.classList.contains('has-video')) pauseOverlay.classList.remove('visible'); });

        playBtn.addEventListener('click', () => {
            if (!audio.src && currentIndex === -1) {
                if (typeof window.__tryRestoreNow === 'function' && window.__tryRestoreNow(true)) return;
                if (typeof window.__hasPendingRestore === 'function' && window.__hasPendingRestore()) return;
            }
            if (!audio.src && playlist.length > 0) playTrack(0);
            else if (audio.paused) { 
                audio.play(); 
                playBtn.querySelector('span').innerText = 'pause'; 
                clearTimeout(pauseFlashTimer);
                pauseOverlay.classList.remove('visible');
            }
            else { 
                audio.pause(); 
                playBtn.querySelector('span').innerText = 'play_arrow'; 
                if (document.body.classList.contains('has-video')) flashPauseIcon();
                else pauseOverlay.classList.add('visible'); 
            }
            updatePlaylistUI();
            if(typeof updatePiPUI === 'function') updatePiPUI(); 
        });

        // Giao diện điện thoại: nút giãn ra như viên thuốc khi bấm rồi co về (Previous -> phải, Play/Pause -> 2 bên, Next -> trái),
        // đồng thời đẩy các nút bên cạnh xẹp lại chút. Chỉ dùng transform (scaleX) nên chạy trên GPU, không bắt trình duyệt tính lại bố cục
        // mỗi khung hình; bo góc được bù theo tỉ lệ để viên thuốc không bị méo, icon được bù ngược để không bị kéo giãn.
        (function () {
            const DUR = 520, N = 26;
            const back = (x) => { const c = 1.2; x = Math.min(1, Math.max(0, x)); return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
            const bump = (t) => t < 0.35 ? back(t / 0.35) : 1 - back((t - 0.35) / 0.65);   // 0 -> 1 (lò xo) -> 0 (lò xo)
            const run = (el, factor, origin) => {
                // factor: hệ số co giãn tối đa theo chiều ngang (>1 giãn, <1 xẹp); origin: mép giữ nguyên
                const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
                const frames = [], kids = [];
                for (let i = 0; i <= N; i++) {
                    const t = i / N, sc = 1 + (factor - 1) * bump(t);
                    frames.push({ sc, offset: t });
                }
                if (el.__anims) el.__anims.forEach(a => { try { a.cancel(); } catch (e) {} });
                el.style.transformOrigin = origin;
                el.style.willChange = 'transform';
                const main = el.animate(frames.map(f => ({
                    transform: 'scaleX(' + f.sc.toFixed(4) + ')',
                    borderRadius: (r / f.sc).toFixed(2) + 'px / ' + r + 'px',
                    offset: f.offset
                })), { duration: DUR, easing: 'linear' });
                const anims = [main];
                Array.prototype.forEach.call(el.children, c => {
                    anims.push(c.animate(frames.map(f => ({ transform: 'scaleX(' + (1 / f.sc).toFixed(4) + ')', offset: f.offset })), { duration: DUR, easing: 'linear' }));
                });
                el.__anims = anims;
                main.onfinish = main.oncancel = () => { if (el.__anims === anims) { el.style.willChange = ''; el.style.zIndex = ''; el.style.transformOrigin = ''; el.__anims = null; } };
            };
            // extra: phần nút giãn thêm (px); squeeze: các nút bên cạnh xẹp đúng bằng phần đó, mép phía kia đứng yên
            const stretch = (id, frac, origin, squeeze) => {
                const b = document.getElementById(id);
                if (!b) return;
                b.addEventListener('click', () => {
                    const root = document.documentElement;
                    if (!root.classList.contains('m-ui') || root.classList.contains('reduce-motion') || !b.animate) return;
                    const w = b.offsetWidth;
                    if (!w) return;
                    const extra = Math.round(w * frac);   // tỉ lệ theo bề rộng nút để máy nào cũng cân đối
                    b.style.zIndex = '3';
                    run(b, (w + extra) / w, origin);
                    squeeze.forEach(q => {
                        const n = document.getElementById(q.id);
                        if (!n || !n.offsetWidth) return;
                        const dw = Math.min(extra * q.share, n.offsetWidth * 0.4);
                        run(n, (n.offsetWidth - dw) / n.offsetWidth, q.origin);
                    });
                });
            };
            stretch('prev-btn', 0.2, 'left center', [{ id: 'play-btn', share: 1, origin: 'right center' }]);
            stretch('next-btn', 0.2, 'right center', [{ id: 'play-btn', share: 1, origin: 'left center' }]);
            stretch('play-btn', 0.3, 'center center', [{ id: 'prev-btn', share: 0.5, origin: 'left center' }, { id: 'next-btn', share: 0.5, origin: 'right center' }]);
        })();

        document.getElementById('next-btn').addEventListener('click', () => {
            if (isEditorOpen()) return;   // đang chỉnh sửa: khoá chuyển bài
            if (isShuffle) {
                if (!shuffleInitialized) generateShuffleOrder();
                if (shuffleOrder.length === 0) return;
                let pos = shuffleOrder.indexOf(currentIndex);
                pos = (pos + 1) % shuffleOrder.length;
                playTrack(shuffleOrder[pos]);
            } else {
                playTrack((currentIndex + 1) % playlist.length);
            }
        });

        // Khi Shuffle đang bật: nếu bài đã phát quá 5 giây thì Previous chỉ tua về 0:00,
        // còn trong 5 giây đầu thì lùi về bài trước đó trong shuffleOrder. Shuffle tắt thì giữ như cũ.
        document.getElementById('prev-btn').addEventListener('click', () => {
            if (isEditorOpen()) return;   // đang chỉnh sửa: khoá chuyển bài
            if (!isShuffle) {
                let p = currentIndex - 1; if (p < 0) p = playlist.length - 1;
                playTrack(p);
                return;
            }
            if (audio.currentTime > 5) { audio.currentTime = 0; return; }
            if (!shuffleInitialized) generateShuffleOrder();
            if (shuffleOrder.length === 0) return;
            let pos = shuffleOrder.indexOf(currentIndex);
            pos = pos - 1; if (pos < 0) pos = shuffleOrder.length - 1;
            playTrack(shuffleOrder[pos]);
        });

        // --- NÚT SHUFFLE: bật/tắt + chuyển đổi hiển thị tab Playlist/Shuffle ---
        document.getElementById('shuffle-btn').addEventListener('click', function() {
            isShuffle = !isShuffle; this.classList.toggle('active', isShuffle);
            localStorage.setItem('settings_shuffle', isShuffle);

            const plTabs = document.getElementById('pl-tabs');
            const reshuffleBtnEl = document.getElementById('reshuffle-btn');

            if (isShuffle) {
                // Bật (dù là lần đầu từ lúc khởi động, hay vừa tắt-bật lại) -> luôn random lại
                generateShuffleOrder();
                activePlTab = 'shuffle';
                document.getElementById('pl-tab-playlist').classList.remove('active');
                document.getElementById('pl-tab-shuffle').classList.add('active');
                if (plTabs) plTabs.classList.add('expanded');
                if (reshuffleBtnEl) reshuffleBtnEl.style.display = 'flex';
            } else {
                activePlTab = 'playlist';
                document.getElementById('pl-tab-playlist').classList.add('active');
                document.getElementById('pl-tab-shuffle').classList.remove('active');
                if (plTabs) plTabs.classList.remove('expanded');
                if (reshuffleBtnEl) reshuffleBtnEl.style.display = 'none';
            }

            updatePlaylistUI();
            if(typeof updatePiPUI === 'function') updatePiPUI(); 
        });

        // Chuyển tab Playlist <-> Shuffle (chỉ đổi CÁCH XEM, không đụng tới isShuffle)
        document.getElementById('pl-tab-playlist').addEventListener('click', () => {
            activePlTab = 'playlist'; plLimit = PL_CHUNK;
            document.getElementById('pl-tab-playlist').classList.add('active');
            document.getElementById('pl-tab-shuffle').classList.remove('active');
            document.getElementById('reshuffle-btn').style.display = 'none';
            updatePlaylistUI();
        });
        document.getElementById('pl-tab-shuffle').addEventListener('click', () => {
            activePlTab = 'shuffle'; plLimit = PL_CHUNK;
            document.getElementById('pl-tab-shuffle').classList.add('active');
            document.getElementById('pl-tab-playlist').classList.remove('active');
            document.getElementById('reshuffle-btn').style.display = 'flex';
            if (!shuffleInitialized) generateShuffleOrder();
            updatePlaylistUI();
        });

        // Nút Reshuffle: chỉ có tác dụng và hiển thị ở tab Shuffle
        document.getElementById('reshuffle-btn').addEventListener('click', () => {
            generateShuffleOrder();
            updatePlaylistUI();
        });

        document.getElementById('repeat-btn').addEventListener('click', function() {
            if (repeatLockSaved !== null) return; // đang khoá lặp 1 bài vì mở editor
            repeatMode = (repeatMode + 1) % 3;
            this.classList.toggle('active', repeatMode > 0);
            this.classList.toggle('repeat-one', repeatMode === 2);
            this.querySelector('.material-symbols-rounded').textContent = repeatMode === 2 ? 'repeat_one' : 'repeat';
            localStorage.setItem('settings_repeat_mode', repeatMode);
            if(typeof updatePiPUI === 'function') updatePiPUI(); 
        });

        // --- SPINNER LOADING TRÊN NÚT PLAY/PAUSE (áp dụng cho cả PiP) ---
        // "loadstart"/"waiting" = đang tải/đang buffer -> hiện spinner thay icon play/pause
        // "canplay"/"playing" = đã sẵn sàng phát được -> trả icon play/pause lại như cũ
        function setPlayBtnLoading(isLoading) {
            const btns = [playBtn];
            if (customPipWindow) {
                const pipPlayBtn = customPipWindow.document.getElementById('pip-play-btn');
                if (pipPlayBtn) btns.push(pipPlayBtn);
            }
            btns.forEach(btn => {
                const icon = btn.querySelector('.material-symbols-rounded');
                const spinner = btn.querySelector('.play-btn-spinner');
                if (!icon || !spinner) return;
                icon.style.display = isLoading ? 'none' : '';
                spinner.style.display = isLoading ? 'inline-flex' : 'none';
            });
        }
        // Màu động: dừng/tạm dừng >10s -> về màu gốc; phát lại -> áp lại màu bài đang phát
        function scheduleDynamicAccentReset() {
            clearDynamicAccentTimer();
            if (!settings.dynamicAccent || !dynamicAccentHex) return;
            dynamicAccentResetTimer = setTimeout(() => { setDynamicAccent(null); }, 10000);
        }
        audio.addEventListener('pause', scheduleDynamicAccentReset);
        audio.addEventListener('ended', scheduleDynamicAccentReset);
        audio.addEventListener('playing', () => {
            clearDynamicAccentTimer();
            const t = playlist[currentIndex];
            if (settings.dynamicAccent && t && t.cover && !dynamicAccentHex) refreshDynamicAccent(t);
        });
        audio.addEventListener('loadstart', () => setPlayBtnLoading(true));
        audio.addEventListener('waiting', () => setPlayBtnLoading(true));
        audio.addEventListener('canplay', () => setPlayBtnLoading(false));
        audio.addEventListener('canplaythrough', () => setPlayBtnLoading(false));
        audio.addEventListener('loadeddata', () => setPlayBtnLoading(false));
        audio.addEventListener('playing', () => setPlayBtnLoading(false));
        audio.addEventListener('timeupdate', () => { if (!audio.paused && audio.readyState >= 2) setPlayBtnLoading(false); });
        audio.addEventListener('pause', () => setPlayBtnLoading(false));
        audio.addEventListener('ended', () => setPlayBtnLoading(false));
        audio.addEventListener('error', () => setPlayBtnLoading(false));

        audio.addEventListener('ended', () => {
            if (sleepState && sleepState.type === 'tracks') {
                if (--sleepState.remaining <= 0) { fireSleep(); return; }
                updateSleepUI();
            }
            if (repeatMode === 2) { audio.play(); return; }
            if (repeatMode === 1) { document.getElementById('next-btn').click(); return; }
            // Không lặp: chỉ tự next nếu chưa phải bài cuối cùng trong danh sách đang phát
            // (thứ tự Playlist bình thường, hoặc thứ tự shuffleOrder nếu Shuffle đang bật)
            if (isShuffle) {
                const pos = shuffleOrder.indexOf(currentIndex);
                if (pos !== -1 && pos < shuffleOrder.length - 1) document.getElementById('next-btn').click();
            } else if (currentIndex < playlist.length - 1) {
                document.getElementById('next-btn').click();
            }
        });

        let audioCtx, analyser, dataArray;


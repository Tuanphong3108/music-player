        // --- Trạng thái "chưa có bài" + nút Thêm ở giữa, class is-playing cho nút Play ---
        (function () {
            const body = document.body;
            const sync = () => body.classList.toggle('no-track', !(typeof playlist !== 'undefined' && playlist.length));
            document.getElementById('m-empty-add').addEventListener('click', () => document.getElementById('add-music-trigger').click());
            audio.addEventListener('play', () => body.classList.add('is-playing'));
            audio.addEventListener('pause', () => body.classList.remove('is-playing'));
            audio.addEventListener('ended', () => body.classList.remove('is-playing'));
            new MutationObserver(sync).observe(document.getElementById('playlist-container'), { childList: true });
            sync(); setInterval(sync, 1500);
        })();


        // --- Thanh tua dạng sóng MD3E: wavelength 40dp, biên độ 3dp, nét 4dp, khe 4dp, chấm dừng Ø4 (theo spec wavy linear progress indicator) ---
        // Dùng cho thanh tua chính (PC + điện thoại) và thanh tua trong Lyric View (điện thoại)
        (function () {
            const WL = 40, AMP = 3, STROKE = 4, GAP = 4, DOT = 4, THUMB = 6;
            function makeWave(slider, host, before, trackColor, thumbW, opts) {
                opts = opts || {};
                const doc = opts.doc || document, win = opts.win || window, primaryVar = opts.primaryVar || '--md-sys-color-primary';
                const cv = doc.createElement('canvas'); cv.className = 'seek-wave';
                host.insertBefore(cv, before || slider);
                const ctx = cv.getContext('2d');
                let amp = 0, phase = 0, last = 0, raf = 0, colT = 0, colSyncTimer = null, colP = '#d0bcff', colV = 'rgba(255,255,255,.18)';
                function readColors(now) {
                    colT = now || performance.now();
                    const cs = win.getComputedStyle(doc.documentElement);
                    colP = cs.getPropertyValue(primaryVar).trim() || colP;
                    colV = trackColor ? trackColor : (cs.getPropertyValue('--md-sys-color-surface-variant').trim() || colV);
                }
                function colors(now) {
                    if (now - colT < 500) return;
                    readColors(now);
                }
                function scheduleColorSync() {
                    clearTimeout(colSyncTimer);
                    colSyncTimer = setTimeout(() => {
                        readColors(performance.now());
                        draw(performance.now());
                    }, 500);
                }
                function draw(now) {
                    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
                    const dpr = win.devicePixelRatio || 1;
                    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
                    colors(now);
                    const mn = +slider.min || 0, mx = +slider.max || 100;
                    const p = Math.min(1, Math.max(0, ((+slider.value) - mn) / ((mx - mn) || 1)));
                    const tw = thumbW || THUMB;
                    const x = tw / 2 + (W - tw) * p, cy = H / 2;
                    ctx.lineCap = 'round'; ctx.lineWidth = STROKE;
                    const tx = x + tw / 2 + GAP;
                    if (tx < W - STROKE / 2) {
                        ctx.strokeStyle = colV; ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(W - STROKE / 2, cy); ctx.stroke();
                        ctx.fillStyle = colP; ctx.beginPath(); ctx.arc(W - STROKE / 2, cy, DOT / 2, 0, Math.PI * 2); ctx.fill();
                    }
                    const xe = x - tw / 2 - GAP;
                    if (xe > STROKE / 2) {
                        ctx.strokeStyle = colP; ctx.beginPath();
                        const a = AMP * amp;
                        for (let px = STROKE / 2; px <= xe; px += 1.5) {
                            const edge = Math.min(1, (px - STROKE / 2) / 10);
                            const y = cy + Math.sin((px / WL) * Math.PI * 2 + phase) * a * edge;
                            if (px === STROKE / 2) ctx.moveTo(px, y); else ctx.lineTo(px, y);
                        }
                        ctx.lineTo(xe, cy + Math.sin((xe / WL) * Math.PI * 2 + phase) * a); ctx.stroke();
                    }
                }
                function frame(now) {
                    raf = 0;
                    if (doc.hidden || !cv.offsetParent) return;
                    const dt = Math.min(64, now - (last || now)); last = now;
                    const reduce = document.documentElement.classList.contains('reduce-motion');
                    // Theo Material 3 Expressive (WavyProgressIndicatorDefaults.indicatorAmplitude): biên độ = 0 khi tiến trình ≤ 10% hoặc ≥ 95%
                    // (đường thẳng), = 1 ở giữa; tạm dừng thì cũng về 0. Biên độ chuyển dần (không nhảy) giữa thẳng <-> sóng.
                    const mn = +slider.min || 0, mx = +slider.max || 100;
                    const prog = Math.min(1, Math.max(0, ((+slider.value) - mn) / ((mx - mn) || 1)));
                    const wavy = prog > 0.05 && prog < 0.98;
                    const isActivelyPlaying = (!audio.paused && !audio.ended)
                        || !!(window.__nativeAudioState && window.__nativeAudioState.mode === 'native' && !window.__nativeAudioState.paused && !window.__nativeAudioState.ended);
                    const target = (isActivelyPlaying && !reduce && wavy) ? 1 : 0;
                    amp += (target - amp) * (1 - Math.exp(-dt / 140));      // giảm/tăng dần về 0 <-> 1
                    if (Math.abs(target - amp) < 0.004) amp = target;
                    if (amp > 0) phase += (dt / 1000) * Math.PI * 2;          // 1 wavelength / giây (waveSpeed mặc định MD3E); sóng chạy ngược (từ phải sang trái)
                    draw(now);
                    if (amp > 0 || target) raf = win.requestAnimationFrame(frame); else last = 0;
                }
                const kick = () => { if (!raf) raf = win.requestAnimationFrame(frame); };
                ['play', 'pause', 'seeked', 'timeupdate', 'loadedmetadata', 'durationchange', 'ended'].forEach(e => audio.addEventListener(e, kick));
                slider.addEventListener('input', kick);
                win.addEventListener('resize', kick);
                doc.addEventListener('visibilitychange', kick);
                new win.MutationObserver(() => { kick(); scheduleColorSync(); }).observe(doc.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
                new win.MutationObserver(kick).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
                win.matchMedia('(prefers-color-scheme: light)').addEventListener('change', scheduleColorSync);
                kick();
            }
            window.__makeWave = makeWave;
            makeWave(document.getElementById('seek-slider'), document.querySelector('.seek-container'), null, null, 6);
            const ls = document.getElementById('m-lyric-seek');
            if (ls) makeWave(ls, ls.parentElement, null, 'rgba(255,255,255,.22)', 8);
        })();

        // --- HỆ THỐNG PWA INSTALL ---
        let deferredPrompt;
        const installWrapper = document.getElementById('install-wrapper');
        const installBtn = document.getElementById('install-btn');

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
            if (!isStandalone) {
                installWrapper.style.display = 'block';
            }
        });

        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    console.log('Đã đồng ý cài đặt PWA');
                } else {
                    console.log('Đã huỷ cài đặt PWA');
                }
                deferredPrompt = null;
                installWrapper.style.display = 'none';
            }
        });

        window.addEventListener('appinstalled', () => {
            installWrapper.style.display = 'none';
            deferredPrompt = null;
            console.log('PWA đã được cài đặt vào hệ thống');
        });

        // Thiết lập menu Dropdown cho nút Thêm nhạc (+) hỗ trợ File System Access API
        const addMusicTrigger = document.getElementById('add-music-trigger');
        const addMusicMenu = document.getElementById('add-music-menu');

        // ===== Hiệu ứng nút Thêm nhạc =====
        // mở hộp thoại chọn tệp: icon lật (flip) -> mũi tên xuống
        // đóng hộp thoại mà không thêm gì: mũi tên nảy lên + xoay, về chỗ cũ thì thành icon cũ và nảy xuống nhẹ
        // đã chọn tệp: icon xoay tròn (Material circular progress) -> tick -> 1s sau về icon cũ
        const addIco = document.getElementById('add-music-icon');
        const addSpin = document.getElementById('add-music-spinner');
        let addSeq = 0, addIdleTimer = null, addPickerPending = false;
        const addAnim = (el, kf, ms, easing) => {
            const a = el.animate(kf, { duration: ms, easing: easing || 'ease', fill: 'none' });
            return a.finished.catch(() => {});
        };
        const addStop = () => { addSeq++; clearTimeout(addIdleTimer); [addIco, addSpin].forEach(el => el.getAnimations().forEach(a => a.cancel())); return addSeq; };
        const addShowIcon = (name) => { addSpin.style.display = 'none'; addIco.style.display = ''; addIco.textContent = name; };
        async function addFlipTo(name) {
            if (addIco.style.display !== 'none' && addIco.textContent === name) return;
            const my = addStop();
            if (addIco.style.display === 'none') {   // đang xoay tròn -> hiện lại icon
                addSpin.style.display = 'none'; addIco.style.display = '';
            } else {
                await addAnim(addIco, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }], 170, 'ease-in');
                if (my !== addSeq) return;
            }
            addIco.textContent = name;
            await addAnim(addIco, [{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg)' }], 190, 'ease-out');
        }
        const addBtnArrow = () => addFlipTo('arrow_downward');   // menu Thêm nhạc đang mở
        const addBtnFolder = () => addFlipTo('folder_open');     // hộp thoại chọn tệp đang mở
        async function addBtnCancel() {
            addPickerPending = false;
            addStop();   // huỷ vòng xoay đang chờ hiện (nếu có)
            await addFlipTo('add_circle');
        }
        let addBusyReady = Promise.resolve();
        function addBtnBusy() {
            const my = addStop();
            addPickerPending = false;
            addBusyReady = (async () => {
                if (addIco.style.display !== 'none') {
                    await addAnim(addIco, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }], 160, 'ease-in');
                    if (my !== addSeq) return;
                }
                addIco.style.display = 'none'; addSpin.style.display = '';
                await addAnim(addSpin, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], 240, 'cubic-bezier(.34,1.56,.64,1)');
            })();
            return addBusyReady;
        }
        async function addBtnDone() {
            const my0 = addSeq;
            await addBusyReady;                      // chờ vòng xoay hiện xong (thêm nhanh quá thì vẫn thấy)
            if (my0 !== addSeq) return;
            await new Promise(r => setTimeout(r, 250));
            if (my0 !== addSeq) return;
            const my = addStop();
            if (addSpin.style.display !== 'none') {
                await addAnim(addSpin, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }], 160, 'ease-in');
                if (my !== addSeq) return;
            }
            addShowIcon('check');
            await addAnim(addIco, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], 280, 'cubic-bezier(.34,1.56,.64,1)');
            if (my !== addSeq) return;
            addIdleTimer = setTimeout(async () => {
                if (my !== addSeq) return;
                await addAnim(addIco, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }], 160, 'ease-in');
                if (my !== addSeq) return;
                addIco.textContent = 'add_circle';
                addAnim(addIco, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], 280, 'cubic-bezier(.34,1.56,.64,1)');
            }, 1000);
        }
        window.addBtnArrow = addBtnArrow; window.addBtnCancel = addBtnCancel;

        // Ctrl + O: mở menu Thêm nhạc ngay tại vị trí con trỏ chuột (bấm nút thì vẫn mở dưới nút như cũ)
        let addMenuAtMouse = false, lastMouse = null;
        window.addEventListener('mousemove', (e) => { lastMouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
        const addMenuAnchor = {   // "neo ảo" cho fixMenuPlacement: con trỏ chuột hoặc nút Thêm
            get offsetWidth() { return addMenuAtMouse ? 0 : addMusicTrigger.offsetWidth; },
            getBoundingClientRect() {
                if (addMenuAtMouse && lastMouse) return { left: lastMouse.x, right: lastMouse.x, top: lastMouse.y, bottom: lastMouse.y, width: 0, height: 0 };
                return addMusicTrigger.getBoundingClientRect();
            }
        };
        window.__openAddMenuAtMouse = function () {
            if (!window.showOpenFilePicker && !window.AndroidBridge) { addBtnFolder(); document.getElementById('file-input').click(); return; }
            if (addMusicMenu.open) { addMusicMenu.open = false; return; }
            addMenuAtMouse = !!lastMouse;
            addMusicMenu.open = true;
        };
        addMusicTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            addMenuAtMouse = false;
            if (window.showOpenFilePicker || window.AndroidBridge) {
                addMusicMenu.open = !addMusicMenu.open;
            } else {
                addBtnFolder();
                document.getElementById('file-input').click();
            }
        });
        hookMenuPlacement(addMusicMenu, addMenuAnchor);
        // Menu thêm nhạc đang mở -> icon lật thành mũi tên; đóng mà không chọn gì -> lật về icon cũ
        addMusicMenu.addEventListener('opening', () => { addPickerPending = false; addBtnArrow(); });
        addMusicMenu.addEventListener('closed', () => { addMenuAtMouse = false; if (!addPickerPending) addBtnCancel(); });
        // Hộp thoại chọn tệp kiểu truyền thống bị đóng mà không chọn gì
        document.getElementById('file-input').addEventListener('cancel', () => addBtnCancel());

        document.getElementById('btn-fs-pick-files').addEventListener('click', async () => {
            addPickerPending = true; addBtnFolder();
            if (window.AndroidBridge && AndroidBridge.pickFiles) { AndroidBridge.pickFiles(); return; }
            try {
                const fileHandles = await window.showOpenFilePicker({
                    multiple: true,
                    excludeAcceptAllOption: false,
                    types: [{
                        description: 'Audio / Video / Lyrics',
                        accept: {
                            'audio/*': ['.mp3', '.ogg', '.oga', '.opus', '.wav', '.m4a', '.aac', '.flac', '.wma'],
                            'video/*': ['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.ogv'],
                            'text/plain': ['.lrc']
                        }
                    }]
                });
                const files = [];
                for (const handle of fileHandles) {
                    try {
                        if (handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) !== 'granted') {
                            if (handle.requestPermission) await handle.requestPermission({ mode: 'read' });
                        }
                        const file = await handle.getFile();
                        file.fileHandle = handle;
                        files.push(file);
                    } catch (fileErr) {
                        console.warn('Không đọc được tệp từ File System handle:', handle && handle.name, fileErr);
                    }
                }
                if (files.length) {
                    await handleFiles(files);
                } else {
                    addBtnCancel();
                    if (typeof showToast === 'function') showToast('Không đọc được tệp đã chọn từ hệ thống tệp.', 'error', 3500);
                }
            } catch (err) {
                addBtnCancel();
                if (!err || err.name !== 'AbortError') {
                    console.error("Lỗi chọn file bằng File System Access API:", err);
                    if (typeof showToast === 'function') showToast('Không mở được tệp: ' + (err && err.message ? err.message : String(err)), 'error', 3800);
                }
            }
        });

        document.getElementById('btn-fs-pick-directory').addEventListener('click', async () => {
            addPickerPending = true; addBtnFolder();
            if (window.AndroidBridge && AndroidBridge.pickFolder) { AndroidBridge.pickFolder(); return; }
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
                if (dirHandle.queryPermission && (await dirHandle.queryPermission({ mode: 'read' })) !== 'granted') {
                    if (dirHandle.requestPermission) await dirHandle.requestPermission({ mode: 'read' });
                }
                const files = [];
                async function walkDir(dir, depth) {
                    if (depth > 6) return;
                    for await (const entry of dir.values()) {
                        try {
                            if (entry.kind === 'file') {
                                const file = await entry.getFile();
                                file.fileHandle = entry;
                                files.push(file);
                            } else if (entry.kind === 'directory') {
                                await walkDir(entry, depth + 1);
                            }
                        } catch (entryErr) {
                            console.warn('Bỏ qua mục không đọc được trong thư mục:', entry && entry.name, entryErr);
                        }
                    }
                }
                await walkDir(dirHandle, 0);
                if (files.length) {
                    await handleFiles(files);
                } else {
                    addBtnCancel();
                    if (typeof showToast === 'function') showToast('Thư mục không có tệp nhạc/video nào đọc được.', 'info', 3000);
                }
            } catch (err) {
                addBtnCancel();
                if (!err || err.name !== 'AbortError') {
                    console.error("Lỗi chọn thư mục bằng File System Access API:", err);
                    if (typeof showToast === 'function') showToast('Không đọc được thư mục: ' + (err && err.message ? err.message : String(err)), 'error', 3800);
                }
            }
        });




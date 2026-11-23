        // --- CẦU NỐI VỚI APP ANDROID (WebView) ---
        // App native gọi window.__nativeOpenFiles([{url,name,type}]) với url dạng
        // https://appassets.local/f/<id> (được app chặn request và trả dữ liệu content://).
        (function () {
            const AB = window.AndroidBridge;
            if (!AB) return;
            if (window.IS_ANDROID_DEVICE !== false && new URLSearchParams(location.search).get('android') === 'true') {
                window.IS_ANDROID_APP = true;
                document.documentElement.classList.add('is-android-app');
            }
            window.__nativeOpenFiles = async function (list) {
                window.__ingestBusy = (window.__ingestBusy || 0) + 1;
                try {
                    const files = [];
                    const disallowVideoOnAndroid = !!(window.IS_ANDROID_APP || /[?&]android=true/.test(location.search) || document.documentElement.classList.contains('is-android-app'));
                    const isLibraryBatch = Array.isArray(list) && list.length > 0 && list.every(x => x && x.fromLibrary);
                    const isExternalBatch = Array.isArray(list) && list.length > 0 && !isLibraryBatch;
                    if (isExternalBatch) {
                        window.__externalOpenActive = true;
                        window.__nativeBoot = null;
                        window.__restoreOnce = null;
                        if (typeof window.__cancelUiRestore === 'function') window.__cancelUiRestore();
                    }
                    for (const it of list || []) {
                        const name = it.name || 'media';
                        const ext = (name.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();
                        if ((it.type || '').startsWith('video/') || VIDEO_EXTS.includes(ext)) {
                            if (disallowVideoOnAndroid) continue;
                            // Video: phát trực tiếp qua URL stream HTTP Range của app native (tránh fetch() tải nguyên tệp vào RAM và tránh mở decoder phụ)
                            const url = it.url, size = it.size;
                            const f = new File([], name, { type: it.type || 'video/mp4', lastModified: it.modified || Date.now() });
                            Object.defineProperty(f, 'size', { get: () => size });
                            f.__nativeUrl = url;
                            const part = async (a, b) => (await fetch(url, { headers: { Range: 'bytes=' + a + '-' + (Math.min(b, size) - 1) } })).arrayBuffer();
                            f.slice = (a = 0, b = size) => ({ arrayBuffer: () => part(a, b), size: Math.max(0, Math.min(b, size) - a) });
                            f.arrayBuffer = () => part(0, size);
                            files.push(f);
                            continue;
                        }
                        if (it.fromLibrary && it.url) {
                            // Tệp quét từ thư viện thiết bị: nạp metadata & ảnh bìa tức thì, chỉ tải tệp thành blob khi người dùng bấm phát (hết MEDIA_ERR_NETWORK & không tốn RAM)
                            const size = Number(it.size) || 0;
                            const f = new File([], name, { type: it.type || 'audio/mpeg', lastModified: it.modified || Date.now() });
                            Object.defineProperty(f, 'size', { get: () => size });
                            f.__nativeUrl = it.url;
                            f.__nativeStreamUrl = it.url;
                            f.__nativeArtUrl = it.artUrl || null;
                            f.__nativeLrcUrl = it.lrcUrl || '';
                            f.__metaTitle = it.title || '';
                            f.__metaArtist = it.artist || '';
                            f.__metaAlbum = it.album || '';
                            f.__metaYear = it.year || '';
                            f.__nativeId = it.id || ((it.url || '').match(/\/f\/([^/?#]+)/) || [])[1] || null;
                            f.__nativeLocation = it.location || it.uri || '';
                            f.__nativeName = name;
                            f.__fromLibrary = true;
                            const part = async (a, b) => (await fetch(it.url, { headers: { Range: 'bytes=' + a + '-' + (Math.min(b, size) - 1) } })).arrayBuffer();
                            f.slice = (a = 0, b = size) => ({ arrayBuffer: () => part(a, b), size: Math.max(0, Math.min(b, size) - a) });
                            f.arrayBuffer = async () => (await fetch(it.url)).arrayBuffer();
                            files.push(f);
                            continue;
                        }
                        const r = await fetch(it.url);
                        const b = await r.blob();
                        const f = new File([b], name, { type: it.type || b.type || '' });
                        f.__nativeId = it.id || ((it.url || '').match(/\/f\/([^/?#]+)/) || [])[1] || null;
                        f.__nativeLocation = it.location || it.uri || '';
                        f.__nativeName = name;
                        files.push(f);
                    }
                    if (isLibraryBatch) {
                        window.__plDefer = true;
                        clearTimeout(window.__plDeferT);
                        window.__plDeferT = setTimeout(() => { if (window.__plFlush) window.__plFlush(); }, 30000);   // phòng khi không nhận được tín hiệu quét xong
                    }
                    if (files.length) {
                        await handleFiles(files, isLibraryBatch ? { noPlay: true } : undefined);
                        if (isLibraryBatch && document.documentElement.classList.contains('m-ui')) {
                            if (typeof window.__syncMobileLibraryFromPlaylist === 'function') window.__syncMobileLibraryFromPlaylist();
                            if (typeof window.__renderMobileLibrary === 'function') window.__renderMobileLibrary();
                            if (typeof window.__refreshMobileLibraryViews === 'function') window.__refreshMobileLibraryViews();
                            if (typeof window.__hydrateMobileLibraryCovers === 'function') window.__hydrateMobileLibraryCovers();
                        } else if (isExternalBatch && document.documentElement.classList.contains('m-ui')) {
                            document.body.classList.remove('m-early-card');
                            document.body.classList.add('m-mini-visible');
                            if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
                        }
                    }
                } catch (e) { console.log('native-open failed', e); }
                finally { window.__ingestBusy = Math.max(0, (window.__ingestBusy || 1) - 1); }
            };
            window.__clearLibraryTracksBeforeScan = function () {
                try {
                    if (Array.isArray(window.__mobileLibrary)) {
                        window.__mobileLibrary = window.__mobileLibrary.filter(tr => tr && !(tr.file && tr.file.__fromLibrary));
                    }
                    // Chỉ giữ bài đang phát nếu có; các bài cũ của lần quét trước trên Mobile sẽ được nạp lại tươi từ đợt quét mới (tránh sót bài hoặc trùng bài)
                    for (let i = playlist.length - 1; i >= 0; i--) {
                        const tr = playlist[i];
                        if (tr && tr.file && tr.file.__fromLibrary && i !== currentIndex) {
                            if (tr.url && tr.url.startsWith('blob:')) URL.revokeObjectURL(tr.url);
                            playlist.splice(i, 1);
                            if (currentIndex > i) currentIndex--;
                        }
                    }
                    if (shuffleInitialized) generateShuffleOrder();
                    updatePlaylistUI();
                } catch (e) {}
            };
            window.__onAndroidPermissionsUpdated = function (info) {
                try {
                    const w = gettingStartedIframe && gettingStartedIframe.contentWindow;
                    if (w && w.__gsOnPermissionsUpdated) w.__gsOnPermissionsUpdated(info);
                    if (typeof window.__checkAndroidPermGate === 'function') window.__checkAndroidPermGate();
                } catch (e) {}
            };
            window.__onAndroidLibraryScanDone = function (count, missingPerm) {
                try {
                    if (missingPerm) return;
                    // Sau khi quét xong toàn bộ danh sách, đồng bộ lại playlist tạm nếu chưa phát bài riêng lẻ để không bị thiếu bài
                    if (!window.__queueRestored && !window.__externalOpenActive && Array.isArray(window.__mobileLibrary) && window.__mobileLibrary.length > 0 && playlist.length < window.__mobileLibrary.length) {
                        const curTr = playlist[currentIndex] || null;
                        playlist.length = 0;
                        window.__mobileLibrary.forEach(t => playlist.push(t));
                        currentIndex = curTr ? playlist.indexOf(curTr) : -1;
                        if (shuffleInitialized) generateShuffleOrder();
                    }
                    if (typeof window.__renderMobileLibrary === 'function') window.__renderMobileLibrary();
                    if (typeof window.__refreshMobileLibraryViews === 'function') window.__refreshMobileLibraryViews();
                    clearTimeout(window.__plDeferT);
                    const isMobileHomeHiddenQueue = document.documentElement.classList.contains('m-ui')
                        && !document.body.classList.contains('m-playlist-open')
                        && !document.body.classList.contains('m-player-expanded');
                    if (isMobileHomeHiddenQueue) {
                        window.__plDefer = true;
                        window.__plDirty = true;
                    } else {
                        window.__plDefer = false; window.__plDirty = false;
                        setTimeout(() => updatePlaylistUI(), 0);
                    }
                    // Tự động đọc ảnh bìa / tag nhúng ở nền cho các bài trên Mobile mà danh sách ngoài chưa có ảnh bìa
                    if (document.documentElement.classList.contains('m-ui') && Array.isArray(window.__mobileLibrary) && typeof window.__hydrateMobileLibraryCovers === 'function') {
                        window.__hydrateMobileLibraryCovers();
                    }
                } catch (e) {}
            };
            if (window.IS_ANDROID_APP && AB && typeof AB.scanAllDeviceAudio === 'function') {
                setTimeout(() => {
                    try {
                        if (localStorage.getItem('getting_started_done') === 'true') {
                            AB.scanAllDeviceAudio(false);
                        }
                    } catch (e) {}
                }, 600);
            }
            window.__nativeCmd = function (c) {
                if (c.startsWith('seek:')) { audio.currentTime = parseFloat(c.slice(5)) / 1000; return; }
                if (c.startsWith('play_index:')) {
                    const idx = parseInt(c.slice(11), 10);
                    if (Number.isFinite(idx) && idx >= 0 && idx < playlist.length) playTrack(idx);
                    return;
                }
                if (c === 'open_lyrics') {
                    if (typeof isLyricVisible !== 'undefined' && !isLyricVisible) {
                        const lb = document.getElementById('lyric-btn');
                        if (lb) lb.click();
                    }
                    return;
                }
                const id = { toggle: 'play-btn', next: 'next-btn', prev: 'prev-btn', shuffle: 'shuffle-btn', repeat: 'repeat-btn' }[c];
                const el = id && document.getElementById(id);
                if (el) el.click();
            };
            // Theo dõi thứ tự mở của các md-dialog để Back đóng đúng cái trên cùng
            (function () {
                const stack = [];
                document.addEventListener('open', (e) => { const d = e.target; if (d && d.tagName === 'MD-DIALOG') { const i = stack.indexOf(d); if (i >= 0) stack.splice(i, 1); stack.push(d); } }, true);
                document.addEventListener('closed', (e) => { const d = e.target; const i = stack.indexOf(d); if (i >= 0) stack.splice(i, 1); }, true);
                window.__mdTopDialog = function () {
                    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].open) return stack[i];
                    // dự phòng: dialog đang mở mà chưa kịp ghi nhận
                    return Array.from(document.querySelectorAll('md-dialog')).filter(d => d.open).pop() || null;
                };
            })();
            const handleBackNavigation = function () {
                try {
                    if (document.body.classList.contains('screen-animating')) {
                        return true;
                    }
                    const shareSheet = document.getElementById('share-sheet');
                    if (shareSheet && (shareSheet.classList.contains('open') || shareSheet.classList.contains('show'))) {
                        return true;
                    }
                    if (gettingStartedOverlay && gettingStartedOverlay.style.display === 'block') {
                        try {
                            const gw = gettingStartedIframe && gettingStartedIframe.contentWindow;
                            if (gw && typeof gw.__gsAndroidBack === 'function' && gw.__gsAndroidBack()) return true;
                        } catch (e) {}
                        return true;
                    }
                    // Dialog của Material Web (md-dialog) nằm trong top layer nên luôn nằm trên mọi thứ khác -> đóng trước
                    const mdTop = window.__mdTopDialog && window.__mdTopDialog();
                    if (mdTop) { try { mdTop.close(); } catch (e) { mdTop.open = false; } return true; }
                    const stSheet = document.getElementById('st-sheet');
                    if (stSheet && (stSheet.classList.contains('open') || stSheet.classList.contains('show'))) {
                        stSheet.classList.remove('show');
                        setTimeout(() => stSheet.classList.remove('open'), 260);
                        return true;
                    }
                    const openMenus = Array.from(document.querySelectorAll('md-menu, .m3-dropdown, .ctxl')).filter(el => {
                        if (el.tagName === 'MD-MENU') return !!el.open;
                        const st = getComputedStyle(el);
                        return el.classList.contains('show') || el.classList.contains('open') || st.display === 'flex' || st.display === 'block';
                    });
                    if (openMenus.length) {
                        openMenus.forEach(el => {
                            if (el.tagName === 'MD-MENU') {
                                try { el.open = false; } catch (e) {}
                                el.removeAttribute('open');
                            } else {
                                el.classList.remove('show', 'open');
                                if (el.style.display) el.style.display = 'none';
                            }
                        });
                        return true;
                    }
                    const updBanner = document.getElementById('android-update-banner');
                    if (updBanner && updBanner.classList.contains('show')) {
                        const disBtn = document.getElementById('android-update-dismiss');
                        if (disBtn) disBtn.click();
                        else { updBanner.classList.remove('show', 'fullscreen-toast'); }
                        return true;
                    }
                    const getZ = (el) => {
                        const z = parseFloat(getComputedStyle(el).zIndex);
                        return Number.isFinite(z) ? z : 0;
                    };
                    const openModal = Array.from(document.querySelectorAll('.cl-overlay.open, .cl-overlay[style*="display: flex"], .cl-overlay[style*="display: block"], dialog[open]'))
                        .filter(el => {
                            const st = getComputedStyle(el);
                            return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity || '1') > 0.05;
                        })
                        .sort((a, b) => getZ(b) - getZ(a))[0];
                    if (openModal) {
                        if (openModal.id === 'settings-overlay') {
                            const stDlg = document.getElementById('settings-dialog');
                            if (stDlg && stDlg.classList.contains('searching')) {
                                exitSettingsSearch();
                                return true;
                            }
                            if (stDlg && stDlg.classList.contains('st-m-detail')) {
                                if (typeof clPage !== 'undefined' && clPage !== 'about' && typeof clNavigateTo === 'function') {
                                    clNavigateTo('about');
                                    return true;
                                }
                                const mBack = document.getElementById('st-m-back');
                                if (mBack) mBack.click();
                                else if (typeof window.__stMobileReset === 'function') window.__stMobileReset();
                                return true;
                            }
                            const sClose = document.getElementById('settings-close-btn');
                            if (sClose) sClose.click();
                            else openModal.classList.remove('open');
                        } else if (openModal.id === 'more-info-modal') {
                            openModal.classList.remove('open');
                        } else if (openModal.tagName === 'DIALOG' && typeof openModal.close === 'function') {
                            openModal.close();
                        } else {
                            openModal.classList.remove('open');
                            if (openModal.style.display && openModal.style.display !== 'none') openModal.style.display = 'none';
                        }
                        return true;
                    }
                    if (document.body.classList.contains('m-more-open')) {
                        document.body.classList.remove('m-more-open');
                        const lyricBtn = document.getElementById('lyric-btn');
                        if (lyricBtn) lyricBtn.style.pointerEvents = '';
                        return true;
                    }
                    if (document.body.classList.contains('m-playlist-open')) {
                        document.body.classList.remove('m-playlist-open');
                        return true;
                    }
                    if (document.body.classList.contains('lyrics-open')) {
                        if (typeof window.__mLyricBackClose === 'function') {
                            window.__mLyricBackClose();
                            return true;
                        }
                        if (typeof closeLyrics === 'function') closeLyrics();
                        else if (typeof toggleLyrics === 'function') toggleLyrics();
                        const lo = document.getElementById('lyric-overlay') || (typeof lyricOverlay !== 'undefined' ? lyricOverlay : null);
                        const lb = document.getElementById('lyric-btn') || (typeof lyricBtn !== 'undefined' ? lyricBtn : null);
                        if (typeof isLyricVisible !== 'undefined') isLyricVisible = false;
                        document.body.classList.remove('lyrics-open', 'm-lyric-ui');
                        if (lo) {
                            lo.classList.remove('visible');
                            lo.style.opacity = '';
                            lo.style.visibility = '';
                            lo.style.display = '';
                            lo.style.pointerEvents = '';
                        }
                        if (lb) lb.classList.remove('active');
                        return true;
                    }
                    if (document.body.classList.contains('m-player-expanded')) {
                        document.body.classList.remove('m-player-expanded');
                        if (currentIndex >= 0 && playlist[currentIndex]) document.body.classList.add('m-mini-visible');
                        return true;
                    }
                    if (typeof window.__closeMobilePlDetailIfOpen === 'function' && window.__closeMobilePlDetailIfOpen()) {
                        return true;
                    }
                    return false;
                } catch (e) { return false; }
            };
            window.__androidHandleBack = handleBackNavigation;

            // ===== Predictive Back: xem trước theo ngón tay vuốt (Android 14+: app nhận tiến trình từ OnBackAnimationCallback) =====
            // - Có lớp phủ (Settings, sheet, hộp thoại, playlist, lyric...): lớp trên cùng thu nhỏ + trượt + bo góc.
            // - Đang ở màn hình chính: TOÀN BỘ UI mờ dần và lùi ra sau; thả tay thì zoom-out + fade-out rồi hiện hộp thoại thoát;
            //   khi hộp thoại đóng (Ở lại / chạy nền) UI zoom-in + fade-in về như cũ.
            (function () {
                let els = [], root = false, dir = 1, timer = 0;
                const z = (e) => { const v = parseFloat(getComputedStyle(e).zIndex); return Number.isFinite(v) ? v : 0; };
                const visible = (e) => { const st = getComputedStyle(e); return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity || '1') > 0.05; };
                const rootEls = () => ['.app-container', '#m-empty'].map(q => document.querySelector(q)).filter(Boolean);
                const exitOv = document.getElementById('exit-confirm-overlay');
                function target() {
                    if (document.body.classList.contains('screen-animating')) return null;
                    const md = window.__mdTopDialog && window.__mdTopDialog();
                    if (md) return (md.shadowRoot && md.shadowRoot.querySelector('.container')) || md;
                    const sh = document.getElementById('st-sheet');
                    if (sh && (sh.classList.contains('open') || sh.classList.contains('show'))) return sh.querySelector('.st-sheet-box');
                    const ov = Array.from(document.querySelectorAll('.cl-overlay.open, dialog[open]')).filter(visible).sort((a, b) => z(b) - z(a))[0];
                    if (ov) return ov.id === 'settings-overlay' ? document.getElementById('settings-dialog') : (ov.tagName === 'DIALOG' ? ov : (ov.firstElementChild || ov));
                    const b = document.body.classList;
                    if (b.contains('m-more-open')) return document.querySelector('.top-extra');
                    if (b.contains('m-playlist-open')) return document.querySelector('.playlist-card');
                    if (b.contains('lyrics-open')) return document.getElementById('lyric-overlay');
                    return null;
                }
                const tr = (on) => els.forEach(e => { e.style.transition = on || 'none'; });
                function reset(animated) {
                    const list = els, wasRoot = root; els = []; root = false;
                    if (!list.length) return;
                    clearTimeout(timer);
                    list.forEach(e => {
                        e.style.transition = animated ? 'transform .3s cubic-bezier(.2,0,0,1), opacity .3s, filter .3s, border-radius .25s' : 'none';
                        e.style.transform = ''; e.style.opacity = ''; e.style.filter = ''; e.style.borderRadius = '';
                    });
                    timer = setTimeout(() => list.forEach(e => { e.style.transition = ''; e.style.willChange = ''; }), 360);
                }
                window.__pbStart = function (edge) {
                    reset(false);
                    dir = edge === 1 ? -1 : 1;
                    const t = target();
                    if (t) { els = [t]; root = false; }
                    else { els = rootEls(); root = true; }
                    clearTimeout(timer);
                    els.forEach(e => { e.style.transition = 'none'; e.style.willChange = 'transform, opacity, filter'; });
                };
                window.__pbProgress = function (p) {
                    if (!els.length) return;
                    const k = Math.min(1, Math.max(0, p));
                    if (root) {
                        const t = 'scale(' + (1 - 0.08 * k).toFixed(3) + ')', o = (1 - 0.45 * k).toFixed(3), f = 'blur(' + (k * 5).toFixed(1) + 'px)';
                        els.forEach(e => { e.style.transform = t; e.style.opacity = o; e.style.filter = f; });
                    } else {
                        const t = 'translateX(' + (dir * k * 24).toFixed(1) + 'px) scale(' + (1 - 0.1 * k).toFixed(3) + ')', r = Math.round(k * 28) + 'px';
                        els.forEach(e => { e.style.transform = t; e.style.borderRadius = r; });
                    }
                };
                window.__pbCancel = function () { reset(true); };
                function restoreRoot() { document.body.classList.remove('pb-receded'); reset(true); }
                window.__pbCommit = function () {
                    if (!els.length) return;
                    clearTimeout(timer);
                    if (root) {
                        // Toàn bộ UI zoom-out + fade-out; hộp thoại thoát hiện ra từ phía Java ngay sau đó
                        els.forEach(e => {
                            e.style.transition = 'transform .28s cubic-bezier(.3,0,.8,.15), opacity .28s, filter .28s';
                            e.style.transform = 'scale(.8)'; e.style.opacity = '0'; e.style.filter = 'blur(8px)';
                        });
                        document.body.classList.add('pb-receded');
                        // Back được xử lý theo cách khác (menu, banner...) và không hiện hộp thoại -> trả UI về
                        timer = setTimeout(() => { if (!exitOv || !exitOv.classList.contains('open')) restoreRoot(); }, 700);
                    } else {
                        const keep = els;
                        timer = setTimeout(() => { if (els === keep) reset(true); }, 140);
                    }
                };
                // Thoát có animation: UI zoom-out + fade-out, cả cửa sổ mờ dần về nền tối rồi mới gọi lệnh thoát (cb).
                // restore = true (chạy nền): sau đó trả UI về nguyên trạng để lúc mở lại app không bị trống.
                window.__pbExitAnim = function (cb, restore) {
                    window.__pbExiting = true;
                    clearTimeout(timer);
                    if (!els.length) els = rootEls();
                    els.forEach(e => {
                        e.style.willChange = 'transform, opacity, filter';
                        e.style.transition = 'transform .3s cubic-bezier(.3,0,.8,.15), opacity .3s, filter .3s';
                        e.style.transform = 'scale(.8)'; e.style.opacity = '0'; e.style.filter = 'blur(8px)';
                    });
                    document.body.classList.add('pb-receded');
                    const h = document.documentElement;
                    h.style.transition = 'opacity .3s ease-out'; h.style.opacity = '0';
                    setTimeout(() => { try { cb(); } catch (e) {} }, 300);
                    if (restore) setTimeout(() => {
                        h.style.transition = 'none'; h.style.opacity = '';
                        window.__pbExiting = false;
                        els.forEach(e => { e.style.transition = 'none'; e.style.transform = ''; e.style.opacity = ''; e.style.filter = ''; });
                        document.body.classList.remove('pb-receded'); els = [];
                    }, 900);
                };
                // Hộp thoại thoát đóng (Ở lại / Chạy nền / bấm ra ngoài) -> UI zoom-in + fade-in
                if (exitOv) new MutationObserver(() => {
                    if (!window.__pbExiting && !exitOv.classList.contains('open') && document.body.classList.contains('pb-receded')) {
                        clearTimeout(timer);
                        if (!els.length) els = rootEls();
                        els.forEach(e => { e.style.transform = 'scale(.8)'; e.style.opacity = '0'; e.style.filter = 'blur(8px)'; e.style.transition = 'none'; });
                        requestAnimationFrame(() => requestAnimationFrame(restoreRoot));
                    }
                }).observe(exitOv, { attributes: true, attributeFilter: ['class'] });
            })();
            try {
                if (!window.__androidPopstateBound) {
                    window.__androidPopstateBound = true;
                    history.pushState({ mpBackGuard: 1 }, '');
                    window.addEventListener('popstate', () => {
                        const handled = handleBackNavigation();
                        if (!handled && AB && AB.__nativeBackFallback) {
                            AB.__nativeBackFallback();
                        } else {
                            try { history.pushState({ mpBackGuard: 1 }, ''); } catch (e) {}
                        }
                    });
                }
            } catch (e) {}
            let triggerAndroidUpdateCheck = null;
            window.__showExitConfirmDialog = function () {
                try {
                    const ov = document.getElementById('exit-confirm-overlay');
                    if (!ov) {
                        if (AB && AB.exitBackground) AB.exitBackground();
                        return;
                    }
                    const isEn = /^en/i.test(localStorage.getItem('settings_language') || '');
                    const tEl = document.getElementById('exit-confirm-title');
                    const bgEl = document.getElementById('exit-bg-label');
                    const fullEl = document.getElementById('exit-full-label');
                    const stayEl = document.getElementById('exit-stay-label');
                    if (tEl) tEl.textContent = isEn ? 'Do you want to exit?' : 'Bạn muốn thoát?';
                    if (bgEl) bgEl.textContent = isEn ? 'Run in background' : 'Chạy dưới nền';
                    if (fullEl) fullEl.textContent = isEn ? 'Exit completely' : 'Thoát hẳn';
                    if (stayEl) stayEl.textContent = isEn ? 'Stay' : 'Ở lại';
                    ov.classList.add('open');
                } catch (e) {}
            };
            (function () {
                const ov = document.getElementById('exit-confirm-overlay');
                if (!ov) return;
                const hideExitDialog = () => ov.classList.remove('open');
                const bgBtn = document.getElementById('exit-bg-btn');
                const fullBtn = document.getElementById('exit-full-btn');
                const stayBtn = document.getElementById('exit-stay-btn');
                const anim = (fn, restore) => { if (window.__pbExitAnim) window.__pbExitAnim(fn, restore); else fn(); };
                if (bgBtn) bgBtn.addEventListener('click', () => {
                    hideExitDialog();
                    anim(() => {
                        try {
                            if (window.AndroidBridge && window.AndroidBridge.exitBackground) window.AndroidBridge.exitBackground();
                            else if (AB && AB.exitBackground) AB.exitBackground();
                        } catch (e) {}
                    }, true);
                });
                if (fullBtn) fullBtn.addEventListener('click', () => {
                    hideExitDialog();
                    anim(() => {
                        try {
                            if (window.AndroidBridge && window.AndroidBridge.exitAppCompletely) window.AndroidBridge.exitAppCompletely();
                            else if (AB && AB.exitAppCompletely) AB.exitAppCompletely();
                        } catch (e) {}
                    }, false);
                });
                if (stayBtn) stayBtn.addEventListener('click', hideExitDialog);
                ov.addEventListener('click', (e) => { if (e.target === ov) hideExitDialog(); });
            })();
            window.__androidPing = function () {
                try {
                    const lang = localStorage.getItem('settings_language') || 'vi';
                    if (AB && AB.setLanguage) AB.setLanguage(lang);
                    if (AB && AB.pongReady) AB.pongReady();
                    // Mỗi lần app ping trang (mở app, quay lại từ nền) thì kiểm tra bản cập nhật luôn; giãn tối thiểu 30 giây để khỏi chạm giới hạn API của GitHub
                    const now = Date.now();
                    if (typeof triggerAndroidUpdateCheck === 'function') {
                        if (now - (window.__lastUpdCheckAt || 0) > 30000) { window.__lastUpdCheckAt = now; triggerAndroidUpdateCheck(); }
                    } else {
                        window.__pendingUpdCheck = true;   // hàm kiểm tra chưa nạp xong: sẽ chạy ngay khi sẵn sàng
                    }
                } catch (e) {}
            };
            try {
                const syncNativeLang = () => {
                    try {
                        const lang = localStorage.getItem('settings_language') || 'vi';
                        if (AB && AB.setLanguage) AB.setLanguage(lang);
                    } catch (e) {}
                };
                const langSel = document.getElementById('setting-language');
                if (langSel) langSel.addEventListener('change', () => setTimeout(syncNativeLang, 50));
                window.addEventListener('storage', (ev) => {
                    if (ev && ev.key === 'settings_language') syncNativeLang();
                });
                syncNativeLang();
                if (AB && AB.pongReady) AB.pongReady();
            } catch (e) {}

            // --- HIỂN THỊ THÔNG BÁO MÃ LỖI KHI APP VỪA TỰ HỦY / BỊ ĐÓNG ĐỘT NGỘT Ở NỀN (CHỈ ANDROID) ---
            (function checkLastAndroidCrash() {
                if (!AB || typeof AB.consumeLastCrashInfo !== 'function') return;
                setTimeout(() => {
                    try {
                        const raw = AB.consumeLastCrashInfo();
                        if (!raw) return;
                        const info = JSON.parse(raw);
                        if (!info || !info.code) return;
                        if (info.code === 'BG_TASK_REMOVED' || info.code === 'BG_SYS_USER_STOPPED') return;

                        // Khôi phục lại accent color gốc (bỏ màu động còn sót nếu có)
                        try {
                            if (typeof setDynamicAccent === 'function') setDynamicAccent(null);
                            else if (typeof applyAccentColor === 'function') applyAccentColor();
                        } catch (e) {}

                        const isEn = /^en/i.test(localStorage.getItem('settings_language') || '');
                        const code = String(info.code || 'UNKNOWN');
                        const reason = String(info.reason || '').trim();
                        const ts = Number(info.ts) || 0;
                        const timeText = ts ? new Date(ts).toLocaleString(isEn ? 'en-US' : 'vi-VN') : '';

                        const EXPLAIN = {
                            BG_WEBVIEW_RENDER_CRASH: [
                                'Tiến trình hiển thị (WebView) gặp lỗi và bị sập khi ứng dụng đang chạy ở nền. Ứng dụng đã tự dọn widget, khôi phục màu chủ đạo và tải lại sạch sẽ.',
                                'The WebView rendering process crashed while running in the background. Widgets and accent colors were reset and the app reloaded cleanly.'
                            ],
                            BG_WEBVIEW_RENDER_OOM: [
                                'Hệ thống Android đã thu hồi tiến trình WebView do thiếu RAM khi ứng dụng ở nền. Ứng dụng đã tự dọn sạch và khởi động lại từ đầu.',
                                'Android reclaimed the WebView process due to low memory while in the background. The app cleaned up and reloaded fresh.'
                            ],
                            FG_WEBVIEW_RENDER_CRASH: [
                                'Tiến trình hiển thị (WebView) vừa bị sập đột ngột. Ứng dụng đã tự khôi phục giao diện và đặt lại widget.',
                                'The WebView rendering process crashed unexpectedly. The app restored the interface and reset widgets.'
                            ],
                            FG_WEBVIEW_RENDER_OOM: [
                                'Thiết bị cạn RAM khiến hệ thống đóng tiến trình hiển thị (WebView). Ứng dụng đã tự tải lại.',
                                'The device ran low on memory and closed the WebView renderer. The app reloaded automatically.'
                            ],
                            BG_LOW_MEMORY_KILL: [
                                'Hệ thống báo thiếu RAM nghiêm trọng (TRIM_MEMORY_COMPLETE) khi ứng dụng đang chạy ở nền nên ứng dụng đã chủ động tự dọn widget, khôi phục màu và thoát sạch.',
                                'The system reported critical low memory (TRIM_MEMORY_COMPLETE) in the background, so the app safely reset widgets, restored accent color, and exited.'
                            ],
                            BG_TASK_REMOVED: [
                                'Tác vụ ứng dụng đã bị đóng hoặc gạt khỏi đa nhiệm trong khi đang chạy ở nền. Toàn bộ widget và màu chủ đạo đã được đặt lại.',
                                'The app task was closed or removed from recents while running in the background. Widgets and accent color were reset.'
                            ],
                            APP_UNCAUGHT_EXCEPTION: [
                                'Ứng dụng gặp ngoại lệ không xử lý được ở tầng Android native và phải khởi động lại.',
                                'The app encountered an unhandled native Android exception and had to restart.'
                            ],
                            BG_STALE_WATCHDOG: [
                                'Ứng dụng ngừng phản hồi hoặc bị hệ thống dừng đột ngột khi đang phát nhạc ở nền.',
                                'The app stopped responding or was unexpectedly terminated by the system while playing in the background.'
                            ],
                            BG_SYS_LOW_MEMORY: [
                                'Hệ thống Android (Low Memory Killer) đã đóng tiến trình ứng dụng ở nền để giải phóng RAM.',
                                'Android Low Memory Killer terminated the app process in the background to free up RAM.'
                            ],
                            BG_SYS_FREEZER: [
                                'Hệ thống đã đóng băng và dừng ứng dụng khi chạy nền để tiết kiệm pin. Bạn nên tắt tối ưu hóa pin cho Media Player trong Cài đặt.',
                                'The system froze and stopped the app in the background to save battery. Consider disabling battery optimization for Media Player in Settings.'
                            ],
                            BG_SYS_ANR: [
                                'Ứng dụng bị hệ thống dừng do không phản hồi (ANR).',
                                'The system stopped the app because it became unresponsive (ANR).'
                            ],
                            BG_SYS_CRASH: [
                                'Tiến trình ứng dụng vừa gặp sự cố sập hệ thống (Crash).',
                                'The app process previously terminated due to a crash.'
                            ],
                            BG_SYS_EXCESSIVE_RESOURCE: [
                                'Hệ thống đã dừng ứng dụng ở nền do sử dụng nhiều tài nguyên (CPU/Pin).',
                                'The system stopped the app in the background due to excessive resource usage.'
                            ],
                            BG_SYS_USER_STOPPED: [
                                'Ứng dụng đã bị buộc dừng từ hệ thống trước đó.',
                                'The app was previously force-stopped by the system.'
                            ],
                            BG_SYS_SIGNALED: [
                                'Tiến trình ứng dụng bị hệ thống ngắt đột ngột (SIGKILL).',
                                'The app process was abruptly terminated by the system (SIGKILL).'
                            ]
                        };
                        const pair = EXPLAIN[code] || [
                            'Ứng dụng vừa bị đóng đột ngột ở nền và đã tự động dọn dẹp widget, khôi phục màu chủ đạo để khởi động lại sạch sẽ.',
                            'The app was unexpectedly closed in the background and automatically reset widgets and accent colors for a clean restart.'
                        ];
                        const descText = isEn ? pair[1] : pair[0];

                        const ov = document.createElement('div');
                        ov.id = 'android-crash-overlay';
                        ov.className = 'cl-overlay open';
                        ov.style.cssText = 'z-index: 9600; padding: 16px;';

                        const box = document.createElement('div');
                        box.className = 'cl-dialog';
                        box.style.cssText = 'max-width: 420px; width: 100%; height: auto; max-height: 85vh; border-radius: 28px; overflow: hidden; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); display: flex; flex-direction: column;';

                        const body = document.createElement('div');
                        body.style.cssText = 'padding: 24px 22px 18px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto;';

                        const head = document.createElement('div');
                        head.style.cssText = 'display: flex; align-items: center; gap: 14px;';
                        head.innerHTML = '<div style="width:48px;height:48px;border-radius:16px;background:color-mix(in srgb, var(--md-sys-color-error, #F2B8B5) 22%, transparent);color:var(--md-sys-color-error, #F2B8B5);display:grid;place-items:center;flex-shrink:0;"><span class="material-symbols-rounded" style="font-size:26px;">warning</span></div>';
                        const hTx = document.createElement('div');
                        hTx.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';
                        const hTitle = document.createElement('h3');
                        hTitle.style.cssText = 'margin:0;font-size:18px;font-weight:800;line-height:1.25;';
                        hTitle.textContent = isEn ? 'App recovered from an unexpected stop' : 'Ứng dụng vừa bị đóng đột ngột';
                        const hSub = document.createElement('div');
                        hSub.style.cssText = 'font-size:12px;opacity:.68;';
                        hSub.textContent = timeText || (isEn ? 'Previous session' : 'Phiên chạy trước');
                        hTx.appendChild(hTitle);
                        hTx.appendChild(hSub);
                        head.appendChild(hTx);

                        const pDesc = document.createElement('p');
                        pDesc.style.cssText = 'margin:0;font-size:14px;line-height:1.5;opacity:.9;';
                        pDesc.textContent = descText;

                        const detailCard = document.createElement('div');
                        detailCard.style.cssText = 'padding:12px 14px;border-radius:16px;background:color-mix(in srgb, var(--md-sys-color-surface-variant) 55%, var(--md-sys-color-surface));font-family:monospace;font-size:12px;line-height:1.5;word-break:break-word;display:flex;flex-direction:column;gap:4px;';
                        const codeLine = document.createElement('div');
                        codeLine.style.fontWeight = '700';
                        codeLine.textContent = (isEn ? 'Error code: ' : 'Mã lỗi: ') + code;
                        detailCard.appendChild(codeLine);
                        if (reason) {
                            const rLine = document.createElement('div');
                            rLine.style.opacity = '0.82';
                            rLine.textContent = (isEn ? 'Details: ' : 'Chi tiết: ') + reason;
                            detailCard.appendChild(rLine);
                        }

                        const foot = document.createElement('div');
                        foot.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;padding:12px 20px 18px;';

                        const copyBtn = document.createElement('button');
                        copyBtn.type = 'button';
                        copyBtn.className = 'btn-m3';
                        copyBtn.style.cssText = 'width:auto;height:42px;padding:0 16px;border-radius:999px;background:var(--md-sys-color-surface-variant);color:var(--md-sys-color-on-surface);font-weight:700;display:inline-flex;align-items:center;gap:6px;';
                        copyBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px;">content_copy</span><span>' + (isEn ? 'Copy' : 'Sao chép') + '</span>';
                        copyBtn.addEventListener('click', () => {
                            const payload = `Code: ${code}${timeText ? '\nTime: ' + timeText : ''}${reason ? '\nDetails: ' + reason : ''}`;
                            try { navigator.clipboard.writeText(payload); } catch (e) {}
                            if (typeof showToast === 'function') showToast(isEn ? 'Copied error code' : 'Đã sao chép mã lỗi', 'content_copy', 2200);
                        });

                        const okBtn = document.createElement('button');
                        okBtn.type = 'button';
                        okBtn.className = 'btn-m3';
                        okBtn.style.cssText = 'width:auto;height:42px;padding:0 22px;border-radius:999px;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);font-weight:700;';
                        okBtn.textContent = isEn ? 'Got it' : 'Đã hiểu';
                        const closeOv = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 220); };
                        okBtn.addEventListener('click', closeOv);
                        ov.addEventListener('click', (ev) => { if (ev.target === ov) closeOv(); });

                        foot.appendChild(copyBtn);
                        foot.appendChild(okBtn);
                        body.appendChild(head);
                        body.appendChild(pDesc);
                        body.appendChild(detailCard);
                        box.appendChild(body);
                        box.appendChild(foot);
                        ov.appendChild(box);
                        document.body.appendChild(ov);
                    } catch (e) {}
                }, 700);
            })();
            window.__onAndroidLeaveApp = function () {
                try {
                    const tr = playlist[currentIndex];
                    if (tr && tr.isVideo && !audio.paused && !audio.ended && AB && AB.enterVideoPip) {
                        const vw = audio.videoWidth || 16;
                        const vh = audio.videoHeight || 9;
                        AB.enterVideoPip(vw, vh);
                    }
                } catch (e) {}
            };
            window.__onAndroidPipModeChanged = function (inPip) {
                try {
                    document.documentElement.classList.toggle('android-pip-mode', !!inPip);
                    document.body.classList.toggle('android-pip-mode', !!inPip);
                } catch (e) {}
            };
            if (window.__pendingNativeFiles) { const q = window.__pendingNativeFiles; window.__pendingNativeFiles = null; window.__nativeOpenFiles(q); }
            // Trạng thái chính xác cho MediaSession: playing | paused | buffering | ended | error | none
            const mediaState = () => {
                if (!(playlist[currentIndex] && audio.currentSrc)) return 'none';
                if (audio.error) return 'error';
                if (audio.ended) return 'ended';
                if (audio.paused) return (window.__trackSwitchUntil || 0) > Date.now() ? 'buffering' : 'paused';
                if (audio.seeking || audio.readyState < 3) return 'buffering';
                return 'playing';
            };
            const bufferedMs = () => {
                try {
                    const b = audio.buffered, t = audio.currentTime || 0;
                    for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.25 && t <= b.end(i) + 0.25) return Math.round(b.end(i) * 1000);
                } catch (e) {}
                return 0;
            };
            const report = () => {
                try {
                    const t = document.getElementById('track-name'), ar = document.getElementById('track-artist');
                    const artist = ((ar && ar.textContent) || '').split('|')[0].trim();
                    const st = mediaState(), active = st !== 'none';
                    const title = active ? ((t && t.textContent) || '') : '', art = active ? artist : '';
                    const pos = active ? Math.round((audio.currentTime || 0) * 1000) : 0;
                    const dur = (active && isFinite(audio.duration)) ? Math.round(audio.duration * 1000) : 0;
                    const rate = active ? (audio.playbackRate || 1) : 0;
                    if (AB.setMediaState) AB.setMediaState(st, title, art, pos, dur, rate, active ? bufferedMs() : 0);
                    else AB.setState(st === 'playing' || st === 'buffering', title, art, pos, dur, rate);
                } catch (e) {}
            };
            window.__reportMediaState = report;
            const sendArt = () => {
                try {
                    const img = document.getElementById('art-img');
                    if (!img || img.classList.contains('hidden') || !img.naturalWidth) { AB.setArtwork(''); return; }
                    const c = document.createElement('canvas'), n = 320;
                    c.width = n; c.height = n;
                    const k = Math.max(n / img.naturalWidth, n / img.naturalHeight);
                    const w = img.naturalWidth * k, h = img.naturalHeight * k;
                    c.getContext('2d').drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
                    AB.setArtwork(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
                } catch (e) {}
            };
            // Mọi sự kiện đổi trạng thái -> gửi ngay; khi đang phát thì chốt lại vị trí đúng mỗi giây (timeupdate chỉ ~4 lần/giây và không đều)
            ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'seeking', 'seeked', 'waiting', 'stalled', 'canplay', 'ratechange', 'emptied', 'error', 'abort'].forEach(ev => audio.addEventListener(ev, report));
            let lastWidgetModesKey = '';
            let lastWidgetQueueJson = '';
            const syncWidgetsExtra = () => {
                try {
                    if (AB && AB.setWidgetDetails) {
                        const sh = !!isShuffle, rp = Number(repeatMode) || 0;
                        const mKey = (sh ? '1' : '0') + '|' + rp;
                        if (mKey !== lastWidgetModesKey) {
                            lastWidgetModesKey = mKey;
                            AB.setWidgetDetails(sh, rp, 0, 0);
                        }
                    }
                    if (AB && AB.setWidgetQueue) {
                        const upcoming = [];
                        if (Array.isArray(playlist) && playlist.length > 0 && currentIndex >= 0) {
                            const order = (isShuffle && Array.isArray(shuffleOrder) && shuffleOrder.length === playlist.length)
                                ? shuffleOrder
                                : playlist.map((_, i) => i);
                            const curPos = order.indexOf(currentIndex);
                            const startPos = curPos >= 0 ? curPos : 0;
                            const maxItems = Math.min(4, Math.max(0, order.length - 1));
                            for (let step = 1; step <= maxItems; step++) {
                                const realIdx = order[(startPos + step) % order.length];
                                const item = playlist[realIdx];
                                if (item) {
                                    upcoming.push({
                                        index: realIdx,
                                        title: item.name || '',
                                        artist: item.artist || ''
                                    });
                                }
                            }
                        }
                        const qJson = JSON.stringify(upcoming);
                        if (qJson !== lastWidgetQueueJson) {
                            lastWidgetQueueJson = qJson;
                            AB.setWidgetQueue(qJson);
                        }
                    }
                } catch (e) {}
            };
            window.__syncAndroidWidgets = syncWidgetsExtra;
            setInterval(() => {
                if (!audio.paused && !audio.ended) report();
                syncWidgetsExtra();
            }, 1000);
            ['play', 'pause', 'ended', 'loadedmetadata', 'seeked'].forEach(ev => audio.addEventListener(ev, syncWidgetsExtra));
            audio.addEventListener('loadedmetadata', () => { sendArt(); report(); setTimeout(() => { sendArt(); report(); }, 1500); });
            // Chuyển bài: xóa ngay ảnh bìa cũ trong MediaSession, rồi gửi ảnh mới ngay khi nó tải xong (kể cả ảnh nhúng nạp muộn)
            audio.addEventListener('loadstart', sendArt);
            audio.addEventListener('playing', () => { window.__trackSwitchUntil = 0; });
            audio.addEventListener('pause', () => {
                const left = (window.__trackSwitchUntil || 0) - Date.now();
                if (left > 0) setTimeout(report, left + 80);
            });
            const artEl = document.getElementById('art-img');
            if (artEl) artEl.addEventListener('load', () => setTimeout(sendArt, 60));
            // Khung app (thanh trạng thái / điều hướng) ăn theo màu accent: theo dõi theme-color của trang
            const themeMeta = document.getElementById('theme-meta');
            const sendTheme = () => {
                try {
                    const cv = document.createElement('canvas').getContext('2d');
                    cv.fillStyle = '#000'; cv.fillStyle = themeMeta.getAttribute('content');
                    AB.setThemeColor(cv.fillStyle);
                } catch (e) {}
            };
            if (themeMeta) { new MutationObserver(sendTheme).observe(themeMeta, { attributes: true, attributeFilter: ['content'] }); sendTheme(); }

            // Widget màn hình chính ăn theo màu accent đang chọn trong app (nền = primary-container, nhấn = primary)
            let widgetColorTimer = null, lastWidgetColors = '';
            const sendWidgetColors = () => {
                try {
                    if (!AB.setWidgetColors) return;
                    const cs = getComputedStyle(document.documentElement);
                    const cv = document.createElement('canvas').getContext('2d');
                    const norm = (v, d) => { cv.fillStyle = '#000'; cv.fillStyle = (v || '').trim() || d; return cv.fillStyle; };
                    const bg = norm(cs.getPropertyValue('--md-sys-color-primary-container'), '#4F378B');
                    const ac = norm(cs.getPropertyValue('--md-sys-color-primary'), '#D0BCFF');
                    if (bg[0] !== '#' || ac[0] !== '#') return;
                    const key = bg + ac;
                    if (key === lastWidgetColors) return;
                    lastWidgetColors = key;
                    AB.setWidgetColors(bg, ac);
                } catch (e) {}
            };
            const queueWidgetColors = () => { clearTimeout(widgetColorTimer); widgetColorTimer = setTimeout(sendWidgetColors, 400); };
            new MutationObserver(queueWidgetColors).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
            setTimeout(sendWidgetColors, 1500);

            // Công tắc "Tắt tối ưu hóa pin" (chỉ hiện trên Android app)
            (function () {
                const row = document.getElementById('setting-battery-opt-row');
                const sw = document.getElementById('setting-battery-opt');
                if (!row || !sw) return;
                row.style.display = 'flex';
                const applyState = (ignored) => {
                    const ok = !!ignored;
                    sw.selected = ok;
                    sw.disabled = ok;
                    row.style.opacity = ok ? '0.6' : '1';
                };
                window.__onAndroidBatteryOptResult = (ignored) => {
                    applyState(ignored);
                    try {
                        const gf = document.getElementById('getting-started-iframe');
                        if (gf && gf.contentWindow && gf.contentWindow.__gsOnBatteryOptResult) {
                            gf.contentWindow.__gsOnBatteryOptResult(ignored);
                        }
                    } catch (e) {}
                };
                let initialIgnored = false;
                try {
                    if (AB && typeof AB.isIgnoringBatteryOptimizations === 'function') {
                        initialIgnored = !!AB.isIgnoringBatteryOptimizations();
                    }
                } catch (e) {}
                applyState(initialIgnored);
                sw.addEventListener('change', () => {
                    if (sw.disabled) {
                        sw.selected = true;
                        return;
                    }
                    if (!sw.selected) return;
                    try {
                        if (AB && typeof AB.requestIgnoreBatteryOptimizations === 'function') {
                            AB.requestIgnoreBatteryOptimizations();
                        } else {
                            applyState(false);
                        }
                    } catch (e) {
                        applyState(false);
                    }
                });
            })();

            // Truyền phiên bản app Android vào trang và đối chiếu với Release mới nhất trên GitHub
            function parseVerParts(raw) {
                const m = String(raw || '').trim().match(/(\d+(?:\.\d+)*)/);
                return m ? m[1].split('.').map(n => parseInt(n, 10) || 0) : [0];
            }
            function compareVerParts(a, b) {
                const len = Math.max(a.length, b.length);
                for (let i = 0; i < len; i++) {
                    const av = a[i] || 0, bv = b[i] || 0;
                    if (av > bv) return 1;
                    if (av < bv) return -1;
                }
                return 0;
            }
            const curVerName = (AB.getAppVersion && AB.getAppVersion()) || '';
            const curVerCode = (AB.getAppVersionCode && AB.getAppVersionCode()) || 0;
            window.ANDROID_APP_VERSION = curVerName;
            window.ANDROID_APP_VERSION_CODE = curVerCode;

            // Mũi tên xuống ở đáy ghi chú cập nhật khi còn nội dung bên dưới chưa cuộn tới
            function setupUpdateDescScrollHint(descEl) {
                const hint = document.createElement('div');
                hint.className = 'upd-more';
                hint.innerHTML = '<button type="button" aria-label="Scroll down"><span class="material-symbols-rounded">keyboard_arrow_down</span></button>';
                descEl.appendChild(hint);
                const update = () => {
                    const more = descEl.scrollHeight - descEl.scrollTop - descEl.clientHeight > 8;
                    hint.classList.toggle('show', more);
                };
                hint.querySelector('button').addEventListener('click', () => descEl.scrollBy({ top: Math.max(120, descEl.clientHeight * 0.7), behavior: 'smooth' }));
                if (!descEl.__hintBound) {
                    descEl.__hintBound = true;
                    descEl.addEventListener('scroll', () => descEl.__hintUpdate && descEl.__hintUpdate(), { passive: true });
                    try { new ResizeObserver(() => descEl.__hintUpdate && descEl.__hintUpdate()).observe(descEl); } catch (e) {}
                }
                descEl.__hintUpdate = update;
                update(); setTimeout(update, 150); setTimeout(update, 600);
            }
            window.__setupUpdHint = setupUpdateDescScrollHint;
            // Render markdown gọn cho ghi chú phát hành: tiêu đề, in đậm/nghiêng, code, danh sách (lồng nhau), liên kết, đoạn văn
            function escHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
            function renderReleaseMarkdown(md) {
                const inline = (t) => escHtml(t)
                    .replace(/`([^`]+)`/g, '<code>$1</code>')
                    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
                    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
                const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
                let out = '', stack = [], para = [];
                const flushPara = () => { if (para.length) { out += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
                // Mỗi cấp danh sách: <ul><li>…</li></ul>
                const closeLists = (depth) => { while (stack.length > depth) { out += '</li></ul>'; stack.pop(); } };
                for (const raw of lines) {
                    const line = raw.replace(/\s+$/, '');
                    if (!line.trim()) { flushPara(); closeLists(0); continue; }
                    let m;
                    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flushPara(); closeLists(0); out += '<h' + Math.min(m[1].length + 2, 6) + '>' + inline(m[2]) + '</h' + Math.min(m[1].length + 2, 6) + '>'; continue; }
                    if ((m = line.match(/^(\s*)[-*+]\s+(.*)$/))) {
                        flushPara();
                        const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2) + 1;
                        if (depth > stack.length) { while (stack.length < depth) { out += '<ul><li>'; stack.push(1); } }
                        else { closeLists(depth); out += '</li><li>'; }
                        out += inline(m[2]);
                        continue;
                    }
                    if (stack.length && /^\s+\S/.test(line)) { out += '<br>' + inline(line.trim()); continue; }   // dòng nối tiếp của mục danh sách
                    closeLists(0); para.push(line.trim());
                }
                flushPara(); closeLists(0);
                return out;
            }
            const banner = document.getElementById('android-update-banner');
            const iconEl = document.getElementById('android-update-icon');
            const titleEl = document.getElementById('android-update-title');
            const subEl = document.getElementById('android-update-sub');
            const descEl = document.getElementById('android-update-desc');
            const linkEl = document.getElementById('android-update-link');
            const dismissEl = document.getElementById('android-update-dismiss');
            const moreUpdateBtn = document.getElementById('m-more-update-btn');
            if (dismissEl && banner) {
                dismissEl.addEventListener('click', () => {
                    banner.classList.remove('show');
                    banner.classList.remove('fullscreen-toast');
                });
            }

            let updateCheckBound = false;
            triggerAndroidUpdateCheck = async function checkGitHubAndroidRelease() {
                if (!banner || (!curVerName && !curVerCode)) return;
                try {
                    const res = await fetch('https://api.github.com/repos/Tuanphong3108/music-player/releases?per_page=20', {
                        headers: { Accept: 'application/vnd.github+json' }
                    });
                    if (!res.ok) return;
                    const list = await res.json();
                    if (!Array.isArray(list) || !list.length) return;
                    const candidates = list.filter(r => r && !r.draft && !r.prerelease && Array.isArray(r.assets) && r.assets.some(a => /\.apk$/i.test(a.name || '')));
                    if (!candidates.length) return;
                    candidates.sort((a, b) => compareVerParts(parseVerParts(b.tag_name), parseVerParts(a.tag_name))
                        || String(b.published_at || '').localeCompare(String(a.published_at || '')));
                    const rel = candidates[0];
                    const tag = String(rel.tag_name || '').trim();
                    if (!tag) return;
                    const remoteParts = parseVerParts(tag);
                    const localParts = parseVerParts(curVerName);
                    const hasNewer = compareVerParts(remoteParts, localParts) > 0
                        || (/^latest$/i.test(tag) && Number(curVerCode) > 0 && String(rel.published_at || '') > String(localStorage.getItem('mp_android_apk_pub') || ''));
                    if (!hasNewer) return;
                    const displayVer = /^latest$/i.test(tag) ? (rel.name || 'latest') : tag;
                    const apkAsset = rel.assets.find(a => /\.apk$/i.test(a.name || ''));
                    const dlUrl = (apkAsset && apkAsset.browser_download_url) || rel.html_url || 'https://github.com/Tuanphong3108/music-player/releases';
                    const isEn = /^en/i.test(localStorage.getItem('settings_language') || '');
                    const progWrap = document.getElementById('android-update-progress-wrap');
                    const progFill = document.getElementById('android-update-progress-fill');
                    const progText = document.getElementById('android-update-progress-text');
                    const btnInner = document.getElementById('android-update-btn');
                    const fromVer = curVerName || String(curVerCode);
                    const toVer = displayVer;
                    const releaseNotes = (rel.body && String(rel.body).trim())
                        || (isEn
                            ? 'Includes improvements, bug fixes, and smoother Android experience.'
                            : 'Bản cập nhật mới cải thiện hiệu năng, sửa lỗi và tối ưu trải nghiệm trên Android.');

                    if (iconEl) iconEl.style.fontSize = '36px';
                    if (titleEl) titleEl.textContent = isEn ? 'Android app update available' : 'Đã có bản cập nhật cho ứng dụng Android';
                    if (subEl) subEl.textContent = isEn
                        ? `Version ${fromVer} → ${toVer}`
                        : `Phiên bản ${fromVer} → ${toVer}`;
                    if (descEl) {
                        descEl.innerHTML = '<p>' + escHtml(isEn
                            ? `Upgrade from ${fromVer} to ${toVer}.`
                            : `Nâng cấp từ phiên bản ${fromVer} lên ${toVer}.`) + '</p>' + renderReleaseMarkdown(releaseNotes);
                        setupUpdateDescScrollHint(descEl);
                    }
                    if (dismissEl) dismissEl.textContent = isEn ? 'Cancel' : 'Hủy';
                    if (btnInner) { btnInner.textContent = isEn ? 'Update' : 'Cập nhật'; btnInner.disabled = false; }
                    if (progWrap) progWrap.classList.remove('show');

                    let updateConfirmed = false;
                    const openConfirmFullscreen = () => {
                        updateConfirmed = true;
                        if (banner) {
                            banner.classList.add('show');
                            banner.classList.add('fullscreen-toast');
                        }
                        if (dismissEl) {
                            dismissEl.style.display = '';
                            dismissEl.textContent = isEn ? 'Cancel' : 'Hủy';
                        }
                        if (btnInner) {
                            btnInner.textContent = isEn ? 'Update' : 'Cập nhật';
                            btnInner.disabled = false;
                        }
                        if (progWrap) progWrap.classList.remove('show');
                    };

                    const triggerDownloadNow = () => {
                        if (dismissEl) {
                            dismissEl.style.display = '';
                            dismissEl.textContent = isEn ? 'Cancel' : 'Hủy';
                        }
                        if (btnInner) {
                            btnInner.disabled = true;
                            btnInner.textContent = isEn ? 'Update' : 'Cập nhật';
                        }
                        if (progWrap) progWrap.classList.add('show');
                        if (progFill) progFill.style.width = '0%';
                        if (progText) progText.textContent = isEn ? 'Downloading update... 0%' : 'Đang tải bản cập nhật... 0%';
                        const apkUrl = (apkAsset && apkAsset.browser_download_url) || '';
                        if (AB && AB.startUpdateDownload && apkUrl) {
                            AB.startUpdateDownload(apkUrl);
                        } else if (apkUrl) {
                            window.location.href = apkUrl;
                        } else {
                            window.open(dlUrl, '_blank', 'noopener');
                        }
                    };

                    if (dismissEl && banner) {
                        dismissEl.onclick = function (ev) {
                            ev.preventDefault();
                            if (AB && AB.cancelUpdateDownload) AB.cancelUpdateDownload();
                            banner.classList.remove('show');
                            banner.classList.remove('fullscreen-toast');
                        };
                    }

                    if (moreUpdateBtn) {
                        moreUpdateBtn.classList.add('has-update');
                        if (!updateCheckBound) {
                            moreUpdateBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                document.body.classList.remove('m-more-open');
                                openConfirmFullscreen();
                            });
                        }
                    }

                    if (linkEl) {
                        linkEl.href = dlUrl;
                        linkEl.onclick = function (ev) {
                            ev.preventDefault();
                            if (!updateConfirmed) {
                                openConfirmFullscreen();
                                return;
                            }
                            triggerDownloadNow();
                        };
                    }
                    if (btnInner && !updateCheckBound) {
                        btnInner.addEventListener('click', function (ev) {
                            ev.preventDefault();
                            ev.stopPropagation();
                            if (!updateConfirmed) {
                                openConfirmFullscreen();
                                return;
                            }
                            triggerDownloadNow();
                        });
                    }
                    updateCheckBound = true;
                    window.__onAndroidUpdateProgress = function (pct, doneBytes, totalBytes) {
                        if (!progWrap) progWrap.classList.add('show');
                        if (pct >= 0) {
                            if (progFill) progFill.style.width = pct + '%';
                            if (progText) progText.textContent = (isEn ? 'Downloading update... ' : 'Đang tải bản cập nhật... ') + pct + '%';
                        } else {
                            const mb = (doneBytes / (1024 * 1024)).toFixed(2);
                            if (progText) progText.textContent = (isEn ? `Downloading... ${mb} MB` : `Đang tải... ${mb} MB`);
                        }
                        if (pct >= 100 && progText) {
                            progText.textContent = isEn ? 'Opening installer...' : 'Đang mở trình cài đặt...';
                        }
                    };
                    window.__onAndroidUpdateInstalled = function () {
                        if (banner) {
                            banner.classList.remove('show');
                            banner.classList.remove('fullscreen-toast');
                        }
                    };
                    window.__onAndroidUpdateError = function (errMsg) {
                        if (banner) {
                            banner.classList.add('show');
                            banner.classList.add('fullscreen-toast');
                        }
                        if (progWrap) progWrap.classList.add('show');
                        if (progText) {
                            progText.textContent = (isEn ? 'Update failed: ' : 'Lỗi cập nhật: ') + errMsg;
                        }
                        if (dismissEl) {
                            dismissEl.style.display = '';
                            dismissEl.textContent = isEn ? 'Cancel' : 'Hủy';
                        }
                        if (btnInner) {
                            btnInner.disabled = false;
                            btnInner.textContent = isEn ? 'Retry' : 'Thử lại';
                        }
                    };
                    if (dismissEl) dismissEl.textContent = isEn ? 'Later' : 'Để sau';
                    if (btnInner) btnInner.textContent = isEn ? 'Update' : 'Cập nhật';
                    banner.classList.add('show');
                } catch (e) {}
            };
            if (typeof triggerAndroidUpdateCheck === 'function') { window.__lastUpdCheckAt = Date.now(); window.__pendingUpdCheck = false; triggerAndroidUpdateCheck(); }
        })();

        if ('serviceWorker' in navigator) {
            const hadSwController = !!navigator.serviceWorker.controller;
            let swReloading = false;
            let swReloadPending = false;
            const isPlayingNow = () => { try { return !!(audio && !audio.paused && !audio.ended); } catch (e) { return false; } };
            const triggerSwReload = () => {
                if (!hadSwController || swReloading) return;
                // Đang mở tệp từ app Files (launchQueue) -> không reload kẻo bay mất tệp vừa truyền sang
                if (window.__launchQueueActive) { swReloadPending = true; return; }
                // Đang phát nhạc thì không tải lại giữa chừng: đợi tới khi tạm dừng/hết bài (bản mới sẽ áp dụng ở lần mở sau nếu không kịp)
                if (isPlayingNow() && !(window.__nativeAudioState && window.IS_ANDROID_APP)) { swReloadPending = true; return; }
                swReloading = true;
                location.reload();
            };
            try {
                audio.addEventListener('pause', () => {
                    if (swReloadPending && !isPlayingNow()) setTimeout(() => { if (swReloadPending && !isPlayingNow()) { swReloadPending = false; triggerSwReload(); } }, 1500);
                });
            } catch (e) {}
            navigator.serviceWorker.addEventListener('controllerchange', triggerSwReload);
            navigator.serviceWorker.addEventListener('message', (ev) => {
                if (ev && ev.data && ev.data.type === 'SW_UPDATED') triggerSwReload();
            });
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js?v=2026_11_24_0650_ai_lyric_translate', { updateViaCache: 'none' })
                    .then(registration => {
                        console.log('SW Registered with scope:', registration.scope);
                        try { registration.update(); } catch (e) {}
                    })
                    .catch(err => console.log('SW Registration failed:', err));
            });
        }


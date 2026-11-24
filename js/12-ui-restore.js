// Nhớ trạng thái giao diện + bài đang phát; nếu WebView bị tải lại (tự phục hồi / hệ thống thu hồi) thì quay lại đúng chỗ cũ
(function () {
    'use strict';
    if (!window.IS_ANDROID_APP) return;
    const KEY = 'mp_ui_state_v1';
    const body = document.body;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    const keyOf = (t) => (t && (t.nativeLocation || t.rawName || t.name || '') || '').toLowerCase();
    const hasExtLaunch = !!(window.__externalOpenActive || (window.AndroidBridge && typeof window.AndroidBridge.hasPendingExternalOpen === 'function' && window.AndroidBridge.hasPendingExternalOpen()));
    if (hasExtLaunch) window.__externalOpenActive = true;
    let armed = hasExtLaunch;          // chỉ ghi đè trạng thái đã lưu sau khi đã khôi phục xong / người dùng đã thao tác
    let trackDone = hasExtLaunch || !saved || !saved.key;
    if (!hasExtLaunch && (window.__nativeBoot || (window.AndroidBridge && typeof window.AndroidBridge.nativeAudioQueueState === 'function'))) {
        saved = saved || { key: '', ts: 0 };
        trackDone = false;
    }
    let navApplied = hasExtLaunch;
    let touched = hasExtLaunch;
    window.addEventListener('pointerdown', (ev) => {
        // Bấm nút Play trên thẻ Mini Player khôi phục sớm -> không hủy khôi phục mà kích hoạt phát tiếp từ đoạn cũ
        if (ev && ev.target && ev.target.closest && ev.target.closest('#m-mini-play') && !trackDone) {
            return;
        }
        touched = true;
        armed = true;
    }, true);

    function snapshot() {
        const cur = (typeof playlist !== 'undefined' && currentIndex >= 0) ? playlist[currentIndex] : null;
        const nav = (window.__getMobileNav && window.__getMobileNav()) || {};
        let pos = 0;
        try { pos = audio.currentTime > 0.5 ? audio.currentTime : (window.__lastPos || 0); } catch (e) {}
        return {
            key: cur ? keyOf(cur) : '',
            path: cur && cur.nativeLocation ? String(cur.nativeLocation) : '',
            pos: pos,
            playing: !!cur && !audio.paused,
            expanded: body.classList.contains('m-player-expanded'),
            lyrics: body.classList.contains('lyrics-open'),
            queue: body.classList.contains('m-playlist-open'),
            tab: nav.tab || 'songs',
            plId: nav.plId || null,
            ts: Date.now()
        };
    }
    function save() {
        if (!armed) return;
        try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) {}
    }
    let t = null;
    const soon = () => { clearTimeout(t); t = setTimeout(save, 300); };
    new MutationObserver(soon).observe(body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('click', soon, true);
    document.addEventListener('visibilitychange', save);
    window.addEventListener('pagehide', save);
    setInterval(() => { if (!document.hidden || (typeof audio !== 'undefined' && !audio.paused && !audio.ended)) save(); }, 1000);

    // ===== Hàng đợi tạm (playlist đang phát): lưu đúng thứ tự + thứ tự shuffle, khôi phục sau khi quét xong thư viện =====
    const QKEY = 'mp_queue_v1';
    let qArmed = hasExtLaunch, qDone = hasExtLaunch, qSig = '';
    function cancelRestoreForExternal() {
        window.__externalOpenActive = true;
        window.__nativeBoot = null;
        window.__nativeBootQueue = null;
        window.__restoreOnce = null;
        window.__pendingMiniResume = false;
        trackDone = true;
        qDone = true;
        qArmed = true;
        navApplied = true;
        touched = true;
        armed = true;
        try { body.classList.remove('m-early-card'); } catch (e) {}
    }
    window.__cancelUiRestore = cancelRestoreForExternal;
    function saveQueue() {
        if (!qArmed || typeof playlist === 'undefined' || !playlist.length) return;
        try {
            const useOrder = !!(isShuffle && shuffleInitialized && shuffleOrder.length === playlist.length);
            const keys = playlist.map(keyOf);
            const paths = playlist.map(t => (t && t.nativeLocation) ? String(t.nativeLocation) : '');
            const sig = keys.length + '|' + keys[0] + '|' + keys[keys.length - 1] + '|' + keys.join('').length + '|' + (useOrder ? shuffleOrder.join(',') : '') + '|' + keys.filter((k, i) => i % 5 === 0).join('');
            if (sig === qSig) return;
            qSig = sig;
            localStorage.setItem(QKEY, JSON.stringify({ keys: keys, paths: paths, order: useOrder ? shuffleOrder.slice() : null }));
        } catch (e) {}
    }
    setInterval(() => { if (!document.hidden) saveQueue(); }, 10000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveQueue(); });
    window.addEventListener('pagehide', saveQueue);

    function buildPool() {
        const byKey = new Map();
        const byId = new Map();
        const lib = Array.isArray(window.__mobileLibrary) ? window.__mobileLibrary : [];
        const cur = (typeof playlist !== 'undefined' && currentIndex >= 0 && playlist[currentIndex]) ? playlist[currentIndex] : null;
        lib.concat(typeof playlist !== 'undefined' ? playlist : []).concat(cur ? [cur] : []).forEach(tr => {
            if (!tr) return;
            const k = keyOf(tr);
            if (k && !byKey.has(k)) byKey.set(k, tr);
            if (tr.nativeId && !byId.has(String(tr.nativeId))) byId.set(String(tr.nativeId), tr);
        });
        return { byKey, byId };
    }

    function applyNativeQueue(nqData) {
        if (!nqData || typeof playlist === 'undefined') return false;
        const isBackup = !!nqData.fromBackup;
        const locs = Array.isArray(nqData.locations) ? nqData.locations : [];
        const ids = Array.isArray(nqData.ids) ? nqData.ids : [];
        const len = Math.max(locs.length, ids.length);
        if (!len) return false;
        const { byKey, byId } = buildPool();
        const nq = [], oldIdx = [];
        for (let i = 0; i < len; i++) {
            const loc = String(locs[i] || '').toLowerCase();
            const id = String(ids[i] || '');
            // Bản lưu sau khi sập/đóng app (fromBackup): ID cũ của tiến trình trước không còn hợp lệ -> chỉ khớp theo đường dẫn tệp (location)
            const tr = isBackup
                ? ((loc && byKey.get(loc)) || null)
                : ((id && byId.get(id)) || (loc && byKey.get(loc)) || null);
            if (tr) { nq.push(tr); oldIdx[i] = nq.length - 1; }
            else oldIdx[i] = -1;
        }
        if (!nq.length) return false;
        const cur = (currentIndex >= 0 && playlist[currentIndex]) || null;
        const same = nq.length === playlist.length && nq.every((tr, i) => tr === playlist[i]);
        if (!same) {
            playlist.length = 0;
            nq.forEach(tr => playlist.push(tr));
            let ci = cur ? playlist.indexOf(cur) : -1;
            if (cur && ci < 0) {   // bài đang phát vừa được thay bằng bản thật trong thư viện (hoặc ngược lại) -> khớp theo id / đường dẫn
                const ck = keyOf(cur);
                ci = playlist.findIndex(t => t && ((!isBackup && cur.nativeId && t.nativeId === cur.nativeId) || (ck && keyOf(t) === ck)));
            }
            currentIndex = ci;
            window.__queueRestored = true;
        }
        if (typeof nqData.repeat === 'number' && typeof repeatMode !== 'undefined' && repeatMode !== nqData.repeat) {
            repeatMode = nqData.repeat;
            if (typeof applyRepeatUI === 'function') applyRepeatUI();
        }
        const nativeShuffled = nqData.shuffle === true;
        const rawOrder = Array.isArray(nqData.shuffleOrder) ? nqData.shuffleOrder : (Array.isArray(nqData.order) ? nqData.order : []);
        const ord = nativeShuffled ? rawOrder.map(i => oldIdx[i]).filter(i => i >= 0) : [];
        if (nativeShuffled && ord.length === playlist.length && playlist.length > 0) {
            if (typeof isShuffle !== 'undefined') {
                isShuffle = true;
                try { localStorage.setItem('settings_shuffle', 'true'); } catch (e) {}
                document.getElementById('shuffle-btn')?.classList.add('active');
                document.getElementById('m-pl-shuffle')?.classList.add('active');
                if (typeof activePlTab !== 'undefined') activePlTab = 'shuffle';
                document.getElementById('pl-tab-playlist')?.classList.remove('active');
                document.getElementById('pl-tab-shuffle')?.classList.add('active');
                document.getElementById('pl-tabs')?.classList.add('expanded');
                const rb = document.getElementById('reshuffle-btn');
                if (rb) rb.style.display = 'flex';
            }
            shuffleOrder = ord;
            shuffleInitialized = true;
        } else if (nqData.shuffle === false) {
            if (typeof isShuffle !== 'undefined') {
                isShuffle = false;
                try { localStorage.setItem('settings_shuffle', 'false'); } catch (e) {}
                document.getElementById('shuffle-btn')?.classList.remove('active');
                document.getElementById('m-pl-shuffle')?.classList.remove('active');
                if (typeof activePlTab !== 'undefined') activePlTab = 'playlist';
                document.getElementById('pl-tab-playlist')?.classList.add('active');
                document.getElementById('pl-tab-shuffle')?.classList.remove('active');
                document.getElementById('pl-tabs')?.classList.remove('expanded');
                const rb = document.getElementById('reshuffle-btn');
                if (rb) rb.style.display = 'none';
            }
            shuffleOrder = [];
            shuffleInitialized = false;
        } else if (isShuffle && !same && typeof generateShuffleOrder === 'function') {
            generateShuffleOrder();
        }
        qDone = true;
        qArmed = true;
        window.__plDefer = false;
        window.__plDirty = false;
        updatePlaylistUI();
        if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
        return true;
    }

    function restoreQueue() {
        if (qDone || window.__externalOpenActive) { qDone = true; qArmed = true; return; }
        if (window.__nativeBootQueue && applyNativeQueue(window.__nativeBootQueue)) return;
        try {
            let q = null;
            try { q = JSON.parse(localStorage.getItem(QKEY) || 'null'); } catch (e) {}
            if (!q || !Array.isArray(q.keys) || !q.keys.length) {
                if (window.__ingestBusy <= 0) { qDone = true; qArmed = true; }
                return;
            }
            const { byKey } = buildPool();
            if (!byKey.size) return; // thư viện chưa có bài nào -> đợi đợt quét tới
            const cur = (currentIndex >= 0 && playlist[currentIndex]) || null;
            const nq = [], oldIdx = [];
            q.keys.forEach((k, i) => { const tr = byKey.get(String(k || '').toLowerCase()); if (tr) { nq.push(tr); oldIdx[i] = nq.length - 1; } else oldIdx[i] = -1; });
            if (!nq.length) return;
            qDone = true;
            const same = nq.length === playlist.length && nq.every((tr, i) => tr === playlist[i]);
            if (!same) {
                playlist.length = 0;
                nq.forEach(tr => playlist.push(tr));
                currentIndex = cur ? playlist.indexOf(cur) : -1;
                window.__queueRestored = true;
            }
            if (isShuffle) {
                const ord = Array.isArray(q.order) ? q.order.map(i => oldIdx[i]).filter(i => i >= 0) : [];
                if (ord.length === playlist.length) { shuffleOrder = ord; shuffleInitialized = true; }
                else if (!same) generateShuffleOrder();
            }
            updatePlaylistUI();
            if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
            if (typeof window.__syncNativeQueue === 'function') window.__syncNativeQueue();
        } catch (e) {} finally {
            if (qDone) qArmed = true;
        }
    }
    let libScanFinished = false;
    (function () {
        const o = window.__onAndroidLibraryScanDone;
        window.__onAndroidLibraryScanDone = function (count, missingPerm) {
            if (!missingPerm && window.__ingestBusy > 0) { const args = arguments; setTimeout(() => window.__onAndroidLibraryScanDone.apply(null, args), 150); return; }
            let r; try { if (o) r = o.apply(this, arguments); } catch (e) {}
            libScanFinished = true;
            if (!missingPerm) {
                // Đợi một nhịp ngắn sau khi quét xong để toàn bộ danh sách & DOM ổn định rồi mới chạy pipeline khôi phục tuần tự
                setTimeout(() => {
                    window.__plDefer = false;
                    if (typeof window.__plFlush === 'function') window.__plFlush();
                    if (!trackDone && !window.__externalOpenActive) tryRestore(false);
                    else restoreQueue();
                    if (typeof window.__refreshMobileLibraryViews === 'function') window.__refreshMobileLibraryViews();
                }, 220);
            } else {
                qArmed = true;
            }
            return r;
        };
        setTimeout(() => {
            libScanFinished = true;
            if (!trackDone && !window.__externalOpenActive) tryRestore(false);
            if (!qDone) { qArmed = true; }
        }, 12000);
    })();

    // ===== Thẻ bài đang phát lưu sẵn: hiện mini player NGAY khi mở app (trước khi quét xong thư viện) =====
    const CKEY = 'mp_last_card_v1';
    let card = null;
    try { card = JSON.parse(localStorage.getItem(CKEY) || 'null'); } catch (e) {}
    function showEarlyCard() {
        try {
            if (hasExtLaunch || window.__externalOpenActive) return;
            if (!card || !card.name || !document.documentElement.classList.contains('m-ui')) return;
            const t = document.getElementById('m-mini-title'), ar = document.getElementById('m-mini-artist'), art = document.getElementById('m-mini-art');
            if (t) t.textContent = card.name;
            if (ar) ar.textContent = card.artist || '';
            if (art) art.innerHTML = '<span class="material-symbols-rounded">music_note</span>' + (card.thumb ? '<img src="' + card.thumb + '" alt="" class="loaded">' : '');
            body.classList.add('m-early-card', 'm-mini-visible');
            // không tìm lại được bài trong thư viện sau một lúc -> gỡ thẻ tạm
            setTimeout(() => { if (typeof currentIndex !== 'undefined' && currentIndex < 0) body.classList.remove('m-early-card', 'm-mini-visible'); }, 50000);
        } catch (e) {}
    }
    showEarlyCard();
    let cardKey = '';
    function saveCard() {
        try {
            const tr = (typeof playlist !== 'undefined' && currentIndex >= 0) ? playlist[currentIndex] : null;
            if (!tr) return;
            const k = keyOf(tr) + '|' + (tr.cover ? 1 : 0) + '|' + tr.name + '|' + tr.artist;
            if (k === cardKey) return;
            let thumb = card && card.key === keyOf(tr) ? card.thumb : '';
            const img = document.getElementById('art-img');
            if (tr.cover && img && !img.classList.contains('hidden') && img.naturalWidth) {
                const c = document.createElement('canvas'), n = 144;
                c.width = n; c.height = n;
                const kk = Math.max(n / img.naturalWidth, n / img.naturalHeight);
                const w = img.naturalWidth * kk, h = img.naturalHeight * kk;
                c.getContext('2d').drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
                thumb = c.toDataURL('image/jpeg', 0.75);
            } else if (!tr.cover) thumb = '';
            cardKey = k;
            card = { key: keyOf(tr), name: tr.name || '', artist: tr.artist || '', thumb: thumb };
            localStorage.setItem(CKEY, JSON.stringify(card));
        } catch (e) {}
    }
    setInterval(() => { if (!document.hidden) saveCard(); }, 6000);
    audio.addEventListener('loadedmetadata', () => setTimeout(saveCard, 800));
    const artEl = document.getElementById('art-img');
    if (artEl) artEl.addEventListener('load', () => setTimeout(saveCard, 100));

    // Mở danh sách phát trong lúc đang nạp thư viện -> dựng ngay
    new MutationObserver(() => {
        if (window.__plDefer && window.__plDirty && (body.classList.contains('m-playlist-open') || body.classList.contains('m-player-expanded'))) window.__plFlush();
    }).observe(body, { attributes: true, attributeFilter: ['class'] });

    function applyNav() {
        if (navApplied || !saved || touched) return;
        navApplied = true;
        if (window.__setMobileNav && ((saved.tab && saved.tab !== 'songs') || saved.plId)) {
            window.__setMobileNav(saved.tab, saved.plId);
            if (typeof window.__refreshMobileLibraryViews === 'function') window.__refreshMobileLibraryViews();
        }
    }
    function applyPanels() {
        try {
            if (!saved) return;
            if (saved.expanded) { body.classList.add('m-player-expanded'); if (typeof updateFsUI === 'function') updateFsUI(); }
            if (saved.queue) body.classList.add('m-playlist-open');
            if (saved.lyrics && saved.expanded) { const lb = document.getElementById('lyric-btn'); if (lb && !body.classList.contains('lyrics-open')) lb.click(); }
        } catch (e) {}
    }
    // Đọc ngay thẻ nhúng + ảnh bìa của bài đang khôi phục (không chờ 300ms/3s như các bài khác)
    function prioritizeTrack(idx) {
        try {
            const tr = playlist[idx];
            if (!tr) return;
            if (!tr._hasRealCover && tr.nativeStreamUrl && typeof hydrateTrackTags === 'function') {
                tr._tagsHydrated = true; tr._prioDone = true;
                const viaRange = () => {
                    fetch(tr.nativeStreamUrl, { headers: { Range: 'bytes=0-3145727' } }).then(r => r.ok ? r.blob() : null).then(bl => {
                        if (!bl || playlist[currentIndex] !== tr) return;
                        hydrateTrackTags(tr, idx, new File([bl], tr.nativeName || (tr.name + '.' + (tr.ext || 'mp3').toLowerCase()), { type: bl.type || 'audio/mpeg' }));
                    }).catch(() => {});
                };
                try { hydrateTrackTags(tr, idx, tr.nativeStreamUrl, viaRange); } catch (e) { viaRange(); }
            }
        } catch (e) {}
    }
    let bootSince = 0, stubbed = false, restorePipelineRunning = false;
    const waitMs = (ms) => new Promise(r => setTimeout(r, ms));
    const waitFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    function waitTrackLoaded(timeoutMs) {
        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(tm);
                audio.removeEventListener('loadedmetadata', finish);
                audio.removeEventListener('canplay', finish);
                resolve();
            };
            const tm = setTimeout(finish, timeoutMs || 2500);
            audio.addEventListener('loadedmetadata', finish, { once: true });
            audio.addEventListener('canplay', finish, { once: true });
        });
    }

    async function importMissingSavedPaths(boot, bootQ) {
        try {
            if (!window.AndroidBridge || typeof window.AndroidBridge.importLocationsForRestore !== 'function') return;
            const { byKey } = buildPool();
            const candidates = [];
            const seen = new Set();
            const pushPath = (p) => {
                const s = String(p || '').trim();
                if (!s) return;
                if (!(s.startsWith('/') || s.startsWith('content://') || s.startsWith('file://'))) return;
                const low = s.toLowerCase();
                if (seen.has(low) || byKey.has(low)) return;
                seen.add(low);
                candidates.push(s);
            };
            if (boot) { pushPath(boot.curPath); pushPath(boot.curLoc); }
            if (bootQ) {
                pushPath(bootQ.curLoc);
                if (Array.isArray(bootQ.locations)) bootQ.locations.forEach(pushPath);
            }
            if (saved) pushPath(saved.path);
            try {
                const q = JSON.parse(localStorage.getItem(QKEY) || 'null');
                if (q && Array.isArray(q.paths)) q.paths.forEach(pushPath);
            } catch (e) {}
            if (!candidates.length) return;
            const raw = window.AndroidBridge.importLocationsForRestore(JSON.stringify(candidates));
            const imported = JSON.parse(raw || '[]');
            if (Array.isArray(imported) && imported.length && typeof window.__nativeOpenFiles === 'function') {
                await window.__nativeOpenFiles(imported);
                await waitFrames();
            }
        } catch (e) {}
    }

    function tryRestore(forceNow) {
        if (window.__externalOpenActive) { trackDone = true; armed = true; return true; }
        if (!saved && !(card && card.key) && !window.__nativeBoot && !(window.AndroidBridge && typeof window.AndroidBridge.nativeAudioQueueState === 'function')) return true;
        if (!touched) applyNav();
        if (trackDone || restorePipelineRunning) return true;
        if (touched || (typeof currentIndex !== 'undefined' && currentIndex >= 0)) { trackDone = true; return true; }
        if (typeof playlist === 'undefined') return false;
        // Bước 1: Đợi load xong toàn bộ thư viện / playlist trước rồi mới khôi phục hàng đợi và chọn bài (trừ khi người dùng chủ động bấm Play sớm)
        if (!forceNow && (!libScanFinished || window.__ingestBusy > 0)) return false;

        // Bước 2: Request khung app lấy trạng thái + hàng đợi (live trước, không có thì lấy bản lưu SharedPreferences)
        let boot = window.__nativeBoot || null;
        let bootQ = window.__nativeBootQueue || null;
        if (window.AndroidBridge) {
            if (!boot && typeof window.AndroidBridge.nativeAudioState === 'function') {
                try {
                    const liveS = JSON.parse(window.AndroidBridge.nativeAudioState() || 'null');
                    if (liveS && liveS.loaded && liveS.id) {
                        boot = liveS;
                        window.__nativeBoot = liveS;
                    }
                } catch (e) {}
            }
            if (!bootQ && typeof window.AndroidBridge.nativeAudioQueueState === 'function') {
                try {
                    const liveQ = JSON.parse(window.AndroidBridge.nativeAudioQueueState() || 'null');
                    if (liveQ && (liveQ.count > 0 || (Array.isArray(liveQ.ids) && liveQ.ids.length > 0) || liveQ.curId)) {
                        bootQ = liveQ;
                        window.__nativeBootQueue = liveQ;
                    }
                } catch (e) {}
            }
            if (!boot && typeof window.AndroidBridge.nativeAudioSavedState === 'function') {
                try {
                    const savedS = JSON.parse(window.AndroidBridge.nativeAudioSavedState() || 'null');
                    if (savedS && (savedS.curLoc || savedS.id || savedS.title)) {
                        savedS.fromBackup = true;
                        savedS.pwr = false;
                        boot = savedS;
                        window.__nativeBoot = savedS;
                    }
                } catch (e) {}
            }
            if (!bootQ && typeof window.AndroidBridge.nativeAudioSavedQueue === 'function') {
                try {
                    const savedQ = JSON.parse(window.AndroidBridge.nativeAudioSavedQueue() || 'null');
                    if (savedQ && (savedQ.count > 0 || (Array.isArray(savedQ.locations) && savedQ.locations.length > 0))) {
                        savedQ.fromBackup = true;
                        bootQ = savedQ;
                        window.__nativeBootQueue = savedQ;
                    }
                } catch (e) {}
            }
        }
        const isLiveBoot = !!(boot && !boot.fromBackup && boot.loaded && boot.id);
        restorePipelineRunning = true;

        (async () => {
            try {
                // Bước 2.5: Nếu có bài đã lưu đường dẫn tệp (/storage/... hoặc content://...) chưa có trong thư viện quét -> import trực tiếp từ native trước khi dựng hàng đợi
                await importMissingSavedPaths(boot, bootQ);
                // Bước 3: Nhập lại playlist tạm (kèm đúng thứ tự Shuffle nếu bật) và đợi DOM playlist dựng xong hẳn
                if (bootQ) {
                    applyNativeQueue(bootQ);
                } else {
                    restoreQueue();
                }
                window.__plDefer = false;
                window.__plDirty = false;
                if (typeof updatePlaylistUI === 'function') updatePlaylistUI();
                await waitFrames();
                await waitMs(120);

                if (window.__externalOpenActive || touched || (typeof currentIndex !== 'undefined' && currentIndex >= 0)) {
                    trackDone = true;
                    armed = true;
                    return;
                }

                // Bước 4: Tìm đúng bài hát trong playlist tạm vừa nạp
                const targetKey = (saved && saved.key) || (card && card.key) || '';
                const bootLoc = String((boot && boot.curLoc) || (bootQ && bootQ.curLoc) || '').toLowerCase();
                let idx = -1;
                if (isLiveBoot) {
                    idx = playlist.findIndex(x => x && x.nativeId === boot.id);
                    if (idx < 0 && bootLoc) idx = playlist.findIndex(x => keyOf(x) === bootLoc);
                    if (idx < 0 && targetKey) idx = playlist.findIndex(x => keyOf(x) === targetKey);
                } else if (boot || targetKey) {
                    if (bootLoc) idx = playlist.findIndex(x => keyOf(x) === bootLoc);
                    if (idx < 0 && targetKey) idx = playlist.findIndex(x => keyOf(x) === targetKey);
                    if (idx < 0 && bootQ && typeof bootQ.shufflePos === 'number' && isShuffle && shuffleOrder.length === playlist.length && bootQ.shufflePos >= 0 && bootQ.shufflePos < shuffleOrder.length) {
                        idx = shuffleOrder[bootQ.shufflePos];
                    }
                    if (idx < 0 && (bootLoc || targetKey) && Array.isArray(window.__mobileLibrary)) {
                        const wantKey = bootLoc || targetKey;
                        const libTr = window.__mobileLibrary.find(x => keyOf(x) === wantKey);
                        if (libTr) {
                            playlist.unshift(libTr);
                            idx = 0;
                            if (shuffleInitialized && typeof generateShuffleOrder === 'function') generateShuffleOrder();
                            if (typeof updatePlaylistUI === 'function') updatePlaylistUI();
                            await waitFrames();
                        }
                    }
                }
                if (idx < 0 && (boot || bootQ)) {
                    // Không tìm thấy trong thư viện: dựng bài tạm từ thông tin native (id lấy từ phiên hoặc từ hàng đợi) để vẫn mở được player
                    let stubId = (boot && boot.id) || (bootQ && bootQ.curId) || '';
                    if (!stubId && bootQ && Array.isArray(bootQ.ids) && Array.isArray(bootQ.locations) && bootLoc) {
                        const li = bootQ.locations.findIndex(l => String(l || '').toLowerCase() === bootLoc);
                        if (li >= 0) stubId = bootQ.ids[li] || '';
                    }
                    if (stubId) {
                        stubId = String(stubId);
                        idx = playlist.findIndex(x => x && String(x.nativeId) === stubId);
                        if (idx < 0) {
                            const nm = (boot && boot.title) || (card && card.name) || bootLoc.split('/').pop() || '...';
                            const stub = {
                                name: nm, artist: (boot && boot.artist) || (card && card.artist) || '', album: '', year: '', genre: '', composer: '',
                                cover: null, url: 'https://appassets.local/f/' + stubId, isVideo: false,
                                ext: '', lyrics: null, lyricsRaw: '', file: null, fileHandle: null,
                                nativeId: stubId, nativeLocation: bootLoc, nativeName: nm,
                                nativeStreamUrl: 'https://appassets.local/f/' + stubId, nativeLrcUrl: '', fromLibrary: true,
                                rawName: nm, _stub: true
                            };
                            playlist.push(stub);
                            idx = playlist.length - 1;
                            if (shuffleInitialized && typeof generateShuffleOrder === 'function') generateShuffleOrder();
                            if (typeof updatePlaylistUI === 'function') updatePlaylistUI();
                            await waitFrames();
                            stubbed = true;
                        }
                    }
                }
                if (idx < 0) return;

                trackDone = true;
                body.classList.remove('m-early-card');
                const seekSec = boot
                    ? Math.max(0, Number(boot.pos || 0) / 1000)
                    : Math.max(0, Number((saved && saved.pos) || 0));
                const durSec = boot
                    ? Math.max(0, Number(boot.dur || 0) / 1000)
                    : Math.max(0, Number((saved && saved.dur) || 0));

                if (isLiveBoot) {
                    const rawNativePlay = !!(boot.pwr && (boot.st === 'ready' || boot.st === 'buffering'));
                    const matchedTrack = playlist[idx];
                    if (matchedTrack && matchedTrack.nativeId && window.__nativeAudioState) {
                        window.__nativeAudioState.adoptId = matchedTrack.nativeId;
                    }
                    window.__adoptNative = true;
                    window.__restoreOnce = { pos: seekSec, dur: durSec, play: rawNativePlay, fromNativeSession: true };
                    playTrack(idx);
                    await waitFrames();
                    prioritizeTrack(idx);
                    applyPanels();
                    navApplied = false; applyNav();
                    armed = true;
                    if (stubbed && bootQ) {
                        let k = 0;
                        const iv2 = setInterval(() => {
                            k++;
                            try { applyNativeQueue(bootQ); } catch (e) {}
                            if ((!(window.__ingestBusy > 0) && k > 3) || k > 70) clearInterval(iv2);
                        }, 1500);
                    }
                    return;
                }

                // Bước 5: Chọn bài trong playlist tạm, đợi bài load xong hẳn rồi mới tua tới đoạn đã lưu & chốt trạng thái Pause
                window.__adoptNative = false;
                window.__restoreStartMs = Math.round(seekSec * 1000);
                if (playlist[idx] && playlist[idx].nativeId && seekSec > 0) window.__restoreHint = { id: playlist[idx].nativeId, ms: Math.round(seekSec * 1000) };
                window.__restoreOnce = { pos: seekSec, dur: durSec, play: false, fromNativeSession: false };
                const loadedPromise = waitTrackLoaded(2500);
                const itemEl = playlistContainer && playlistContainer.querySelector('.song-item[data-index="' + idx + '"]');
                if (itemEl && typeof itemEl.click === 'function' && currentIndex !== idx) {
                    itemEl.click();
                } else {
                    playTrack(idx);
                }
                await loadedPromise;
                await waitMs(80);
                if (seekSec > 0 && Math.abs((audio.currentTime || 0) - seekSec) > 1.0) {
                    try { audio.currentTime = seekSec; } catch (e) {}
                }
                try { if (!audio.paused) audio.pause(); } catch (e) {}
                if (stubbed && bootQ) { try { applyNativeQueue(bootQ); } catch (e) {} }
                prioritizeTrack(idx);
                applyPanels();
                navApplied = false; applyNav();
                if (typeof window.__syncNativeQueue === 'function') window.__syncNativeQueue();
                if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
                armed = true;
                // Người dùng đã bấm Play lúc đang khôi phục: phát tiếp từ đúng vị trí vừa tua
                if (window.__pendingMiniResume) {
                    window.__pendingMiniResume = false;
                    try { audio.play(); } catch (e) {}
                }
            } catch (e) {
                armed = true;
            } finally {
                restorePipelineRunning = false;
            }
        })();
        return true;
    }

    window.__hasPendingRestore = function () {
        if (window.__externalOpenActive || trackDone) return false;
        const hasNative = !!(window.__nativeBoot || (window.AndroidBridge && typeof window.AndroidBridge.nativeAudioQueueState === 'function'));
        return !!(hasNative || (saved && saved.key) || (card && card.key));
    };
    window.__hasPendingQueueRestore = function () {
        if (window.__externalOpenActive || qDone) return false;
        return !!(window.__nativeBootQueue || localStorage.getItem(QKEY) || (window.AndroidBridge && typeof window.AndroidBridge.nativeAudioQueueState === 'function'));
    };
    window.__tryRestoreNow = function (autoPlay) {
        if (autoPlay) window.__pendingMiniResume = true;
        return !!tryRestore(true);
    };
    // Đồng bộ lại ngay khi người dùng thoát app ra ngoài rồi quay lại (onResume / visibilitychange) mà WebView chưa bị tải lại
    window.__adoptNativeSessionNow = function (s, q) {
        try {
            if (!s || !s.loaded || !s.id || window.__externalOpenActive) return;
            if (typeof playlist === 'undefined' || !playlist.length) {
                trackDone = false;
                tryRestore();
                return;
            }
            if (q) applyNativeQueue(q);
            const curLoc = (q && q.curLoc) ? String(q.curLoc).toLowerCase() : '';
            let idx = playlist.findIndex(x => x && x.nativeId === s.id);
            if (idx < 0 && curLoc) idx = playlist.findIndex(x => keyOf(x) === curLoc);
            if (idx < 0) return;
            const tr = playlist[idx];
            const curTimeMs = (audio.currentTime || 0) * 1000;
            const sPlaying = !!(s.pwr && (s.st === 'ready' || s.st === 'buffering'));
            const diffTrack = idx !== currentIndex || !audio.currentSrc;
            const diffPos = Math.abs(curTimeMs - (s.pos || 0)) > 1500;
            const diffPlay = audio.paused !== !sPlaying;
            if (diffTrack || diffPos || diffPlay) {
                trackDone = true;
                body.classList.remove('m-early-card');
                if (tr && tr.nativeId && window.__nativeAudioState) {
                    window.__nativeAudioState.adoptId = tr.nativeId;
                }
                window.__adoptNative = true;
                window.__restoreOnce = { pos: (s.pos || 0) / 1000, play: sPlaying, fromNativeSession: true };
                playTrack(idx);
                if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
            }
        } catch (e) {}
    };

    (function () {
        const o = window.__nativeOpenFiles;
        if (typeof o !== 'function') return;
        window.__nativeOpenFiles = async function (list) {
            if (Array.isArray(list) && list.some(x => x && (x.fromExternal || !x.fromLibrary))) {
                cancelRestoreForExternal();
            }
            const r = await o.apply(this, arguments);
            try { if (libScanFinished && !trackDone && !window.__externalOpenActive) tryRestore(false); } catch (e) {}
            return r;
        };
    })();
    let n = 0;
    const iv = setInterval(() => {
        n++;
        if ((libScanFinished && tryRestore(false)) || n > 60) {   // ~42 giây
            clearInterval(iv);
            armed = true;
        }
    }, 700);
    setTimeout(() => { armed = true; }, 45000);
})();

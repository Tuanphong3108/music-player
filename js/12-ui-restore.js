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
    if (!hasExtLaunch && window.__nativeBoot) { saved = saved || { key: '', ts: 0 }; trackDone = false; }
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
    setInterval(() => { if (!document.hidden) save(); }, 8000);

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
            const sig = keys.length + '|' + keys[0] + '|' + keys[keys.length - 1] + '|' + keys.join('').length + '|' + (useOrder ? shuffleOrder.join(',') : '') + '|' + keys.filter((k, i) => i % 5 === 0).join('');
            if (sig === qSig) return;
            qSig = sig;
            localStorage.setItem(QKEY, JSON.stringify({ keys: keys, order: useOrder ? shuffleOrder.slice() : null }));
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
        const locs = Array.isArray(nqData.locations) ? nqData.locations : [];
        const ids = Array.isArray(nqData.ids) ? nqData.ids : [];
        const len = Math.max(locs.length, ids.length);
        if (!len) return false;
        const { byKey, byId } = buildPool();
        const nq = [], oldIdx = [];
        for (let i = 0; i < len; i++) {
            const loc = String(locs[i] || '').toLowerCase();
            const id = String(ids[i] || '');
            const tr = (id && byId.get(id)) || (loc && byKey.get(loc)) || null;
            if (tr) { nq.push(tr); oldIdx[i] = nq.length - 1; }
            else oldIdx[i] = -1;
        }
        if (!nq.length) return false;
        const cur = (currentIndex >= 0 && playlist[currentIndex]) || null;
        const same = nq.length === playlist.length && nq.every((tr, i) => tr === playlist[i]);
        if (!same) {
            playlist.length = 0;
            nq.forEach(tr => playlist.push(tr));
            currentIndex = cur ? playlist.indexOf(cur) : -1;
            window.__queueRestored = true;
        }
        if (typeof nqData.repeat === 'number' && typeof repeatMode !== 'undefined' && repeatMode !== nqData.repeat) {
            repeatMode = nqData.repeat;
            if (typeof applyRepeatUI === 'function') applyRepeatUI();
        }
        const ord = Array.isArray(nqData.order) ? nqData.order.map(i => oldIdx[i]).filter(i => i >= 0) : [];
        if (ord.length === playlist.length && playlist.length > 0) {
            if (!isShuffle && typeof isShuffle !== 'undefined') {
                isShuffle = true;
                document.getElementById('shuffle-btn')?.classList.add('active');
            }
            shuffleOrder = ord;
            shuffleInitialized = true;
        } else if (isShuffle && !same && typeof generateShuffleOrder === 'function') {
            generateShuffleOrder();
        }
        qDone = true;
        qArmed = true;
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
    (function () {
        const o = window.__onAndroidLibraryScanDone;
        window.__onAndroidLibraryScanDone = function (count, missingPerm) {
            if (!missingPerm && window.__ingestBusy > 0) { const args = arguments; setTimeout(() => window.__onAndroidLibraryScanDone.apply(null, args), 120); return; }
            let r; try { if (o) r = o.apply(this, arguments); } catch (e) {}
            if (!missingPerm) {
                setTimeout(() => {
                    restoreQueue();
                    if (!trackDone && !window.__externalOpenActive) tryRestore();
                    if (typeof window.__refreshMobileLibraryViews === 'function') window.__refreshMobileLibraryViews();
                }, 0);
            } else {
                qArmed = true;
            }
            return r;
        };
        setTimeout(() => { if (!qDone) { qArmed = true; } }, 60000);
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
    function tryRestore() {
        if (window.__externalOpenActive) { trackDone = true; armed = true; return true; }
        if (!saved && !(card && card.key) && !window.__nativeBoot) return true;
        if (!touched) applyNav();
        if (trackDone) return true;
        if (touched || (typeof currentIndex !== 'undefined' && currentIndex >= 0)) { trackDone = true; return true; }
        if (typeof playlist === 'undefined') return false;
        const boot = window.__nativeBoot || null;   // app đang phát/giữ sẵn bài nào đó: ưu tiên nhận lại đúng bài & hàng đợi đó
        const bootQ = window.__nativeBootQueue || null;
        if (boot) {
            if (bootQ) applyNativeQueue(bootQ);
            else restoreQueue();
        } else {
            restoreQueue();
        }
        const targetKey = (saved && saved.key) || (card && card.key) || '';
        const bootLoc = (bootQ && bootQ.curLoc) ? String(bootQ.curLoc).toLowerCase() : '';
        let idx = -1;
        if (boot) {
            idx = playlist.findIndex(x => x && x.nativeId === boot.id);
            if (idx < 0 && bootLoc) idx = playlist.findIndex(x => keyOf(x) === bootLoc);
            if (idx < 0 && targetKey) idx = playlist.findIndex(x => keyOf(x) === targetKey);
        } else if (targetKey) {
            idx = playlist.findIndex(x => keyOf(x) === targetKey);
            if (idx < 0 && Array.isArray(window.__mobileLibrary)) {
                const libTr = window.__mobileLibrary.find(x => keyOf(x) === targetKey);
                if (libTr) {
                    playlist.unshift(libTr);
                    idx = 0;
                    if (shuffleInitialized && typeof generateShuffleOrder === 'function') generateShuffleOrder();
                }
            }
        }
        if (idx < 0) return false;
        trackDone = true;
        body.classList.remove('m-early-card');
        if (boot) {
            const matchedTrack = playlist[idx];
            if (matchedTrack && matchedTrack.nativeId && window.__nativeAudioState) {
                window.__nativeAudioState.adoptId = matchedTrack.nativeId;
            }
            window.__adoptNative = true;
            window.__restoreOnce = { pos: (boot.pos || 0) / 1000, play: !!boot.pwr };
            playTrack(idx);
            prioritizeTrack(idx);
            applyPanels();
            navApplied = false; applyNav();
            armed = true;
            return true;
        }
        // Khung app không đang phát bài nào -> nạp sẵn bài cũ ở đoạn cũ (pos) ở trạng thái tạm dừng (chỉ tự phát nếu người dùng vừa bấm Play trên Mini Player)
        const shouldAutoPlay = !!window.__pendingMiniResume;
        window.__pendingMiniResume = false;
        const resumePos = (saved && saved.pos > 0) ? saved.pos : 0;
        window.__restoreOnce = { pos: resumePos, play: shouldAutoPlay };
        playTrack(idx);
        prioritizeTrack(idx);
        applyPanels();
        navApplied = false; applyNav();
        armed = true;
        return true;
    }

    window.__hasPendingRestore = function () {
        if (window.__externalOpenActive || trackDone) return false;
        return !!(window.__nativeBoot || (saved && saved.key) || (card && card.key));
    };
    window.__hasPendingQueueRestore = function () {
        if (window.__externalOpenActive || qDone) return false;
        return !!(window.__nativeBootQueue || localStorage.getItem(QKEY));
    };
    window.__tryRestoreNow = function (autoPlay) {
        if (autoPlay) window.__pendingMiniResume = true;
        return !!tryRestore();
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
            const diffTrack = idx !== currentIndex || !audio.currentSrc;
            const diffPos = Math.abs(curTimeMs - (s.pos || 0)) > 1500;
            const diffPlay = audio.paused !== !s.pwr;
            if (diffTrack || diffPos || diffPlay) {
                trackDone = true;
                body.classList.remove('m-early-card');
                if (tr && tr.nativeId && window.__nativeAudioState) {
                    window.__nativeAudioState.adoptId = tr.nativeId;
                }
                window.__adoptNative = true;
                window.__restoreOnce = { pos: (s.pos || 0) / 1000, play: !!s.pwr };
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
            try { if (!trackDone && !window.__externalOpenActive) tryRestore(); } catch (e) {}
            return r;
        };
    })();
    let n = 0;
    const iv = setInterval(() => {
        n++;
        if (tryRestore() || n > 60) {   // ~42 giây
            clearInterval(iv);
            armed = true;
        }
    }, 700);
    setTimeout(() => { armed = true; }, 45000);
})();

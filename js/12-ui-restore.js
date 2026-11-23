// Nhớ trạng thái giao diện + bài đang phát; nếu WebView bị tải lại (tự phục hồi / hệ thống thu hồi) thì quay lại đúng chỗ cũ
(function () {
    'use strict';
    if (!window.IS_ANDROID_APP) return;
    const KEY = 'mp_ui_state_v1';
    const body = document.body;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    const keyOf = (t) => (t && (t.nativeLocation || t.rawName || t.name || '') || '').toLowerCase();
    let armed = false;          // chỉ ghi đè trạng thái đã lưu sau khi đã khôi phục xong / người dùng đã thao tác
    let trackDone = !saved || !saved.key;
    if (window.__nativeBoot) { saved = saved || { key: '', ts: 0 }; trackDone = false; }
    let navApplied = false;
    let touched = false;
    window.addEventListener('pointerdown', () => { touched = true; armed = true; }, true);

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
    setInterval(() => { if (!document.hidden) save(); }, 3000);

    // ===== Hàng đợi tạm (playlist đang phát): lưu đúng thứ tự + thứ tự shuffle, khôi phục sau khi quét xong thư viện =====
    const QKEY = 'mp_queue_v1';
    let qArmed = false, qDone = false, qSig = '';
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
    setInterval(() => { if (!document.hidden) saveQueue(); }, 3000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveQueue(); });
    window.addEventListener('pagehide', saveQueue);
    function restoreQueue() {
        if (qDone) return;
        qDone = true;
        try {
            let q = null;
            try { q = JSON.parse(localStorage.getItem(QKEY) || 'null'); } catch (e) {}
            if (!q || !Array.isArray(q.keys) || !q.keys.length) return;
            const pool = new Map();
            (Array.isArray(window.__mobileLibrary) ? window.__mobileLibrary : []).concat(playlist).forEach(t => { const k = keyOf(t); if (k && !pool.has(k)) pool.set(k, t); });
            const cur = (currentIndex >= 0 && playlist[currentIndex]) || null;
            if (cur) pool.set(keyOf(cur), cur);
            const nq = [], oldIdx = [];
            q.keys.forEach((k, i) => { const t = pool.get(k); if (t) { nq.push(t); oldIdx[i] = nq.length - 1; } else oldIdx[i] = -1; });
            if (!nq.length) return;
            const same = nq.length === playlist.length && nq.every((t, i) => t === playlist[i]);
            if (!same) {
                playlist.length = 0;
                nq.forEach(t => playlist.push(t));
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
        } catch (e) {} finally { qArmed = true; }
    }
    (function () {
        const o = window.__onAndroidLibraryScanDone;
        window.__onAndroidLibraryScanDone = function (count, missingPerm) {
            let r; try { if (o) r = o.apply(this, arguments); } catch (e) {}
            if (!missingPerm) setTimeout(restoreQueue, 0); else qArmed = true;
            return r;
        };
        setTimeout(() => { if (!qDone) { qArmed = true; } }, 60000);
    })();

    function applyNav() {
        if (navApplied || !saved || touched) return;
        navApplied = true;
        if (window.__setMobileNav && (saved.tab && saved.tab !== 'songs' || saved.plId)) window.__setMobileNav(saved.tab, saved.plId);
    }
    function applyPanels() {
        try {
            if (saved.expanded) { body.classList.add('m-player-expanded'); if (typeof updateFsUI === 'function') updateFsUI(); }
            if (saved.queue) body.classList.add('m-playlist-open');
            if (saved.lyrics && saved.expanded) { const lb = document.getElementById('lyric-btn'); if (lb && !body.classList.contains('lyrics-open')) lb.click(); }
        } catch (e) {}
    }
    function tryRestore() {
        if (!saved) return true;
        if (!touched) applyNav();
        if (trackDone) return true;
        if (touched || (typeof currentIndex !== 'undefined' && currentIndex >= 0)) { trackDone = true; return true; }
        if (typeof playlist === 'undefined') return false;
        const boot = window.__nativeBoot || null;   // app đang phát sẵn bài nào đó: ưu tiên nhận lại đúng bài đó
        const idx = boot ? playlist.findIndex(x => x && x.nativeId === boot.id) : playlist.findIndex(x => keyOf(x) === saved.key);
        if (idx < 0) return false;
        trackDone = true;
        if (boot) {
            window.__restoreOnce = { pos: 0, play: !!boot.pwr };
            playTrack(idx);
            applyPanels();
            navApplied = false; applyNav();
            armed = true;
            return true;
        }
        // chỉ tự phát tiếp nếu lần lưu cuối còn mới (WebView vừa bị tải lại giữa chừng), còn không thì nạp sẵn ở trạng thái tạm dừng
        const fresh = Date.now() - (saved.ts || 0) < 120000;
        window.__restoreOnce = { pos: saved.pos || 0, play: !!(saved.playing && fresh) };
        playTrack(idx);
        applyPanels();
        // Mở lại danh sách/tab sau khi thư viện đã có bài (playlist chi tiết cần thư viện mới có nội dung)
        navApplied = false; applyNav();
        armed = true;
        return true;
    }
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

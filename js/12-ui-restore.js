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
    setInterval(() => { if (!document.hidden) save(); }, 8000);

    // ===== Hàng đợi tạm (playlist đang phát): lưu đúng thứ tự + thứ tự shuffle, khôi phục sau khi quét xong thư viện =====
    const QKEY = 'mp_queue_v1';
    let qArmed = hasExtLaunch, qDone = hasExtLaunch, qSig = '';
    function cancelRestoreForExternal() {
        window.__externalOpenActive = true;
        window.__nativeBoot = null;
        window.__restoreOnce = null;
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
    function restoreQueue() {
        if (qDone || window.__externalOpenActive) { qDone = true; qArmed = true; return; }
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
            if (!missingPerm && window.__ingestBusy > 0) { const args = arguments; setTimeout(() => window.__onAndroidLibraryScanDone.apply(null, args), 120); return; }
            let r; try { if (o) r = o.apply(this, arguments); } catch (e) {}
            if (!missingPerm) setTimeout(restoreQueue, 0); else qArmed = true;
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
        if (window.__setMobileNav && (saved.tab && saved.tab !== 'songs' || saved.plId)) window.__setMobileNav(saved.tab, saved.plId);
    }
    function applyPanels() {
        try {
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
            prioritizeTrack(idx);
            applyPanels();
            navApplied = false; applyNav();
            armed = true;
            return true;
        }
        // chỉ tự phát tiếp nếu lần lưu cuối còn mới (WebView vừa bị tải lại giữa chừng), còn không thì nạp sẵn ở trạng thái tạm dừng
        const fresh = Date.now() - (saved.ts || 0) < 120000;
        window.__restoreOnce = { pos: saved.pos || 0, play: !!(saved.playing && fresh) };
        playTrack(idx);
        prioritizeTrack(idx);
        applyPanels();
        // Mở lại danh sách/tab sau khi thư viện đã có bài (playlist chi tiết cần thư viện mới có nội dung)
        navApplied = false; applyNav();
        armed = true;
        return true;
    }
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

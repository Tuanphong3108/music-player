// Trình phát native: với bài trong thư viện máy (https://appassets.local/f/<id>) app Android phát bằng ExoPlayer ở khung app,
// trang web chỉ ra lệnh. Thẻ <audio> được "đóng vai" lại để toàn bộ code cũ (audio.play/pause/currentTime/sự kiện...) chạy nguyên không đổi.
(function () {
    'use strict';
    const AB = window.AndroidBridge;
    if (!window.IS_ANDROID_APP || !AB || typeof AB.nativeAudioLoad !== 'function') return;
    const a = audio;
    const proto = HTMLMediaElement.prototype;
    const D = (n) => Object.getOwnPropertyDescriptor(proto, n);
    const orig = { src: D('src'), currentTime: D('currentTime'), paused: D('paused'), duration: D('duration'), volume: D('volume'),
        playbackRate: D('playbackRate'), ended: D('ended'), readyState: D('readyState'), currentSrc: D('currentSrc'),
        seeking: D('seeking'), error: D('error'), buffered: D('buffered') };
    const oPlay = proto.play, oPause = proto.pause, oLoad = proto.load;
    const ID_RE = /^https:\/\/appassets\.local\/f\/([^/?#]+)/;
    const now = () => performance.now();

    // N = trạng thái phản chiếu của trình phát native
    const N = { mode: 'web', id: '', url: '', loaded: false, pending: false, startMs: 0, paused: true, pos: 0, stamp: 0, dur: 0, buf: 0,
        rate: 1, vol: 1, st: 'idle', ended: false, err: false, hadMeta: false, adopt: false };
    window.__nativeAudioState = N;

    const fire = (t) => { try { a.dispatchEvent(new Event(t)); } catch (e) {} };
    const curPos = () => {
        if (!N.loaded) return N.startMs / 1000;
        let p = N.pos;
        if (!N.paused && N.st === 'ready' && !N.ended) p += (now() - N.stamp) * N.rate;
        if (N.dur > 0) p = Math.min(p, N.dur);
        return Math.max(0, p) / 1000;
    };
    const nativeTrack = () => (typeof playlist !== 'undefined' && playlist[currentIndex]) || null;

    function doLoad(play) {
        N.pending = false;
        N.loaded = true; N.ended = false; N.err = false; N.hadMeta = false; N.paused = !play; N.pos = N.startMs; N.stamp = now(); N.dur = 0; N.st = 'buffering';
        const t = nativeTrack();
        const ar = ((document.getElementById('track-artist') || {}).textContent || '').split('|')[0].trim();
        try { AB.nativeAudioLoad(N.id, (t && t.name) || '', (t && t.artist) || ar || '', Math.round(N.startMs), !!play, N.vol, N.rate); } catch (e) {}
        N.startMs = 0;
        scheduleNext();
    }
    function stopNative() {
        if (N.loaded || N.pending) { try { AB.nativeAudioStop(); } catch (e) {} }
        N.mode = 'web'; N.loaded = false; N.pending = false; N.id = ''; N.url = ''; N.ended = false; N.err = false; N.paused = true;
    }
    function setSrc(v) {
        const m = typeof v === 'string' ? ID_RE.exec(v) : null;
        if (!m) {
            if (N.mode === 'native') stopNative();
            orig.src.set.call(a, v);
            return;
        }
        const adopting = (window.__restoreOnce || window.__adoptNative) && N.adoptId === m[1];
        window.__adoptNative = false;
        // thẻ audio thật phải im và dừng nạp
        try { oPause.call(a); a.removeAttribute('src'); oLoad.call(a); } catch (e) {}
        N.mode = 'native'; N.id = m[1]; N.url = v; N.err = false; N.ended = false;
        if (adopting) {
            // trình phát native đã đang phát đúng bài này (WebView vừa tải lại): nhận lại, không nạp lại
            N.loaded = true; N.pending = false;
            try {
                const ns = JSON.parse(AB.nativeAudioState() || 'null');
                if (ns && ns.id === m[1]) { N.pos = ns.pos || 0; N.stamp = now(); N.dur = ns.dur || 0; N.buf = ns.buf || 0; N.st = ns.st; N.rate = ns.rate || 1; N.paused = !ns.pwr; N.ended = ns.st === 'ended'; }
            } catch (e) {}
            fire('loadstart');
            setTimeout(() => { N.hadMeta = true; ['loadedmetadata', 'durationchange', 'loadeddata', 'canplay'].forEach(fire); if (!N.paused) { fire('play'); fire('playing'); } }, 0);
            return;
        }
        N.loaded = false; N.pending = true;
        N.startMs = 0; N.paused = true; N.pos = 0; N.dur = 0; N.stamp = now(); N.st = 'buffering';
        fire('loadstart');
        // nếu không ai gọi play() ngay sau đó (vd. khôi phục ở trạng thái tạm dừng) thì vẫn nạp để có thời lượng/vị trí
        const id = N.id;
        setTimeout(() => { if (N.pending && N.id === id && N.mode === 'native') doLoad(false); }, 40);
    }
    const isNative = () => N.mode === 'native';

    const def = (name, get, set) => { const d = { configurable: true, get }; if (set) d.set = set; Object.defineProperty(a, name, d); };
    def('src', function () { return isNative() ? N.url : orig.src.get.call(a); }, setSrc);
    def('currentSrc', function () { return isNative() ? N.url : orig.currentSrc.get.call(a); });
    def('currentTime', function () { return isNative() ? curPos() : orig.currentTime.get.call(a); }, function (v) {
        if (!isNative()) { orig.currentTime.set.call(a, v); return; }
        v = Math.max(0, Number(v) || 0);
        if (!N.loaded) { N.startMs = v * 1000; return; }
        N.pos = v * 1000; N.stamp = now(); N.ended = false;
        try { AB.nativeAudioSeek(Math.round(v * 1000)); } catch (e) {}
        fire('seeking');
    });
    def('paused', function () { return isNative() ? (N.paused || N.ended) : orig.paused.get.call(a); });
    def('ended', function () { return isNative() ? N.ended : orig.ended.get.call(a); });
    def('duration', function () { return isNative() ? (N.dur > 0 ? N.dur / 1000 : NaN) : orig.duration.get.call(a); });
    def('seeking', function () { return isNative() ? false : orig.seeking.get.call(a); });
    def('error', function () { return isNative() ? (N.err ? { code: 2, message: 'native playback error' } : null) : orig.error.get.call(a); });
    def('readyState', function () { return isNative() ? (N.loaded && N.dur > 0 && N.st !== 'buffering' ? 4 : (N.loaded && N.dur > 0 ? 2 : 0)) : orig.readyState.get.call(a); });
    def('buffered', function () {
        if (!isNative()) return orig.buffered.get.call(a);
        const e = Math.max(0, N.buf) / 1000;
        return { length: e > 0 ? 1 : 0, start: () => 0, end: () => e };
    });
    def('volume', function () { return isNative() ? N.vol : orig.volume.get.call(a); }, function (v) {
        orig.volume.set.call(a, v); N.vol = Math.max(0, Math.min(1, Number(v) || 0));
        try { if (N.loaded || N.pending) AB.nativeAudioVolume(N.vol); } catch (e) {}
    });
    def('playbackRate', function () { return isNative() ? N.rate : orig.playbackRate.get.call(a); }, function (v) {
        orig.playbackRate.set.call(a, v); N.rate = Number(v) || 1;
        try { if (N.loaded || N.pending) AB.nativeAudioRate(N.rate); } catch (e) {}
        fire('ratechange');
    });
    a.play = function () {
        if (!isNative()) return oPlay.call(a);
        if (N.pending) doLoad(true);
        else if (N.loaded) {
            N.paused = false;
            if (N.ended) { N.ended = false; N.pos = 0; N.stamp = now(); }
            try { AB.nativeAudioPlay(); } catch (e) {}
            fire('play');
        }
        return Promise.resolve();
    };
    a.pause = function () {
        if (!isNative()) return oPause.call(a);
        if (window.__adoptNative) return;   // chuyển bài do app tự sang: đừng làm gián đoạn
        if (N.pending) { doLoad(false); return; }
        if (N.loaded && !N.paused) { N.paused = true; N.pos = curPos() * 1000; N.stamp = now(); try { AB.nativeAudioPause(); } catch (e) {} fire('pause'); }
    };
    a.load = function () { if (!isNative()) oLoad.call(a); };

    // Sự kiện từ app native
    window.__nativeAudioEv = function (e) {
        try {
            if (!e) return;
            if (e.ev === 'advanced') {
                // app tự sang bài kế (lúc trang không phản hồi / bấm Next từ thông báo): trang theo kịp bằng cách nhận lại đúng bài đó
                N.adoptId = e.id;
                const i = (typeof playlist !== 'undefined') ? playlist.findIndex(t => t && t.nativeId === e.id) : -1;
                if (i >= 0 && i !== currentIndex) { window.__adoptNative = true; playTrack(i); }
                return;
            }
            if (!isNative() || e.id !== N.id || !N.loaded) return;
            const wasPaused = N.paused, hadDur = N.dur > 0, wasEnded = N.ended;
            N.pos = e.pos || 0; N.stamp = now(); N.dur = e.dur || N.dur; N.buf = e.buf || 0; N.st = e.st; N.rate = e.rate || 1;
            N.paused = !e.pwr;
            if (e.err) { N.err = true; fire('error'); return; }
            if (!hadDur && N.dur > 0) { N.hadMeta = true; ['loadedmetadata', 'durationchange', 'loadeddata'].forEach(fire); }
            if (e.st === 'buffering' && !N.paused) fire('waiting');
            if (e.st === 'ready') { fire('canplay'); if (!N.paused) fire('playing'); }
            if (wasPaused && !N.paused) fire('play');
            if (!wasPaused && N.paused && e.st !== 'ended') fire('pause');
            if (e.ev === 'seeked') { fire('seeked'); }
            if (e.st === 'ended' && !wasEnded) { N.ended = true; N.paused = true; fire('pause'); fire('ended'); return; }
            if (e.ev === 'tick') fire('timeupdate');
        } catch (err) {}
    };

    // Báo cho app biết bài kế tiếp (để app tự sang bài khi trang không phản hồi)
    function nextIndex() {
        try {
            const n = playlist.length;
            if (n < 2 && repeatMode !== 2) return -1;
            if (repeatMode === 2) return currentIndex;
            if (isShuffle && shuffleInitialized && shuffleOrder.length) {
                const p = shuffleOrder.indexOf(currentIndex);
                if (p >= 0 && p < shuffleOrder.length - 1) return shuffleOrder[p + 1];
                return repeatMode === 1 ? shuffleOrder[0] : -1;
            }
            if (currentIndex < n - 1) return currentIndex + 1;
            return repeatMode === 1 ? 0 : -1;
        } catch (e) { return -1; }
    }
    let nt = null;
    function scheduleNext() { clearTimeout(nt); nt = setTimeout(reportNext, 400); }
    function reportNext() {
        try {
            const i = nextIndex(), t = i >= 0 ? playlist[i] : null;
            const id = t && t.nativeId && t.fromLibrary ? String(t.nativeId) : '';
            AB.nativeAudioSetNext(id, id ? (t.name || '') : '', id ? (t.artist || '') : '');
        } catch (e) {}
    }
    ['shuffle-btn', 'repeat-btn'].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener('click', scheduleNext); });
    a.addEventListener('playing', scheduleNext);

    // Hỏi lại trạng thái khi trang vừa (tải lại) mở: nếu app đang phát bài nào thì cho khôi phục UI nhận lại đúng bài đó
    try {
        const s = JSON.parse(AB.nativeAudioState() || 'null');
        if (s && s.loaded && s.id) { window.__nativeBoot = s; N.adoptId = s.id; N.paused = !s.pwr; N.vol = 1; }
    } catch (e) {}
})();

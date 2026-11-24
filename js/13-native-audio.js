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
    let restoreDurHintMs = 0;
    let restoreMuteActive = false;
    let savedPreRestoreVol = null;
    const N = { mode: 'web', id: '', url: '', loaded: false, pending: false, startMs: 0, paused: true, pos: 0, stamp: 0, dur: 0, buf: 0,
        rate: 1, vol: 1, st: 'idle', ended: false, err: false, hadMeta: false, adopt: false };
    window.__nativeAudioState = N;
    function setRestoreMute(mute) {
        try {
            if (mute) {
                if (!restoreMuteActive) {
                    savedPreRestoreVol = (savedPreRestoreVol != null) ? savedPreRestoreVol : N.vol;
                    restoreMuteActive = true;
                }
                N.vol = 0;
                orig.volume.set.call(a, 0);
                try { if (N.loaded || N.pending) AB.nativeAudioVolume(0); } catch (e) {}
            } else {
                const targetVol = (savedPreRestoreVol != null && isFinite(savedPreRestoreVol)) ? Math.max(0, Math.min(1, Number(savedPreRestoreVol))) : 1;
                restoreMuteActive = false;
                savedPreRestoreVol = null;
                N.vol = targetVol;
                orig.volume.set.call(a, targetVol);
                try { if (N.loaded || N.pending) AB.nativeAudioVolume(targetVol); } catch (e) {}
            }
        } catch (e) {}
    }
    window.__setNativeRestoreMute = setRestoreMute;
    window.__setRestoreDurationHint = function (url, durSec) {
        if (url && durSec > 0 && N.url === url && !(N.dur > 0)) {
            restoreDurHintMs = Math.round(durSec * 1000);
            if (typeof syncMediaSessionState === 'function') syncMediaSessionState();
        }
    };

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
        // Dự phòng: nếu vị trí khôi phục bị mất trước khi nạp (vd. bấm Play quá sớm) thì dùng lại vị trí đã lưu của đúng bài này
        const rh = window.__restoreHint;
        if (rh && String(rh.id) === String(N.id)) {
            if (!(N.startMs > 0) && rh.ms > 0) N.startMs = rh.ms;
            window.__restoreHint = null;
        }
        N.loaded = true; N.ended = false; N.err = false; N.hadMeta = false; N.wasReady = false; N.isPlaying = false; N.paused = !play; N.pos = N.startMs; N.stamp = now(); N.dur = 0; N.st = 'buffering';
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
            // trình phát native đã giữ sẵn thông tin bài & hàng đợi: đồng bộ metadata, đợi nạp xong rồi tua tới vị trí cũ và áp dụng Play/Pause
            N.loaded = false; N.pending = true; N.wasReady = false; N.isPlaying = false;
            N.startMs = 0; N.pos = 0; N.dur = 0; N.buf = 0; N.st = 'buffering'; N.paused = true;
            let wantPlay = false;
            let seekTargetMs = -1;
            try {
                const ns = JSON.parse(AB.nativeAudioState() || 'null');
                if (ns && ns.id === m[1]) {
                    N.pos = ns.pos || 0;
                    N.stamp = now();
                    N.dur = ns.dur || 0;
                    N.buf = ns.buf || 0;
                    N.st = ns.st || 'ready';
                    N.rate = ns.rate || 1;
                    wantPlay = !!(ns.pwr && (ns.st === 'ready' || ns.st === 'buffering'));
                    N.paused = !wantPlay;
                    N.ended = ns.st === 'ended';
                    if (ns.pos > 0) seekTargetMs = ns.pos;
                }
            } catch (e) {}
            const ro = window.__restoreOnce || window.__pendingRestoreSession || null;
            window.__restoreOnce = null;
            window.__pendingRestoreSession = null;
            if (ro && typeof ro.pos === 'number' && ro.pos >= 0 && seekTargetMs <= 0) {
                seekTargetMs = Math.round(ro.pos * 1000);
            }
            if (ro && typeof ro.play === 'boolean') wantPlay = ro.play;
            if (window.__wasCrashOrClosed) wantPlay = false;
            if (seekTargetMs > 0 && !restoreMuteActive) setRestoreMute(true);
            fire('loadstart');
            N.loaded = true;
            N.pending = false;
            N.wasReady = true;
            N.hadMeta = true;
            setTimeout(() => {
                ['loadedmetadata', 'durationchange', 'loadeddata', 'canplay'].forEach(fire);
                if (seekTargetMs >= 0) {
                    N.pos = seekTargetMs;
                    N.stamp = now();
                    try { AB.nativeAudioSeek(seekTargetMs); } catch (e) {}
                    fire('seeking');
                    fire('seeked');
                }
                N.paused = !wantPlay;
                N.isPlaying = wantPlay;
                if (wantPlay) {
                    try { AB.nativeAudioPlay(); } catch (e) {}
                    fire('play');
                    fire('playing');
                } else {
                    try { AB.nativeAudioPause(); } catch (e) {}
                    fire('pause');
                }
                setRestoreMute(false);
                if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
            }, 0);
            return;
        }
        const restoreStartMs = Number(window.__restoreStartMs) || 0;
        window.__restoreStartMs = 0;
        N.loaded = false; N.pending = true; N.wasReady = false; N.isPlaying = false;
        N.startMs = restoreStartMs > 0 ? restoreStartMs : 0; N.paused = true; N.pos = N.startMs; N.dur = 0; N.stamp = now(); N.st = 'buffering';
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
    def('duration', function () {
        if (!isNative()) return orig.duration.get.call(a);
        if (N.dur > 0) return N.dur / 1000;
        if (restoreDurHintMs > 0) return restoreDurHintMs / 1000;
        return NaN;
    });
    def('seeking', function () { return isNative() ? false : orig.seeking.get.call(a); });
    def('error', function () { return isNative() ? (N.err ? { code: 2, message: 'native playback error' } : null) : orig.error.get.call(a); });
    def('readyState', function () { return isNative() ? (N.loaded && N.dur > 0 && N.st !== 'buffering' ? 4 : (N.loaded && N.dur > 0 ? 2 : 0)) : orig.readyState.get.call(a); });
    def('buffered', function () {
        if (!isNative()) return orig.buffered.get.call(a);
        const e = Math.max(0, N.buf) / 1000;
        return { length: e > 0 ? 1 : 0, start: () => 0, end: () => e };
    });
    def('volume', function () { return isNative() ? N.vol : orig.volume.get.call(a); }, function (v) {
        const nv = Math.max(0, Math.min(1, Number(v) || 0));
        if (restoreMuteActive) {
            savedPreRestoreVol = nv;
            return;
        }
        orig.volume.set.call(a, nv);
        N.vol = nv;
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
    let tickRaf = 0;
    let lastTickUiPos = -1;
    let tickNeedTimeupdate = false;
    function scheduleTickUi(needTimeupdate) {
        if (document.hidden) return;
        if (needTimeupdate) tickNeedTimeupdate = true;
        if (tickRaf) return;
        tickRaf = requestAnimationFrame(() => {
            tickRaf = 0;
            const doTime = tickNeedTimeupdate;
            tickNeedTimeupdate = false;
            if (document.hidden) return;
            if (doTime) fire('timeupdate');
            if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
        });
    }

    window.__nativeAudioEv = function (e) {
        try {
            if (!e) return;
            if (e.ev === 'sleep') {
                if (isNative()) {
                    N.paused = true;
                    N.isPlaying = false;
                    fire('pause');
                }
                sleepSig = '';
                if (typeof window.__showNativeSleepEndedNotice === 'function') {
                    window.__showNativeSleepEndedNotice(e.sleepFiredType || (typeof sleepState !== 'undefined' && sleepState && sleepState.type) || 'time', e.sleepFiredTotal || (typeof sleepState !== 'undefined' && sleepState && sleepState.total) || 1);
                } else if (typeof sleepState !== 'undefined' && sleepState) {
                    fireSleep();
                }
                return;
            }
            if (typeof e.sleepTracks === 'number' && typeof sleepState !== 'undefined' && sleepState && sleepState.type === 'tracks' && e.sleepTracks > 0 && e.sleepTracks < sleepState.remaining) {
                sleepState.remaining = e.sleepTracks;
                if (typeof updateSleepUI === 'function') updateSleepUI();
            }
            if (e.ev === 'advanced' || (e.ev === 'tick' && e.loaded && e.id && e.id !== N.id && !N.pending)) {
                // app tự sang bài kế (hoặc trang lỡ sự kiện chuyển bài): nhận lại đúng bài đang phát
                if (N.adoptId === e.id && window.__adoptNative) return;
                N.adoptId = e.id;
                const i = (typeof playlist !== 'undefined') ? playlist.findIndex(t => t && t.nativeId === e.id) : -1;
                if (i >= 0 && i !== currentIndex) { window.__adoptNative = true; playTrack(i); }
                return;
            }
            if (!isNative() || e.id !== N.id || !N.loaded) return;
            const wasPaused = N.paused, hadDur = N.dur > 0, wasEnded = N.ended;
            N.pos = e.pos || 0; N.stamp = now(); N.dur = e.dur || N.dur; N.buf = e.buf || 0; N.st = e.st; N.rate = e.rate || 1;
            N.paused = !e.pwr;
            if (e.st !== 'ended') N.ended = false;
            if (e.err) { N.err = true; fire('error'); return; }
            if (!hadDur && N.dur > 0) { N.hadMeta = true; ['loadedmetadata', 'durationchange', 'loadeddata'].forEach(fire); }
            if (e.st === 'buffering' && !N.paused) fire('waiting');
            const nowReady = e.st === 'ready', nowPlaying = nowReady && !N.paused;
            if (nowReady && !N.wasReady) fire('canplay');
            if (nowPlaying && !N.isPlaying) fire('playing');
            N.wasReady = nowReady; N.isPlaying = nowPlaying;
            if (wasPaused && !N.paused) fire('play');
            if (!wasPaused && N.paused && e.st !== 'ended') fire('pause');
            if (e.ev === 'seeked') { lastTickUiPos = N.pos; fire('seeked'); }
            if (e.st === 'ended' && !wasEnded) { N.ended = true; N.paused = true; fire('pause'); fire('ended'); return; }
            if (e.ev === 'tick') {
                const posChanged = Math.abs(N.pos - lastTickUiPos) >= 15;
                const needTime = (!N.paused && !N.ended) || posChanged;
                if (posChanged) lastTickUiPos = N.pos;
                scheduleTickUi(needTime);
            }
        } catch (err) {}
    };

    // Gửi cả hàng đợi + thứ tự shuffle + chế độ lặp sang app native để app tự điều khiển bài kế/trước khi trang không phản hồi
    let qSig = '';
    function syncQueue(force) {
        try {
            if (typeof playlist === 'undefined' || !playlist.length) return;
            // Đang chờ khôi phục hàng đợi cũ sau khi mở lại app -> chưa ghi đè hàng đợi mới lên khung app
            if (typeof window.__hasPendingQueueRestore === 'function' && window.__hasPendingQueueRestore()) return;
            const useOrder = !!(isShuffle && shuffleInitialized && shuffleOrder.length === playlist.length);
            let h = 0;
            const ids = new Array(playlist.length);
            for (let i = 0; i < playlist.length; i++) {
                const t = playlist[i];
                const id = t && t.nativeId ? String(t.nativeId) : '';
                ids[i] = id;
                for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0;
                h = (h * 31 + 7) | 0;
            }
            if (useOrder) for (let i = 0; i < shuffleOrder.length; i++) h = (h * 33 + shuffleOrder[i] + 1) | 0;
            const sig = playlist.length + '|' + h + '|' + (useOrder ? 1 : 0) + '|' + (Number(repeatMode) || 0);
            if (!force && sig === qSig) return;
            qSig = sig;
            AB.nativeAudioSetQueue(JSON.stringify({
                ids: ids,
                locations: playlist.map(t => (t && t.nativeLocation) ? String(t.nativeLocation) : ''),
                titles: playlist.map((t, i) => ids[i] ? (t.name || '') : ''),
                artists: playlist.map((t, i) => ids[i] ? (t.artist || '') : ''),
                shuffle: useOrder,
                order: useOrder ? shuffleOrder : null,
                repeat: Number(repeatMode) || 0
            }));
        } catch (e) {}
    }
    let nt = null;
    function scheduleNext() { clearTimeout(nt); nt = setTimeout(() => syncQueue(false), 400); }
    ['shuffle-btn', 'repeat-btn', 'reshuffle-btn'].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener('click', scheduleNext); });
    a.addEventListener('playing', scheduleNext);
    setInterval(() => { if (!document.hidden && isNative()) syncQueue(false); }, 8000);
    // Hẹn giờ ngủ: báo cho app giữ để vẫn dừng đúng lúc dù WebView bị đóng băng
    let sleepSig = '';
    function syncSleep(force) {
        try {
            const st = (typeof sleepState !== 'undefined') ? sleepState : null;
            const key = st ? st.type + ':' + (st.endAt || st.remaining || st.total || 0) : '';
            if (!force && key === sleepSig) return;
            sleepSig = key;
            AB.nativeAudioSetSleep(st && st.type === 'time' ? st.endAt : 0, st && st.type === 'tracks' ? Math.max(1, Number(st.remaining || st.total || 0)) : 0);
        } catch (e) {}
    }
    setInterval(() => { if (!document.hidden) syncSleep(false); }, 3000);
    window.__syncNativeSleep = (force) => syncSleep(force !== false);
    window.__syncNativeQueue = () => syncQueue(true);
    window.__syncNativeShuffle = function (enabled) {
        try {
            const val = !!enabled;
            if (typeof AB.nativeAudioSetShuffle === 'function') AB.nativeAudioSetShuffle(val);
            syncQueue(true);
        } catch (e) {}
    };
    (function hookShuffleFlag() {
        const pushCurrent = () => {
            try {
                if (typeof isShuffle !== 'undefined' && typeof AB.nativeAudioSetShuffle === 'function') {
                    AB.nativeAudioSetShuffle(!!isShuffle);
                }
            } catch (e) {}
        };
        ['shuffle-btn', 'm-pl-shuffle', 'reshuffle-btn'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.addEventListener('click', () => setTimeout(pushCurrent, 0));
        });
        setTimeout(pushCurrent, 300);
    })();
    window.__matchNativeSession = function (qState) {
        try {
            if (!qState || typeof playlist === 'undefined') return;
            if (typeof window.__hasPendingQueueRestore === 'function' && window.__hasPendingQueueRestore()) return;
            syncQueue(false);
            syncSleep();
        } catch (e) {}
    };

    // EQ / preamp / mono / nén / cân bằng + visualizer cho bài do app phát
    let mixSig = '';
    function syncMixer(force) {
        try {
            if (typeof mixer === 'undefined') return;
            const sig = JSON.stringify(mixer);
            if (!force && sig === mixSig) return;
            mixSig = sig;
            AB.nativeAudioMixer(JSON.stringify({ pre: mixer.preamp || 0, eqOn: !!mixer.eqOn, eq: mixer.eq, mono: !!mixer.mono, comp: !!mixer.comp, balance: mixer.balance || 0 }));
        } catch (e) {}
    }
    setInterval(syncMixer, 400);
    a.addEventListener('loadstart', () => { if (isNative()) syncMixer(true); });
    let vizSent = null;
    function vizWanted() {
        try { return isNative() && !N.paused && !document.hidden && !!(settings && settings.perf && settings.perf.visualizer); } catch (e) { return false; }
    }
    window.__nativeFft = function (arr) {
        if (!vizWanted()) { if (vizSent) { vizSent = false; try { AB.nativeAudioViz(false); } catch (e) {} } return false; }
        if (!vizSent) { vizSent = true; try { AB.nativeAudioViz(true); } catch (e) {} }
        try {
            const s = AB.nativeAudioFft();
            if (!s) return false;
            const bin = atob(s);
            for (let i = 0; i < arr.length; i++) arr[i] = bin.charCodeAt(i) || 0;
            return true;
        } catch (e) { return false; }
    };
    ['pause', 'ended'].forEach(ev => a.addEventListener(ev, () => { if (vizSent) { vizSent = false; try { AB.nativeAudioViz(false); } catch (e) {} } }));
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            syncSleep(true);
            if (vizSent) { vizSent = false; try { AB.nativeAudioViz(false); } catch (e) {} }
            if (restoreMuteActive) setRestoreMute(false);
            else {
                N.vol = 1;
                orig.volume.set.call(a, 1);
                try { if (N.loaded || N.pending) AB.nativeAudioVolume(1); } catch (e) {}
            }
        } else {
            queryNativeSession(true);
        }
    });
    window.addEventListener('pagehide', () => {
        syncSleep(true);
        if (restoreMuteActive) setRestoreMute(false);
        else {
            N.vol = 1;
            orig.volume.set.call(a, 1);
            try { if (N.loaded || N.pending) AB.nativeAudioVolume(1); } catch (e) {}
        }
    });

    // Hỏi lại trạng thái + hàng đợi từ khung app khi vừa mở trang hoặc khi quay lại app từ nền
    function queryNativeSession(fromResume) {
        try {
            const hasExt = !!(window.__externalOpenActive || (typeof AB.hasPendingExternalOpen === 'function' && AB.hasPendingExternalOpen()));
            if (hasExt) {
                window.__externalOpenActive = true;
                return;
            }
            const s = JSON.parse(AB.nativeAudioState() || 'null');
            let q = null;
            if (typeof AB.nativeAudioQueueState === 'function') {
                try { q = JSON.parse(AB.nativeAudioQueueState() || 'null'); } catch (e) {}
            }
            const sleepInfo = (q && q.sleepFired) ? q : (s && s.sleepFired ? s : null);
            if (sleepInfo && sleepInfo.sleepFired && typeof window.__showNativeSleepEndedNotice === 'function') {
                setTimeout(() => {
                    try { window.__showNativeSleepEndedNotice(sleepInfo.sleepFiredType, sleepInfo.sleepFiredTotal); } catch (e) {}
                }, 120);
            }
            if (s && s.loaded && s.id) {
                const sPlaying = !!(s.pwr && (s.st === 'ready' || s.st === 'buffering'));
                window.__nativeBoot = s;
                window.__nativeBootQueue = q;
                N.adoptId = s.id;
                N.paused = !sPlaying;
                N.vol = 1;
                if (fromResume && typeof window.__adoptNativeSessionNow === 'function') {
                    window.__adoptNativeSessionNow(s, q);
                }
            } else if (!fromResume) {
                window.__nativeBoot = null;
                window.__nativeBootQueue = null;
            }
        } catch (e) {}
    }
    queryNativeSession(false);
    window.__queryNativeSession = queryNativeSession;
    window.__onAndroidAppResume = function () { queryNativeSession(true); };
})();

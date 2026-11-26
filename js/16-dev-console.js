// Developer Features: bật/tắt nút <\> trong menu 3 chấm và gọi Developer Console thuần Android (NativeDevConsole)
// Không chèn thêm DOM overlay vào trang web để tránh ảnh hưởng bố cục/sự kiện của WebView.
(function () {
    'use strict';

    const STORAGE_KEY = 'settings_dev_console';
    const T = (k, f) => { try { return (window.__tr && window.__tr(k)) || f; } catch (e) { return f; } };
    const isEnabled = () => { try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch (e) { return false; } };

    function openNativeConsole() {
        document.body.classList.remove('m-more-open');
        const lyricBtn = document.getElementById('lyric-btn');
        if (lyricBtn) lyricBtn.style.pointerEvents = '';

        const ab = window.AndroidBridge;
        if (ab && typeof ab.toggleDevConsole === 'function') {
            try { ab.toggleDevConsole(); } catch (e) {}
            return;
        }
        if (ab && typeof ab.openDevConsole === 'function') {
            try { ab.openDevConsole(); } catch (e) {}
            return;
        }
        if (typeof showToast === 'function') {
            showToast(T('dev.need_native', 'Cần cập nhật ứng dụng Android để dùng Developer Console gốc'), 'code', 2600);
        }
    }

    function applyDevState(on) {
        const enabled = !!on;
        try { localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false'); } catch (e) {}
        document.body.classList.toggle('dev-console-on', enabled);
        const sw = document.getElementById('setting-dev-console');
        if (sw && !!sw.selected !== enabled) sw.selected = enabled;
        try {
            if (window.AndroidBridge && typeof window.AndroidBridge.setDevConsoleEnabled === 'function') {
                window.AndroidBridge.setDevConsoleEnabled(enabled);
            }
        } catch (e) {}
    }


    // ---------- Công cụ debug trong Settings > Developer Features ----------
    const DEV_KEYS = [STORAGE_KEY];
    const BRIDGE_METHODS = ['getAppVersion', 'getAppVersionCode', 'nativeAudioLoad', 'nativeAudioPlay', 'nativeAudioPause', 'nativeAudioSeek', 'nativeAudioState',
        'nativeAudioSetQueue', 'nativeAudioStop', 'setMediaState', 'setArtwork', 'shareNativeFiles', 'deleteNativeFiles', 'setAsSound', 'canWriteSettings',
        'openWriteSettings', 'setQuickPlayPrefs', 'toggleDevConsole', 'setDevConsoleEnabled', 'closeDevConsole'];

    function safe(fn, dflt) { try { const v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt === undefined ? ('lỗi: ' + (e && e.message)) : dflt; } }

    async function swInfo() {
        const out = { controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller), caches: [], regs: 0 };
        try { out.caches = await caches.keys(); } catch (e) {}
        try { out.regs = (await navigator.serviceWorker.getRegistrations()).length; } catch (e) {}
        return out;
    }

    async function buildAppState() {
        const AB = window.AndroidBridge;
        const L = [];
        L.push('== Media Player diagnostics ==');
        L.push('Time: ' + new Date().toISOString());
        L.push('UA: ' + navigator.userAgent);
        L.push('App: ' + (AB && AB.getAppVersion ? safe(() => AB.getAppVersion()) : 'web') + ' (code ' + (AB && AB.getAppVersionCode ? safe(() => AB.getAppVersionCode()) : '-') + ')');
        L.push('Android app: ' + !!window.IS_ANDROID_APP + ' | m-ui: ' + document.documentElement.classList.contains('m-ui') + ' | lang: ' + (typeof savedLanguage !== 'undefined' ? savedLanguage : '-'));
        const sw = await swInfo();
        L.push('SW controller: ' + sw.controller + ' | registrations: ' + sw.regs + ' | caches: ' + (sw.caches.join(', ') || '-'));
        try {
            L.push('Queue: ' + playlist.length + ' | index: ' + currentIndex + ' | shuffle: ' + !!isShuffle + ' | repeat: ' + repeatMode);
            const t = playlist[currentIndex];
            if (t) L.push('Track: ext=' + (t.ext || '-') + ' nativeId=' + (t.nativeId || '-') + ' fromLibrary=' + !!t.fromLibrary);
        } catch (e) {}
        try { L.push('audio: paused=' + audio.paused + ' ended=' + audio.ended + ' t=' + (audio.currentTime || 0).toFixed(2) + '/' + (audio.duration || 0).toFixed(2) + ' rs=' + audio.readyState); } catch (e) {}
        const ns = window.__nativeAudioState;
        if (ns) L.push('JS native mirror: ' + JSON.stringify({ mode: ns.mode, id: ns.id, loaded: ns.loaded, pending: ns.pending, paused: ns.paused, ended: ns.ended, st: ns.st, pos: Math.round(ns.pos || 0), dur: ns.dur }));
        if (AB && typeof AB.nativeAudioState === 'function') L.push('Native: ' + safe(() => AB.nativeAudioState()));
        L.push('LocalStorage keys: ' + safe(() => Object.keys(localStorage).length));
        return L.join('\n');
    }

    async function bridgeTest() {
        const AB = window.AndroidBridge;
        if (!AB) return 'Không có AndroidBridge (đang chạy web thường).';
        const missing = [], ok = [];
        BRIDGE_METHODS.forEach(m => (typeof AB[m] === 'function' ? ok : missing).push(m));
        const t0 = performance.now();
        const r1 = safe(() => AB.getAppVersion ? AB.getAppVersion() : '(thiếu)', '(thiếu)');
        const t1 = performance.now();
        const r2 = safe(() => AB.nativeAudioState ? AB.nativeAudioState() : null, null);
        const t2 = performance.now();
        return 'Có ' + ok.length + '/' + BRIDGE_METHODS.length + ' hàm bridge.\n' +
            (missing.length ? 'THIẾU (APK cũ hơn web?): ' + missing.join(', ') + '\n' : 'Đủ hàm.\n') +
            'getAppVersion → ' + r1 + ' (' + (t1 - t0).toFixed(1) + ' ms)\n' +
            'nativeAudioState → ' + (r2 ? ('ok, ' + String(r2).length + ' ký tự') : 'rỗng') + ' (' + (t2 - t1).toFixed(1) + ' ms)';
    }

    async function clearCacheAndReload() {
        try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } catch (e) {}
        try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
        location.reload();
    }

    function resetDevSettings() {
        DEV_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
        applyDevState(false);
        const sw = document.getElementById('setting-dev-console');
        if (sw) sw.selected = false;
    }

    function copyText(txt) {
        const done = () => { if (typeof showToast === 'function') showToast(T('dev.state_copied', 'Đã sao chép'), 'content_copy', 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done, () => fallback()); return; }
        fallback();
        function fallback() {
            try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) {}
        }
    }

    function buildTools() {
        const host = document.getElementById('dev-tools');
        if (!host) return;
        host.innerHTML = '';
        const info = document.createElement('div'); info.className = 'dev-info';
        const out = document.createElement('pre'); out.className = 'dev-out';
        const grid = document.createElement('div'); grid.className = 'dev-grid';
        const show = (txt) => { out.textContent = txt; out.style.display = 'block'; };
        const btn = (icon, key, def, fn, cls) => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'dev-btn' + (cls ? ' ' + cls : '');
            b.innerHTML = '<span class="material-symbols-rounded">' + icon + '</span><span></span>';
            b.lastChild.textContent = T(key, def);
            b.addEventListener('click', fn);
            grid.appendChild(b);
        };
        const refreshInfo = async () => {
            const sw = await swInfo();
            const AB = window.AndroidBridge;
            info.textContent = 'URL: ' + location.href + '\n' + 'SW: ' + (sw.controller ? 'đang điều khiển' : 'chưa điều khiển') + ' • cache: ' + (sw.caches.join(', ') || '-') +
                (AB && AB.getAppVersion ? '\nAPK: ' + safe(() => AB.getAppVersion()) : '');
        };
        btn('content_copy', 'dev.copy_state', 'Sao chép trạng thái app', async () => { const t = await buildAppState(); show(t); copyText(t); });
        btn('settings_ethernet', 'dev.bridge_test', 'Kiểm tra Bridge', async () => show(await bridgeTest()));
        btn('refresh', 'dev.reload', 'Tải lại trang', () => location.reload());
        btn('cleaning_services', 'dev.clear_reload', 'Xóa cache & tải lại', () => clearCacheAndReload());
        btn('restart_alt', 'dev.reset', 'Đặt lại cài đặt Developer', () => { resetDevSettings(); show(T('dev.reset_done', 'Đã đặt lại cài đặt Developer về mặc định.')); }, 'danger');
        host.appendChild(info); host.appendChild(grid); host.appendChild(out);
        refreshInfo();
    }

    function init() {
        // Console gốc chỉ có trong app Android; PC/PWA đã có F12 nên ẩn hẳn tab, nút và không bật
        if (!window.IS_ANDROID_APP) {
            document.querySelectorAll('.st-tab[data-tab="developer"], .st-pane[data-pane="developer"], #dev-console-btn')
                .forEach(el => el.style.setProperty('display', 'none', 'important'));
            document.body.classList.remove('dev-console-on');
            return;
        }
        buildTools();
        const on = isEnabled();
        applyDevState(on);

        const sw = document.getElementById('setting-dev-console');
        if (sw) {
            sw.selected = on;
            sw.addEventListener('change', () => applyDevState(!!sw.selected));
        }

        const btn = document.getElementById('dev-console-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openNativeConsole();
            });
        }
    }

    window.__openDevConsole = openNativeConsole;
    window.__closeDevConsole = function () {
        try {
            if (window.AndroidBridge && typeof window.AndroidBridge.closeDevConsole === 'function') {
                window.AndroidBridge.closeDevConsole();
            }
        } catch (e) {}
        return false;
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

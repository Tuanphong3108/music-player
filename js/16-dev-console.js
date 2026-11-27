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
        'openWriteSettings', 'setQuickPlayPrefs', 'toggleDevConsole', 'setDevConsoleEnabled', 'closeDevConsole', 'readAppLogs'];

    function safe(fn, dflt) { try { const v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt === undefined ? ('error: ' + (e && e.message)) : dflt; } }

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
        if (!AB) return T('dev.no_bridge', 'Không có AndroidBridge (đang chạy web thường).');
        const missing = [], ok = [];
        BRIDGE_METHODS.forEach(m => (typeof AB[m] === 'function' ? ok : missing).push(m));
        const t0 = performance.now();
        const r1 = safe(() => AB.getAppVersion ? AB.getAppVersion() : '(missing)', '(missing)');
        const t1 = performance.now();
        const r2 = safe(() => AB.nativeAudioState ? AB.nativeAudioState() : null, null);
        const t2 = performance.now();
        return T('dev.bridge_count', 'Có {a}/{b} hàm bridge.').replace('{a}', ok.length).replace('{b}', BRIDGE_METHODS.length) + '\n' +
            (missing.length ? T('dev.bridge_missing', 'THIẾU (APK cũ hơn web?): ') + missing.join(', ') + '\n' : T('dev.bridge_full', 'Đủ hàm.') + '\n') +
            'getAppVersion → ' + r1 + ' (' + (t1 - t0).toFixed(1) + ' ms)\n' +
            'nativeAudioState → ' + (r2 ? (T('dev.bridge_ok', 'ok, {n} ký tự').replace('{n}', String(r2).length)) : T('dev.bridge_empty', 'rỗng')) + ' (' + (t2 - t1).toFixed(1) + ' ms)';
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


    // ---------- Native Log Viewer + Export Diagnostics ----------
    const LOG_RE = /^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?)\s*:\s?(.*)$/;
    const LEVELS = 'VDIWEF';
    function readLogs(max) {
        const AB = window.AndroidBridge;
        if (!AB || typeof AB.readAppLogs !== 'function') return null;
        try { return String(AB.readAppLogs(max || 1500) || ''); } catch (e) { return null; }
    }
    function parseLogs(raw) {
        const out = [];
        (raw || '').split('\n').forEach(l => {
            const m = LOG_RE.exec(l);
            if (m) out.push({ t: m[1], lv: m[4], tag: m[5], msg: m[6], raw: l });
            else if (l.trim() && out.length) out[out.length - 1].raw += '\n' + l;
        });
        return out;
    }
    function filterLogs(arr, o) {
        const min = LEVELS.indexOf(o.level || 'V');
        const tag = (o.tag || '').toLowerCase(), q = (o.q || '').toLowerCase();
        return arr.filter(e => LEVELS.indexOf(e.lv) >= min && (!tag || e.tag.toLowerCase().indexOf(tag) >= 0) && (!q || e.raw.toLowerCase().indexOf(q) >= 0));
    }
    async function exportDiagnostics() {
        const state = await buildAppState();
        const raw = readLogs(2000);
        let logs = T('dev.logs_unreadable', '(không đọc được log native)');
        if (raw !== null) {
            const arr = parseLogs(raw);
            const keep = arr.filter(e => LEVELS.indexOf(e.lv) >= 3 || /^(MP|NativeAudio|MediaService|MainActivity|QuickPlay|chromium|cr_console|Console)/i.test(e.tag));
            logs = keep.slice(-250).map(e => e.raw).join('\n') || T('dev.logs_empty', '(trống)');
        }
        return state + '\n\n' + T('dev.logs_header', '== Logs (W/E + MP*/Media*/Console, 250 dòng cuối) ==') + '\n' + logs;
    }
    function buildLogViewer(host) {
        const box = document.createElement('div'); box.className = 'dev-logs'; box.style.display = 'none';
        box.innerHTML = '<div class="dev-log-bar"></div><input type="search" class="dev-log-q" placeholder=""><pre class="dev-out" style="display:block;"></pre>';
        const bar = box.querySelector('.dev-log-bar'), q = box.querySelector('.dev-log-q'), pre = box.querySelector('pre');
        q.placeholder = T('dev.log_search', 'Tìm trong log...');
        const st = { level: 'V', tag: '' };
        const chips = [[T('dev.f_all', 'Tất cả'), 'V', ''], [T('dev.f_warn', 'Cảnh báo+'), 'W', ''], [T('dev.f_err', 'Lỗi'), 'E', ''], ['MP*', 'V', 'MP'], ['Media', 'V', 'Media'], ['Web', 'V', 'chromium']];
        let arr = [], cur = chips[0];
        const render = () => {
            const f = filterLogs(arr, { level: st.level, tag: st.tag, q: q.value });
            const last = f.slice(-300);
            pre.textContent = (raw0 === null ? T('dev.logs_need_apk', 'Chỉ có trong app Android (cần APK mới có readAppLogs).') : (last.map(e => e.raw).join('\n') || T('dev.logs_nomatch', 'Không có dòng log nào khớp.')));
            pre.scrollTop = pre.scrollHeight;
        };
        let raw0 = '';
        const reload = () => { raw0 = readLogs(2000); arr = raw0 === null ? [] : parseLogs(raw0); render(); };
        chips.forEach(c => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'dev-chip' + (c === cur ? ' on' : ''); b.textContent = c[0];
            b.addEventListener('click', () => { cur = c; st.level = c[1]; st.tag = c[2]; bar.querySelectorAll('.dev-chip').forEach(x => x.classList.toggle('on', x === b)); render(); });
            bar.appendChild(b);
        });
        const act = (icon, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dev-chip act'; b.innerHTML = '<span class="material-symbols-rounded" style="font-size:18px;">' + icon + '</span>'; b.addEventListener('click', fn); bar.appendChild(b); };
        act('refresh', reload);
        act('content_copy', () => copyText(pre.textContent));
        q.addEventListener('input', render);
        host.appendChild(box);
        return { toggle: () => { const on = box.style.display === 'none'; box.style.display = on ? 'flex' : 'none'; if (on) reload(); } };
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
            info.textContent = 'URL: ' + location.href + '\n' + 'SW: ' + (sw.controller ? T('dev.sw_active', 'đang điều khiển') : T('dev.sw_inactive', 'chưa điều khiển')) + ' • cache: ' + (sw.caches.join(', ') || '-') +
                (AB && AB.getAppVersion ? '\nAPK: ' + safe(() => AB.getAppVersion()) : '');
        };
        // Flags: 2 công tắc đưa giao diện cũ trở lại (lưu localStorage, áp dụng ngay)
        const flags = document.createElement('div'); flags.className = 'dev-flags'; flags.style.display = 'none';
        const flagRow = (key, tk, td, dk, dd) => {
            const row = document.createElement('div'); row.className = 'dev-flag-row';
            row.innerHTML = '<div class="dev-flag-tx"><b></b><span></span></div>';
            row.querySelector('b').textContent = T(tk, td); row.querySelector('span').textContent = T(dk, dd);
            const sw = document.createElement('md-switch'); sw.setAttribute('icons', '');
            sw.innerHTML = '<span class="material-symbols-rounded" slot="on-icon">check</span><span class="material-symbols-rounded" slot="off-icon">close</span>';
            sw.selected = !!(window.__flags && window.__flags.get(key));
            sw.addEventListener('change', () => { if (window.__flags) window.__flags.set(key, !!sw.selected); });
            row.appendChild(sw); flags.appendChild(row);
        };
        flagRow('oldInfo', 'dev.flag_old_info', 'Old Other Info menu', 'dev.flag_old_info_desc', 'Dùng hộp thoại Info kiểu PC (áp dụng cả QuickPlay).');
        flagRow('oldSettings', 'dev.flag_old_settings', 'Old Settings menu', 'dev.flag_old_settings_desc', 'Dùng giao diện Cài đặt kiểu PC.');
        btn('flag', 'dev.flags', 'Flags', () => { flags.style.display = flags.style.display === 'none' ? 'flex' : 'none'; });
        btn('content_copy', 'dev.copy_state', 'Sao chép trạng thái app', async () => { const t = await buildAppState(); show(t); copyText(t); });
        btn('settings_ethernet', 'dev.bridge_test', 'Kiểm tra Bridge', async () => show(await bridgeTest()));
        const lv = buildLogViewer(host);
        btn('receipt_long', 'dev.logs', 'Xem log native', () => lv.toggle());
        btn('upload_file', 'dev.export', 'Xuất chẩn đoán', async () => {
            const t = await exportDiagnostics(); show(t);
            if (navigator.share) { try { await navigator.share({ title: 'Media Player diagnostics', text: t }); return; } catch (e) {} }
            copyText(t);
        });
        btn('refresh', 'dev.reload', 'Tải lại trang', () => location.reload());
        btn('cleaning_services', 'dev.clear_reload', 'Xóa cache & tải lại', () => clearCacheAndReload());
        btn('restart_alt', 'dev.reset', 'Đặt lại cài đặt Developer', () => { resetDevSettings(); show(T('dev.reset_done', 'Đã đặt lại cài đặt Developer về mặc định.')); }, 'danger');
        host.insertBefore(info, host.firstChild); host.insertBefore(grid, info.nextSibling); host.insertBefore(flags, grid.nextSibling); host.appendChild(out);
        refreshInfo();
    }

    // Tab Experimental (PC): công tắc giao diện mới của điện thoại
    function bindExperimental() {
        [['setting-exp-info', 'newInfo'], ['setting-exp-settings', 'newSettings']].forEach(([id, key]) => {
            const sw = document.getElementById(id); if (!sw || !window.__flags) return;
            sw.selected = window.__flags.get(key);
            sw.addEventListener('change', () => window.__flags.set(key, !!sw.selected));
        });
    }

    function init() {
        bindExperimental();
        // Console gốc chỉ có trong app Android; PC/PWA đã có F12 nên ẩn hẳn tab, nút và không bật
        if (!window.IS_ANDROID_APP) {
            document.querySelectorAll('.st-tab[data-tab="developer"], .st-pane[data-pane="developer"], .st-m-card[data-tab="developer"], #dev-console-btn')
                .forEach(el => el.style.setProperty('display', 'none', 'important'));
            document.body.classList.remove('dev-console-on');
            return;
        }
        buildTools();
        document.querySelectorAll('.st-tab[data-tab="developer"]').forEach(t => t.addEventListener('click', () => setTimeout(buildTools, 0)));
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

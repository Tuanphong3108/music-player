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

    function init() {
        // Console gốc chỉ có trong app Android; PC/PWA đã có F12 nên ẩn hẳn tab, nút và không bật
        if (!window.IS_ANDROID_APP) {
            document.querySelectorAll('.st-tab[data-tab="developer"], .st-pane[data-pane="developer"], #dev-console-btn')
                .forEach(el => el.style.setProperty('display', 'none', 'important'));
            document.body.classList.remove('dev-console-on');
            return;
        }
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

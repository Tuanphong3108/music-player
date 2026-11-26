// Developer Features: bật/tắt nút <\> trong menu 3 chấm và mở bảng điều khiển (Console) trực tiếp trong ứng dụng (hoạt động cả khi offline)
(function () {
    'use strict';

    const STORAGE_KEY = 'settings_dev_console';
    const MAX_LOGS = 400;
    const logs = [];
    const cmdHistory = [];
    let histIdx = -1;
    let filterLevel = 'all';
    let overlay = null;
    let listEl = null;
    let inputEl = null;
    let inspectMode = false;
    let patchedConsole = false;

    const T = (k, f) => { try { return (window.__tr && window.__tr(k)) || f; } catch (e) { return f; } };
    const isEnabled = () => { try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch (e) { return false; } };

    function fmtTime(d) {
        const p = (n, w = 2) => String(n).padStart(w, '0');
        return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
    }

    function stringifyArg(v, depth = 0) {
        if (v === null) return 'null';
        if (v === undefined) return 'undefined';
        const t = typeof v;
        if (t === 'string') return v;
        if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
        if (t === 'symbol') return v.toString();
        if (t === 'function') return `[Function: ${v.name || 'anonymous'}]`;
        if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
        if (v instanceof Element) {
            const id = v.id ? '#' + v.id : '';
            const cls = (typeof v.className === 'string' && v.className.trim())
                ? '.' + v.className.trim().split(/\s+/).slice(0, 3).join('.')
                : '';
            return `<${v.tagName.toLowerCase()}${id}${cls}>`;
        }
        if (depth > 2) return Array.isArray(v) ? `[Array(${v.length})]` : '[Object]';
        try {
            const seen = new WeakSet();
            return JSON.stringify(v, (k, val) => {
                if (val instanceof Element) return stringifyArg(val, depth + 1);
                if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
                if (val && typeof val === 'object') {
                    if (seen.has(val)) return '[Circular]';
                    seen.add(val);
                }
                return val;
            }, 2);
        } catch (e) {
            try { return String(v); } catch (e2) { return '[Unserializable]'; }
        }
    }

    function pushLog(level, args) {
        const text = Array.from(args).map(a => stringifyArg(a)).join(' ');
        const entry = { level, text, time: fmtTime(new Date()) };
        logs.push(entry);
        if (logs.length > MAX_LOGS) logs.shift();
        if (overlay && overlay.classList.contains('open')) appendLogRow(entry);
    }

    function patchConsole() {
        if (patchedConsole) return;
        patchedConsole = true;
        ['log', 'info', 'warn', 'error', 'debug'].forEach(lv => {
            const orig = console[lv];
            console[lv] = function (...args) {
                try { pushLog(lv === 'debug' ? 'log' : lv, args); } catch (e) {}
                if (typeof orig === 'function') return orig.apply(console, args);
            };
        });
        const origTable = console.table;
        console.table = function (data) {
            try { pushLog('info', [data]); } catch (e) {}
            if (typeof origTable === 'function') return origTable.apply(console, arguments);
        };
        window.addEventListener('error', (ev) => {
            const msg = ev.error ? stringifyArg(ev.error) : `${ev.message || 'Error'} (${ev.filename || ''}:${ev.lineno || 0})`;
            pushLog('error', [msg]);
        });
        window.addEventListener('unhandledrejection', (ev) => {
            pushLog('error', ['UnhandledRejection:', ev.reason]);
        });
    }

    function appendLogRow(entry) {
        if (!listEl) return;
        if (filterLevel !== 'all' && entry.level !== filterLevel) return;
        const row = document.createElement('div');
        row.className = 'dc-row dc-' + entry.level;
        const meta = document.createElement('span');
        meta.className = 'dc-time';
        meta.textContent = entry.time;
        const body = document.createElement('pre');
        body.className = 'dc-msg';
        body.textContent = entry.text;
        row.appendChild(meta);
        row.appendChild(body);
        listEl.appendChild(row);
        listEl.scrollTop = listEl.scrollHeight;
    }

    function renderLogs() {
        if (!listEl) return;
        listEl.innerHTML = '';
        const shown = logs.filter(e => filterLevel === 'all' || e.level === filterLevel);
        if (!shown.length) {
            const emp = document.createElement('div');
            emp.className = 'dc-empty';
            emp.textContent = T('dev.console_empty', 'Chưa có log nào. Nhập lệnh JS bên dưới để chạy thử.');
            listEl.appendChild(emp);
            return;
        }
        shown.forEach(appendLogRow);
    }

    function runCommand(raw) {
        const code = String(raw || '').trim();
        if (!code) return;
        cmdHistory.push(code);
        if (cmdHistory.length > 50) cmdHistory.shift();
        histIdx = cmdHistory.length;
        pushLog('cmd', ['> ' + code]);
        try {
            const res = (0, eval)(code);
            if (res && typeof res.then === 'function') {
                pushLog('result', ['Promise {<pending>}']);
                res.then(v => pushLog('result', ['<', v])).catch(err => pushLog('error', [err]));
            } else {
                pushLog('result', ['<', res]);
            }
        } catch (err) {
            pushLog('error', [err]);
        }
    }

    function startInspectTap() {
        inspectMode = true;
        closeConsole();
        if (typeof showToast === 'function') {
            showToast(T('dev.inspect_hint', 'Chạm vào bất kỳ vị trí nào để soi lớp phủ (elementsFromPoint)'), 'touch_app', 2600);
        }
        const onTap = (e) => {
            if (!inspectMode) return;
            inspectMode = false;
            document.removeEventListener('pointerdown', onTap, true);
            const x = Math.round(e.clientX), y = Math.round(e.clientY);
            const stack = document.elementsFromPoint(x, y).slice(0, 10).map(el => {
                const s = getComputedStyle(el);
                const id = el.id ? '#' + el.id : '';
                const cls = (typeof el.className === 'string' && el.className.trim())
                    ? '.' + el.className.trim().split(/\s+/).join('.')
                    : '';
                return `${el.tagName.toLowerCase()}${id}${cls} [z=${s.zIndex}, pe=${s.pointerEvents}, op=${s.opacity}, pos=${s.position}]`;
            });
            pushLog('info', [
                `Inspect (${x}, ${y}) | ss-open=${document.body.classList.contains('ss-open')} | active=${stringifyArg(document.activeElement)}\n` +
                stack.map((s, i) => `${i + 1}. ${s}`).join('\n')
            ]);
            setTimeout(openConsole, 60);
        };
        setTimeout(() => document.addEventListener('pointerdown', onTap, true), 120);
    }

    function buildConsole() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = 'dev-console-overlay';
        overlay.innerHTML =
            '<div class="dc-scrim" id="dc-scrim"></div>' +
            '<div class="dc-sheet" id="dev-console-sheet" role="dialog" aria-modal="true" tabindex="-1">' +
            '<div class="dc-head">' +
            '<div class="dc-title"><span class="material-symbols-rounded">code</span><span>Developer Console</span></div>' +
            '<div class="dc-actions">' +
            '<button type="button" class="dc-ic-btn" id="dc-inspect-btn" title="Soi điểm chạm"><span class="material-symbols-rounded">touch_app</span></button>' +
            '<button type="button" class="dc-ic-btn" id="dc-copy-btn" title="Sao chép log"><span class="material-symbols-rounded">content_copy</span></button>' +
            '<button type="button" class="dc-ic-btn" id="dc-clear-btn" title="Xóa log"><span class="material-symbols-rounded">delete_sweep</span></button>' +
            '<button type="button" class="dc-ic-btn" id="dc-close-btn" title="Đóng"><span class="material-symbols-rounded">close</span></button>' +
            '</div>' +
            '</div>' +
            '<div class="dc-filters">' +
            '<button type="button" class="dc-chip on" data-lv="all">All</button>' +
            '<button type="button" class="dc-chip" data-lv="log">Log</button>' +
            '<button type="button" class="dc-chip" data-lv="warn">Warn</button>' +
            '<button type="button" class="dc-chip" data-lv="error">Error</button>' +
            '</div>' +
            '<div class="dc-list" id="dc-list"></div>' +
            '<div class="dc-input-bar">' +
            '<span class="dc-prompt">&gt;</span>' +
            '<input type="text" id="dc-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Nhập lệnh JavaScript...">' +
            '<button type="button" class="dc-run-btn" id="dc-run-btn" title="Chạy"><span class="material-symbols-rounded">play_arrow</span></button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        listEl = overlay.querySelector('#dc-list');
        inputEl = overlay.querySelector('#dc-input');
        overlay.querySelector('#dc-scrim').addEventListener('click', closeConsole);
        overlay.querySelector('#dc-close-btn').addEventListener('click', closeConsole);
        overlay.querySelector('#dc-clear-btn').addEventListener('click', () => { logs.length = 0; renderLogs(); });
        overlay.querySelector('#dc-inspect-btn').addEventListener('click', startInspectTap);
        overlay.querySelector('#dc-copy-btn').addEventListener('click', () => {
            const txt = logs.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.text}`).join('\n');
            if (!txt) return;
            try {
                navigator.clipboard.writeText(txt).then(() => {
                    if (typeof showToast === 'function') showToast(T('dev.copied', 'Đã sao chép log'), 'content_copy', 1800);
                }).catch(() => {});
            } catch (e) {}
        });
        overlay.querySelectorAll('.dc-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                filterLevel = btn.dataset.lv || 'all';
                overlay.querySelectorAll('.dc-chip').forEach(b => b.classList.toggle('on', b === btn));
                renderLogs();
            });
        });
        const submit = () => {
            const val = inputEl.value;
            if (!val.trim()) return;
            inputEl.value = '';
            runCommand(val);
        };
        overlay.querySelector('#dc-run-btn').addEventListener('click', submit);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            else if (e.key === 'ArrowUp' && cmdHistory.length) {
                e.preventDefault();
                histIdx = Math.max(0, histIdx - 1);
                inputEl.value = cmdHistory[histIdx] || '';
            } else if (e.key === 'ArrowDown' && cmdHistory.length) {
                e.preventDefault();
                histIdx = Math.min(cmdHistory.length, histIdx + 1);
                inputEl.value = cmdHistory[histIdx] || '';
            }
        });
    }

    function openConsole() {
        patchConsole();
        buildConsole();
        document.body.classList.remove('m-more-open');
        const lyricBtn = document.getElementById('lyric-btn');
        if (lyricBtn) lyricBtn.style.pointerEvents = '';
        if (inputEl) inputEl.placeholder = T('dev.console_placeholder', 'Nhập lệnh JavaScript...');
        renderLogs();
        overlay.style.display = 'block';
        void overlay.offsetWidth;
        overlay.classList.add('open');
        const sheet = overlay.querySelector('#dev-console-sheet');
        if (sheet) { try { sheet.focus({ preventScroll: true }); } catch (e) {} }
    }

    function closeConsole() {
        if (!overlay || !overlay.classList.contains('open')) return false;
        overlay.classList.remove('open');
        setTimeout(() => {
            if (overlay && !overlay.classList.contains('open')) overlay.style.display = 'none';
        }, 260);
        return true;
    }

    function applyDevState(on) {
        const enabled = !!on;
        try { localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false'); } catch (e) {}
        document.body.classList.toggle('dev-console-on', enabled);
        const sw = document.getElementById('setting-dev-console');
        if (sw && !!sw.selected !== enabled) sw.selected = enabled;
        if (enabled) patchConsole();
        else closeConsole();
    }

    function init() {
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
                openConsole();
            });
        }
    }

    window.__openDevConsole = openConsole;
    window.__closeDevConsole = closeConsole;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();

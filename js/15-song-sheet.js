// Bottom sheet tùy chọn bài hát (giao diện điện thoại): mở từ nút "Thông tin khác" ở trình phát hoặc dấu ⋮ của một bài > Info.
// Tab OPTIONS: Play / Thích / Chia sẻ / Thêm vào hàng đợi / Phát tiếp theo / Danh sách phát / Xóa / Đặt làm âm thanh + nút bút chì (Metadata Editor)
// Tab INFO: thông tin chi tiết của tệp.
(function () {
    'use strict';
    const T = (k, f) => { try { return (window.__tr && window.__tr(k)) || f; } catch (e) { return f; } };
    const isM = () => document.documentElement.classList.contains('m-ui');
    const AB = () => window.AndroidBridge;
    const toast = (m, ic) => { try { showToast(m, ic || 'info'); } catch (e) {} };
    const keyOf = (t) => (window.__plApi ? window.__plApi.key(t) : String((t && (t.nativeLocation || t.rawName || t.name)) || '').toLowerCase());
    const sameTrack = (a, b) => !!a && !!b && (a === b || (keyOf(a) && keyOf(a) === keyOf(b)));
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    let root = null, track = null, tab = 'options', infoSeq = 0;

    function icon(name, fill) { return '<span class="material-symbols-rounded"' + (fill ? ' style="font-variation-settings:\'FILL\' 1;"' : '') + '>' + name + '</span>'; }

    function build() {
        if (root) return;
        root = document.createElement('div');
        root.id = 'ss-root';
        root.innerHTML =
            '<div class="ss-scrim" id="ss-scrim"></div>' +
            '<div class="ss-box" id="ss-box">' +
            '<div class="ss-grip"></div>' +
            '<div class="ss-body">' +
            '<div class="ss-head"><div class="ss-art" id="ss-art"></div><div class="ss-title" id="ss-title"></div>' +
            '<button type="button" class="ss-edit" id="ss-edit" title="Metadata">' + icon('edit') + '</button></div>' +
            '<div class="ss-pane active" id="ss-pane-options">' +
            '<div class="ss-row">' +
            '<button type="button" class="ss-btn ss-play" id="ss-play">' + icon('play_arrow', true) + '<span>' + T('ss.play', 'Phát') + '</span></button>' +
            '<button type="button" class="ss-btn ss-like" id="ss-like">' + icon('favorite', true) + '</button>' +
            '<button type="button" class="ss-btn ss-share" id="ss-share">' + icon('share') + '</button>' +
            '</div>' +
            '<div class="ss-row">' +
            '<button type="button" class="ss-btn ss-queue" id="ss-queue">' + icon('playlist_add') + '<span>' + T('ss.add_queue', 'Thêm vào hàng đợi') + '</span></button>' +
            '<button type="button" class="ss-btn ss-next" id="ss-next">' + icon('queue_music') + '<span>' + T('ss.next', 'Tiếp theo') + '</span></button>' +
            '</div>' +
            '<div class="ss-row">' +
            '<button type="button" class="ss-btn ss-pl" id="ss-pl">' + icon('playlist_add') + '<span>' + T('ss.playlist', 'Danh sách phát') + '</span></button>' +
            '<button type="button" class="ss-btn ss-del" id="ss-del">' + icon('delete_forever') + '<span>' + T('ss.delete', 'Xóa') + '</span></button>' +
            '</div>' +
            '<div class="ss-row">' +
            '<button type="button" class="ss-btn ss-sound" id="ss-sound">' + icon('notifications_active') + '<span>' + T('ss.set_sound', 'Đặt làm âm thanh') + '</span></button>' +
            '</div>' +
            '</div>' +
            '<div class="ss-pane" id="ss-pane-info"><div class="ss-info" id="ss-info"></div></div>' +
            '</div>' +
            '<div class="ss-tabs">' +
            '<button type="button" class="ss-tab on" data-tab="options">' + icon('menu') + '<span>' + T('ss.tab_options', 'TÙY CHỌN') + '</span></button>' +
            '<button type="button" class="ss-tab" data-tab="info">' + icon('info', true) + '<span>' + T('ss.tab_info', 'THÔNG TIN') + '</span></button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(root);

        const $ = (id) => root.querySelector('#' + id);
        $('ss-scrim').addEventListener('click', close);
        root.querySelectorAll('.ss-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
        $('ss-edit').addEventListener('click', editMetadata);
        $('ss-play').addEventListener('click', playNow);
        $('ss-like').addEventListener('click', () => { if (track && window.__toggleLiked) { window.__toggleLiked(track); syncLike(); } });
        $('ss-share').addEventListener('click', shareTrack);
        $('ss-queue').addEventListener('click', addToQueue);
        $('ss-next').addEventListener('click', playNext);
        $('ss-pl').addEventListener('click', openPlaylistPicker);
        $('ss-del').addEventListener('click', () => {
            if (!track) return;
            const t = track;
            close();
            if (typeof window.__deleteTracksFlow === 'function') window.__deleteTracksFlow([t]);
        });
        $('ss-sound').addEventListener('click', openSoundDialog);

        // Vuốt xuống ở tay nắm để đóng
        const box = $('ss-box'), grip = root.querySelector('.ss-grip');
        let y0 = null;
        grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; try { grip.setPointerCapture(e.pointerId); } catch (er) {} });
        grip.addEventListener('pointermove', (e) => { if (y0 == null) return; const dy = Math.max(0, e.clientY - y0); box.style.transition = 'none'; box.style.transform = 'translateY(' + dy + 'px)'; });
        const end = (e) => {
            if (y0 == null) return;
            const dy = Math.max(0, e.clientY - y0); y0 = null;
            box.style.transition = '';
            if (dy > 90) close(); else box.style.transform = '';
        };
        grip.addEventListener('pointerup', end);
        grip.addEventListener('pointercancel', end);
    }

    function setTab(t) {
        tab = t;
        root.querySelectorAll('.ss-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        const pOpt = root.querySelector('#ss-pane-options');
        const pInf = root.querySelector('#ss-pane-info');
        pOpt.classList.toggle('active', t === 'options');
        pInf.classList.toggle('active', t === 'info');
        pOpt.style.display = t === 'options' ? 'block' : 'none';
        pInf.style.display = t === 'info' ? 'block' : 'none';
        const body = root.querySelector('.ss-body');
        if (body) body.scrollTop = 0;
        if (t === 'info') loadInfo();
    }

    function renderInfoCards(items) {
        if (!Array.isArray(items) || !items.length) return '';
        return '<div class="ss-info-group">' + items.map(it =>
            '<div class="ss-info-card">' +
            '<span class="material-symbols-rounded ss-info-ic">' + esc(it.icon || 'info') + '</span>' +
            '<div class="ss-info-txt">' +
            '<div class="ss-info-lbl">' + esc(it.label || '') + '</div>' +
            '<div class="ss-info-val">' + esc(it.value || '') + '</div>' +
            '</div></div>'
        ).join('') + '</div>';
    }

    async function loadInfo() {
        const el = root.querySelector('#ss-info');
        const curTrack = track;
        const seq = ++infoSeq;
        el.innerHTML = '';
        if (!curTrack) return;
        try {
            if (typeof window.__buildMoreInfoData === 'function') {
                const data = await window.__buildMoreInfoData(curTrack);
                if (seq !== infoSeq || track !== curTrack) return;
                let html = renderInfoCards(data.items);
                if (data.lyricItems && data.lyricItems.length) {
                    html += '<div class="ss-info-sec">' + esc(data.lyricTitle || 'Lyric Information') + '</div>' + renderInfoCards(data.lyricItems);
                }
                el.innerHTML = html;
            } else if (typeof window.__buildMoreInfoRows === 'function') {
                const rows = await window.__buildMoreInfoRows(curTrack);
                if (seq !== infoSeq || track !== curTrack) return;
                el.innerHTML = rows.join('');
            }
        } catch (e) {}
    }

    function syncLike() {
        const b = root.querySelector('#ss-like');
        const on = !!(track && window.__isLiked && window.__isLiked(track));
        b.classList.toggle('on', on);
        b.firstChild.style.fontVariationSettings = on ? "'FILL' 1" : "'FILL' 0";
    }

    function syncPlayBtn() {
        const b = root.querySelector('#ss-play');
        const cur = playlist[currentIndex];
        const isCur = sameTrack(cur, track);
        const playing = isCur && !audio.paused;
        b.firstChild.textContent = playing ? 'pause' : 'play_arrow';
        b.lastChild.textContent = playing ? T('ss.pause', 'Tạm dừng') : T('ss.play', 'Phát');
    }

    function open(tr, startTab) {
        if (!tr) return;
        build();
        track = tr;
        const art = root.querySelector('#ss-art');
        art.innerHTML = tr.cover ? '<img alt="" src="' + esc(tr.cover) + '">' : icon('music_note');
        root.querySelector('#ss-title').textContent = tr.name || '';
        root.querySelector('#ss-del').style.display = (AB() && typeof AB().deleteNativeFiles === 'function') ? '' : 'none';
        root.querySelector('#ss-sound').style.display = (AB() && typeof AB().setAsSound === 'function') ? '' : 'none';
        syncLike(); syncPlayBtn();
        setTab(startTab || 'options');
        root.style.display = 'block';
        void root.offsetWidth;
        root.classList.add('open');
    }

    function close() {
        if (!root) return;
        root.classList.remove('open');
        const box = root.querySelector('#ss-box'); box.style.transform = '';
        setTimeout(() => { if (!root.classList.contains('open')) root.style.display = 'none'; }, 260);
    }
    window.__closeSongSheet = function () {
        const pl = document.getElementById('ss-pl-screen'), sd = document.getElementById('ss-sound-dlg');
        if (sd && sd.classList.contains('open')) { sd.classList.remove('open'); return true; }
        if (pl && pl.classList.contains('open')) { pl.classList.remove('open'); return true; }
        if (root && root.classList.contains('open')) { close(); return true; }
        return false;
    };

    // ---------- Hành động ----------
    function playNow() {
        if (!track) return;
        const cur = playlist[currentIndex];
        if (sameTrack(cur, track)) {
            if (audio.paused) audio.play().catch(() => {}); else audio.pause();
            syncPlayBtn();
            return;
        }
        close();
        const idx = playlist.findIndex(t => sameTrack(t, track));
        if (idx >= 0) playTrack(idx);
        else if (window.__plApi) window.__plApi.replaceAndPlay((window.__plApi.pool() || []).slice(), track);
    }

    function afterQueueChange() {
        try { updatePlaylistUI(); } catch (e) {}
        try { if (typeof window.__syncNativeQueue === 'function') window.__syncNativeQueue(); } catch (e) {}
        try { if (typeof window.__saveQueueNow === 'function') window.__saveQueueNow(); } catch (e) {}
    }

    function addToQueue() {
        if (!track) return;
        if (playlist.some(t => sameTrack(t, track))) { toast(T('ss.already_queue', 'Bài này đã có trong hàng đợi'), 'queue_music'); close(); return; }
        playlist.push(track);
        const idx = playlist.length - 1;
        if (shuffleInitialized) shuffleOrder.splice(Math.floor(Math.random() * (shuffleOrder.length + 1)), 0, idx);
        afterQueueChange();
        toast(T('ss.added_queue', 'Đã thêm vào hàng đợi'), 'playlist_add');
        close();
    }

    // Đưa bài lên ngay sau bài đang phát (cả thứ tự Playlist lẫn thứ tự Shuffle)
    function playNext() {
        if (!track) return;
        const cur = playlist[currentIndex];
        if (!cur) { addToQueue(); return; }
        if (sameTrack(cur, track)) { toast(T('ss.is_current', 'Bài này đang phát'), 'music_note'); close(); return; }
        const shufTracks = shuffleInitialized ? shuffleOrder.map(i => playlist[i]).filter(Boolean) : null;
        const existing = playlist.findIndex(t => sameTrack(t, track));
        const item = existing >= 0 ? playlist[existing] : track;
        if (existing >= 0) playlist.splice(existing, 1);
        const ci = playlist.indexOf(cur);
        playlist.splice(ci + 1, 0, item);
        currentIndex = playlist.indexOf(cur);
        if (shufTracks) {
            const rest = shufTracks.filter(t => t !== item);
            const sp = rest.indexOf(cur);
            rest.splice(sp >= 0 ? sp + 1 : 0, 0, item);
            shuffleOrder = rest.map(t => playlist.indexOf(t)).filter(i => i >= 0);
        }
        afterQueueChange();
        toast(T('ss.next_done', 'Sẽ phát tiếp theo'), 'queue_music');
        close();
    }

    function shareTrack() {
        if (!track) return;
        const ab = AB();
        if (!ab || typeof ab.shareNativeFiles !== 'function') {
            if (sameTrack(playlist[currentIndex], track) && typeof shareCurrentFile === 'function') { close(); shareCurrentFile(); }
            else toast(T('sel.unsupported', 'Chức năng này cần app Android'), 'info');
            return;
        }
        const t = track;
        close();
        try { if (typeof openShareSheet === 'function') openShareSheet('locating'); } catch (e) {}
        const err = ab.shareNativeFiles(JSON.stringify([{
            id: String(t.nativeId || ''), loc: String(t.nativeLocation || ''),
            name: String(t.nativeName || ((t.name || 'media') + '.' + (t.ext || 'mp3').toLowerCase())), mime: String((t.file && t.file.type) || '')
        }]));
        if (err) { try { closeShareSheet(); } catch (e) {} toast('Chia sẻ lỗi: ' + err, 'error'); }
    }

    // Bút chì: mở Metadata Editor của bài (editor làm việc trên bài đang chọn nên nếu chưa phải bài hiện tại thì chuyển sang bài đó trước)
    function editMetadata() {
        if (!track) return;
        const t = track;
        close();
        const openEd = () => { const b = document.getElementById('btn-edit-metadata-fields'); if (b) b.click(); };
        if (sameTrack(playlist[currentIndex], t)) { openEd(); return; }
        let idx = playlist.findIndex(x => sameTrack(x, t));
        if (idx < 0) { playlist.push(t); idx = playlist.length - 1; if (shuffleInitialized) shuffleOrder.push(idx); afterQueueChange(); }
        const done = () => { audio.removeEventListener('loadedmetadata', done); clearTimeout(tm); setTimeout(openEd, 120); };
        const tm = setTimeout(done, 2500);
        audio.addEventListener('loadedmetadata', done);
        playTrack(idx);
    }

    // ---------- Màn "Chọn danh sách phát" ----------
    function openPlaylistPicker() {
        if (!track || !window.__plApi) return;
        const api = window.__plApi;
        let scr = document.getElementById('ss-pl-screen');
        if (!scr) {
            scr = document.createElement('div');
            scr.id = 'ss-pl-screen';
            scr.innerHTML =
                '<div class="ssp-grip"></div><h2 class="ssp-title"></h2>' +
                '<label class="ssp-search"><input id="ssp-q" type="text" autocomplete="off"></label>' +
                '<div class="ssp-newrow"><button type="button" class="ssp-new" id="ssp-new">' + icon('playlist_add') + '<span></span></button></div>' +
                '<div class="ssp-list" id="ssp-list"></div>' +
                '<button type="button" class="ssp-save" id="ssp-save">' + icon('save', true) + '<span></span></button>';
            document.body.appendChild(scr);
        }
        scr.querySelector('.ssp-title').textContent = T('ss.select_playlists', 'Chọn danh sách phát');
        const q = scr.querySelector('#ssp-q');
        q.placeholder = T('ss.search_playlists', 'Tìm danh sách phát...');
        q.value = '';
        scr.querySelector('#ssp-new span:last-child').textContent = T('ss.new', 'Mới');
        scr.querySelector('#ssp-save span:last-child').textContent = T('ss.save', 'Lưu');
        const tk = keyOf(track);
        const pls = api.load().filter(p => p && p.mode !== 'smart' && p.mode !== 'virtual');
        const want = new Map(pls.map(p => [p.id, (p.trackKeys || []).some(k => String(k).toLowerCase() === tk)]));
        const orig = new Map(want);
        const list = scr.querySelector('#ssp-list');
        const render = () => {
            const term = (typeof removeVietnameseTones === 'function' ? removeVietnameseTones(q.value) : q.value).toLowerCase().trim();
            list.innerHTML = '';
            const shown = pls.filter(p => !term || (typeof removeVietnameseTones === 'function' ? removeVietnameseTones(p.name || '') : (p.name || '')).toLowerCase().includes(term));
            if (!shown.length) { list.innerHTML = '<div class="ssp-empty">' + esc(T('ss.no_playlists', 'Chưa có danh sách phát nào.')) + '</div>'; return; }
            shown.forEach(p => {
                const row = document.createElement('div');
                row.className = 'ssp-row';
                let cover = ''; try { cover = api.cover(p, 56, api.resolve(p)); } catch (e) {}
                const cnt = (p.trackKeys || []).length;
                row.innerHTML = '<div class="ssp-cover">' + cover + '</div><div class="ssp-meta"><div class="ssp-name"></div><div class="ssp-cnt"></div></div>' +
                    '<span class="ssp-check' + (want.get(p.id) ? ' on' : '') + '">' + icon('check', true) + '</span>';
                row.querySelector('.ssp-name').textContent = p.name || '';
                row.querySelector('.ssp-cnt').textContent = T('pl.tracks_count', '{n} bài hát').replace('{n}', cnt);
                row.addEventListener('click', () => { want.set(p.id, !want.get(p.id)); row.querySelector('.ssp-check').classList.toggle('on', want.get(p.id)); });
                list.appendChild(row);
            });
        };
        q.oninput = render;
        render();
        scr.querySelector('#ssp-new').onclick = () => {
            scr.classList.remove('open'); close();
            if (typeof window.__openCreatePlaylistFromTracks === 'function') window.__openCreatePlaylistFromTracks([track]);
        };
        scr.querySelector('#ssp-save').onclick = () => {
            const all = api.load();
            let changed = 0;
            all.forEach(p => {
                if (!want.has(p.id) || want.get(p.id) === orig.get(p.id)) return;
                p.trackKeys = Array.isArray(p.trackKeys) ? p.trackKeys : [];
                const has = p.trackKeys.findIndex(k => String(k).toLowerCase() === tk);
                if (want.get(p.id) && has < 0) { p.trackKeys.push(tk); changed++; }
                else if (!want.get(p.id) && has >= 0) { p.trackKeys.splice(has, 1); changed++; }
            });
            if (changed) { api.save(all); api.rerender(); }
            scr.classList.remove('open'); close();
            toast(changed ? T('ss.pl_saved', 'Đã cập nhật danh sách phát') : T('ss.pl_nochange', 'Không có thay đổi'), 'playlist_add_check');
        };
        scr.style.display = 'flex';
        void scr.offsetWidth;
        scr.classList.add('open');
    }

    // ---------- Đặt làm âm thanh ----------
    function openSoundDialog() {
        if (!track) return;
        const ab = AB();
        if (!ab || typeof ab.setAsSound !== 'function') return;
        // Cần quyền "Sửa đổi cài đặt hệ thống" trước: chưa có thì mở trang cấp quyền
        if (typeof ab.canWriteSettings === 'function' && !ab.canWriteSettings()) {
            toast(T('ss.need_write', 'Hãy bật "Cho phép sửa đổi cài đặt hệ thống" rồi quay lại bấm lại'), 'settings');
            try { ab.openWriteSettings(); } catch (e) {}
            return;
        }
        let dlg = document.getElementById('ss-sound-dlg');
        if (!dlg) {
            dlg = document.createElement('div');
            dlg.id = 'ss-sound-dlg';
            dlg.innerHTML = '<div class="ssd-card"><div class="ssd-head"><span class="ssd-ic">' + icon('notifications_active') + '</span><h3></h3></div><p class="ssd-desc"></p>' +
                '<div class="ssd-opts"></div><div class="ssd-foot"><button type="button" class="ssd-cancel"></button></div></div>';
            document.body.appendChild(dlg);
            dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.classList.remove('open'); });
            dlg.querySelector('.ssd-cancel').addEventListener('click', () => dlg.classList.remove('open'));
        }
        dlg.querySelector('h3').textContent = T('ss.use_as', 'Dùng bài này làm');
        dlg.querySelector('.ssd-desc').textContent = T('ss.use_as_desc', 'Chọn nơi Media Player sẽ cài âm thanh này.');
        dlg.querySelector('.ssd-cancel').textContent = T('ss.cancel', 'Hủy');
        const opts = [
            ['ringtone', 'music_note', T('ss.ringtone', 'Nhạc chuông điện thoại'), T('ss.ringtone_d', 'Cuộc gọi đến')],
            ['notification', 'notifications_active', T('ss.notif', 'Âm thông báo'), T('ss.notif_d', 'Tin nhắn và thông báo ứng dụng')],
            ['alarm', 'alarm', T('ss.alarm', 'Âm báo thức'), T('ss.alarm_d', 'Báo thức đồng hồ')]
        ];
        const box = dlg.querySelector('.ssd-opts'); box.innerHTML = '';
        opts.forEach(([type, ic, name, desc]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'ssd-opt';
            b.innerHTML = '<span class="ssd-oic">' + icon(ic) + '</span><span class="ssd-ot"><b></b><small></small></span>';
            b.querySelector('b').textContent = name; b.querySelector('small').textContent = desc;
            b.addEventListener('click', () => {
                const t = track;
                dlg.classList.remove('open'); close();
                toast(T('ss.installing', 'Đang cài đặt âm thanh...'), 'notifications_active');
                ab.setAsSound(String(t.nativeId || ''), String(t.nativeLocation || ''), String(t.nativeName || ((t.name || 'sound') + '.' + (t.ext || 'mp3').toLowerCase())), type);
            });
            box.appendChild(b);
        });
        dlg.style.display = 'flex';
        void dlg.offsetWidth;
        dlg.classList.add('open');
    }
    window.__onSetSoundResult = function (r) {
        try {
            if (r && r.ok) {
                const names = { ringtone: T('ss.ringtone', 'Nhạc chuông điện thoại'), notification: T('ss.notif', 'Âm thông báo'), alarm: T('ss.alarm', 'Âm báo thức') };
                toast(T('ss.sound_done', 'Đã đặt làm') + ': ' + (names[r.type] || ''), 'check_circle');
            } else if (r && r.error === 'NO_PERMISSION') {
                toast(T('ss.need_write', 'Hãy bật "Cho phép sửa đổi cài đặt hệ thống" rồi quay lại bấm lại'), 'settings');
                try { AB().openWriteSettings(); } catch (e) {}
            } else {
                toast(T('ss.sound_fail', 'Không đặt được âm thanh') + (r && r.error ? ' (' + r.error + ')' : ''), 'error');
            }
        } catch (e) {}
    };

    window.__openSongSheet = open;

    // Dấu ⋮ của một bài > Info
    document.addEventListener('DOMContentLoaded', hook);
    if (document.readyState !== 'loading') hook();
    function hook() {
        const ci = document.getElementById('cm-info');
        if (!ci || ci._ssHooked) return;
        ci._ssHooked = true;
        ci.addEventListener('click', () => {
            const cm = document.getElementById('context-menu');
            const tr = (typeof targetMenuIndex === 'number' && targetMenuIndex > -1 && playlist[targetMenuIndex]) || window.__lrcFallbackTrack || null;
            if (cm) cm.style.display = 'none';
            if (tr) open(tr);
        });
    }
    // Đồng bộ nút Play khi trạng thái phát thay đổi lúc sheet đang mở
    ['play', 'pause'].forEach(ev => audio.addEventListener(ev, () => { if (root && root.classList.contains('open')) syncPlayBtn(); }));
})();

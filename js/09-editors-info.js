        // --- STREAMING_CHUNK:Linking Metadata and Thumbnail Editors... ---
        // --- HỆ THỐNG METADATA & THUMBNAIL EDITORS ---
        const editMetadataBtn = document.getElementById('edit-metadata-btn');
        const editOptionsModal = document.getElementById('edit-options-modal');
        const editOptionsClose = document.getElementById('edit-options-close');
        
        const btnEditThumbnail = document.getElementById('btn-edit-thumbnail');
        const btnEditMetadataFields = document.getElementById('btn-edit-metadata-fields');

        const metadataIframe = document.getElementById('metadata-iframe');
        const confirmOverwriteModal = document.getElementById('confirm-overwrite-modal');

        let pendingMetadata = null;

        // Phụ đề của video được lưu trong trình duyệt (không ghi được vào tệp video), khoá theo tên + dung lượng tệp
        const subKey = f => f ? (f.name + '|' + f.size) : '';
        function loadVideoSubtitle(f) { try { return (JSON.parse(localStorage.getItem('settings_subs') || '{}'))[subKey(f)] || ''; } catch (e) { return ''; } }
        function saveVideoSubtitle(f, text) {
            try {
                const all = JSON.parse(localStorage.getItem('settings_subs') || '{}');
                if (text) all[subKey(f)] = text; else delete all[subKey(f)];
                localStorage.setItem('settings_subs', JSON.stringify(all));
            } catch (e) { showToast('Không lưu được phụ đề (bộ nhớ trình duyệt đầy?)'); }
        }

        editMetadataBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentIndex === -1) {
                showToast(currentLangDict['player.load_first_prompt'] || "Hãy nạp tệp nhạc hoặc video và phát để sử dụng trình chỉnh sửa!");
                return;
            }
            // Video: chỉ có Subtitle Embed -> mở thẳng trình chỉnh sửa, không cần bảng chọn (không có ảnh bìa để sửa)
            if (playlist[currentIndex] && playlist[currentIndex].isVideo) { btnEditMetadataFields.click(); return; }
            editOptionsModal.classList.add('open');
        });

        editOptionsClose.addEventListener('click', () => editOptionsModal.classList.remove('open'));

        // --- HỆ THỐNG "GỬI PHẢN HỒI" (FEEDBACK QUA MAILTO) ---
        const feedbackBtn = document.getElementById('feedback-btn');
        const feedbackModal = document.getElementById('feedback-modal');
        const feedbackClose = document.getElementById('feedback-close');
        const feedbackContent = document.getElementById('feedback-content');
        const feedbackError = document.getElementById('feedback-error');
        const feedbackSubmit = document.getElementById('feedback-submit');
        const feedbackTypeBug = document.getElementById('feedback-type-bug');
        const feedbackTypeSuggestion = document.getElementById('feedback-type-suggestion');
        const feedbackIncludeSysinfo = document.getElementById('feedback-include-sysinfo');

        // Đọc đúng version đang hiển thị ở góc trên bên trái app (span cạnh icon library_music)
        function getAppVersionText() {
            const versionEl = document.querySelector('.top-bar .brand span:not(.material-symbols-rounded)');
            return versionEl ? versionEl.innerText.trim() : 'Không rõ';
        }

        function getBrowserInfo() {
            const ua = navigator.userAgent;
            let m = ua.match(/Edg\/([\d.]+)/);
            if (m) return 'Microsoft Edge ' + m[1];
            m = ua.match(/OPR\/([\d.]+)/);
            if (m) return 'Opera ' + m[1];
            m = ua.match(/Chrome\/([\d.]+)/);
            if (m) return 'Google Chrome ' + m[1];
            m = ua.match(/Firefox\/([\d.]+)/);
            if (m) return 'Mozilla Firefox ' + m[1];
            m = ua.match(/Version\/([\d.]+).*Safari/);
            if (m) return 'Safari ' + m[1];
            return ua;
        }

        function getPlatformInfo() {
            const ua = navigator.userAgent;
            if (/Windows NT 10\.0/.test(ua)) return 'Windows 10/11';
            if (/Windows NT/.test(ua)) return 'Windows';
            if (/Mac OS X/.test(ua)) return 'macOS';
            if (/Android/.test(ua)) return 'Android';
            if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
            if (/Linux/.test(ua)) return 'Linux';
            return navigator.platform || 'Không rõ';
        }

        function formatFeedbackTimestamp(d) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        }

        feedbackBtn.addEventListener('click', () => {
            feedbackIncludeSysinfo.checked = true; // Mỗi lần mở dialog đều tự bật lại
            feedbackModal.classList.add('open');
        });
        feedbackClose.addEventListener('click', () => feedbackModal.classList.remove('open'));
        feedbackModal.addEventListener('click', (e) => {
            if (e.target === feedbackModal) feedbackModal.classList.remove('open');
        });

        feedbackSubmit.addEventListener('click', () => {
            const content = feedbackContent.value.trim();
            if (!content) {
                feedbackError.style.display = 'block';
                feedbackContent.focus();
                return;
            }
            feedbackError.style.display = 'none';

            const feedbackType = feedbackTypeSuggestion.checked ? 'Gợi ý tính năng' : 'Báo cáo lỗi';
            const subject = 'Phản hồi về Media Player';
            const timeStr = formatFeedbackTimestamp(new Date());

            let body;
            if (feedbackIncludeSysinfo.checked) {
                const onOff = v => v ? 'ON' : 'OFF';
                const themeLabels = { system: 'System', light: 'Light', dark: 'Dark' };
                const settingAccentEl = document.getElementById('setting-accent');
                const accentLabel = settingAccentEl.displayText || settings.accent;

                body = 'Loại: ' + feedbackType + '\n'
                    + 'Nội dung: ' + content + '\n'
                    + '────────────────────────────\n'
                    + 'Media Player Version:\n' + getAppVersionText() + '\n'
                    + 'Language: ' + (localStorage.getItem('settings_language') || 'vi') + '\n'
                    + 'UI scale: ' + (localStorage.getItem('settings_ui_scale') || '100') + '%\n'
                    + 'Font scale: ' + (localStorage.getItem('settings_font_scale') || '100') + '%\n'
                    + 'Font scale sync: ' + ((localStorage.getItem('settings_font_scale_sync') !== 'false') ? 'ON' : 'OFF') + '\n'
                    + 'Font: ' + (localStorage.getItem('settings_font') || 'default') + '\n'
                    + 'Main Player Lyric: ' + onOff(settings.showMainLyric) + '\n'
                    + 'PiP Lyric: ' + onOff(settings.showPipLyric) + '\n'
                    + 'Fullscreen Lyric: ' + onOff(settings.showFsLyric) + '\n'
                    + 'Performance preset: ' + perfPresetOf(settings.perf) + ' (motion ' + onOff(settings.perf.motion) + ', glass ' + onOff(settings.perf.glass) + ', album blur ' + onOff(settings.perf.albumBlur) + ', visualizer ' + onOff(settings.perf.visualizer) + ')\n'
                    + 'Keep Screen Awake in Fullscreen: ' + onOff(settings.wakeLockEnabled) + '\n'
                    + 'Dynamic Accent from Album Art: ' + onOff(settings.dynamicAccent) + '\n'
                    + 'Theme: ' + (themeLabels[settings.theme] || settings.theme) + '\n'
                    + 'Accent Color: ' + accentLabel + '\n'
                    + 'Browser:\n' + getBrowserInfo() + '\n'
                    + 'Platform:\n' + getPlatformInfo() + '\n'
                    + 'Thời gian:\n' + timeStr + '\n'
                    + '[Nội dung email được tạo tự động từ hệ thống của Media Player]';
            } else {
                body = 'Loại: ' + feedbackType + '\n'
                    + 'Nội dung: ' + content + '\n'
                    + 'Người dùng không cung cấp thông tin hệ thống\n'
                    + 'Thời gian:\n' + timeStr + '\n'
                    + '[Nội dung email được tạo tự động từ hệ thống của Media Player]';
            }

            // Hỏi người dùng muốn gửi bằng dịch vụ mail nào
            pendingMail = { subject, body };
            mailDialog.show();
        });

        const MAIL_TO = 'phongvn406@gmail.com';
        let pendingMail = null;
        const mailDialog = document.getElementById('mail-provider-dialog');
        function buildMailUrl(kind, m) {
            const su = encodeURIComponent(m.subject), bo = encodeURIComponent(m.body), to = encodeURIComponent(MAIL_TO);
            switch (kind) {
                case 'gmail': return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + to + '&su=' + su + '&body=' + bo;
                case 'outlook': return 'https://outlook.live.com/mail/0/deeplink/compose?to=' + to + '&subject=' + su + '&body=' + bo;
                case 'yahoo': return 'https://compose.mail.yahoo.com/?to=' + to + '&subject=' + su + '&body=' + bo;
                default: return 'mailto:' + MAIL_TO + '?subject=' + su + '&body=' + bo;
            }
        }
        mailDialog.querySelectorAll('[data-mail]').forEach(el => el.addEventListener('click', () => {
            if (!pendingMail) return;
            const url = buildMailUrl(el.dataset.mail, pendingMail);
            if (el.dataset.mail === 'mailto') window.open(url, '_blank', 'noopener'); else window.open(url, '_blank', 'noopener');
            pendingMail = null;
            mailDialog.close();
            feedbackModal.classList.remove('open');
            feedbackContent.value = '';
            feedbackTypeBug.checked = true;
            feedbackTypeSuggestion.checked = false;
        }));
        document.getElementById('mail-provider-cancel').addEventListener('click', () => mailDialog.close());

        // --- STREAMING_CHUNK:Setting up the "Thông tin khác" (file info) panel... ---
        // --- HỆ THỐNG "THÔNG TIN KHÁC" (FILE INFO) ---
        const moreInfoBtn = document.getElementById('more-info-btn');
        const moreInfoModal = document.getElementById('more-info-modal');
        const moreInfoClose = document.getElementById('more-info-close');
        const moreInfoBody = document.getElementById('more-info-body');

        function formatFileSizeVi(bytes) {
            if (!bytes && bytes !== 0) return currentLangDict['moreinfo.unknown'] || 'Không rõ';
            const mb = bytes / (1024 * 1024);
            const locale = savedLanguage === 'en' ? 'en-US' : 'vi-VN';
            return mb.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MB';
        }

        function formatModifiedDateVi(timestamp) {
            if (!timestamp) return currentLangDict['moreinfo.unknown'] || 'Không rõ';
            const d = new Date(timestamp);
            const now = new Date();
            const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
            const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
            const locale = savedLanguage === 'en' ? 'en-US' : 'vi-VN';
            const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
            if (isSameDay(d, now)) return `${currentLangDict['moreinfo.today_at'] || 'Hôm nay lúc'} ${timeStr}`;
            if (isSameDay(d, yesterday)) return `${currentLangDict['moreinfo.yesterday_at'] || 'Hôm qua lúc'} ${timeStr}`;
            return `${d.toLocaleDateString(locale)} ${currentLangDict['moreinfo.at'] || 'lúc'} ${timeStr}`;
        }

        // Định dạng thời lượng kiểu HH:MM:SS, tự ẩn phần Giờ nếu bài hát dưới 1 tiếng
        function formatDurationVi(totalSeconds) {
            if (!isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
            const total = Math.round(totalSeconds);
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            const s = total % 60;
            const pad = (n) => String(n).padStart(2, '0');
            return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
        }

        function moreInfoRowHTML(icon, label, value) {
            return `<div style="display:flex; gap:16px; align-items:flex-start;">
                <span class="material-symbols-rounded" style="font-size:22px; opacity:0.75; margin-top:1px;">${icon}</span>
                <div style="min-width:0;">
                    <div style="font-size: calc(13px * var(--font-scale-factor, 1)); opacity:0.6;">${label}</div>
                    <div style="font-size: calc(15px * var(--font-scale-factor, 1)); font-weight:600; word-break:break-word;">${value}</div>
                </div>
            </div>`;
        }

        // Đọc thông số kỹ thuật (tần số lấy mẫu, bitrate, định dạng) trực tiếp từ header tệp
        async function probeAudioInfo(track) {
            if (track._tech) return track._tech;
            const f = track.file; const info = { rate: 0, kbps: 0, fmt: (track.ext || '').replace('.', '').toUpperCase() };
            try {
                const head = new Uint8Array(await f.slice(0, 262144).arrayBuffer());
                const dv = new DataView(head.buffer);
                const str = (o, n) => String.fromCharCode(...head.subarray(o, o + n));
                if (str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE') {
                    let o = 12;
                    while (o + 8 < head.length) {
                        const id = str(o, 4), sz = dv.getUint32(o + 4, true);
                        if (id === 'fmt ') { info.rate = dv.getUint32(o + 12, true); info.kbps = Math.round(dv.getUint32(o + 16, true) * 8 / 1000); info.fmt = 'WAV'; break; }
                        o += 8 + sz + (sz & 1);
                    }
                } else if (str(0, 4) === 'fLaC') {
                    info.rate = (head[18] << 12) | (head[19] << 4) | (head[20] >> 4); info.fmt = 'FLAC';
                } else if (str(0, 4) === 'OggS') {
                    const i = str(0, 400).indexOf('OpusHead');
                    const v = Array.from(head.subarray(0, 400)).findIndex((_, k) => head[k] === 1 && str(k + 1, 6) === 'vorbis');
                    if (i >= 0) { info.rate = 48000; info.fmt = 'OPUS'; }
                    else if (v >= 0) { info.rate = dv.getUint32(v + 12, true); const nb = dv.getInt32(v + 20, true); if (nb > 0) info.kbps = Math.round(nb / 1000); info.fmt = 'OGG'; }
                } else {
                    let o = 0;
                    if (str(0, 3) === 'ID3') o = 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]);
                    if (o < head.length - 4 || str(0, 3) === 'ID3') {
                        let buf = head;
                        if (o + 4 > head.length) buf = new Uint8Array(await f.slice(o, o + 4096).arrayBuffer()), o = 0;
                        const RATES = [[11025, 12000, 8000], [0, 0, 0], [22050, 24000, 16000], [44100, 48000, 32000]];
                        const BR = { 11: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], 12: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], 13: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 21: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], 22: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], 23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
                        for (let k = o; k < buf.length - 4 && k < o + 8192; k++) {
                            if (buf[k] === 0xFF && (buf[k + 1] & 0xE0) === 0xE0) {
                                const ver = (buf[k + 1] >> 3) & 3, layer = (buf[k + 1] >> 1) & 3, bi = buf[k + 2] >> 4, ri = (buf[k + 2] >> 2) & 3;
                                if (ver === 1 || layer === 0 || bi === 0 || bi === 15 || ri === 3) continue;
                                info.rate = RATES[ver][ri];
                                const key = (ver === 3 ? 1 : 2) * 10 + (4 - layer);
                                info.kbps = (BR[key] || [])[bi] || 0; info.fmt = 'MP3';
                                // Xing/Info: bitrate trung bình chính xác hơn cho VBR
                                break;
                            }
                        }
                    }
                }
            } catch (e) {}
            if (!info.kbps && f.size && isFinite(audio.duration) && audio.duration > 0) info.kbps = Math.round(f.size * 8 / audio.duration / 1000);
            track._tech = info;
            return info;
        }

        async function openMoreInfoModal() {
            const track = playlist[currentIndex];
            if (!track || moreInfoBtn.disabled) return;
            const tech = track.file ? await probeAudioInfo(track) : null;

            const unknownStr = currentLangDict['moreinfo.unknown'] || 'Không rõ';
            const fileStr = currentLangDict['moreinfo.file_type'] || 'Tệp';
            const isMobileUi = document.documentElement.classList.contains('m-ui');
            const rawFilePath = (track.nativeLocation || (track.file && (track.file.webkitRelativePath || track.file.path)) || '').trim();
            const rows = [];
            rows.push(moreInfoRowHTML('music_note', (track.file && track.file.type) || `${fileStr} ${track.ext}`, formatFileSizeVi(track.file ? track.file.size : null)));
            if (isMobileUi && rawFilePath) {
                rows.push(moreInfoRowHTML('folder', currentLangDict['moreinfo.file_path'] || 'File Path', escHtml(rawFilePath)));
            }
            if (tech && (tech.rate || tech.kbps)) {
                const parts = [];
                if (tech.rate) parts.push((tech.rate / 1000).toLocaleString(savedLanguage === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1 }) + ' kHz');
                if (tech.kbps) parts.push(tech.kbps + ' kbps');
                if (tech.fmt) parts.push(tech.fmt);
                rows.push(moreInfoRowHTML('graphic_eq', currentLangDict['moreinfo.quality'] || 'Chất lượng âm thanh', parts.join(' • ')));
            }
            rows.push(moreInfoRowHTML('calendar_month', currentLangDict['moreinfo.date_modified'] || 'Ngày sửa đổi', formatModifiedDateVi(track.file ? track.file.lastModified : null)));
            rows.push(moreInfoRowHTML('schedule', currentLangDict['moreinfo.duration'] || 'Thời lượng', formatDurationVi(audio.duration)));
            rows.push(moreInfoRowHTML('edit', currentLangDict['moreinfo.title_label'] || 'Tên bài hát', track.name || unknownStr));
            rows.push(moreInfoRowHTML('person', currentLangDict['moreinfo.artist_label'] || 'Nghệ sĩ', track.artist || unknownStr));
            rows.push(moreInfoRowHTML('album', currentLangDict['moreinfo.album_label'] || 'Đĩa nhạc', track.album || unknownStr));
            rows.push(moreInfoRowHTML('edit_note', currentLangDict['moreinfo.composer_label'] || 'Nhà soạn nhạc', track.composer || unknownStr));
            if (track.year) rows.push(moreInfoRowHTML('calendar_today', currentLangDict['moreinfo.year_label'] || 'Năm', track.year));

            const lyInfo = lyricInfoList(track);
            if (lyInfo.length) {
                rows.push(`<div style="font-size: calc(13px * var(--font-scale-factor, 1)); font-weight:700; opacity:0.85; margin-top:8px; padding-top:14px; border-top:1px solid var(--playlist-border);">${escHtml(currentLangDict['moreinfo.lyric_info'] || 'Lyric Information')}</div>`);
                lyInfo.forEach(([k, v]) => rows.push(moreInfoRowHTML(LRC_INFO_ICONS[k] || 'info', escHtml(currentLangDict['moreinfo.lrc_' + k] || LRC_INFO_LABELS[k]), escHtml(v))));
            }
            moreInfoBody.innerHTML = rows.join('');
            moreInfoModal.classList.add('open');
        }

        // Cập nhật trạng thái nút "Thông tin khác": xám đi nếu chưa có bài nào đang mở,
        // hoặc bài hiện tại chưa xác nhận mở/đọc được (đang test / bị lỗi)
        function updateMoreInfoBtnState() {
            const track = playlist[currentIndex];
            moreInfoBtn.disabled = !track || track.canOpen !== true;
        }

        moreInfoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMoreInfoModal();
        });
        moreInfoClose.addEventListener('click', () => moreInfoModal.classList.remove('open'));
        moreInfoModal.addEventListener('click', (e) => {
            if (e.target === moreInfoModal) moreInfoModal.classList.remove('open');
        });

        // Test nền: mỗi khi audio nạp xong metadata thành công -> bài hát này "mở được",
        // bật nút; nếu audio báo lỗi (file hỏng/không hỗ trợ) -> giữ nút tắt (xám)
        audio.addEventListener('loadedmetadata', () => {
            document.body.classList.toggle('has-video', audio.videoWidth > 0);
            if (!audioCtx) { try { initVisualizer(); } catch (e) {} }
            if (typeof pipSyncVideo === 'function') pipSyncVideo(false);
            const track = playlist[currentIndex];
            if (track) track.canOpen = true;
            updateMoreInfoBtnState();
        });
        audio.addEventListener('error', () => {
            const track = playlist[currentIndex];
            if (track) track.canOpen = false;
            updateMoreInfoBtnState();
        });

        let metadataLoadTimeoutId = null;
        let metadataEditorRevealed = false;
        let metadataEditorReady = false;      // true khi iframe đã tải xong LẦN ĐẦU (chỉ 1 lần duy nhất)
        let metadataEditorPendingOpen = false; // true nếu người dùng bấm mở trước khi kịp tải xong lần đầu

        function clearMetadataLoadTimeout() {
            if (metadataLoadTimeoutId) {
                clearTimeout(metadataLoadTimeoutId);
                metadataLoadTimeoutId = null;
            }
        }

        function showMetadataLoadTimeoutError() {
            document.getElementById('metadata-loading-spinner').style.display = 'none';
            document.getElementById('metadata-loading-timeout-dialog').style.display = 'block';
        }

        function hideMetadataLoadTimeoutError() {
            document.getElementById('metadata-loading-timeout-dialog').style.display = 'none';
            document.getElementById('metadata-loading-spinner').style.display = 'flex';
        }

        // Hàm dùng chung để hiện iframe trình chỉnh sửa + chạy animation trượt vào —
        // gọi từ cả nhánh nhận 'load_success' thật lẫn nhánh bấm "Vẫn tiếp tục",
        // để 2 trường hợp luôn có animation giống hệt nhau, và idempotent để
        // load_success đến muộn (sau khi đã bấm Vẫn tiếp tục) không làm gì thêm nữa.
        function revealMetadataEditor() {
            if (metadataEditorRevealed) return;
            metadataEditorRevealed = true;
            clearMetadataLoadTimeout();
            hideMetadataLoadTimeoutError();
            document.getElementById('metadata-loading-overlay').style.display = 'none';
            metadataIframe.style.right = '0';
        }

        function sendLoadDataToEditor() {
            const track = playlist[currentIndex];
            if (!track) return;
            metadataIframe.contentWindow.postMessage({
                type: 'load',
                title: track.name || '',
                artist: /^unknown( artist)?$/i.test(track.artist || '') ? '' : (track.artist || ''),
                album: /^unknown( album)?$/i.test(track.album || '') ? '' : (track.album || ''),
                genre: track.genre || '',
                composer: track.composer || '',
                lyric: track.lyricsRaw || '',
                video: !!track.isVideo
            }, '*');
        }

        // CHIẾN LƯỢC MỚI: tải iframe trình chỉnh sửa DUY NHẤT MỘT LẦN ngay lúc vào
        // trang (ẩn sẵn ngoài rìa phải màn hình qua CSS right:-100vw có sẵn), thay vì
        // tạo mới document mỗi lần bấm mở — việc gán lại srcdoc liên tục mỗi lần mở
        // trước đây chính là thứ khiến "Metadata Editor tải lâu hơn" sau một thời gian
        // dùng: mỗi lần mở là parse + chạy lại toàn bộ HTML/CSS/JS của editor từ đầu.
        // Giờ mở/đóng chỉ là trượt qua trượt lại, document iframe sống xuyên suốt phiên.
        metadataIframe.onload = () => {
            metadataEditorReady = true;
            updateFontScaleFactor();
            applyTranslations(currentLangDict, metadataIframe.contentDocument);
            if (metadataEditorPendingOpen) {
                metadataEditorPendingOpen = false;
                sendLoadDataToEditor();
                if (openLrcSearchPending) { openLrcSearchPending = false; metadataIframe.contentWindow.postMessage({ type: 'openLrcSearch' }, '*'); }
            }
        };
        metadataIframe.srcdoc = document.getElementById('metadata-editor-template').innerHTML;

        btnEditMetadataFields.addEventListener('click', () => {
            editOptionsModal.classList.remove('open');
            metadataEditorRevealed = false;

            if (metadataEditorReady) {
                // Editor đã sống sẵn từ trước -> chỉ cần gửi dữ liệu bài hiện tại, gần
                // như tức thì, không cần hiện màn hình loading/đợi gì nữa
                sendLoadDataToEditor();
                return;
            }

            // Hiếm khi xảy ra: người dùng bấm mở ngay khi editor còn đang tải lần đầu
            hideMetadataLoadTimeoutError();
            document.getElementById('metadata-loading-overlay').style.display = 'flex';
            metadataEditorPendingOpen = true;

            clearMetadataLoadTimeout();
            metadataLoadTimeoutId = setTimeout(() => {
                if (!metadataEditorRevealed) {
                    showMetadataLoadTimeoutError();
                }
            }, 10000);
        });

        document.getElementById('metadata-timeout-ok').addEventListener('click', () => {
            clearMetadataLoadTimeout();
            metadataEditorPendingOpen = false;
            document.getElementById('metadata-loading-overlay').style.display = 'none';
            // KHÔNG đụng vào srcdoc nữa -> để iframe tiếp tục tải nền, sẵn sàng cho lần thử sau
        });

        document.getElementById('metadata-timeout-continue').addEventListener('click', () => {
            // Vẫn tiếp tục: không còn chờ tải xong nữa, hiện iframe ra ngay với animation
            // trượt y hệt lúc tải thành công bình thường
            revealMetadataEditor();
        });

        window.addEventListener('message', async (e) => {
            const d = e.data;
            if (!d) return;

            if (d === 'load_success') {
                revealMetadataEditor();
            }
            // Khi nhận được "close" từ iframe: CHỈ vuốt iframe ra rìa phải, không đụng
            // tới srcdoc/document của nó -> giữ nguyên trạng thái sống, mở lại lần sau
            // tức thì. Việc dọn form về rỗng do chính iframe tự làm sau ~1s (đã xử lý
            // bên trong template, đồng bộ với thời lượng animation trượt ra).
            else if (d === 'close') {
                metadataIframe.style.right = 'calc(-1 * var(--vw))'; 
                refreshCurrentTrackUI(); // Cập nhật tên/nghệ sĩ/lời bài hát tại chỗ tức thì
            }
            else if (d && d.type === 'save' && d.video) {
                // Video: không ghi vào tệp, chỉ lưu phụ đề trong ứng dụng (theo tên + dung lượng tệp)
                const track = playlist[currentIndex];
                if (track) {
                    track.lyricsRaw = d.lyric || '';
                    track.lyrics = d.lyric ? parseLRC(d.lyric) : null;
                    saveVideoSubtitle(track.file, d.lyric || '');
                    renderLyrics(); updatePlaylistUI(); updateFsUI();
                    if (typeof updatePiPUI === 'function') updatePiPUI();
                }
                metadataIframe.contentWindow.postMessage({ type: 'saved', persisted: 'app' }, '*');
            }
            else if (d && d.type === 'save') {
                pendingMetadata = d;
                const titlePrefix = currentLangDict['confirmoverwrite.field_title'] || "Tên: ";
                const artistPrefix = currentLangDict['confirmoverwrite.field_artist'] || "Nghệ sĩ: ";
                const albumPrefix = currentLangDict['confirmoverwrite.field_album'] || "Album: ";
                const untitledStr = currentLangDict['moreinfo.untitled'] || "Chưa đặt tên";
                const unknownStr = currentLangDict['moreinfo.unknown'] || "Chưa rõ";
                document.getElementById('overwrite-details-title').innerText = titlePrefix + (d.title || (playlist[currentIndex] && playlist[currentIndex].file ? playlist[currentIndex].file.name.replace(/\.[^/.]+$/, '') : untitledStr));
                document.getElementById('overwrite-details-artist').innerText = artistPrefix + (d.artist || 'Unknown');
                document.getElementById('overwrite-details-album').innerText = albumPrefix + (d.album || 'Unknown');
                document.getElementById('overwrite-details-genre').innerText = (currentLangDict['confirmoverwrite.field_genre'] || 'Thể loại: ') + (d.genre || '-');
                document.getElementById('overwrite-details-composer').innerText = (currentLangDict['confirmoverwrite.field_composer'] || 'Nhà soạn nhạc: ') + (d.composer || '-');
                { const ly = document.getElementById('overwrite-details-lyric'); ly.value = d.lyric || ''; ly.scrollTop = 0; }
                confirmOverwriteModal.classList.add('open');
            }
        });

        document.getElementById('confirm-overwrite-cancel').addEventListener('click', () => {
            confirmOverwriteModal.classList.remove('open');
            metadataIframe.contentWindow.postMessage('fail', '*');
            pendingMetadata = null;
        });

        document.getElementById('confirm-overwrite-save').addEventListener('click', async () => {
            confirmOverwriteModal.classList.remove('open');
            if (!pendingMetadata) return;

            const result = await writeAudioMetadata(pendingMetadata);
            if (result.ok) {
                metadataIframe.contentWindow.postMessage({ type: 'saved', persisted: result.persisted }, '*');
                
                const track = playlist[currentIndex];
                trackNameEl.innerText = track.name;
                trackArtistEl.innerText = `${track.artist} | ${track.ext}`;
                renderLyrics();
                applyMarquee();
                updatePlaylistUI();
                updateMediaSession();
                updateFsUI();
                if(typeof updatePiPUI === 'function') updatePiPUI();
            } else {
                metadataIframe.contentWindow.postMessage('fail', '*');
            }
            pendingMetadata = null;
        });

        // --- NHẬN DIỆN NGÔN NGỮ LỜI BÀI HÁT (dùng cho mã ngôn ngữ ISO 639-2 của frame USLT) ---
        // Lưu ý: browser-id3-writer lưu text bằng UTF-16 nên tự thân đã hỗ trợ đầy đủ
        // Unicode (tiếng Việt có dấu, tiếng Trung, Nhật, Hàn...); hàm này chỉ chọn đúng
        // mã ngôn ngữ hiển thị trong tag, không ảnh hưởng đến việc mã hoá ký tự.
        function detectLyricLanguageCode(text) {
            if (!text) return 'und';
            if (/[\u3040-\u30ff]/.test(text)) return 'jpn';       // Hiragana / Katakana
            if (/[\uac00-\ud7a3]/.test(text)) return 'kor';       // Hangul (Hàn)
            if (/[\u4e00-\u9fff]/.test(text)) return 'chi';       // Chữ Hán (Trung)
            if (/[àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) return 'vie'; // Có dấu tiếng Việt
            return 'eng';
        }

        async function writeAudioMetadata(meta) {
            const track = playlist[currentIndex];
            if (!track || !track.file) return { ok: false, persisted: false };

            try {
                const arrayBuffer = await track.file.arrayBuffer();
                const writer = new ID3Writer(arrayBuffer);

                if (!meta.title) meta.title = (track.file && track.file.name ? track.file.name : track.name).replace(/\.[^/.]+$/, '');
                writer.setFrame('TIT2', meta.title || '')
                      .setFrame('TPE1', [meta.artist || ''])
                      .setFrame('TALB', meta.album || '')
                      .setFrame('TCON', [meta.genre || ''])
                      .setFrame('TCOM', [meta.composer || '']);

                if (meta.lyric) {
                    writer.setFrame('USLT', {
                        language: detectLyricLanguageCode(meta.lyric),
                        description: 'Lyrics',
                        lyrics: meta.lyric
                    });
                }

                let coverBuffer = null;
                if (track.newCoverBuffer) {
                    coverBuffer = track.newCoverBuffer;
                } else if (track.cover && track.cover.startsWith('data:')) {
                    const res = await fetch(track.cover);
                    coverBuffer = await res.arrayBuffer();
                }

                if (coverBuffer) {
                    writer.setFrame('APIC', {
                        type: 3,
                        data: coverBuffer,
                        description: 'Cover',
                        useUnicodeEncoding: false
                    });
                }

                writer.addTag();
                const taggedBuffer = writer.arrayBuffer;
                const taggedBlob = new Blob([taggedBuffer], { type: 'audio/mpeg' });

                // persisted = true chỉ khi ghi thành công THẲNG vào file gốc trên đĩa.
                // Nếu không có fileHandle (mở nhạc kiểu <input type=file> cũ, hoặc trình
                // duyệt không hỗ trợ File System Access API) hoặc bị từ chối quyền ghi,
                // mọi thay đổi chỉ tồn tại tạm trong bộ nhớ (blob) của phiên làm việc này
                // — KHÔNG có cách nào để bất kỳ web app nào ghi thẳng vào ổ cứng trong
                // trường hợp đó, đây là giới hạn bảo mật cứng của trình duyệt, không phải bug.
                let persisted = false;
                if (track.fileHandle) {
                    try {
                        const writable = await track.fileHandle.createWritable();
                        await writable.write(taggedBlob);
                        await writable.close();
                        persisted = true;
                        console.log("Đã ghi đè trực tiếp lên ổ cứng thông qua File System Access API!");
                    } catch (fsErr) {
                        console.warn("Lỗi ghi trực tiếp đĩa (thiếu quyền ghi hoặc handle đã cũ), chỉ giữ lưu trữ tạm thời:", fsErr);
                    }
                }
                if (!persisted && window.AndroidBridge && typeof window.AndroidBridge.overwriteFileChunk === 'function' && (track.nativeId || track.nativeLocation || track.nativeName)) {
                    try {
                        const CH = 768 * 1024;
                        const txId = 'ov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const total = taggedBlob.size;
                        let okWrite = true;
                        let needPerm = false;
                        for (let o = 0; o < total || o === 0; o += CH) {
                            const buf = new Uint8Array(await taggedBlob.slice(o, o + CH).arrayBuffer());
                            let bin = '';
                            for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
                            const err = window.AndroidBridge.overwriteFileChunk(
                                track.nativeId || '',
                                track.nativeLocation || '',
                                txId,
                                btoa(bin),
                                o + CH >= total,
                                track.nativeName || (track.file && track.file.name) || ''
                            );
                            if (err) {
                                console.warn("Lỗi ghi đè tệp qua khung app Android:", err);
                                if (err === 'NEED_FILE_PERMISSION') needPerm = true;
                                okWrite = false;
                                break;
                            }
                            if (total === 0) break;
                        }
                        if (needPerm) {
                            showToast(tr2('metadata.android_need_file_perm', 'Vui lòng cấp quyền truy cập tệp để ghi đè vào tệp gốc, sau đó bấm Lưu lại.'), 'folder_open');
                        }
                        if (okWrite) {
                            persisted = true;
                            console.log("Đã ghi đè trực tiếp tệp gốc thông qua AndroidBridge!");
                        }
                    } catch (abErr) {
                        console.warn("Lỗi gửi dữ liệu ghi đè tới khung app Android:", abErr);
                    }
                }

                const newFile = new File([taggedBlob], (meta.title || track.name) + ".mp3", { type: 'audio/mpeg' });
                newFile.__nativeId = track.nativeId || null;
                newFile.__nativeLocation = track.nativeLocation || '';
                newFile.__nativeName = track.nativeName || (track.file && track.file.name) || newFile.name;
                track.file = newFile;
                track.name = meta.title || track.name;
                track.artist = meta.artist || 'UNKNOWN ARTIST';
                track.album = meta.album || 'Unknown Album';
                track.genre = meta.genre || '';       // Trống -> để trắng thật sự, không giữ lại giá trị cũ
                track.composer = meta.composer || ''; // Trống -> để trắng thật sự, không giữ lại giá trị cũ
                track.lyrics = meta.lyric ? parseLRC(meta.lyric) : null;
                track.lyricsRaw = meta.lyric || "";
                track._metaLoading = false;
                track._metaLoaded = true;
                track._bgCoverChecked = true;
                track._metaFromCache = true;
                track._unsavedLocalEdit = !persisted;
                if (typeof window.__saveTrackMetaToCache === 'function') {
                    try { window.__saveTrackMetaToCache(track); } catch (e) {}
                }

                URL.revokeObjectURL(track.url);
                track.url = URL.createObjectURL(newFile);
                audio.src = track.url;

                // Không ghi thẳng được vào file gốc -> tự động tải file đã cập nhật thẻ về
                // máy, để người dùng không mất thay đổi khi tải lại trang / mở lại file gốc.
                if (!persisted) {
                    const dlUrl = URL.createObjectURL(taggedBlob);
                    const a = document.createElement('a');
                    a.href = dlUrl;
                    a.download = newFile.name;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
                }

                return { ok: true, persisted };
            } catch (err) {
                console.error("Lỗi biên soạn tag ID3:", err);
                return { ok: false, persisted: false };
            }
        }


        // --- STREAMING_CHUNK:Preparing the Interactive Thumbnail Cropper... ---
        // --- HỆ THỐNG THUMBNAIL EDITOR (CẮT & XOAY) ---
        const thumbnailEditorModal = document.getElementById('thumbnail-editor-modal');
        const thumbEditorClose = document.getElementById('thumb-editor-close');
        const thumbEditorPreview = document.getElementById('thumb-editor-preview');
        const thumbEditorPlaceholder = document.getElementById('thumb-editor-placeholder');
        
        const btnThumbUpload = document.getElementById('btn-thumb-upload');
        const btnThumbDelete = document.getElementById('btn-thumb-delete');
        const btnThumbCancel = document.getElementById('btn-thumb-cancel');

        const thumbFileInput = document.getElementById('thumb-file-input');
        const cropRotateModal = document.getElementById('crop-rotate-modal');
        const cropCanvas = document.getElementById('crop-canvas');
        const cropZoomSlider = document.getElementById('crop-zoom-slider');
        const btnCropRotate = document.getElementById('btn-crop-rotate');
        const btnCropCancel = document.getElementById('btn-crop-cancel');
        const btnCropOk = document.getElementById('btn-crop-ok');

        const saveThumbConfirmModal = document.getElementById('save-thumb-confirm-modal');
        const saveThumbPreview = document.getElementById('save-thumb-preview');
        const btnSaveThumbCancel = document.getElementById('btn-save-thumb-cancel');
        const btnSaveThumbOk = document.getElementById('btn-save-thumb-ok');

        let cropImg = new Image();
        let zoomValue = 1;
        let rotationDegrees = 0; 
        let panX = 0, panY = 0;
        let isDraggingCrop = false;
        let startDragX = 0, startDragY = 0;
        let currentCroppedDataUrl = null;

        btnEditThumbnail.addEventListener('click', () => {
            editOptionsModal.classList.remove('open');
            thumbnailEditorModal.classList.add('open');
            
            const track = playlist[currentIndex];
            if (track && track.cover) {
                thumbEditorPreview.src = track.cover;
                thumbEditorPreview.style.display = 'block';
                thumbEditorPlaceholder.style.display = 'none';
                btnThumbDelete.style.display = 'inline-flex'; 
            } else {
                thumbEditorPreview.style.display = 'none';
                thumbEditorPlaceholder.style.display = 'block';
                btnThumbDelete.style.display = 'none';
            }
        });

        thumbEditorClose.addEventListener('click', () => thumbnailEditorModal.classList.remove('open'));
        btnThumbCancel.addEventListener('click', () => thumbnailEditorModal.classList.remove('open'));

        btnThumbDelete.addEventListener('click', async () => {
            const track = playlist[currentIndex];
            if (!track) return;
            
            if (await confirmDialog(currentLangDict['thumbnail.delete_confirm'] || "Bạn có chắc chắn muốn xoá ảnh thumbnail của bài hát này?", currentLangDict['thumbnail.delete'] || "Xoá thumbnail", currentLangDict['misc.confirm'])) {
                track.cover = null;
                track.newCoverBuffer = null;
                if (playlist[currentIndex] === track) refreshDynamicAccent(track);

                const result = await writeAudioMetadata({
                    title: track.name,
                    artist: track.artist,
                    album: track.album,
                    genre: track.genre,
                    composer: track.composer,
                    lyric: track.lyricsRaw
                });

                if (result.ok) {
                    thumbEditorPreview.style.display = 'none';
                    thumbEditorPlaceholder.style.display = 'block';
                    btnThumbDelete.style.display = 'none';
                    artImg.classList.add('hidden');
                    artPlaceholder.classList.remove('hidden');
                    bgPreview.style.backgroundImage = 'none';
                    updatePlaylistUI();
                    if(typeof updatePiPUI === 'function') updatePiPUI();
                    showToast(result.persisted
                        ? (currentLangDict['thumbnail.delete_success_overwrite'] || "Đã xoá thumbnail và ghi đè trực tiếp vào file gốc thành công!")
                        : (currentLangDict['thumbnail.delete_success_download'] || "Đã xoá thumbnail. Trình duyệt không có quyền ghi thẳng vào file gốc nên file MP3 đã cập nhật được tự động tải về máy — hãy dùng file vừa tải để thay thế file gốc nếu cần lưu vĩnh viễn."));
                } else {
                    showToast(currentLangDict['thumbnail.delete_error'] || "Lỗi xảy ra trong khi xoá thumbnail.");
                }
            }
        });

        btnThumbUpload.addEventListener('click', () => thumbFileInput.click());

        thumbFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                cropImg.onload = () => {
                    thumbnailEditorModal.classList.remove('open');
                    cropRotateModal.classList.add('open');
                    
                    zoomValue = 1;
                    cropZoomSlider.value = 1;
                    rotationDegrees = 0;
                    panX = 0;
                    panY = 0;
                    
                    drawCropCanvas();
                };
                cropImg.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            thumbFileInput.value = ''; 
        });

        // Khung cắt vuông FRAME (px preview) nằm giữa canvas 300x300. Ảnh luôn được phủ kín khung (kiểu "cover"), không lộ nền.
        const CROP_SIZE = 300, CROP_MARGIN = 20, CROP_FRAME = CROP_SIZE - CROP_MARGIN * 2;
        // Tỉ lệ phủ kín khung (ảnh xoay 90° vẫn có cạnh nhỏ nhất như cũ)
        function cropBaseScale() {
            const w = cropImg.naturalWidth || cropImg.width, h = cropImg.naturalHeight || cropImg.height;
            return CROP_FRAME / Math.min(w, h);
        }
        // Giữ ảnh luôn phủ kín khung sau khi kéo/phóng/xoay
        function clampCropPan() {
            const w = cropImg.naturalWidth || cropImg.width, h = cropImg.naturalHeight || cropImg.height;
            const sc = cropBaseScale() * zoomValue;
            const swap = rotationDegrees % 180 !== 0;
            const rw = (swap ? h : w) * sc, rh = (swap ? w : h) * sc;
            const mx = Math.max(0, (rw - CROP_FRAME) / 2), my = Math.max(0, (rh - CROP_FRAME) / 2);
            panX = Math.min(mx, Math.max(-mx, panX));
            panY = Math.min(my, Math.max(-my, panY));
        }
        function drawCropCanvas() {
            const ctx = cropCanvas.getContext('2d');
            const cw = cropCanvas.width = CROP_SIZE;
            const ch = cropCanvas.height = CROP_SIZE;
            clampCropPan();

            ctx.clearRect(0, 0, cw, ch);
            ctx.save();
            ctx.translate(cw / 2 + panX, ch / 2 + panY);
            ctx.rotate((rotationDegrees * Math.PI) / 180);
            const sc = cropBaseScale() * zoomValue;
            const w = cropImg.naturalWidth || cropImg.width, h = cropImg.naturalHeight || cropImg.height;
            ctx.drawImage(cropImg, -w * sc / 2, -h * sc / 2, w * sc, h * sc);
            ctx.restore();

            // Phần ngoài khung được làm tối, khung có viền + góc bo
            const primary = (getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary') || '#d0bcff').trim() || '#d0bcff';
            const R = 16;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, cw, ch);
            ctx.roundRect(CROP_MARGIN, CROP_MARGIN, CROP_FRAME, CROP_FRAME, R);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill('evenodd');
            ctx.restore();
            ctx.strokeStyle = primary;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(CROP_MARGIN, CROP_MARGIN, CROP_FRAME, CROP_FRAME, R);
            ctx.stroke();
        }

        cropZoomSlider.addEventListener('input', (e) => {
            zoomValue = parseFloat(cropZoomSlider.value) || 1;
            drawCropCanvas();
        });

        btnCropRotate.addEventListener('click', () => {
            rotationDegrees = (rotationDegrees + 90) % 360;
            drawCropCanvas();
        });

        const registerDragEvents = (element) => {
            let sx = 0, sy = 0, spx = 0, spy = 0;
            const ratio = () => { const r = cropCanvas.getBoundingClientRect(); return r.width ? cropCanvas.width / r.width : 1; };
            const onStart = (clientX, clientY) => {
                isDraggingCrop = true;
                sx = clientX; sy = clientY; spx = panX; spy = panY;
            };
            const onMove = (clientX, clientY) => {
                if (!isDraggingCrop) return;
                const k = ratio();
                panX = spx + (clientX - sx) * k;
                panY = spy + (clientY - sy) * k;
                drawCropCanvas();
            };
            const onEnd = () => isDraggingCrop = false;

            element.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
            window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
            window.addEventListener('mouseup', onEnd);

            element.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
            });
            window.addEventListener('touchmove', (e) => {
                if (isDraggingCrop && e.touches.length === 1) {
                    e.preventDefault();
                    onMove(e.touches[0].clientX, e.touches[0].clientY);
                }
            }, { passive: false });
            window.addEventListener('touchend', onEnd);
        };
        registerDragEvents(cropCanvas);

        btnCropCancel.addEventListener('click', () => {
            cropRotateModal.classList.remove('open');
            thumbnailEditorModal.classList.add('open');
        });

        btnCropOk.addEventListener('click', () => {
            // Xuất đúng vùng trong khung ở độ phân giải gốc của ảnh (không vượt 4096, không nhỏ hơn 300)
            const w = cropImg.naturalWidth || cropImg.width, h = cropImg.naturalHeight || cropImg.height;
            clampCropPan();
            const nativePerFrame = 1 / (cropBaseScale() * zoomValue);        // px ảnh gốc ứng với 1px khung
            const OUT = Math.round(Math.min(4096, Math.max(300, CROP_FRAME * nativePerFrame)));
            const k = OUT / CROP_FRAME;                                       // hệ số phóng từ khung -> ảnh xuất
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = OUT;
            finalCanvas.height = OUT;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.imageSmoothingQuality = 'high';
            finalCtx.fillStyle = '#000';
            finalCtx.fillRect(0, 0, OUT, OUT);
            finalCtx.save();
            finalCtx.translate(OUT / 2 + panX * k, OUT / 2 + panY * k);
            finalCtx.rotate((rotationDegrees * Math.PI) / 180);
            const sc = cropBaseScale() * zoomValue * k;
            finalCtx.drawImage(cropImg, -w * sc / 2, -h * sc / 2, w * sc, h * sc);
            finalCtx.restore();

            currentCroppedDataUrl = finalCanvas.toDataURL('image/jpeg', 0.92);
            
            cropRotateModal.classList.remove('open');
            saveThumbConfirmModal.classList.add('open');
            saveThumbPreview.src = currentCroppedDataUrl;
        });

        btnSaveThumbCancel.addEventListener('click', () => {
            saveThumbConfirmModal.classList.remove('open');
            cropRotateModal.classList.add('open');
        });

        btnSaveThumbOk.addEventListener('click', async () => {
            saveThumbConfirmModal.classList.remove('open');
            
            const track = playlist[currentIndex];
            if (!track || !currentCroppedDataUrl) return;

            const response = await fetch(currentCroppedDataUrl);
            const arrayBuffer = await response.arrayBuffer();

            track.newCoverBuffer = arrayBuffer;
            track.cover = currentCroppedDataUrl;
            if (playlist[currentIndex] === track && !audio.paused) refreshDynamicAccent(track);

            const result = await writeAudioMetadata({
                title: track.name,
                artist: track.artist,
                album: track.album,
                genre: track.genre,
                composer: track.composer,
                lyric: track.lyricsRaw
            });

            if (result.ok) {
                artImg.src = track.cover;
                artImg.classList.remove('hidden');
                artPlaceholder.classList.add('hidden');
                bgPreview.style.backgroundImage = `url(${track.cover})`;
                
                updatePlaylistUI();
                if(typeof updatePiPUI === 'function') updatePiPUI();
                showToast(result.persisted
                    ? (currentLangDict['thumbnail.save_success_overwrite'] || "Đã lưu thumbnail và ghi đè trực tiếp vào file gốc thành công!")
                    : (currentLangDict['thumbnail.save_success_download'] || "Đã lưu thumbnail. Trình duyệt không có quyền ghi thẳng vào file gốc nên file MP3 đã cập nhật được tự động tải về máy — hãy dùng file vừa tải để thay thế file gốc nếu cần lưu vĩnh viễn."));
            } else {
                showToast(currentLangDict['thumbnail.save_error'] || "Xảy ra lỗi trong khi biên dịch thumbnail.");
            }
        });



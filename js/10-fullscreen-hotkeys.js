        // --- STREAMING_CHUNK:Configuring Immersive Fullscreen and Idle mode... ---
        // --- HỆ THỐNG CHẾ ĐỘ TOÀN MÀN HÌNH CHUYÊN NGHIỆP (IMMERSIVE FULLSCREEN) ---
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        const fsStageOverlay = document.getElementById('fs-stage-overlay');
        const fsCoverImg = document.getElementById('fs-cover-img');
        const fsCoverPlaceholder = document.getElementById('fs-cover-placeholder');
        const fsTitle = document.getElementById('fs-title');
        const fsArtist = document.getElementById('fs-artist');
        const fsLyric = document.getElementById('fs-lyric');

        let fsIdleTimer = null;

        // Trượt thanh Media xuống khi chuột đứng yên quá 5s (và tự ẩn luôn con trỏ chuột)
        function startFsIdleTimer() {
            clearTimeout(fsIdleTimer);
            const shell = document.querySelector('.player-shell');
            shell.classList.remove('controls-hidden');
            document.body.classList.remove('fs-cursor-hidden');
            if (document.body.classList.contains('fullscreen-active')) {
                fsIdleTimer = setTimeout(() => {
                    shell.classList.add('controls-hidden');
                    document.body.classList.add('fs-cursor-hidden');
                }, 5000); 
            }
        }

        function resetFsIdleTimer(e) {
            // Video: sau khi bấm vào khung phát để ẩn, chỉ khi chuột thật sự di chuyển mới hiện lại
            if (e && e.type === 'click' && fsClickHidden) return;
            if (e && e.type === 'mousemove' && fsClickHidden && !e.movementX && !e.movementY) return;
            fsClickHidden = false;
            startFsIdleTimer();
        }
        let fsClickHidden = false;
        // Video ở Full screen: bấm 1 lần vào khung phát (trừ thanh media control và nút Full screen) -> ẩn control + con trỏ
        document.addEventListener('click', (e) => {
            const b = document.body;
            if (!b.classList.contains('fullscreen-active') || !b.classList.contains('has-video')) return;
            if (e.target.closest('.player-shell, #fullscreen-btn')) return;
            if (!e.target.closest('.visual-stage')) return;
            clearTimeout(fsIdleTimer);
            fsClickHidden = true;
            document.querySelector('.player-shell').classList.add('controls-hidden');
            b.classList.add('fs-cursor-hidden');
        });

        async function toggleFullscreen() {
            const container = document.documentElement;
            if (!document.fullscreenElement) {
                try {
                    await container.requestFullscreen();
                    document.body.classList.add('fullscreen-active');
                    fsStageOverlay.classList.remove('hidden');
                    fullscreenBtn.querySelector('span').innerText = 'fullscreen_exit';
                    
                    // Ẩn lời bài hát dạng top khi vào toàn màn hình để tránh chồng chéo
                    document.getElementById('top-active-lyric').style.opacity = '0';
                    
                    updateFsUI();
                    startFsIdleTimer();
                    
                    window.addEventListener('mousemove', resetFsIdleTimer);
                    window.addEventListener('click', resetFsIdleTimer);
                } catch (err) {
                    console.error("Lỗi Fullscreen:", err);
                }
            } else {
                document.exitFullscreen();
            }
        }

        // --- SCREEN WAKE LOCK: giữ màn hình không tự tắt/khoá khi đang ở Full screen ---
        let wakeLockSentinel = null;

        async function requestWakeLock() {
            if (!('wakeLock' in navigator)) return;
            try {
                wakeLockSentinel = await navigator.wakeLock.request('screen');
                wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
            } catch (err) {
                console.warn('Không xin được Wake Lock:', err);
            }
        }

        async function releaseWakeLock() {
            if (wakeLockSentinel) {
                try { await wakeLockSentinel.release(); } catch (err) { /* đã tự nhả rồi thì bỏ qua */ }
                wakeLockSentinel = null;
            }
        }

        // Trình duyệt tự nhả Wake Lock khi tab bị ẩn đi (đổi tab, thu nhỏ...) theo đúng
        // chuẩn API -> xin lại ngay khi tab hiện lại nếu vẫn đang ở Full screen và setting đang bật
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && document.body.classList.contains('fullscreen-active')
                && settings.wakeLockEnabled && !wakeLockSentinel) {
                requestWakeLock();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove('fullscreen-active');
                fsStageOverlay.classList.add('hidden');
                fullscreenBtn.querySelector('span').innerText = 'fullscreen';
                document.getElementById('top-active-lyric').style.opacity = '1';
                
                const shell = document.querySelector('.player-shell');
                shell.classList.remove('controls-hidden');
                document.body.classList.remove('fs-cursor-hidden');
                
                clearTimeout(fsIdleTimer);
                window.removeEventListener('mousemove', resetFsIdleTimer);
                window.removeEventListener('click', resetFsIdleTimer);

                // Thoát Full screen: khôi phục đúng theme người dùng đã cài đặt trong Settings
                applyTheme(settings.theme);

                // Thoát Full screen thì luôn nhả Wake Lock, bất kể setting đang bật hay tắt
                releaseWakeLock();
            } else {
                // Vào Full screen: ép tạm sang chế độ Tối để xem cho đẹp/dịu mắt hơn, KHÔNG
                // đụng vào settings.theme hay localStorage -> thoát ra là tự trả lại theme gốc
                applyTheme('dark');

                // Vào Full screen: xin Wake Lock nếu setting "Luôn bật màn hình" đang bật
                if (settings.wakeLockEnabled) requestWakeLock();
            }
        });

        fullscreenBtn.addEventListener('click', toggleFullscreen);

        function updateFsUI() {
            if (!document.body.classList.contains('fullscreen-active') && !document.documentElement.classList.contains('m-ui')) return;
            const track = playlist[currentIndex];
            if (track) {
                fsTitle.innerText = track.name;
                fsArtist.innerText = track.artist;
                if (track.cover) {
                    fsCoverImg.style.display = 'none';
                    fsCoverPlaceholder.style.display = 'flex';
                    fsCoverImg.onload = () => {
                        fsCoverImg.style.display = 'block';
                        fsCoverPlaceholder.style.display = 'none';
                    };
                    fsCoverImg.onerror = () => {
                        fsCoverImg.style.display = 'none';
                        fsCoverPlaceholder.style.display = 'flex';
                    };
                    fsCoverImg.src = track.cover;
                } else {
                    fsCoverImg.onload = null;
                    fsCoverImg.onerror = null;
                    fsCoverImg.style.display = 'none';
                    fsCoverPlaceholder.style.display = 'flex';
                }
            } else {
                fsTitle.innerText = "Studio Standby";
                fsArtist.innerText = "ENGINE IDLE | SYSTEM";
                fsCoverImg.style.display = 'none';
                fsCoverPlaceholder.style.display = 'flex';
                fsLyric.innerHTML = "";
            }
        }


        // --- STREAMING_CHUNK:Registering global Keyboard Hotkeys... ---
        // --- ĐĂNG KÝ HỆ THỐNG PHÍM TẮT ĐIỀU KHIỂN ---
        const TEXT_INPUT_TYPES = ['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number'];
        function isTypingOrMenuTarget(e) {
            const path = e.composedPath ? e.composedPath() : [e.target];
            for (const n of path) {
                if (!n || n.nodeType !== 1) continue;
                const tag = n.tagName;
                if (tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable) return true;
                if (tag === 'INPUT' && TEXT_INPUT_TYPES.includes((n.getAttribute('type') || '').toLowerCase())) return true;
                if (/^MD-(OUTLINED-|FILLED-)?TEXT-FIELD$|^MD-(MENU|MENU-ITEM|SELECT|SELECT-OPTION|DIALOG)$/.test(tag)) return true;
            }
            return false;
        }
        // Space trên nút đang focus: ngăn trình duyệt kích hoạt nút khi nhả phím (phím tắt đã xử lý ở keydown)
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && !isTypingOrMenuTarget(e) && !document.querySelector('.cl-overlay.open') && !document.querySelector('.overlay:not(.hidden)')) e.preventDefault();
        });

        window.addEventListener('keydown', (e) => {
            // Phím F11: Chặn Full screen mặc định của trình duyệt, dùng chế độ
            // Toàn màn hình Immersive riêng của app thay thế
            if (e.key === 'F11' || e.code === 'F11') {
                e.preventDefault();
                toggleFullscreen();
                return;
            }

            // Ctrl + F: vào ô tìm kiếm playlist (trong chế độ sắp xếp thì tìm kiểu Ctrl + F)
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyF' || (e.key || '').toLowerCase() === 'f')
                && !document.querySelector('.cl-overlay.open') && !document.querySelector('.overlay:not(.hidden)')) {
                e.preventDefault();
                if (playlistCard.classList.contains('collapsed')) togglePlaylist();
                playlistSearch.focus({ preventScroll: true });
                playlistSearch.select();
                return;
            }

            // Alt + F: mở Settings
            if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.code === 'KeyF')
                && !document.querySelector('.cl-overlay.open') && !document.querySelector('.overlay:not(.hidden)')) {
                e.preventDefault();
                settingsBtn.click();
                return;
            }

            // Chặn phím tắt khi đang nhập liệu (ô văn bản) hoặc đang thao tác trong menu / hộp thoại.
            // Các phần tử khác (thanh âm lượng, nút bấm, thanh tua...) KHÔNG chặn: phím tắt vẫn hoạt động
            // và thay thế thao tác mặc định của phần tử đó (vd: Space trên nút, mũi tên trên thanh trượt).
            if (isTypingOrMenuTarget(e)) return;
            if (document.querySelector('.cl-overlay.open') || document.querySelector('.overlay:not(.hidden)')) {
                return;
            }

            // Phím Space: Play/Pause
            if (e.code === 'Space') {
                e.preventDefault();
                playBtn.click();
            } 
            // Phím Ctrl + O: Mở file
            else if (e.ctrlKey && e.code === 'KeyO') {
                e.preventDefault();
                window.__openAddMenuAtMouse();
            } 
            // Phím Ctrl + Mũi tên Phải: Chuyển sang bài tiếp theo
            else if (e.ctrlKey && e.code === 'ArrowRight') {
                e.preventDefault();
                document.getElementById('next-btn').click();
            }
            // Phím Ctrl + Mũi tên Trái: Chuyển về bài trước đó
            else if (e.ctrlKey && e.code === 'ArrowLeft') {
                e.preventDefault();
                document.getElementById('prev-btn').click();
            }
            // Phím Mũi tên Phải: Tua tiến 5 giây
            else if (e.code === 'ArrowRight') {
                e.preventDefault();
                audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
            } 
            // Phím Mũi tên Trái: Tua lùi 5 giây
            else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                audio.currentTime = Math.max(0, audio.currentTime - 5);
            } 
            // Phím Mũi tên Lên/Xuống: Điều chỉnh mức âm lượng
            else if (e.code === 'ArrowUp') {
                e.preventDefault();
                volumeSlider.value = Math.min(100, parseInt(volumeSlider.value, 10) + 5);
                volumeSlider.dispatchEvent(new Event('input'));
            }
            else if (e.code === 'ArrowDown') {
                e.preventDefault();
                volumeSlider.value = Math.max(0, parseInt(volumeSlider.value, 10) - 5);
                volumeSlider.dispatchEvent(new Event('input'));
            }
            // Phím M: Mute/Unmute thông minh
            else if (e.code === 'KeyM') {
                e.preventDefault();
                toggleMute();
            }
        });

        // --- XỬ LÝ HIỂN THỊ KHUNG BÁO LỖI KHI TỆP ÂM THANH / VIDEO BỊ HỎNG ---
        (function setupPlaybackErrorUI() {
            const errTitleEl = document.getElementById('playback-error-title');
            const errDescEl = document.getElementById('playback-error-desc');

            let playbackErrorCode = '';
            function updatePlaybackErrorText() {
                if (!document.body.classList.contains('has-playback-error')) return;
                const codeEl = document.getElementById('playback-error-code');
                if (codeEl) {
                    const ct = (typeof currentLangDict !== 'undefined' && currentLangDict['player.error_code'])
                        || (/^en/i.test(localStorage.getItem('settings_language') || '') ? 'Error code: {code}' : 'Mã lỗi: {code}');
                    codeEl.textContent = ct.replace('{code}', playbackErrorCode);
                }
                const track = playlist[currentIndex];
                const fileName = (track && track.file && track.file.name) ? track.file.name : (track ? track.name : '');
                const isEn = /^en/i.test(localStorage.getItem('settings_language') || '');

                if (errTitleEl) {
                    errTitleEl.textContent = (typeof currentLangDict !== 'undefined' && currentLangDict['player.error_title'])
                        || (isEn ? 'Playback error' : 'Lỗi khi phát');
                }
                if (errDescEl) {
                    const tpl = (typeof currentLangDict !== 'undefined' && currentLangDict['player.error_desc'])
                        || (isEn
                            ? '“{name}” may not be supported. Playback may experience some issues.'
                            : '“{name}” có thể không được hỗ trợ. Quá trình phát có thể gặp một số vấn đề.');
                    errDescEl.textContent = tpl.replace('{name}', fileName);
                }
            }

            // Khi bắt đầu nạp bài mới hoặc phát thành công -> tắt khung lỗi và hiện lại sóng nhạc
            audio.addEventListener('loadstart', () => {
                document.body.classList.remove('has-playback-error');
            });
            audio.addEventListener('loadedmetadata', () => {
                document.body.classList.remove('has-playback-error');
            });

            // Khi tệp âm thanh/video bị lỗi giải mã hoặc không hỗ trợ
            audio.addEventListener('error', () => {
                if (!audio.getAttribute('src') || currentIndex === -1 || !playlist[currentIndex]) return;
                setPlayBtnLoading(false);
                playBtn.querySelector('span').innerText = 'play_arrow';
                pauseOverlay.classList.remove('visible');
                document.body.classList.remove('has-video');
                document.body.classList.add('has-playback-error');
                // Mã lỗi: tên chuẩn của MediaError + mã chi tiết do trình duyệt báo (nếu có), vd. MEDIA_ERR_SRC_NOT_SUPPORTED (4) · DEMUXER_ERROR_COULD_NOT_OPEN
                const MEDIA_ERR = { 1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK', 3: 'MEDIA_ERR_DECODE', 4: 'MEDIA_ERR_SRC_NOT_SUPPORTED' };
                const me = audio.error;
                let code = me ? ((MEDIA_ERR[me.code] || 'MEDIA_ERR_UNKNOWN') + ' (' + me.code + ')') : 'MEDIA_ERR_UNKNOWN';
                const detail = me && me.message ? me.message.split(':')[0].trim() : '';
                if (detail && /^[A-Z0-9_]{6,}$/.test(detail)) code += ' · ' + detail;
                playbackErrorCode = code;
                updatePlaybackErrorText();
            });

            // Đồng bộ lại câu chữ nếu người dùng đổi ngôn ngữ trong Cài đặt
            const langSel = document.getElementById('setting-language');
            if (langSel) langSel.addEventListener('change', () => setTimeout(updatePlaybackErrorText, 100));
        })();

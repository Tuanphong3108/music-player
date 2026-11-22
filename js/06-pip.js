        // --- HỆ THỐNG CUSTOM PICTURE-IN-PICTURE (NEW) ---
        const pipBtn = document.getElementById('pip-btn');
        let pipTargetMenuIndex = -1; 

        function renderPipPlaylist() {
            if (!customPipWindow) return;
            const container = customPipWindow.document.getElementById('pip-playlist-container');
            if (!container) return;
            container.innerHTML = '';
            playlist.forEach((track, index) => {
                const item = customPipWindow.document.createElement('div');
                item.className = `pip-song-item ${index === currentIndex ? 'active' : ''}`;
                item.innerHTML = `
                    <span class="material-symbols-rounded" style="font-size: 18px">${index === currentIndex && !audio.paused ? 'graphic_eq' : 'music_note'}</span>
                    <div class="pip-song-info">
                        <div class="pip-song-name">${track.name}</div>
                        <div class="pip-song-artist">${track.artist}</div>
                    </div>
                `;
                item.onclick = () => playTrack(index);
                
                item.oncontextmenu = (e) => {
                    e.preventDefault();
                    pipTargetMenuIndex = index;
                    customPipWindow.document.getElementById('pip-cm-title').innerText = track.name;
                    customPipWindow.document.getElementById('pip-cm-overlay').classList.add('open');
                    customPipWindow.document.getElementById('pip-context-menu').classList.add('open');
                };

                container.appendChild(item);
            });
        }

        // --- PiP + video: hình lấy từ captureStream() của thẻ phát chính (thẻ gốc vẫn phát, PiP chỉ là bản xem) ---
        let pipSeeking = false;
        function updatePipSeek() {
            if (!customPipWindow) return;
            const d = customPipWindow.document, sk = d.getElementById('pip-seek');
            if (!sk) return;
            if (!pipSeeking) sk.value = audio.duration ? (audio.currentTime / audio.duration) * 1000 : 0;
            d.getElementById('pip-cur').innerText = formatTime(audio.currentTime, audio.duration);
            d.getElementById('pip-dur').innerText = formatTime(audio.duration, audio.duration);
        }
        let pipVideoSrc = '';        // nguồn đang gắn vào PiP, để chỉ đổi stream/kích thước khi đổi bài
        let pipSizedForVideo = false; // cửa sổ đã được chỉnh theo khung video (để trả lại 320x320 khi hết video)
        function pipVideoSize() {
            let w = 480, h = Math.round(w * audio.videoHeight / audio.videoWidth);
            if (h > 560) { h = 560; w = Math.round(h * audio.videoWidth / audio.videoHeight); }
            return [Math.max(w, 280), Math.max(h, 160)];
        }
        function pipSyncVideo(forceResize) {
            if (!customPipWindow) return;
            const doc = customPipWindow.document;
            const v = doc.getElementById('pip-video');
            if (!v) return;
            const on = !!(playlist[currentIndex] && playlist[currentIndex].isVideo) && audio.videoWidth > 0;
            doc.body.classList.toggle('pip-video', on);
            if (on) {
                const key = audio.currentSrc;
                const changed = key !== pipVideoSrc;
                if (changed) {
                    pipVideoSrc = key;
                    try { v.srcObject = audio.captureStream ? audio.captureStream() : null; v.play().catch(() => {}); } catch (e) { console.warn('PiP video:', e); }
                }
                if ((changed || forceResize) && !doc.body.classList.contains('pip-expanded')) {
                    try { const [w, h] = pipVideoSize(); customPipWindow.resizeTo(w, h); pipSizedForVideo = true; } catch (e) {}
                }
            } else {
                if (pipVideoSrc) { pipVideoSrc = ''; v.srcObject = null; }
                if (pipSizedForVideo && !doc.body.classList.contains('pip-expanded')) {
                    pipSizedForVideo = false;
                    try { customPipWindow.resizeTo(320, 320); } catch (e) {}
                }
            }
        }

        function updatePiPUI() {
            if (!customPipWindow) return;
            const doc = customPipWindow.document;
            const track = playlist[currentIndex];
            
            const titleEl = doc.getElementById('pip-title');
            const artistEl = doc.getElementById('pip-artist');
            const bgEl = doc.getElementById('pip-bg');
            const playSpan = doc.getElementById('pip-play-btn').querySelector('span');
            const shuffleBtn = doc.getElementById('pip-shuffle-btn');
            const repeatBtn = doc.getElementById('pip-repeat-btn');
            const repeatBadge = doc.getElementById('pip-repeat-badge');
            const pipLyricEl = doc.getElementById('pip-lyric');

            if (track) {
                titleEl.innerText = track.name;
                artistEl.innerText = track.artist;
                if (track.cover) {
                    bgEl.style.backgroundImage = `url(${track.cover})`;
                    bgEl.innerHTML = '';
                } else {
                    bgEl.style.backgroundImage = 'none';
                    bgEl.innerHTML = '<span class="material-symbols-rounded" style="font-size: 120px; color: rgba(255,255,255,0.15)">music_note</span>';
                }
            } else {
                titleEl.innerText = currentLangDict['player.no_track'] || 'Chưa có bài hát';
                artistEl.innerText = 'Studio Standby';
                bgEl.style.backgroundImage = 'none';
                bgEl.innerHTML = '<span class="material-symbols-rounded" style="font-size: 120px; color: rgba(255,255,255,0.15)">music_note</span>';
            }

            if (pipLyricEl) {
                pipLyricEl.style.display = settings.showPipLyric ? 'flex' : 'none';
            }

            playSpan.innerText = audio.paused ? 'play_arrow' : 'pause';
            
            shuffleBtn.classList.toggle('active', isShuffle);
            repeatBtn.classList.toggle('active', repeatMode > 0);
            repeatBadge.innerText = repeatMode === 2 ? '1' : '';
            { const ic = repeatBtn.querySelector('.material-symbols-rounded'); if (ic) ic.textContent = repeatMode === 2 ? 'repeat_one' : 'repeat'; }

            const playlistSection = doc.getElementById('pip-playlist-section');
            if (playlistSection && playlistSection.style.display !== 'none') {
                renderPipPlaylist();
            }
            pipSyncVideo(false);
        }

        pipBtn.addEventListener('click', async () => {
            if (!('documentPictureInPicture' in window)) {
                showToast(currentLangDict['pip.not_supported'] || 'Trình duyệt của bạn chưa hỗ trợ Document Picture-in-Picture. (Thử dùng Chrome mới nhất nhé!)');
                return;
            }

            if (customPipWindow) {
                customPipWindow.close();
                return;
            }

            try {
                const pipInitVideo = !!(playlist[currentIndex] && playlist[currentIndex].isVideo) && audio.videoWidth > 0;
                const [pipW0, pipH0] = pipInitVideo ? pipVideoSize() : [320, 320];
                customPipWindow = await window.documentPictureInPicture.requestWindow({ width: pipW0, height: pipH0 });

                try {
                    const screenW = window.screen.availWidth;
                    const screenH = window.screen.availHeight;
                    customPipWindow.moveTo(screenW - 340, screenH - 340);
                } catch(e) { console.warn("Hệ điều hành này không cho ép góc PiP programmatically."); }

                const pipDoc = customPipWindow.document;
                setTimeout(() => applyFontToDoc(pipDoc), 0);

                const style = pipDoc.createElement('style');
                style.textContent = `
                    @import url('https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@100..1000&display=swap');
                    @import url('https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght,ROND@100..1000,0..100&display=swap');
                    @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
                    
                    * { box-sizing: border-box; outline: none; -webkit-tap-highlight-color: transparent; }
                    body { 
                        margin: 0; padding: 0; width: 100%; height: 100vh;
                        font-family: var(--app-font); 
                        background: var(--pip-surface, #1C1B1F); color: #E6E1E5; 
                        overflow: hidden; user-select: none;
                        display: flex; flex-direction: column;
                    }
                    .pip-bg { 
                        position: fixed; inset: 0; z-index: 1;
                        background-size: cover; background-position: center;
                        filter: brightness(0.4); 
                        display: flex; justify-content: center; align-items: center;
                    }
                    .pip-player-section {
                        height: 100%; flex-shrink: 0; position: relative; z-index: 2;
                        display: flex; flex-direction: column; justify-content: space-between;
                        padding: 32px 24px; transition: height 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                    }
                    .pip-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
                    .pip-header-content { flex: 1; display: flex; flex-direction: column; align-items: center; overflow: hidden; }
                    .pip-title { 
                        font-size: calc(16px * var(--font-scale-factor, 1)); font-weight: 700; margin: 0; width: 100%; text-align: center;
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                        text-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    }
                    .pip-artist {
                        font-size: calc(10px * var(--font-scale-factor, 1)); font-weight: 400; margin: 4px 0 0; width: 100%; text-align: center; opacity: 0.7;
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                        font-family: 'Minecraft', sans-serif; text-transform: uppercase;
                    }
                    .pip-lyric {
                        flex: 1; display: ${settings.showPipLyric ? 'flex' : 'none'}; flex-direction: column; align-items: center; justify-content: center;
                        text-align: center; font-size: calc(16px * var(--font-scale-factor, 1)); font-weight: 700; color: var(--pip-primary, #D0BCFF);
                        padding: 0 16px; text-shadow: 0 2px 8px rgba(0,0,0,0.8);
                        overflow: hidden;
                        margin: 12px 0;
                    }
                    .bouncing-dots { display: inline-flex; align-items: flex-end; justify-content: center; height: 1em; gap: 4px; }
                    .bouncing-dots .dot { animation: dot-jump 1s infinite; font-size: 1.2em; line-height: 0.5; color: var(--pip-primary, #D0BCFF);}
                    .bouncing-dots .dot:nth-child(2) { animation-delay: 0.2s; }
                    .bouncing-dots .dot:nth-child(3) { animation-delay: 0.4s; }
                    @keyframes dot-jump {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-8px); }
                    }
                    .pip-seek { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }
                    .pip-time { font-size: calc(11px * var(--font-scale-factor, 1)); opacity: .75; min-width: 34px; text-align: center; font-variant-numeric: tabular-nums; }
                    /* Thanh seek của PiP dùng đúng thanh sóng MD3E của trình phát chính */
                    .pip-seek-wrap { position: relative; flex: 1; min-width: 0; height: 28px; }
                    .pip-seek-wrap .seek-wave { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
                    #pip-seek { position: relative; z-index: 1; display: block; width: 100%; height: 28px; margin: 0; padding: 0; cursor: pointer; appearance: none; -webkit-appearance: none; background: transparent; }
                    #pip-seek::-webkit-slider-runnable-track { background: transparent; height: 28px; }
                    #pip-seek::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 6px; height: 28px; border-radius: 3px; background: var(--pip-primary, #D0BCFF); border: none; }
                    body.pip-expanded .pip-player-section { padding: 12px 24px; }
                    .pip-controls { 
                        display: flex; justify-content: center; align-items: center; gap: 8px;
                    }
                    .btn-m3 {
                        background: transparent; border: none; color: #E6E1E5;
                        cursor: pointer; width: 44px; height: 44px; border-radius: 50%;
                        display: flex; align-items: center; justify-content: center; 
                        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                        position: relative;
                    }
                    .btn-m3:hover { background: rgba(255,255,255,0.1); transform: scale(1.1); }
                    .btn-m3:active { transform: scale(0.9); }
                    .btn-m3.active { color: var(--pip-primary, #D0BCFF); background: rgba(255,255,255,0.1); }
                    
                    .btn-play {
                        width: 56px; height: 56px; border-radius: 20px;
                        background: var(--pip-container, #4F378B); color: var(--pip-on-container, #EADDFF);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    }
                    .btn-play:hover { background: var(--pip-primary, #D0BCFF); color: var(--pip-on-primary, #381E72); }
                    
                    .material-symbols-rounded {
                        font-family: 'Material Symbols Rounded';
                        font-weight: normal; font-style: normal; font-size: 24px;
                        font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
                    }
                    .btn-play .material-symbols-rounded { font-size: 32px; font-variation-settings: 'FILL' 1; }
                    .active .material-symbols-rounded { font-variation-settings: 'FILL' 1; }
                    
                    .repeat-badge {
                        position: absolute; font-size: calc(9px * var(--font-scale-factor, 1)); font-weight: 900; 
                        bottom: 6px; right: 6px; background: var(--pip-primary, #D0BCFF); color: var(--pip-on-primary, #381E72);
                        width: 14px; height: 14px; border-radius: 4px; 
                        display: none !important; align-items: center; justify-content: center;
                    }

                    /* Video trong PiP: khung video quyết định kích thước, nút trên/dưới tự ẩn và hiện khi rê chuột vào */
                    .pip-video-el { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; z-index: 1; display: none; }
                    body.pip-video:not(.pip-expanded) .pip-video-el { display: block; }
                    body.pip-video:not(.pip-expanded) .pip-bg { display: none; }
                    body.pip-video:not(.pip-expanded) .pip-player-section { padding: 12px 16px; }
                    body.pip-video:not(.pip-expanded) .pip-player-section::before {
                        content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0; transition: opacity .25s;
                        background: linear-gradient(rgba(0,0,0,.6), transparent 35%, transparent 60%, rgba(0,0,0,.65));
                    }
                    body.pip-video:not(.pip-expanded):hover .pip-player-section::before { opacity: 1; }
                    body.pip-video:not(.pip-expanded) .pip-header, body.pip-video:not(.pip-expanded) .pip-controls, body.pip-video:not(.pip-expanded) .pip-seek { opacity: 0; transition: opacity .25s; }
                    body.pip-video:not(.pip-expanded):hover .pip-header, body.pip-video:not(.pip-expanded):hover .pip-controls, body.pip-video:not(.pip-expanded):hover .pip-seek { opacity: 1; }
                    body.pip-video:not(.pip-expanded) .pip-lyric { justify-content: flex-end; margin: 0 0 4px; pointer-events: none; }
                    .pip-playlist-section {
                        flex: 1; display: none; flex-direction: column; position: relative; z-index: 2;
                        background: rgba(0, 0, 0, 0.4); border-top: 1px solid rgba(255,255,255,0.1);
                        overflow: hidden;
                    }
                    .pip-playlist-header {
                        padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;
                        border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);
                    }
                    .pip-playlist-container {
                        flex: 1; overflow-y: auto; padding: 8px;
                    }
                    .pip-song-item {
                        padding: 10px 12px; border-radius: 12px; display: flex; align-items: center; gap: 12px;
                        cursor: pointer; transition: 0.2s; margin-bottom: 4px;
                    }
                    .pip-song-item:hover { background: rgba(255,255,255,0.1); }
                    .pip-song-item.active { background: var(--pip-container, #4F378B); color: var(--pip-on-container, #EADDFF); }
                    .pip-song-info { display: flex; flex-direction: column; overflow: hidden; }
                    .pip-song-name { font-size: calc(14px * var(--font-scale-factor, 1)); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                    .pip-song-artist { font-size: calc(10px * var(--font-scale-factor, 1)); opacity: 0.7; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                    
                    ::-webkit-scrollbar { width: 6px; }
                    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
                    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }

                    .pip-context-menu {
                        position: absolute; bottom: 0; left: 0; width: 100%;
                        background: #332D41; border-top-left-radius: 20px; border-top-right-radius: 20px;
                        padding: 20px 16px; transform: translateY(100%); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                        z-index: 100; box-shadow: 0 -8px 32px rgba(0,0,0,0.5);
                        display: flex; flex-direction: column; gap: 16px;
                    }
                    .pip-context-menu.open { transform: translateY(0); }
                    .pip-cm-overlay {
                        position: absolute; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
                        z-index: 99; opacity: 0; pointer-events: none; transition: opacity 0.3s;
                    }
                    .pip-cm-overlay.open { opacity: 1; pointer-events: auto; }
                    .pip-cm-title { font-size: calc(15px * var(--font-scale-factor, 1)); font-weight: 700; text-align: center; color: var(--pip-on-container, #EADDFF); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); }
                    .pip-cm-btn {
                        background: rgba(242, 184, 181, 0.1); color: #F2B8B5; border: none;
                        padding: 14px; border-radius: 12px; font-family: inherit; font-size: calc(14px * var(--font-scale-factor, 1)); font-weight: 600;
                        cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
                        transition: background 0.2s;
                    }
                    .pip-cm-btn:active { background: rgba(242, 184, 181, 0.25); }
                `;
                pipDoc.head.appendChild(style);
                applyPipAccent();

                // Document PiP là 1 browsing context THẬT SỰ RIÊNG BIỆT (giống popup window),
                // không tự thừa hưởng custom elements đã đăng ký ở trang chính -> phải import
                // lại @material/web ngay trong document này thì <md-circular-progress> mới
                // render đúng, không thì chỉ là 1 thẻ lạ rỗng không hiển thị gì.
                try {
                    const pipMwcScript = pipDoc.createElement('script');
                    pipMwcScript.type = 'module';
                    pipMwcScript.textContent = "import 'https://esm.run/@material/web/all.js';";
                    pipDoc.head.appendChild(pipMwcScript);
                } catch (mwcErr) {
                    console.warn("Không import được Material Web Components vào cửa sổ PiP:", mwcErr);
                }

                pipDoc.body.innerHTML = `
                    <div id="pip-bg" class="pip-bg"></div>
                    <video id="pip-video" class="pip-video-el" muted playsinline></video>
                    <div class="pip-player-section">
                        <div class="pip-header">
                            <div style="width: 32px;"></div> 
                            <div class="pip-header-content">
                                <h4 id="pip-title" class="pip-title">Studio Standby</h4>
                                <p id="pip-artist" class="pip-artist">ENGINE IDLE | SYSTEM</p>
                            </div>
                            <button class="btn-m3" id="pip-expand-btn" style="width: 32px; height: 32px;" title="Thu gọn/Mở rộng" data-i18n-title="pip.expand"><span class="material-symbols-rounded" style="font-size: 20px;">expand_more</span></button>
                        </div>
                        
                        <div id="pip-lyric" class="pip-lyric"></div>

                        <div class="pip-seek">
                            <span id="pip-cur" class="pip-time">0:00</span>
                            <input type="range" id="pip-seek" min="0" max="1000" step="1" value="0">
                            <span id="pip-dur" class="pip-time">0:00</span>
                        </div>

                        <div class="pip-controls">
                            <button class="btn-m3" id="pip-shuffle-btn" title="Phát ngẫu nhiên" data-i18n-title="player.shuffle"><span class="material-symbols-rounded" style="font-size: 20px;">shuffle</span></button>
                            <button class="btn-m3" id="pip-prev-btn" title="Bài trước" data-i18n-title="player.previous"><span class="material-symbols-rounded">skip_previous</span></button>
                            <button class="btn-m3 btn-play" id="pip-play-btn" title="Phát/Tạm dừng" data-i18n-title="player.play_pause">
                                <span class="material-symbols-rounded">play_arrow</span>
                                <md-circular-progress class="play-btn-spinner" indeterminate style="display:none; --md-circular-progress-size: 24px;"></md-circular-progress>
                            </button>
                            <button class="btn-m3" id="pip-next-btn" title="Bài tiếp theo" data-i18n-title="player.next"><span class="material-symbols-rounded">skip_next</span></button>
                            <button class="btn-m3" id="pip-repeat-btn" title="Lặp lại" data-i18n-title="player.repeat">
                                <span class="material-symbols-rounded" style="font-size: 20px;">repeat</span>
                                <div id="pip-repeat-badge" class="repeat-badge">1</div>
                            </button>
                        </div>
                    </div>
                    
                    <div class="pip-playlist-section" id="pip-playlist-section">
                        <div class="pip-playlist-header">
                            <span style="font-size: calc(14px * var(--font-scale-factor, 1)); font-weight: 600;" data-i18n="pip.playlist">Danh sách phát</span>
                            <button class="btn-m3" id="pip-close-btn" style="width: 28px; height: 28px;" title="Đóng" data-i18n-title="misc.close"><span class="material-symbols-rounded" style="font-size: 18px;">close</span></button>
                        </div>
                        <div class="pip-playlist-container" id="pip-playlist-container"></div>
                    </div>

                    <div class="pip-cm-overlay" id="pip-cm-overlay"></div>
                    <div class="pip-context-menu" id="pip-context-menu">
                        <div class="pip-cm-title" id="pip-cm-title">Song Name</div>
                        <button class="pip-cm-btn" id="pip-cm-delete" title="Xoá khỏi playlist" data-i18n-title="contextmenu.delete">
                            <span class="material-symbols-rounded">delete</span>
                            <span data-i18n="contextmenu.delete">Xoá khỏi playlist</span>
                        </button>
                    </div>
                `;

                applyTranslations(currentLangDict, pipDoc); // Áp ngôn ngữ hiện tại ngay khi vừa dựng xong PiP

                pipDoc.getElementById('pip-play-btn').onclick = () => document.getElementById('play-btn').click();
                pipDoc.getElementById('pip-prev-btn').onclick = () => document.getElementById('prev-btn').click();
                pipDoc.getElementById('pip-next-btn').onclick = () => document.getElementById('next-btn').click();
                pipDoc.getElementById('pip-shuffle-btn').onclick = () => document.getElementById('shuffle-btn').click();
                pipDoc.getElementById('pip-repeat-btn').onclick = () => document.getElementById('repeat-btn').click();
                // Thanh trượt thời gian: kéo -> tua; lúc đang kéo thì không bị timeupdate ghi đè
                const pipSeekEl = pipDoc.getElementById('pip-seek');
                try {
                    const wrap = pipDoc.createElement('div'); wrap.className = 'pip-seek-wrap';
                    pipSeekEl.parentNode.insertBefore(wrap, pipSeekEl); wrap.appendChild(pipSeekEl);
                    if (window.__makeWave) window.__makeWave(pipSeekEl, wrap, null, 'rgba(255,255,255,.22)', 6, { doc: pipDoc, win: customPipWindow, primaryVar: '--pip-primary' });
                } catch (e) { console.warn('PiP wave seek', e); }
                pipSeekEl.addEventListener('pointerdown', () => { pipSeeking = true; });
                pipSeekEl.addEventListener('pointerup', () => { pipSeeking = false; });
                pipSeekEl.addEventListener('input', () => {
                    if (audio.duration) audio.currentTime = (pipSeekEl.value / 1000) * audio.duration;
                    pipDoc.getElementById('pip-cur').innerText = formatTime(audio.currentTime, audio.duration);
                });

                pipDoc.getElementById('pip-expand-btn').onclick = () => {
                    pipDoc.body.classList.add('pip-expanded');
                    customPipWindow.resizeTo(320, 500); 
                    pipDoc.querySelector('.pip-player-section').style.height = '200px'; 
                    pipDoc.getElementById('pip-lyric').style.display = 'none'; 
                    pipDoc.getElementById('pip-playlist-section').style.display = 'flex';
                    pipDoc.getElementById('pip-expand-btn').style.opacity = '0';
                    pipDoc.getElementById('pip-expand-btn').style.pointerEvents = 'none';
                    renderPipPlaylist(); 
                };

                pipDoc.getElementById('pip-close-btn').onclick = () => {
                    pipDoc.body.classList.remove('pip-expanded');
                    customPipWindow.resizeTo(320, 320); pipSizedForVideo = false;
                    pipDoc.querySelector('.pip-player-section').style.height = '100%'; 
                    if (settings.showPipLyric) pipDoc.getElementById('pip-lyric').style.display = 'flex'; 
                    pipDoc.getElementById('pip-playlist-section').style.display = 'none';
                    pipDoc.getElementById('pip-expand-btn').style.opacity = '1';
                    pipDoc.getElementById('pip-expand-btn').style.pointerEvents = 'auto';
                    pipSyncVideo(true);
                };

                const pipOverlayEl = pipDoc.getElementById('pip-cm-overlay');
                const pipCmEl = pipDoc.getElementById('pip-context-menu');
                
                const closePipCm = () => {
                    pipOverlayEl.classList.remove('open');
                    pipCmEl.classList.remove('open');
                    pipTargetMenuIndex = -1;
                };

                pipOverlayEl.onclick = closePipCm;

                pipDoc.getElementById('pip-cm-delete').onclick = () => {
                    if (pipTargetMenuIndex > -1) {
                        targetMenuIndex = pipTargetMenuIndex; 
                        document.getElementById('cm-delete').click(); 
                        closePipCm();
                    }
                };

                updateFontScaleFactor();
                customPipWindow.addEventListener("pagehide", () => { customPipWindow = null; pipVideoSrc = ""; pipSizedForVideo = false; });

                // Khoá tỉ lệ khung PiP: nhạc = hình vuông, video = đúng tỉ lệ khung hình của video.
                // Kéo cạnh nào thì cạnh còn lại tự theo (chỉ phóng to/thu nhỏ, không méo ngang/dọc).
                {
                    const w = customPipWindow;
                    let lastW = w.innerWidth, lastH = w.innerHeight, tmr = 0, busy = false;
                    const ratio = () => (playlist[currentIndex] && playlist[currentIndex].isVideo && audio.videoWidth > 0) ? audio.videoWidth / audio.videoHeight : 1;
                    w.addEventListener('resize', () => {
                        if (busy || w.document.body.classList.contains('pip-expanded')) { lastW = w.innerWidth; lastH = w.innerHeight; return; }
                        clearTimeout(tmr);
                        tmr = setTimeout(() => {
                            if (!customPipWindow || w.document.body.classList.contains('pip-expanded')) return;
                            const r = ratio(), cw = w.innerWidth, ch = w.innerHeight;
                            const dW = Math.abs(cw - lastW), dH = Math.abs(ch - lastH);
                            let nw = cw, nh = ch;
                            if (dW >= dH) nh = Math.round(cw / r); else nw = Math.round(ch * r);
                            if (Math.abs(nw - cw) > 1 || Math.abs(nh - ch) > 1) {
                                busy = true;
                                try { w.resizeTo(nw, nh); } catch (e) {}
                                setTimeout(() => { busy = false; lastW = w.innerWidth; lastH = w.innerHeight; }, 120);
                            } else { lastW = cw; lastH = ch; }
                        }, 90);
                    });
                }

                pipVideoSrc = '';
                updatePiPUI();
                updatePipSeek();
                pipSyncVideo(true);

            } catch (error) {
                console.error("Vỡ kế hoạch mở PiP:", error);
            }
        });


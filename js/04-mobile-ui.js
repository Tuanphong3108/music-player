        // --- UI điện thoại: lớp m-ui chỉ bật trên Android (?android=true hoặc User-Agent Android) ---
        (function () {
            const hasAndroidParam = /[?&]android=true/.test(location.search);
            const isAndroidDevice = !!(window.IS_ANDROID_DEVICE || window.IS_ANDROID_APP || hasAndroidParam || /Android/i.test(navigator.userAgent || ''));
            const isAndroidAudioOnly = isAndroidDevice && hasAndroidParam;
            document.documentElement.classList.toggle('m-ui', isAndroidDevice);
            document.documentElement.classList.toggle('is-android-audio-only', isAndroidAudioOnly);
            if (isAndroidAudioOnly) {
                const applyAndroidAudioLabels = () => {
                    const en = /^en/i.test(localStorage.getItem('settings_language') || '');
                    const fHead = document.querySelector('#btn-fs-pick-files [slot="headline"]');
                    const dHead = document.querySelector('#btn-fs-pick-directory [slot="headline"]');
                    const trig = document.getElementById('add-music-trigger');
                    const finp = document.getElementById('file-input');
                    if (fHead) fHead.textContent = en ? 'Choose music files' : 'Chọn tệp nhạc';
                    if (dHead) dHead.textContent = en ? 'Choose music folder' : 'Chọn thư mục nhạc';
                    if (trig) trig.title = en ? 'Add music' : 'Thêm nhạc';
                    if (finp) finp.setAttribute('accept', 'audio/*,.lrc');
                };
                applyAndroidAudioLabels();
                window.__applyAndroidAudioLabels = applyAndroidAudioLabels;
                const langSel = document.getElementById('setting-language');
                if (langSel) langSel.addEventListener('change', () => setTimeout(applyAndroidAudioLabels, 60));
            }
            if (isAndroidDevice) {
                try { updateFsUI(); } catch (e) {}
                const plArrow = document.querySelector('#playlist-card .playlist-header .expand-icon');
                if (plArrow) plArrow.textContent = 'arrow_back';
            }
            else document.body.classList.remove('m-playlist-open', 'm-more-open');
            const mPlBtn = document.getElementById('m-playlist-btn');
            if (mPlBtn) mPlBtn.addEventListener('click', () => {
                if (playlistCard.classList.contains('collapsed')) togglePlaylist();
                document.body.classList.add('m-playlist-open'); document.body.classList.remove('m-more-open');
            });
            const plHdr = document.querySelector('#playlist-card .playlist-header');
            if (plHdr) plHdr.addEventListener('click', (e) => {
                if (!document.documentElement.classList.contains('m-ui') || document.body.classList.contains('reorder-active')) return;
                e.stopImmediatePropagation(); document.body.classList.remove('m-playlist-open');
            }, true);
            const mMoreBtn = document.getElementById('m-more-btn');
            if (mMoreBtn) mMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = document.body.classList.toggle('m-more-open');
                const lyricBtn = document.getElementById('lyric-btn');
                if (lyricBtn) lyricBtn.style.pointerEvents = isOpen ? 'none' : '';
            });
            document.addEventListener('click', (e) => {
                if (e.target.closest('#m-more-btn') || e.target.closest('#sleep-btn') || e.target.closest('#sleep-menu')) return;
                document.body.classList.remove('m-more-open');
                const lyricBtn = document.getElementById('lyric-btn');
                if (lyricBtn) lyricBtn.style.pointerEvents = '';
            });

            // --- MOBILE HOME LIBRARY + MINI PLAYER PILL + FULL PLAYER COLLAPSE + PLAYLIST FOOTER ---
            const mLibList = document.getElementById('m-lib-list');
            const mLibSearch = document.getElementById('m-lib-search');
            const mLibShuffle = document.getElementById('m-lib-shuffle');
            const mLibRescan = document.getElementById('m-lib-rescan');
            const mMiniPlayer = document.getElementById('m-mini-player');
            const mMiniArt = document.getElementById('m-mini-art');
            const mMiniTitle = document.getElementById('m-mini-title');
            const mMiniArtist = document.getElementById('m-mini-artist');
            const mMiniPrev = document.getElementById('m-mini-prev');
            const mMiniPlay = document.getElementById('m-mini-play');
            const mMiniNext = document.getElementById('m-mini-next');
            const mCollapseBtn = document.getElementById('m-collapse-player-btn');
            const mPlShuffle = document.getElementById('m-pl-shuffle');
            const mPlRepeat = document.getElementById('m-pl-repeat');
            const mPlSleep = document.getElementById('m-pl-sleep');
            const mPlMoreBtn = document.getElementById('m-pl-more-btn');
            const mPlMorePopup = document.getElementById('m-pl-more-popup');
            let mLibQuery = '';

            // Thư viện gốc trên Mobile (luôn giữ đủ bài, sắp xếp 0–Z, không bị xoá khi chỉnh hàng đợi tạm)
            window.__mobileLibrary = window.__mobileLibrary || [];
            const mLibTrackId = (t) => (t && (t.nativeLocation || t.rawName || t.name || '')).toLowerCase();
            const sortMobileLib0Z = (arr) => arr.sort((a, b) =>
                String((a && a.name) || '').localeCompare(String((b && b.name) || ''), undefined, { numeric: true, sensitivity: 'base' })
            );

            function syncMobileLibraryFromPlaylist() {
                if (!document.documentElement.classList.contains('m-ui')) return;
                const seen = new Set(window.__mobileLibrary.map(mLibTrackId));
                playlist.forEach(tr => {
                    if (!tr) return;
                    const id = mLibTrackId(tr);
                    if (id && !seen.has(id)) {
                        seen.add(id);
                        window.__mobileLibrary.push(tr);
                    }
                });
                sortMobileLib0Z(window.__mobileLibrary);
            }
            window.__syncMobileLibraryFromPlaylist = syncMobileLibraryFromPlaylist;

            function replaceQueueAndPlay(tracks, startTrack) {
                if (!Array.isArray(tracks) || !tracks.length) return;
                playlist.length = 0;
                tracks.forEach(t => { if (t) playlist.push(t); });
                const startIdx = Math.max(0, startTrack ? playlist.indexOf(startTrack) : 0);
                currentIndex = -1;
                if (shuffleInitialized) generateShuffleOrder();
                playTrack(startIdx);
                document.body.classList.add('m-mini-visible');
            }

            // --- CACHE METADATA + ALBUM ART VÀO INDEXEDDB (CHỈ MOBILE) ---
            const META_DB_NAME = 'mp_mobile_meta_cache_v1';
            const META_STORE = 'tracks';
            let metaDbPromise = null;
            function openMetaCacheDB() {
                if (metaDbPromise) return metaDbPromise;
                metaDbPromise = new Promise((resolve, reject) => {
                    try {
                        const req = indexedDB.open(META_DB_NAME, 1);
                        req.onupgradeneeded = () => {
                            if (!req.result.objectStoreNames.contains(META_STORE)) {
                                req.result.createObjectStore(META_STORE);
                            }
                        };
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => reject(req.error);
                    } catch (e) { reject(e); }
                }).catch(() => { metaDbPromise = null; return null; });
                return metaDbPromise;
            }
            async function loadAllMetaCache() {
                const map = new Map();
                const db = await openMetaCacheDB();
                if (!db) return map;
                return new Promise((resolve) => {
                    try {
                        const tx = db.transaction(META_STORE, 'readonly');
                        const st = tx.objectStore(META_STORE);
                        const req = st.openCursor();
                        req.onsuccess = (ev) => {
                            const cur = ev.target.result;
                            if (cur) { map.set(cur.key, cur.value); cur.continue(); }
                            else resolve(map);
                        };
                        req.onerror = () => resolve(map);
                    } catch (e) { resolve(map); }
                });
            }
            async function saveTrackMetaToCache(tr) {
                if (!tr) return;
                const key = mLibTrackId(tr);
                if (!key) return;
                const db = await openMetaCacheDB();
                if (!db) return;
                const coverVal = (tr.cover && tr.cover.startsWith('data:')) ? tr.cover : '';
                const rec = {
                    name: tr.name || '',
                    artist: tr.artist || 'UNKNOWN ARTIST',
                    album: tr.album || 'Unknown Album',
                    year: tr.year || '',
                    genre: tr.genre || '',
                    composer: tr.composer || '',
                    cover: coverVal,
                    size: (tr.file && tr.file.size) || 0,
                    modified: (tr.file && tr.file.lastModified) || 0,
                    updatedAt: Date.now()
                };
                try {
                    const tx = db.transaction(META_STORE, 'readwrite');
                    tx.objectStore(META_STORE).put(rec, key);
                } catch (e) {}
            }
            window.__saveTrackMetaToCache = saveTrackMetaToCache;

            function patchMobileLibRowDom(tr) {
                if (!mLibList || !tr) return;
                const id = mLibTrackId(tr);
                if (!id) return;
                const rows = mLibList.querySelectorAll('.m-lib-item');
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.dataset.tid !== id) continue;
                    row.classList.toggle('is-scanning', !!tr._metaLoading);
                    const tEl = row.querySelector('.m-lib-title');
                    const aEl = row.querySelector('.m-lib-artist');
                    if (tEl && tEl.textContent !== (tr.name || '')) tEl.textContent = tr.name || '';
                    if (aEl && aEl.textContent !== (tr.artist || '')) aEl.textContent = tr.artist || '';
                    const artBox = row.querySelector('.m-lib-art');
                    if (artBox) {
                        const existingImg = artBox.querySelector('img');
                        if (tr.cover) {
                            if (!existingImg || existingImg.getAttribute('src') !== tr.cover) {
                                artBox.innerHTML = '<span class="material-symbols-rounded">music_note</span><img src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">';
                            }
                        } else if (existingImg) {
                            existingImg.remove();
                        }
                    }
                    break;
                }
            }

            let coverHydrateRunning = false;
            let coverHydratePending = false;
            window.__hydrateMobileLibraryCovers = async function () {
                if (!document.documentElement.classList.contains('m-ui')) return;
                if (coverHydrateRunning) { coverHydratePending = true; return; }
                const pool = Array.isArray(window.__mobileLibrary) ? window.__mobileLibrary : [];
                if (!pool.length) return;
                coverHydrateRunning = true;
                coverHydratePending = false;
                try {
                    // Bước 1: Nạp tức thì metadata & ảnh bìa đã lưu trong app (IndexedDB) để mở lên là hiện ngay
                    const cacheMap = await loadAllMetaCache();
                    let appliedAnyCache = false;
                    for (let i = 0; i < pool.length; i++) {
                        const tr = pool[i];
                        if (!tr) continue;
                        const key = mLibTrackId(tr);
                        const cached = key ? cacheMap.get(key) : null;
                        if (cached) {
                            if (cached.name) tr.name = cached.name;
                            if (cached.artist) tr.artist = cached.artist;
                            if (cached.album) tr.album = cached.album;
                            if (cached.year) tr.year = cached.year;
                            if (cached.genre !== undefined) tr.genre = cached.genre;
                            if (cached.composer !== undefined) tr.composer = cached.composer;
                            if (cached.cover && cached.cover.startsWith('data:')) {
                                tr.cover = cached.cover;
                                tr._hasRealCover = true;
                            }
                            tr._metaFromCache = true;
                            tr._metaLoading = false;
                            tr._metaLoaded = true;
                            appliedAnyCache = true;
                        } else if (tr.nativeStreamUrl && !tr._bgCoverChecked) {
                            // Chưa có cache trong app -> bật trạng thái xoay Album Art cho tới khi quét xong
                            tr._metaLoading = true;
                        }
                    }
                    renderMobileLibrary();
                    if (appliedAnyCache && typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();

                    // Bước 2: Kiểm tra ngầm toàn bộ bài (kể cả bài đã có cache) để phát hiện thay đổi tag/ảnh bìa và cập nhật lại cache
                    for (let i = 0; i < pool.length; i++) {
                        const tr = pool[i];
                        if (!tr || !tr.nativeStreamUrl || tr._bgCoverChecked) continue;
                        tr._bgCoverChecked = true;
                        try {
                            const r = await fetch(tr.nativeStreamUrl, { headers: { Range: 'bytes=0-2097151' } });
                            if (!r || !r.ok) {
                                tr._metaLoading = false;
                                tr._metaLoaded = true;
                                patchMobileLibRowDom(tr);
                                continue;
                            }
                            const bl = await r.blob();
                            const f = new File([bl], tr.nativeName || (tr.name + '.' + (tr.ext || 'mp3').toLowerCase()), { type: bl.type || 'audio/mpeg' });
                            await new Promise((res) => {
                                window.jsmediatags.read(f, {
                                    onSuccess: function (tag) {
                                        let changed = false;
                                        if (tag.tags.title && tag.tags.title !== tr.name && (!tr._metaFromCache || tag.tags.title !== tr.rawName)) {
                                            tr.name = tag.tags.title; changed = true;
                                        }
                                        if (tag.tags.artist && tag.tags.artist !== tr.artist) {
                                            tr.artist = tag.tags.artist; changed = true;
                                        }
                                        if (tag.tags.album && tag.tags.album !== tr.album) {
                                            tr.album = tag.tags.album; changed = true;
                                        }
                                        if (tag.tags.year && tag.tags.year !== tr.year) { tr.year = tag.tags.year; changed = true; }
                                        if (tag.tags.genre && tag.tags.genre !== tr.genre) { tr.genre = tag.tags.genre; changed = true; }
                                        const c = tag.tags.composer || tag.tags.TCOM || tag.tags['©wrt'] || tag.tags.COMPOSER;
                                        if (c) {
                                            let comp = (typeof c === 'object' ? (c.data != null ? c.data : '') : c);
                                            if (Array.isArray(comp)) comp = comp.join(', ');
                                            comp = String(comp || '');
                                            if (comp && comp !== tr.composer) { tr.composer = comp; changed = true; }
                                        }
                                        if (tag.tags.picture) {
                                            const { data, format } = tag.tags.picture;
                                            let bin = '';
                                            for (let k = 0; k < data.length; k++) bin += String.fromCharCode(data[k]);
                                            const picUrl = `data:${format};base64,${window.btoa(bin)}`;
                                            if (tr.cover !== picUrl) {
                                                tr.cover = picUrl;
                                                tr._hasRealCover = true;
                                                changed = true;
                                            }
                                        } else if (tr._metaFromCache && tr.cover && tr.cover.startsWith('data:')) {
                                            // Ảnh bìa nhúng đã bị xóa ngoài app -> đồng bộ lại
                                            tr.cover = null;
                                            tr._hasRealCover = false;
                                            changed = true;
                                        }
                                        tr._metaLoading = false;
                                        tr._metaLoaded = true;
                                        saveTrackMetaToCache(tr);
                                        patchMobileLibRowDom(tr);
                                        if (changed) {
                                            if (playlist[currentIndex] === tr) {
                                                trackNameEl.innerText = tr.name;
                                                trackArtistEl.innerText = `${tr.artist} | ${tr.ext}`;
                                                if (tr.cover) {
                                                    artImg.src = tr.cover;
                                                    artImg.classList.remove('hidden');
                                                    artPlaceholder.classList.add('hidden');
                                                    bgPreview.style.backgroundImage = `url(${tr.cover})`;
                                                    refreshDynamicAccent(tr);
                                                }
                                                updateFsUI();
                                                updateMediaSession();
                                            }
                                            if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
                                        }
                                        res();
                                    },
                                    onError: function () {
                                        tr._metaLoading = false;
                                        tr._metaLoaded = true;
                                        saveTrackMetaToCache(tr);
                                        patchMobileLibRowDom(tr);
                                        res();
                                    }
                                });
                            });
                            await new Promise(r2 => setTimeout(r2, 35));
                        } catch (e) {
                            tr._metaLoading = false;
                            tr._metaLoaded = true;
                            patchMobileLibRowDom(tr);
                        }
                    }
                } finally {
                    coverHydrateRunning = false;
                    if (coverHydratePending) {
                        coverHydratePending = false;
                        setTimeout(() => { try { window.__hydrateMobileLibraryCovers(); } catch (e) {} }, 60);
                    }
                }
            };

            function renderMobileLibrary() {
                if (!document.documentElement.classList.contains('m-ui') || !mLibList) return;
                if (!window.__mobileLibrary.length && playlist.length) syncMobileLibraryFromPlaylist();
                sortMobileLib0Z(window.__mobileLibrary);
                mLibList.innerHTML = '';
                const q = mLibQuery;
                const activeTrack = playlist[currentIndex] || null;
                const activeId = activeTrack ? mLibTrackId(activeTrack) : '';
                for (let idx = 0; idx < window.__mobileLibrary.length; idx++) {
                    const tr = window.__mobileLibrary[idx];
                    if (!tr) continue;
                    if (q) {
                        const hay = removeVietnameseTones((tr.name || '') + ' ' + (tr.artist || '')).toLowerCase();
                        if (!hay.includes(q)) continue;
                    }
                    const tid = mLibTrackId(tr);
                    const isAct = !!(activeId && tid === activeId);
                    const row = document.createElement('div');
                    row.className = 'm-lib-item' + (isAct ? ' active' : '') + (tr._metaLoading ? ' is-scanning' : '');
                    row.dataset.tid = tid;
                    row.innerHTML =
                        '<div class="m-lib-art"><span class="material-symbols-rounded">music_note</span>' + (tr.cover ? '<img src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '') + '</div>' +
                        '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                        '<button type="button" class="m-lib-more" aria-label="More"><span class="material-symbols-rounded" style="font-size:20px;">more_vert</span></button>';
                    row.querySelector('.m-lib-title').textContent = tr.name || '';
                    row.querySelector('.m-lib-artist').textContent = tr.artist || '';
                    row.addEventListener('click', () => {
                        // Chọn bài từ màn hình chính -> tự reset hàng đợi tạm về toàn bộ thư viện 0–Z
                        replaceQueueAndPlay(window.__mobileLibrary, tr);
                    });
                    const mb = row.querySelector('.m-lib-more');
                    mb.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        // Bài từ màn hình chính không cho loại bỏ khỏi thư viện (chỉ loại bỏ được trong Playlist/Queue)
                        const qIdx = playlist.indexOf(tr);
                        targetMenuIndex = qIdx >= 0 ? qIdx : -1;
                        if (cmDelete) cmDelete.style.display = 'none';
                        if (qIdx < 0) {
                            // Đảm bảo nạp lẻ .lrc vẫn trỏ đúng bài nếu bài chưa có trong queue
                            window.__lrcFallbackTrack = tr;
                        }
                        contextMenu.style.display = 'flex';
                        const r = mb.getBoundingClientRect();
                        window.__placeMenu(contextMenu, r.right, r.bottom + 4);
                    });
                    mLibList.appendChild(row);
                }
            }
            window.__renderMobileLibrary = renderMobileLibrary;

            function syncMobileMiniPlayer() {
                if (!document.documentElement.classList.contains('m-ui')) return;
                const tr = playlist[currentIndex];
                if (tr) {
                    if (mMiniTitle) mMiniTitle.textContent = tr.name || 'Media Player';
                    if (mMiniArtist) mMiniArtist.textContent = tr.artist || 'UNKNOWN ARTIST';
                    if (mMiniArt) {
                        mMiniArt.innerHTML = '<span class="material-symbols-rounded">music_note</span>'
                            + (tr.cover ? '<img src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '');
                    }
                }
                if (mMiniPlay) {
                    const sp = mMiniPlay.querySelector('.material-symbols-rounded');
                    const isLoading = !!(tr && (tr._metaLoading || (audio.currentSrc && !audio.ended && (audio.seeking || (!audio.paused && audio.readyState < 3) || (tr.canOpen === false && !audio.paused)))));
                    mMiniPlay.classList.toggle('is-loading', isLoading);
                    if (sp) sp.textContent = (audio.paused || audio.ended) ? 'play_arrow' : 'pause';
                }
                if (mPlShuffle) mPlShuffle.classList.toggle('active', !!isShuffle);
                if (mPlRepeat) {
                    mPlRepeat.classList.toggle('active', repeatMode > 0);
                    const ic = mPlRepeat.querySelector('.material-symbols-rounded');
                    if (ic) ic.textContent = repeatMode === 2 ? 'repeat_one' : 'repeat';
                }
            }
            window.__syncMobileMiniPlayer = syncMobileMiniPlayer;

            ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'canplay', 'waiting', 'seeking', 'seeked', 'error', 'loadstart'].forEach(ev => audio.addEventListener(ev, syncMobileMiniPlayer));

            if (mLibSearch) {
                mLibSearch.addEventListener('input', (e) => {
                    mLibQuery = removeVietnameseTones(e.target.value || '').toLowerCase().trim();
                    renderMobileLibrary();
                });
            }
            if (mLibShuffle) {
                mLibShuffle.addEventListener('click', () => {
                    const srcLib = window.__mobileLibrary.length ? window.__mobileLibrary : playlist;
                    if (!srcLib.length) return;
                    const pickTrack = srcLib[Math.floor(Math.random() * srcLib.length)];
                    if (!isShuffle) document.getElementById('shuffle-btn').click();
                    replaceQueueAndPlay(srcLib, pickTrack);
                });
            }
            if (mLibRescan) {
                mLibRescan.addEventListener('click', () => {
                    if (window.AndroidBridge && typeof window.AndroidBridge.scanAllDeviceAudio === 'function') {
                        window.AndroidBridge.scanAllDeviceAudio(true);
                    } else {
                        renderMobileLibrary();
                    }
                });
            }
            if (mCollapseBtn) {
                mCollapseBtn.addEventListener('click', () => {
                    document.body.classList.remove('m-player-expanded');
                    if (currentIndex >= 0 && playlist[currentIndex]) document.body.classList.add('m-mini-visible');
                });
            }
            if (mMiniPrev) mMiniPrev.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('prev-btn').click(); });
            if (mMiniPlay) mMiniPlay.addEventListener('click', (e) => { e.stopPropagation(); playBtn.click(); });
            if (mMiniNext) mMiniNext.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('next-btn').click(); });

            // Chạm Mini Player để nở to Full Player; vuốt ngang để dừng nhạc và ẩn Mini Player
            if (mMiniPlayer) {
                let swX = 0, swY = 0, swDx = 0, swDragging = false, swMoved = false;
                mMiniPlayer.addEventListener('touchstart', (e) => {
                    if (!e.touches || e.touches.length !== 1 || e.target.closest('.m-mini-btn')) return;
                    swX = e.touches[0].clientX;
                    swY = e.touches[0].clientY;
                    swDx = 0;
                    swDragging = true;
                    swMoved = false;
                }, { passive: true });
                mMiniPlayer.addEventListener('touchmove', (e) => {
                    if (!swDragging || !e.touches || e.touches.length !== 1) return;
                    const dx = e.touches[0].clientX - swX;
                    const dy = e.touches[0].clientY - swY;
                    if (!swMoved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
                        swMoved = true;
                        mMiniPlayer.classList.add('swiping');
                    }
                    if (swMoved) {
                        swDx = dx;
                        mMiniPlayer.style.transform = 'translateX(' + dx + 'px)';
                        mMiniPlayer.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 220));
                    }
                }, { passive: true });
                const endMiniSwipe = () => {
                    if (!swDragging) return;
                    swDragging = false;
                    mMiniPlayer.classList.remove('swiping');
                    if (swMoved && Math.abs(swDx) >= 80) {
                        const dir = swDx > 0 ? 1 : -1;
                        mMiniPlayer.style.transform = 'translateX(' + (dir * 120) + '%)';
                        mMiniPlayer.style.opacity = '0';
                        try {
                            audio.pause();
                            playBtn.querySelector('span').innerText = 'play_arrow';
                        } catch (err) {}
                        setTimeout(() => {
                            document.body.classList.remove('m-mini-visible');
                            mMiniPlayer.style.transform = '';
                            mMiniPlayer.style.opacity = '';
                            syncMobileMiniPlayer();
                        }, 240);
                    } else {
                        mMiniPlayer.style.transform = '';
                        mMiniPlayer.style.opacity = '';
                    }
                };
                mMiniPlayer.addEventListener('touchend', endMiniSwipe, { passive: true });
                mMiniPlayer.addEventListener('touchcancel', endMiniSwipe, { passive: true });
                mMiniPlayer.addEventListener('click', (e) => {
                    if (swMoved || e.target.closest('.m-mini-btn')) return;
                    document.body.classList.add('m-player-expanded');
                    updateFsUI();
                });
            }

            if (mPlShuffle) mPlShuffle.addEventListener('click', () => { document.getElementById('shuffle-btn').click(); syncMobileMiniPlayer(); });
            if (mPlRepeat) mPlRepeat.addEventListener('click', () => { document.getElementById('repeat-btn').click(); syncMobileMiniPlayer(); });
            if (mPlSleep) mPlSleep.addEventListener('click', () => { document.getElementById('sleep-btn').click(); });

            // Popup 3 chấm của Playlist Sheet (Locate current song / Clear queue / Save as playlist)
            const syncPlMoreLabels = () => {
                const isEn = /^en/i.test(localStorage.getItem('settings_language') || '');
                const loc = document.getElementById('m-pl-opt-locate-txt');
                const clr = document.getElementById('m-pl-opt-clear-txt');
                const sav = document.getElementById('m-pl-opt-save-txt');
                if (loc) loc.textContent = isEn ? 'Locate current song' : 'Định vị bài đang phát';
                if (clr) clr.textContent = isEn ? 'Clear queue' : 'Xóa hàng đợi';
                if (sav) sav.textContent = isEn ? 'Save as playlist' : 'Lưu thành danh sách phát';
            };
            if (mPlMoreBtn && mPlMorePopup) {
                mPlMoreBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    syncPlMoreLabels();
                    mPlMorePopup.classList.toggle('open');
                });
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('#m-pl-more-popup') && !e.target.closest('#m-pl-more-btn')) {
                        mPlMorePopup.classList.remove('open');
                    }
                });
            }
            document.getElementById('m-pl-opt-locate')?.addEventListener('click', (e) => {
                e.stopPropagation();
                mPlMorePopup?.classList.remove('open');
                locateCurrentTrack(true);
            });
            document.getElementById('m-pl-opt-clear')?.addEventListener('click', (e) => {
                e.stopPropagation();
                mPlMorePopup?.classList.remove('open');
                // Chỉ dọn hàng đợi tạm (playlist): giữ nguyên bài đang phát, không đụng màn hình chính & playlist đã tạo
                if (currentIndex >= 0 && playlist[currentIndex]) {
                    const curTrack = playlist[currentIndex];
                    playlist.length = 0;
                    playlist.push(curTrack);
                    currentIndex = 0;
                } else {
                    playlist.length = 0;
                    currentIndex = -1;
                }
                if (shuffleInitialized) generateShuffleOrder();
                updatePlaylistUI();
                syncMobileMiniPlayer();
            });
            document.getElementById('m-pl-opt-save')?.addEventListener('click', (e) => {
                e.stopPropagation();
                mPlMorePopup?.classList.remove('open');
                if (!playlist.length) return;
                if (typeof window.__openCreatePlaylistFromTracks === 'function') {
                    window.__openCreatePlaylistFromTracks(playlist);
                }
            });

            // --- MOBILE PLAYLISTS TAB + NEW PLAYLIST / SMART PLAYLIST CREATOR ---
            (function initMobilePlaylistsTab() {
                const PL_STORE_KEY = 'mp_mobile_playlists_v1';
                const STATS_KEY = 'mp_mobile_play_stats_v1';
                const tabBtns = document.querySelectorAll('#m-lib-tabs .m-lib-tab');
                const paneSongs = document.getElementById('m-pane-songs');
                const panePls = document.getElementById('m-pane-playlists');
                const paneDetail = document.getElementById('m-pane-pl-detail');
                const plListEl = document.getElementById('m-pl-list');
                const plDetailList = document.getElementById('m-pl-detail-list');
                const plDetailTitle = document.getElementById('m-pl-detail-title');
                const creatorModal = document.getElementById('m-pl-creator-modal');
                const paneArtists = document.getElementById('m-pane-artists');
                const paneLiked = document.getElementById('m-pane-liked');
                const artistListEl = document.getElementById('m-artist-list');
                const likedListEl = document.getElementById('m-liked-list');
                const virtualPls = {};   // danh sách ảo (Nghệ sĩ...) mở trong khung chi tiết danh sách phát
                let detailReturnTab = 'playlists';
                let activeTab = 'songs';
                let openedPlId = null;

                const loadPls = () => { try { return JSON.parse(localStorage.getItem(PL_STORE_KEY) || '[]'); } catch (e) { return []; } };
                const savePls = (arr) => { try { localStorage.setItem(PL_STORE_KEY, JSON.stringify(arr)); } catch (e) {} };
                const loadStats = () => { try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch (e) { return {}; } };
                const saveStats = (o) => { try { localStorage.setItem(STATS_KEY, JSON.stringify(o)); } catch (e) {} };
                const trackKeyOf = (t) => (t && (t.nativeLocation || t.rawName || t.name || '')).toLowerCase();

                window.__recordMobilePlayStat = function (track) {
                    if (!track) return;
                    const k = trackKeyOf(track);
                    if (!k) return;
                    const st = loadStats();
                    const cur = st[k] || { count: 0, last: 0 };
                    cur.count = (cur.count || 0) + 1;
                    cur.last = Date.now();
                    st[k] = cur;
                    saveStats(st);
                };

                function buildStarSvg(color, sides, curve, rot, scale, iconName, size) {
                    const S = size || 136, cx = S / 2, cy = S / 2;
                    const rOuter = (S * 0.44) * (scale || 1);
                    const rInner = rOuter * Math.max(0.45, 0.92 - (curve || 0.15) * 1.1);
                    const n = Math.max(3, Math.min(12, sides || 5));
                    const pts = [];
                    const total = n * 2;
                    for (let i = 0; i < total; i++) {
                        const a = (i * Math.PI / n) - Math.PI / 2 + ((rot || 0) * Math.PI / 180);
                        const r = (i % 2 === 0) ? rOuter : rInner;
                        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
                    }
                    let d = '';
                    for (let i = 0; i < pts.length; i++) {
                        const p0 = pts[(i - 1 + pts.length) % pts.length];
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        const mx1 = (p0[0] + p1[0]) / 2, my1 = (p0[1] + p1[1]) / 2;
                        const mx2 = (p1[0] + p2[0]) / 2, my2 = (p1[1] + p2[1]) / 2;
                        d += (i === 0 ? `M ${mx1.toFixed(1)} ${my1.toFixed(1)} ` : '') + `Q ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} ${mx2.toFixed(1)} ${my2.toFixed(1)} `;
                    }
                    d += 'Z';
                    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="display:block;"><path d="${d}" fill="${color}"/></svg>`
                        + `<span class="material-symbols-rounded" style="position:absolute;font-size:${Math.round(S * 0.36)}px;color:#111;font-variation-settings:'FILL' 1;">${iconName || 'music_note'}</span>`;
                }

                function renderPlCoverHtml(pl, size) {
                    const S = size || 56;
                    if (pl.coverType === 'image' && pl.coverImage) {
                        return `<div class="m-pl-cover" style="width:${S}px;height:${S}px;"><img src="${pl.coverImage}" style="width:100%;height:100%;object-fit:cover;"></div>`;
                    }
                    if (pl.coverType === 'icon') {
                        const bg = pl.iconBg || '#93c5fd';
                        const ico = pl.iconName || 'music_note';
                        const sh = pl.iconShape || 'circle';
                        if (sh === 'star') {
                            return `<div class="m-pl-cover" style="width:${S}px;height:${S}px;background:transparent;">${buildStarSvg(bg, pl.starSides, pl.starCurve, pl.starRot, pl.starScale, ico, S)}</div>`;
                        }
                        const rad = sh === 'circle' ? '50%' : (sh === 'oval' ? '999px' : '16px');
                        const tf = sh === 'oval' ? 'transform:scaleY(0.76) rotate(-25deg);' : '';
                        return `<div class="m-pl-cover" style="width:${S}px;height:${S}px;background:transparent;"><div style="width:100%;height:100%;border-radius:${rad};background:${bg};display:grid;place-items:center;${tf}"></div><span class="material-symbols-rounded" style="position:absolute;font-size:${Math.round(S * 0.46)}px;color:#111;font-variation-settings:'FILL' 1;">${ico}</span></div>`;
                    }
                    return `<div class="m-pl-cover" style="width:${S}px;height:${S}px;"><span class="material-symbols-rounded" style="font-size:${Math.round(S * 0.5)}px;opacity:.75;">grid_view</span></div>`;
                }

                function getLibPool() {
                    return (window.__mobileLibrary && window.__mobileLibrary.length) ? window.__mobileLibrary : playlist;
                }

                function resolvePlaylistTracks(pl) {
                    if (!pl) return [];
                    if (pl.mode === 'virtual') return pl.getTracks();
                    const pool = getLibPool();
                    if (pl.mode === 'smart') {
                        const st = loadStats();
                        const all = pool.slice();
                        if (pl.smartRule === 'top') {
                            return all.sort((a, b) => ((st[trackKeyOf(b)]?.count || 0) - (st[trackKeyOf(a)]?.count || 0))).slice(0, 30);
                        }
                        if (pl.smartRule === 'recent') {
                            return all.filter(t => st[trackKeyOf(t)]?.last).sort((a, b) => (st[trackKeyOf(b)].last - st[trackKeyOf(a)].last)).slice(0, 30);
                        }
                        if (pl.smartRule === 'forgotten') {
                            return all.sort((a, b) => ((st[trackKeyOf(a)]?.last || 0) - (st[trackKeyOf(b)]?.last || 0))).slice(0, 30);
                        }
                        return all.slice(0, 30);
                    }
                    const byKey = new Map();
                    pool.forEach(t => { if (t) byKey.set(trackKeyOf(t), t); });
                    return (pl.trackKeys || []).map(k => byKey.get(String(k).toLowerCase())).filter(Boolean);
                }

                function setMobileLibTab(tab) {
                    activeTab = tab;
                    openedPlId = null;
                    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.mlib === tab));
                    paneSongs?.classList.toggle('active', tab === 'songs');
                    panePls?.classList.toggle('active', tab === 'playlists');
                    paneArtists?.classList.toggle('active', tab === 'artists');
                    paneLiked?.classList.toggle('active', tab === 'liked');
                    paneDetail?.classList.remove('active');
                    document.getElementById('m-lib-tabs')?.style.removeProperty('display');
                    if (tab === 'playlists') renderMobilePlaylists();
                    if (tab === 'artists') renderMobileArtists();
                    if (tab === 'liked') renderMobileLiked();
                }

                function rowArtHtml(tr) {
                    return '<div class="m-lib-art"><span class="material-symbols-rounded">music_note</span>' + (tr && tr.cover ? '<img src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '') + '</div>';
                }
                function emptyHtml(icon, text) {
                    return '<div class="m-pl-empty"><span class="material-symbols-rounded">' + icon + '</span><p>' + text + '</p></div>';
                }

                // --- Tab Nghệ sĩ: gom bài theo ca sĩ, chạm để mở danh sách bài của ca sĩ đó ---
                function renderMobileArtists() {
                    if (!artistListEl) return;
                    const groups = new Map();
                    getLibPool().forEach(t => {
                        if (!t) return;
                        const name = String(t.artist || '').trim() || 'UNKNOWN ARTIST';
                        const k = name.toLowerCase();
                        if (!groups.has(k)) groups.set(k, { name, tracks: [] });
                        groups.get(k).tracks.push(t);
                    });
                    const arr = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                    artistListEl.innerHTML = '';
                    if (!arr.length) { artistListEl.innerHTML = emptyHtml('artist', tr2('pl.artists_empty', 'Chưa có nghệ sĩ nào.')); return; }
                    arr.forEach(g => {
                        const row = document.createElement('div');
                        row.className = 'm-lib-item';
                        row.innerHTML = rowArtHtml(g.tracks.find(t => t.cover) || g.tracks[0]) +
                            '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                            '<span class="material-symbols-rounded" style="opacity:.5;">chevron_right</span>';
                        row.querySelector('.m-lib-title').textContent = g.name;
                        row.querySelector('.m-lib-artist').textContent = tr2('pl.tracks_count', '{n} bài hát').replace('{n}', g.tracks.length);
                        row.addEventListener('click', () => {
                            const id = 'virt_artist_' + g.name.toLowerCase();
                            virtualPls[id] = { id, name: g.name, mode: 'virtual', returnTab: 'artists',
                                getTracks: () => getLibPool().filter(t => t && (String(t.artist || '').trim() || 'UNKNOWN ARTIST').toLowerCase() === g.name.toLowerCase()) };
                            openPlaylistDetail(id);
                        });
                        artistListEl.appendChild(row);
                    });
                }

                // --- Tab Yêu thích: các bài đã bấm trái tim ---
                function renderMobileLiked() {
                    if (!likedListEl) return;
                    const liked = getLibPool().filter(t => t && window.__isLiked && window.__isLiked(t));
                    likedListEl.innerHTML = '';
                    if (!liked.length) { likedListEl.innerHTML = emptyHtml('favorite', tr2('pl.liked_empty', 'Chưa có bài hát yêu thích nào.')); return; }
                    const activeTr = playlist[currentIndex] || null;
                    const activeKey = activeTr ? trackKeyOf(activeTr) : '';
                    liked.forEach(tr => {
                        const row = document.createElement('div');
                        row.className = 'm-lib-item' + (activeKey && trackKeyOf(tr) === activeKey ? ' active' : '');
                        row.innerHTML = rowArtHtml(tr) +
                            '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                            '<button type="button" class="m-lib-more" aria-label="Unlike"><span class="material-symbols-rounded" style="font-size:20px;color:#ff5a7a;">favorite</span></button>';
                        row.querySelector('.m-lib-title').textContent = tr.name || '';
                        row.querySelector('.m-lib-artist').textContent = tr.artist || '';
                        row.addEventListener('click', () => replaceQueueAndPlay(liked, tr));
                        row.querySelector('.m-lib-more').addEventListener('click', (ev) => { ev.stopPropagation(); window.__toggleLiked(tr); });
                        likedListEl.appendChild(row);
                    });
                }
                document.getElementById('m-liked-shuffle')?.addEventListener('click', () => {
                    const liked = getLibPool().filter(t => t && window.__isLiked && window.__isLiked(t));
                    if (!liked.length) return;
                    if (!isShuffle) document.getElementById('shuffle-btn').click();
                    replaceQueueAndPlay(liked, liked[Math.floor(Math.random() * liked.length)]);
                });
                document.addEventListener('mp-liked-changed', () => {
                    if (activeTab === 'liked' && !openedPlId) renderMobileLiked();
                });
                tabBtns.forEach(b => b.addEventListener('click', () => setMobileLibTab(b.dataset.mlib)));

                function renderMobilePlaylists() {
                    if (!plListEl) return;
                    const pls = loadPls();
                    plListEl.innerHTML = '';
                    if (!pls.length) {
                        plListEl.innerHTML =
                            '<div class="m-pl-empty">' +
                            '<span class="material-symbols-rounded">playlist_play</span>' +
                            '<h4>' + tr2('pl.empty_title', 'Chưa có danh sách phát nào.') + '</h4>' +
                            '<p>' + tr2('pl.empty_desc', "Chạm nút 'Tạo mới' để bắt đầu.") + '</p>' +
                            '</div>';
                        return;
                    }
                    pls.forEach(pl => {
                        const plTracks = resolvePlaylistTracks(pl);
                        const card = document.createElement('div');
                        card.className = 'm-pl-card';
                        card.innerHTML =
                            renderPlCoverHtml(pl, 56) +
                            '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                            '<button type="button" class="m-lib-more" aria-label="Delete"><span class="material-symbols-rounded" style="font-size:20px;">delete</span></button>';
                        card.querySelector('.m-lib-title').textContent = pl.name;
                        card.querySelector('.m-lib-artist').textContent = tr2('pl.tracks_count', '{n} bài hát').replace('{n}', plTracks.length) + (pl.mode === 'smart' ? ' • Smart' : '');
                        card.addEventListener('click', () => openPlaylistDetail(pl.id));
                        card.querySelector('.m-lib-more').addEventListener('click', async (ev) => {
                            ev.stopPropagation();
                            const ok = await confirmDialog(tr2('pl.delete_confirm', 'Bạn có chắc muốn xóa danh sách phát "{name}"?').replace('{name}', pl.name), tr2('misc.confirm', 'Xác nhận'));
                            if (!ok) return;
                            savePls(loadPls().filter(x => x.id !== pl.id));
                            renderMobilePlaylists();
                        });
                        plListEl.appendChild(card);
                    });
                }

                let pldRemoveMode = false;
                let pldReorderMode = false;
                let pldSortAsc = true;

                // Cập nhật bài đang phát (sáng) trong chi tiết danh sách phát mà không cần dựng lại
                window.__syncPldActive = function () {
                    if (!plDetailList) return;
                    const t = playlist[currentIndex] || null;
                    const k = t ? trackKeyOf(t) : '';
                    plDetailList.querySelectorAll('.m-lib-item').forEach(r => r.classList.toggle('active', !!k && r.dataset.key === k));
                };

                function openPlaylistDetail(plId, keepModes) {
                    const pl = loadPls().find(x => x.id === plId) || virtualPls[plId];
                    if (!pl || !plDetailList) return;
                    openedPlId = plId;
                    detailReturnTab = pl.mode === 'virtual' ? (pl.returnTab || 'artists') : 'playlists';
                    if (!keepModes) { pldRemoveMode = false; pldReorderMode = false; }
                    paneSongs?.classList.remove('active');
                    panePls?.classList.remove('active');
                    paneArtists?.classList.remove('active');
                    paneLiked?.classList.remove('active');
                    paneDetail?.classList.add('active');
                    document.getElementById('m-lib-tabs')?.style.setProperty('display', 'none');
                    if (plDetailTitle) plDetailTitle.textContent = pl.name;
                    const isEn = /^en/i.test(localStorage.getItem('settings_language') || '');
                    const playTxt = document.getElementById('m-pl-detail-play-txt');
                    const addTxt = document.getElementById('m-pl-detail-add-txt');
                    const remTxt = document.getElementById('m-pl-detail-rem-txt');
                    const reordTxt = document.getElementById('m-pl-detail-reord-txt');
                    if (playTxt) playTxt.textContent = isEn ? 'Play it' : 'Phát ngay';
                    if (addTxt) addTxt.textContent = isEn ? 'Add' : 'Thêm';
                    if (remTxt) remTxt.textContent = isEn ? 'Remove' : 'Xóa bài';
                    if (reordTxt) reordTxt.textContent = isEn ? 'Reorder' : 'Sắp xếp';

                    const chipsRow = document.getElementById('m-pl-detail-chips');
                    if (chipsRow) chipsRow.style.display = (pl.mode === 'smart' || pl.mode === 'virtual') ? 'none' : 'flex';
                    ['m-pl-detail-sort', 'm-pl-detail-more'].forEach(i => { const e = document.getElementById(i); if (e) e.style.display = pl.mode === 'virtual' ? 'none' : ''; });
                    document.getElementById('m-pl-detail-remove')?.classList.toggle('active', pldRemoveMode);
                    document.getElementById('m-pl-detail-reorder')?.classList.toggle('active', pldReorderMode);

                    const plTracks = resolvePlaylistTracks(pl);
                    const subEl = document.getElementById('m-pl-detail-sub');
                    if (subEl) subEl.textContent = tr2('pl.tracks_count', '{n} bài hát').replace('{n}', plTracks.length);

                    const activeTr = playlist[currentIndex] || null;
                    const activeKey = activeTr ? trackKeyOf(activeTr) : '';
                    plDetailList.innerHTML = '';
                    plTracks.forEach((tr, pos) => {
                        if (!tr) return;
                        const row = document.createElement('div');
                        const key = trackKeyOf(tr);
                        row.className = 'm-lib-item' + (activeKey && key === activeKey ? ' active' : '');
                        row.dataset.key = key;
                        let leftHtml = pldReorderMode ? '<span class="material-symbols-rounded" style="opacity:.6;font-size:20px;">drag_indicator</span>' : '';
                        let rightHtml = '';
                        if (pldReorderMode) {
                            rightHtml =
                                '<button type="button" class="m-pld-row-act pld-up" title="Up"><span class="material-symbols-rounded" style="font-size:18px;">arrow_upward</span></button>' +
                                '<button type="button" class="m-pld-row-act pld-dn" title="Down"><span class="material-symbols-rounded" style="font-size:18px;">arrow_downward</span></button>';
                        }
                        if (pldRemoveMode) {
                            rightHtml += '<button type="button" class="m-pld-row-act pld-del" title="Remove"><span class="material-symbols-rounded" style="font-size:18px;">close</span></button>';
                        }
                        row.innerHTML =
                            leftHtml +
                            '<div class="m-lib-art"><span class="material-symbols-rounded">music_note</span>' + (tr.cover ? '<img src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '') + '</div>' +
                            '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                            rightHtml;
                        row.querySelector('.m-lib-title').textContent = tr.name || '';
                        row.querySelector('.m-lib-artist').textContent = tr.artist || '';
                        row.addEventListener('click', () => {
                            if (pldRemoveMode || pldReorderMode) return;
                            // Phát từ danh sách phát đã tạo -> hàng đợi tạm chỉ chứa các bài trong danh sách phát này
                            replaceQueueAndPlay(plTracks, tr);
                        });
                        row.querySelector('.pld-del')?.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            const pls = loadPls();
                            const cur = pls.find(x => x.id === plId);
                            if (cur && Array.isArray(cur.trackKeys)) {
                                cur.trackKeys = cur.trackKeys.filter(k => String(k).toLowerCase() !== key);
                                savePls(pls);
                                openPlaylistDetail(plId, true);
                            }
                        });
                        const moveItem = (dir) => {
                            const pls = loadPls();
                            const cur = pls.find(x => x.id === plId);
                            if (!cur || !Array.isArray(cur.trackKeys)) return;
                            const ni = pos + dir;
                            if (ni < 0 || ni >= cur.trackKeys.length) return;
                            const tmp = cur.trackKeys[pos];
                            cur.trackKeys[pos] = cur.trackKeys[ni];
                            cur.trackKeys[ni] = tmp;
                            savePls(pls);
                            openPlaylistDetail(plId, true);
                        };
                        row.querySelector('.pld-up')?.addEventListener('click', (ev) => { ev.stopPropagation(); moveItem(-1); });
                        row.querySelector('.pld-dn')?.addEventListener('click', (ev) => { ev.stopPropagation(); moveItem(1); });
                        plDetailList.appendChild(row);
                    });
                    document.getElementById('m-pl-detail-play').onclick = () => {
                        if (plTracks.length) replaceQueueAndPlay(plTracks, plTracks[0]);
                    };
                    document.getElementById('m-pl-detail-shuffle').onclick = () => {
                        if (!plTracks.length) return;
                        if (!isShuffle) document.getElementById('shuffle-btn').click();
                        const pick = plTracks[Math.floor(Math.random() * plTracks.length)];
                        replaceQueueAndPlay(plTracks, pick);
                    };
                    document.getElementById('m-pl-detail-sort').onclick = () => {
                        if (pl.mode !== 'manual') return;
                        const pls = loadPls();
                        const cur = pls.find(x => x.id === plId);
                        if (!cur || !Array.isArray(cur.trackKeys)) return;
                        pldSortAsc = !pldSortAsc;
                        const nameByKey = new Map();
                        getLibPool().forEach(t => nameByKey.set(trackKeyOf(t), (t.name || '').toLowerCase()));
                        cur.trackKeys.sort((a, b) => {
                            const na = nameByKey.get(String(a).toLowerCase()) || '';
                            const nb = nameByKey.get(String(b).toLowerCase()) || '';
                            return pldSortAsc ? na.localeCompare(nb, undefined, { numeric: true }) : nb.localeCompare(na, undefined, { numeric: true });
                        });
                        savePls(pls);
                        openPlaylistDetail(plId, true);
                    };
                    document.getElementById('m-pl-detail-remove').onclick = () => { pldRemoveMode = !pldRemoveMode; openPlaylistDetail(plId, true); };
                    document.getElementById('m-pl-detail-reorder').onclick = () => { pldReorderMode = !pldReorderMode; openPlaylistDetail(plId, true); };
                    document.getElementById('m-pl-detail-add').onclick = () => {
                        plc = {
                            editId: pl.id, step: 1, mode: 'manual', smartRule: pl.smartRule || 'top',
                            coverType: pl.coverType || 'default', coverImage: pl.coverImage || '',
                            iconBg: pl.iconBg || '#93c5fd', iconName: pl.iconName || 'music_note',
                            iconShape: pl.iconShape || 'circle', starSides: pl.starSides || 5,
                            starCurve: pl.starCurve || 0.15, starRot: pl.starRot || 0, starScale: pl.starScale || 1,
                            pickedKeys: new Set((pl.trackKeys || []).map(k => String(k).toLowerCase()))
                        };
                        const ni = document.getElementById('plc-name-input'); if (ni) ni.value = pl.name;
                        renderSongPicker();
                        syncCreatorUI();
                        creatorModal?.classList.add('open');
                    };
                    document.getElementById('m-pl-detail-more').onclick = () => {
                        if (typeof window.__openSheetItems !== 'function') return;
                        window.__openSheetItems((isEn ? 'Playlist options' : 'Tùy chọn danh sách phát') + ' • ' + pl.name, [
                            {
                                label: isEn ? 'Edit playlist' : 'Chỉnh sửa danh sách phát',
                                icon: 'edit',
                                pick: () => {
                                    plc = {
                                        editId: pl.id, step: 0, mode: pl.mode || 'manual', smartRule: pl.smartRule || 'top',
                                        coverType: pl.coverType || 'default', coverImage: pl.coverImage || '',
                                        iconBg: pl.iconBg || '#93c5fd', iconName: pl.iconName || 'music_note',
                                        iconShape: pl.iconShape || 'circle', starSides: pl.starSides || 5,
                                        starCurve: pl.starCurve || 0.15, starRot: pl.starRot || 0, starScale: pl.starScale || 1,
                                        pickedKeys: new Set((pl.trackKeys || []).map(k => String(k).toLowerCase()))
                                    };
                                    const ni = document.getElementById('plc-name-input'); if (ni) ni.value = pl.name;
                                    syncCreatorUI();
                                    creatorModal?.classList.add('open');
                                }
                            },
                            {
                                label: isEn ? 'Delete playlist' : 'Xóa danh sách phát',
                                icon: 'delete',
                                pick: async () => {
                                    const ok = await confirmDialog(tr2('pl.delete_confirm', 'Bạn có chắc muốn xóa danh sách phát "{name}"?').replace('{name}', pl.name), tr2('misc.confirm', 'Xác nhận'));
                                    if (!ok) return;
                                    savePls(loadPls().filter(x => x.id !== pl.id));
                                    setMobileLibTab('playlists');
                                }
                            }
                        ]);
                    };
                }
                document.getElementById('m-pl-detail-back')?.addEventListener('click', () => {
                    document.getElementById('m-lib-tabs')?.style.removeProperty('display');
                    setMobileLibTab(detailReturnTab);
                });

                // --- Creator Modal State ---
                const BG_COLORS = ['#47628a','#93c5fd','#525b6e','#dbeafe','#525670','#c4b5fd','#b91c1c','#fecaca','#e2e8f0','#111827'];
                const ICON_LIST = ['music_note','headphones','album','graphic_eq','speaker','favorite','piano','queue_music'];
                const RULE_DESC_KEYS = { top:['pl.rule_top_desc','Những bài hát bạn phát nhiều nhất'], recent:['pl.rule_recent_desc','Những bài hát bạn vừa nghe gần đây'], forgotten:['pl.rule_forgotten_desc','Các bài trong thư viện đã lâu chưa phát lại'], new:['pl.rule_new_desc','Những bài hát mới nhất trong thư viện'] };
                let plc = { step: 0, mode: 'manual', smartRule: 'top', coverType: 'default', coverImage: '', iconBg: '#93c5fd', iconName: 'music_note', iconShape: 'circle', starSides: 5, starCurve: 0.15, starRot: 0, starScale: 1, pickedKeys: new Set() };

                const bgGrid = document.getElementById('plc-bg-swatches');
                const icoGrid = document.getElementById('plc-icon-grid');
                if (bgGrid) BG_COLORS.forEach(c => {
                    const b = document.createElement('button'); b.type = 'button'; b.className = 'plc-sw'; b.style.background = c; b.dataset.color = c;
                    b.addEventListener('click', () => { plc.iconBg = c; syncCreatorUI(); });
                    bgGrid.appendChild(b);
                });
                if (icoGrid) ICON_LIST.forEach(ic => {
                    const b = document.createElement('button'); b.type = 'button'; b.className = 'plc-ico-btn'; b.dataset.ico = ic;
                    b.innerHTML = '<span class="material-symbols-rounded" style="font-variation-settings:\'FILL\' 1;">' + ic + '</span>';
                    b.addEventListener('click', () => { plc.iconName = ic; syncCreatorUI(); });
                    icoGrid.appendChild(b);
                });

                function syncCreatorUI() {
                    const titleEl = document.getElementById('plc-modal-title');
                    const prevBox = document.getElementById('plc-preview-box');
                    const prevCap = document.getElementById('plc-preview-caption');
                    const smartWrap = document.getElementById('plc-smart-rules-wrap');
                    const iconOpts = document.getElementById('plc-icon-options');
                    const starParams = document.getElementById('plc-star-params');
                    const stepCfg = document.getElementById('plc-step-config');
                    const stepSongs = document.getElementById('plc-step-songs');
                    const backBtn = document.getElementById('plc-back-step-btn');
                    const priBtn = document.getElementById('plc-primary-btn');
                    const priIco = document.getElementById('plc-primary-ico');
                    const priTxt = document.getElementById('plc-primary-txt');

                    if (titleEl) titleEl.textContent = plc.mode === 'smart' ? tr2('pl.new_smart_title', 'Danh sách phát thông minh') : tr2('pl.new_title', 'Danh sách phát mới');
                    document.getElementById('plc-mode-manual')?.classList.toggle('sel', plc.mode === 'manual');
                    document.getElementById('plc-mode-smart')?.classList.toggle('sel', plc.mode === 'smart');
                    const mChk = document.querySelector('#plc-mode-manual .material-symbols-rounded');
                    const sChk = document.querySelector('#plc-mode-smart .material-symbols-rounded');
                    if (mChk) mChk.style.display = plc.mode === 'manual' ? '' : 'none';
                    if (sChk) sChk.style.display = plc.mode === 'smart' ? '' : 'none';
                    if (smartWrap) smartWrap.style.display = plc.mode === 'smart' ? 'flex' : 'none';

                    document.querySelectorAll('#plc-smart-rules .plc-pill').forEach(b => b.classList.toggle('sel', b.dataset.rule === plc.smartRule));
                    const rd = RULE_DESC_KEYS[plc.smartRule] || RULE_DESC_KEYS.top;
                    const rdEl = document.getElementById('plc-rule-desc');
                    if (rdEl) rdEl.textContent = tr2(rd[0], rd[1]);

                    document.querySelectorAll('#plc-cover-tabs .plc-pill').forEach(b => b.classList.toggle('sel', b.dataset.cover === plc.coverType));
                    if (iconOpts) iconOpts.style.display = plc.coverType === 'icon' ? 'flex' : 'none';
                    if (starParams) starParams.style.display = (plc.coverType === 'icon' && plc.iconShape === 'star') ? 'flex' : 'none';

                    document.querySelectorAll('#plc-bg-swatches .plc-sw').forEach(b => b.classList.toggle('sel', b.dataset.color === plc.iconBg));
                    document.querySelectorAll('#plc-icon-grid .plc-ico-btn').forEach(b => b.classList.toggle('sel', b.dataset.ico === plc.iconName));
                    document.querySelectorAll('#plc-shape-grid .plc-shape-btn').forEach(b => b.classList.toggle('sel', b.dataset.shape === plc.iconShape));

                    if (prevBox) {
                        prevBox.style.background = 'var(--md-sys-color-surface-variant)';
                        prevBox.style.borderRadius = '28px';
                        if (plc.coverType === 'default') {
                            prevBox.innerHTML = '<span class="material-symbols-rounded" style="font-size:48px;opacity:.6;">grid_view</span>';
                            if (prevCap) { prevCap.style.display = ''; prevCap.textContent = tr2('pl.auto_collage', 'Ảnh ghép tự động'); }
                        } else if (plc.coverType === 'image') {
                            prevBox.innerHTML = plc.coverImage
                                ? '<img src="' + plc.coverImage + '" style="width:100%;height:100%;object-fit:cover;">'
                                : '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;"><span class="material-symbols-rounded" style="font-size:36px;">add_photo_alternate</span><span style="font-size:12px;font-weight:700;">' + tr2('pl.pick_image', 'Chọn ảnh') + '</span></div>';
                            if (prevCap) prevCap.style.display = 'none';
                        } else {
                            prevBox.style.background = 'transparent';
                            if (plc.iconShape === 'star') {
                                prevBox.innerHTML = buildStarSvg(plc.iconBg, plc.starSides, plc.starCurve, plc.starRot, plc.starScale, plc.iconName, 136);
                            } else {
                                const rad = plc.iconShape === 'circle' ? '50%' : (plc.iconShape === 'oval' ? '999px' : '28px');
                                const tf = plc.iconShape === 'oval' ? 'transform:scaleY(0.76) rotate(-25deg);' : '';
                                prevBox.innerHTML = '<div style="width:100%;height:100%;border-radius:' + rad + ';background:' + plc.iconBg + ';' + tf + '"></div><span class="material-symbols-rounded" style="position:absolute;font-size:50px;color:#111;font-variation-settings:\'FILL\' 1;">' + plc.iconName + '</span>';
                            }
                            if (prevCap) prevCap.style.display = 'none';
                        }
                    }

                    if (stepCfg) stepCfg.style.display = plc.step === 0 ? 'flex' : 'none';
                    if (stepSongs) stepSongs.style.display = plc.step === 1 ? 'flex' : 'none';
                    if (backBtn) backBtn.style.display = plc.step === 1 ? 'inline-flex' : 'none';
                    const isCreate = plc.mode === 'smart' || plc.step === 1;
                    if (priIco) priIco.textContent = isCreate ? 'check' : 'arrow_forward';
                    if (priTxt) priTxt.textContent = isCreate ? tr2('pl.create_btn', 'Tạo') : tr2('pl.next_step', 'Tiếp theo');
                    const nameOk = (document.getElementById('plc-name-input')?.value || '').trim().length > 0;
                    if (priBtn) priBtn.style.opacity = nameOk ? '1' : '.45';
                }

                const plcSongSearch = document.getElementById('plc-song-search');
                function renderSongPicker() {
                    const box = document.getElementById('plc-song-pick-list');
                    if (!box) return;
                    box.innerHTML = '';
                    const q = removeVietnameseTones((plcSongSearch && plcSongSearch.value) || '').toLowerCase().trim();
                    const pool = getLibPool().slice();
                    sortMobileLib0Z(pool);
                    pool.forEach(tr => {
                        if (!tr) return;
                        if (q) {
                            const hay = removeVietnameseTones((tr.name || '') + ' ' + (tr.artist || '')).toLowerCase();
                            if (!hay.includes(q)) return;
                        }
                        const key = trackKeyOf(tr);
                        const picked = plc.pickedKeys.has(key);
                        const row = document.createElement('div');
                        row.className = 'plc-song-pick-row' + (picked ? ' picked' : '');
                        row.innerHTML =
                            '<div class="m-lib-art"><span class="material-symbols-rounded">music_note</span>' + (tr.cover ? '<img src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '') + '</div>' +
                            '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                            '<span class="material-symbols-rounded">' + (picked ? 'check_circle' : 'radio_button_unchecked') + '</span>';
                        row.querySelector('.m-lib-title').textContent = tr.name || '';
                        row.querySelector('.m-lib-artist').textContent = tr.artist || '';
                        row.addEventListener('click', () => {
                            if (plc.pickedKeys.has(key)) plc.pickedKeys.delete(key); else plc.pickedKeys.add(key);
                            renderSongPicker();
                        });
                        box.appendChild(row);
                    });
                }
                plcSongSearch?.addEventListener('input', renderSongPicker);

                window.__openCreatePlaylistFromTracks = function (tracks) {
                    const keys = new Set((tracks || []).map(t => trackKeyOf(t)).filter(Boolean));
                    plc = { step: 0, mode: 'manual', smartRule: 'top', coverType: 'default', coverImage: '', iconBg: '#93c5fd', iconName: 'music_note', iconShape: 'circle', starSides: 5, starCurve: 0.15, starRot: 0, starScale: 1, pickedKeys: keys };
                    const ni = document.getElementById('plc-name-input'); if (ni) ni.value = '';
                    if (plcSongSearch) plcSongSearch.value = '';
                    syncCreatorUI();
                    creatorModal?.classList.add('open');
                };

                document.getElementById('m-pl-new-btn')?.addEventListener('click', () => {
                    plc = { step: 0, mode: 'manual', smartRule: 'top', coverType: 'default', coverImage: '', iconBg: '#93c5fd', iconName: 'music_note', iconShape: 'circle', starSides: 5, starCurve: 0.15, starRot: 0, starScale: 1, pickedKeys: new Set() };
                    const ni = document.getElementById('plc-name-input'); if (ni) ni.value = '';
                    if (plcSongSearch) plcSongSearch.value = '';
                    syncCreatorUI();
                    creatorModal?.classList.add('open');
                });
                document.getElementById('plc-close-btn')?.addEventListener('click', () => creatorModal?.classList.remove('open'));
                document.getElementById('plc-name-input')?.addEventListener('input', syncCreatorUI);
                document.getElementById('plc-mode-manual')?.addEventListener('click', () => { plc.mode = 'manual'; syncCreatorUI(); });
                document.getElementById('plc-mode-smart')?.addEventListener('click', () => { plc.mode = 'smart'; syncCreatorUI(); });
                document.querySelectorAll('#plc-smart-rules .plc-pill').forEach(b => b.addEventListener('click', () => { plc.smartRule = b.dataset.rule; syncCreatorUI(); }));
                document.querySelectorAll('#plc-cover-tabs .plc-pill').forEach(b => b.addEventListener('click', () => { plc.coverType = b.dataset.cover; syncCreatorUI(); }));
                document.querySelectorAll('#plc-shape-grid .plc-shape-btn').forEach(b => b.addEventListener('click', () => { plc.iconShape = b.dataset.shape; syncCreatorUI(); }));
                document.getElementById('plc-preview-wrap')?.addEventListener('click', () => {
                    if (plc.coverType === 'image') document.getElementById('plc-image-input')?.click();
                });
                document.getElementById('plc-image-input')?.addEventListener('change', (e) => {
                    const f = e.target.files && e.target.files[0]; if (!f) return;
                    const rd = new FileReader();
                    rd.onload = () => {
                        const im = new Image();
                        im.onload = () => {
                            const cv = document.createElement('canvas'), S = 200;
                            cv.width = S; cv.height = S;
                            const k = Math.max(S / im.width, S / im.height);
                            cv.getContext('2d').drawImage(im, (S - im.width * k) / 2, (S - im.height * k) / 2, im.width * k, im.height * k);
                            plc.coverImage = cv.toDataURL('image/jpeg', 0.82);
                            syncCreatorUI();
                        };
                        im.src = rd.result;
                    };
                    rd.readAsDataURL(f);
                    e.target.value = '';
                });
                const bindStarSl = (id, valId, prop, fmt, div) => {
                    const sl = document.getElementById(id), vl = document.getElementById(valId);
                    if (!sl) return;
                    sl.addEventListener('input', () => {
                        plc[prop] = div ? (+sl.value / div) : (+sl.value);
                        if (vl) vl.textContent = fmt(plc[prop]);
                        syncCreatorUI();
                    });
                };
                bindStarSl('plc-sides', 'plc-sides-val', 'starSides', v => String(v), 0);
                bindStarSl('plc-curve', 'plc-curve-val', 'starCurve', v => v.toFixed(2), 100);
                bindStarSl('plc-rot', 'plc-rot-val', 'starRot', v => v + '°', 0);
                bindStarSl('plc-scale', 'plc-scale-val', 'starScale', v => v.toFixed(1) + 'x', 100);

                document.getElementById('plc-back-step-btn')?.addEventListener('click', () => { plc.step = 0; syncCreatorUI(); });
                document.getElementById('plc-primary-btn')?.addEventListener('click', () => {
                    const name = (document.getElementById('plc-name-input')?.value || '').trim();
                    if (!name) { document.getElementById('plc-name-input')?.focus(); return; }
                    if (plc.mode === 'manual' && plc.step === 0) {
                        plc.step = 1;
                        renderSongPicker();
                        syncCreatorUI();
                        return;
                    }
                    const pls = loadPls();
                    const payload = {
                        id: plc.editId || ('pl_' + Date.now()),
                        name,
                        mode: plc.mode,
                        smartRule: plc.smartRule,
                        coverType: plc.coverType,
                        coverImage: plc.coverImage,
                        iconBg: plc.iconBg,
                        iconName: plc.iconName,
                        iconShape: plc.iconShape,
                        starSides: plc.starSides,
                        starCurve: plc.starCurve,
                        starRot: plc.starRot,
                        starScale: plc.starScale,
                        trackKeys: Array.from(plc.pickedKeys)
                    };
                    if (plc.editId) {
                        const idx = pls.findIndex(x => x.id === plc.editId);
                        if (idx >= 0) pls[idx] = payload; else pls.unshift(payload);
                    } else {
                        pls.unshift(payload);
                    }
                    savePls(pls);
                    creatorModal?.classList.remove('open');
                    if (plc.editId && openedPlId === plc.editId) openPlaylistDetail(plc.editId, false);
                    else renderMobilePlaylists();
                    showToast(plc.editId
                        ? (tr2('font.edit_save', 'Lưu') + ': ' + name)
                        : tr2('pl.created_toast', 'Đã tạo danh sách phát "{name}"!').replace('{name}', name), 'playlist_add_check', 3000);
                });

                window.__closeMobilePlDetailIfOpen = function () {
                    if (openedPlId) { setMobileLibTab(detailReturnTab); return true; }
                    return false;
                };
            })();
        })();

        // Gọi pongReady sớm nhất có thể ngay khi có AndroidBridge để tránh bị báo "Trang không phản hồi" trên cả điện thoại và máy tính bảng
        try {
            if (window.AndroidBridge && typeof window.AndroidBridge.pongReady === 'function') {
                window.AndroidBridge.pongReady();
            }
        } catch (e) {}


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
            const mLibLocate = document.getElementById('m-lib-locate');
            if (mLibLocate) {
                const locate = (retry) => {
                    const row = mLibList.querySelector('.m-lib-item.active');
                    if (row) {
                        // Hàng dùng content-visibility:auto (chiều cao chỉ là ước lượng nên cuộn bị lố/thiếu): tắt tạm để đo đúng chiều cao thật rồi nhảy thẳng tới giữa, sau đó trả lại như cũ
                        const prevSB = mLibList.style.scrollBehavior;
                        mLibList.style.scrollBehavior = 'auto';
                        mLibList.classList.add('m-locating');
                        const center = () => {
                            const lr = mLibList.getBoundingClientRect(), rr = row.getBoundingClientRect();
                            return (rr.top + rr.height / 2) - (lr.top + lr.height / 2);
                        };
                        mLibList.scrollTop += center();
                        mLibList.scrollTop += center();   // đo lại một lần nữa để khử sai số do cuộn neo (scroll anchoring)
                        requestAnimationFrame(() => {
                            if (row.isConnected) mLibList.scrollTop += center();
                            setTimeout(() => { mLibList.classList.remove('m-locating'); mLibList.style.scrollBehavior = prevSB; }, 400);
                        });
                        row.classList.remove('m-locate-flash'); void row.offsetWidth; row.classList.add('m-locate-flash');
                        setTimeout(() => row.classList.remove('m-locate-flash'), 1400);
                        return;
                    }
                    const q = document.getElementById('m-lib-search');
                    if (!retry && q && q.value) {   // đang lọc tìm kiếm làm ẩn bài đang phát: bỏ lọc rồi thử lại
                        q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
                        setTimeout(() => locate(true), 80);
                    }
                };
                mLibLocate.addEventListener('click', () => locate(false));
            }
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
            const mLibCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
            const sortMobileLib0Z = (arr) => arr.sort((a, b) =>
                mLibCollator.compare(String((a && a.name) || ''), String((b && b.name) || ''))
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
            const META_DB_NAME = 'mp_mobile_meta_cache_v2';
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
                    lyricsRaw: tr.lyricsRaw || '',
                    fullTags: !!tr._fullTagsHydrated,
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
            let coverHydrateSeq = 0;
            async function clearMetaCache() {
                coverHydrateSeq++;
                coverHydratePending = false;
                try {
                    if (window.AndroidBridge && typeof window.AndroidBridge.updateScanNotification === 'function') {
                        window.AndroidBridge.updateScanNotification(0, 0, '');
                    }
                } catch (e) {}
                try {
                    const db = await openMetaCacheDB();
                    if (db) {
                        await new Promise((resolve) => {
                            try {
                                const tx = db.transaction(META_STORE, 'readwrite');
                                tx.objectStore(META_STORE).clear();
                                tx.oncomplete = () => resolve();
                                tx.onerror = () => resolve();
                                tx.onabort = () => resolve();
                            } catch (e) { resolve(); }
                        });
                    }
                } catch (e) {}
                try { indexedDB.deleteDatabase('mp_mobile_meta_cache_v1'); } catch (e) {}
                const resetTrackMeta = (tr) => {
                    if (!tr) return;
                    tr._metaFromCache = false;
                    tr._bgCoverChecked = false;
                    tr._metaLoaded = false;
                    tr._metaLoading = false;
                    tr._fullTagsHydrated = false;
                    tr._tagsHydrated = false;
                    tr._lyricNativeTried = false;
                    tr._hasRealCover = false;
                    tr._tech = null;
                    tr.cover = null;
                    tr.lyrics = null;
                    tr.lyricsRaw = '';
                };
                if (Array.isArray(window.__mobileLibrary)) window.__mobileLibrary.forEach(resetTrackMeta);
                if (typeof playlist !== 'undefined' && Array.isArray(playlist)) playlist.forEach(resetTrackMeta);
            }
            window.__clearMobileMetaCache = clearMetaCache;

            let mLibRowMap = new Map();
            function dataUrlToThumb(dataUrl) {
                return new Promise((resolve) => {
                    if (!dataUrl || typeof dataUrl !== 'string') { resolve(null); return; }
                    try {
                        const img = new Image();
                        img.onload = () => {
                            try {
                                const S = 144;
                                const cv = document.createElement('canvas');
                                cv.width = S; cv.height = S;
                                const k = Math.max(S / (img.naturalWidth || S), S / (img.naturalHeight || S));
                                const w = (img.naturalWidth || S) * k, h = (img.naturalHeight || S) * k;
                                cv.getContext('2d').drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
                                resolve(cv.toDataURL('image/jpeg', 0.78));
                            } catch (e) { resolve(dataUrl); }
                        };
                        img.onerror = () => resolve(dataUrl);
                        img.src = dataUrl;
                    } catch (e) { resolve(dataUrl); }
                });
            }
            function pictureToThumbDataUrl(data, format) {
                return new Promise((resolve) => {
                    try {
                        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
                        const blob = new Blob([bytes], { type: format || 'image/jpeg' });
                        const objUrl = URL.createObjectURL(blob);
                        const img = new Image();
                        img.onload = () => {
                            try {
                                const S = 144;
                                const cv = document.createElement('canvas');
                                cv.width = S; cv.height = S;
                                const k = Math.max(S / (img.naturalWidth || S), S / (img.naturalHeight || S));
                                const w = (img.naturalWidth || S) * k, h = (img.naturalHeight || S) * k;
                                cv.getContext('2d').drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
                                const out = cv.toDataURL('image/jpeg', 0.78);
                                URL.revokeObjectURL(objUrl);
                                resolve(out);
                            } catch (e) {
                                URL.revokeObjectURL(objUrl);
                                resolve(null);
                            }
                        };
                        img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
                        img.src = objUrl;
                    } catch (e) { resolve(null); }
                });
            }

            function patchMobileLibRowDom(tr) {
                if (!mLibList || !tr) return;
                const id = mLibTrackId(tr);
                if (!id) return;
                const row = mLibRowMap.get(id);
                if (!row || !row.isConnected) return;
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
                            artBox.innerHTML = '<span class="material-symbols-rounded">music_note</span><img loading="lazy" decoding="async" src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">';
                        }
                    } else if (existingImg) {
                        existingImg.remove();
                    }
                }
            }

            function syncCoverToCurrentTrackIfMatch(tr) {
                if (!tr) return;
                const cur = (typeof currentIndex === 'number' && currentIndex >= 0 && Array.isArray(playlist)) ? playlist[currentIndex] : null;
                if (!cur) return;
                const trId = mLibTrackId(tr);
                const curId = mLibTrackId(cur);
                if (cur !== tr && (!trId || trId !== curId)) return;
                if (cur !== tr) {
                    if (tr.name) cur.name = tr.name;
                    if (tr.artist) cur.artist = tr.artist;
                    if (tr.album) cur.album = tr.album;
                    if (tr.year) cur.year = tr.year;
                    if (tr.genre !== undefined) cur.genre = tr.genre;
                    if (tr.composer !== undefined) cur.composer = tr.composer;
                    if (tr.lyricsRaw && !cur.lyricsRaw) {
                        cur.lyricsRaw = tr.lyricsRaw;
                        cur.lyrics = tr.lyrics || parseLRC(tr.lyricsRaw);
                    }
                    cur.cover = tr.cover || null;
                    cur._hasRealCover = !!tr._hasRealCover;
                }
                try {
                    if (typeof trackNameEl !== 'undefined' && trackNameEl) trackNameEl.innerText = cur.name;
                    if (typeof trackArtistEl !== 'undefined' && trackArtistEl) trackArtistEl.innerText = `${cur.artist} | ${cur.ext}`;
                    if (cur.cover) {
                        if (typeof artImg !== 'undefined' && artImg) {
                            if (artImg.getAttribute('src') !== cur.cover) artImg.src = cur.cover;
                            artImg.classList.remove('hidden');
                        }
                        if (typeof artPlaceholder !== 'undefined' && artPlaceholder) artPlaceholder.classList.add('hidden');
                        if (typeof bgPreview !== 'undefined' && bgPreview) bgPreview.style.backgroundImage = `url(${cur.cover})`;
                    }
                    if (typeof refreshDynamicAccent === 'function') refreshDynamicAccent(cur);
                    if (typeof updateFsUI === 'function') updateFsUI();
                    if (typeof updateMediaSession === 'function') updateMediaSession();
                } catch (e) {}
            }

            let coverHydrateRunning = false;
            let coverHydratePending = false;
            window.__hydrateMobileLibraryCovers = async function () {
                if (!document.documentElement.classList.contains('m-ui')) return;
                if (coverHydrateRunning) { coverHydratePending = true; return; }
                const pool = Array.isArray(window.__mobileLibrary) ? window.__mobileLibrary : [];
                if (!pool.length) return;
                const mySeq = ++coverHydrateSeq;
                coverHydrateRunning = true;
                coverHydratePending = false;
                try {
                    // Bước 1: Nạp tức thì metadata & ảnh bìa đã lưu trong app (IndexedDB) để mở lên là hiện ngay
                    const cacheMap = await loadAllMetaCache();
                    if (mySeq !== coverHydrateSeq) return;
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
                            if (cached.lyricsRaw && !tr.lyricsRaw) {
                                tr.lyricsRaw = cached.lyricsRaw;
                                tr.lyrics = parseLRC(cached.lyricsRaw);
                            }
                            if (cached.fullTags) tr._fullTagsHydrated = true;
                            if (cached.cover && cached.cover.startsWith('data:')) {
                                tr.cover = cached.cover;
                                tr._hasRealCover = true;
                            } else {
                                tr.cover = null;
                                tr._hasRealCover = false;
                            }
                            tr._metaFromCache = true;
                            tr._metaLoading = false;
                            tr._metaLoaded = true;
                            const fSize = (tr.file && tr.file.size) || 0;
                            const fMod = (tr.file && tr.file.lastModified) || 0;
                            if ((!fSize || !cached.size || cached.size === fSize) && (!fMod || !cached.modified || cached.modified === fMod)) {
                                // File chưa thay đổi so với cache -> bỏ qua quét lại 2MB ở nền để giao diện siêu mượt
                                tr._bgCoverChecked = true;
                            }
                            appliedAnyCache = true;
                            syncCoverToCurrentTrackIfMatch(tr);
                        } else if (tr.nativeStreamUrl && !tr._bgCoverChecked) {
                            // Chưa có cache trong app -> bật trạng thái xoay Album Art cho tới khi quét xong
                            tr._metaLoading = true;
                        }
                    }
                    renderMobileLibrary();
                    if (appliedAnyCache && typeof window.__refreshMobileLibraryViews === 'function') window.__refreshMobileLibraryViews();
                    if (appliedAnyCache && typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();

                    // Bước 2: Thả xong toàn bộ danh sách thần tốc -> đọc bổ sung toàn bộ bài chưa có cache song song 3 tệp cùng lúc (chạy cả ở nền + thông báo tiến trình)
                    await new Promise(r0 => setTimeout(r0, 600));
                    if (mySeq !== coverHydrateSeq) return;
                    const targets = [];
                    const curTrack = (typeof playlist !== 'undefined' && currentIndex >= 0) ? playlist[currentIndex] : null;
                    for (let i = 0; i < pool.length; i++) {
                        const tr = pool[i];
                        if (!tr || !tr.nativeStreamUrl || tr._bgCoverChecked || tr._metaFromCache) continue;
                        if (tr === curTrack) targets.unshift(tr);
                        else targets.push(tr);
                    }
                    let lastScanNotifAt = 0;
                    const pushScanNotif = (done, total, title, force) => {
                        try {
                            if (!window.AndroidBridge || typeof window.AndroidBridge.updateScanNotification !== 'function') return;
                            const nowTs = Date.now();
                            if (!force && total > 0 && done < total && (nowTs - lastScanNotifAt) < 350) return;
                            lastScanNotifAt = nowTs;
                            window.AndroidBridge.updateScanNotification(done | 0, total | 0, String(title || ''));
                        } catch (e) {}
                    };
                    if (targets.length) {
                        const CONCURRENCY = 3;
                        const totalCount = targets.length;
                        let cursor = 0;
                        let doneCount = 0;
                        pushScanNotif(0, totalCount, targets[0] ? (targets[0].name || '') : '', true);
                        const hydrateOne = async (tr) => {
                            if (mySeq !== coverHydrateSeq) return;
                            if (typeof window.__waitPriorityMeta === 'function') await window.__waitPriorityMeta();
                            if (mySeq !== coverHydrateSeq || tr._bgCoverChecked) return;
                            tr._bgCoverChecked = true;
                            try {
                                const meta = (typeof window.__readCompleteTrackTags === 'function')
                                    ? await window.__readCompleteTrackTags(tr, { preferThumb: true })
                                    : null;
                                if (mySeq !== coverHydrateSeq) return;
                                if (meta) {
                                    let changed = false;
                                    if (meta.title && meta.title !== tr.name && (!tr._metaFromCache || meta.title !== tr.rawName)) {
                                        tr.name = meta.title; changed = true;
                                    }
                                    if (meta.artist && meta.artist !== tr.artist) {
                                        tr.artist = meta.artist; changed = true;
                                    }
                                    if (meta.album && meta.album !== tr.album) {
                                        tr.album = meta.album; changed = true;
                                    }
                                    if (meta.albumArtist && meta.albumArtist !== tr.albumArtist) { tr.albumArtist = meta.albumArtist; changed = true; }
                                    if (meta.year && meta.year !== tr.year) { tr.year = meta.year; changed = true; }
                                    if (meta.genre && meta.genre !== tr.genre) { tr.genre = meta.genre; changed = true; }
                                    if (meta.composer && meta.composer !== tr.composer) { tr.composer = meta.composer; changed = true; }
                                    if (meta.lyrics && !tr.lyricsRaw) {
                                        tr.lyricsRaw = meta.lyrics;
                                        tr.lyrics = parseLRC(meta.lyrics);
                                        changed = true;
                                    }
                                    if (meta.pictureDataUrl) {
                                        // Nếu native đã trả sẵn thumbnail JPEG nhỏ gọn (< 32KB) thì dùng luôn, khỏi vẽ lại qua Canvas
                                        const picUrl = (meta.pictureDataUrl.length < 36000)
                                            ? meta.pictureDataUrl
                                            : (await dataUrlToThumb(meta.pictureDataUrl) || meta.pictureDataUrl);
                                        if (picUrl && (tr.cover !== picUrl || !tr._hasRealCover)) {
                                            tr.cover = picUrl;
                                            tr._hasRealCover = true;
                                            changed = true;
                                        }
                                    } else if (!meta.hasPicture && (tr.cover || tr._hasRealCover)) {
                                        tr.cover = null;
                                        tr._hasRealCover = false;
                                        changed = true;
                                    }
                                    tr._metaLoading = false;
                                    tr._metaLoaded = true;
                                    saveTrackMetaToCache(tr);
                                    patchMobileLibRowDom(tr);
                                    if (changed) {
                                        syncCoverToCurrentTrackIfMatch(tr);
                                        if (typeof window.__syncMobileMiniPlayer === 'function') window.__syncMobileMiniPlayer();
                                    }
                                } else {
                                    tr._metaLoading = false;
                                    tr._metaLoaded = true;
                                    saveTrackMetaToCache(tr);
                                    patchMobileLibRowDom(tr);
                                }
                            } catch (e) {
                                tr._metaLoading = false;
                                tr._metaLoaded = true;
                                patchMobileLibRowDom(tr);
                            } finally {
                                doneCount++;
                                pushScanNotif(doneCount, totalCount, tr.name || '', doneCount >= totalCount);
                            }
                        };
                        const runWorker = async () => {
                            while (cursor < targets.length) {
                                if (mySeq !== coverHydrateSeq) return;
                                if (typeof window.__waitPriorityMeta === 'function') await window.__waitPriorityMeta();
                                if (mySeq !== coverHydrateSeq) return;
                                const tr = targets[cursor++];
                                if (!tr) continue;
                                await hydrateOne(tr);
                                await new Promise(r2 => setTimeout(r2, 25));
                            }
                        };
                        const workers = [];
                        for (let w = 0; w < Math.min(CONCURRENCY, targets.length); w++) {
                            workers.push(runWorker());
                        }
                        await Promise.all(workers);
                        pushScanNotif(totalCount, totalCount, '', true);
                    }
                } finally {
                    coverHydrateRunning = false;
                    if (coverHydratePending) {
                        coverHydratePending = false;
                        setTimeout(() => { try { window.__hydrateMobileLibraryCovers(); } catch (e) {} }, 60);
                    } else {
                        try {
                            if (window.AndroidBridge && typeof window.AndroidBridge.updateScanNotification === 'function') {
                                window.AndroidBridge.updateScanNotification(0, 0, '');
                            }
                        } catch (e) {}
                    }
                }
            };


            // --- CHẾ ĐỘ CHỌN NHIỀU (nhấn giữ bài ở màn hình chính) ---
            const mSel = new Set();
            const selBar = document.getElementById('m-sel-bar');
            const selCountEl = document.getElementById('m-sel-count');
            function updateSelCount() {
                if (selCountEl) selCountEl.textContent = tr2('sel.count', '{n} tệp đã chọn').replace('{n}', mSel.size);
            }
            function enterSelect() { document.body.classList.add('m-selecting'); updateSelCount(); }
            function exitSelect() {
                mSel.clear();
                document.body.classList.remove('m-selecting');
                mLibList.querySelectorAll('.m-lib-item.selected').forEach(r => r.classList.remove('selected'));
            }
            function toggleSelect(tr, row, forceOn) {
                row = mLibRowMap.get(mLibTrackId(tr)) || row;   // hàng có thể đã được dựng lại trong lúc nhấn giữ
                if (forceOn || !mSel.has(tr)) { mSel.add(tr); row && row.classList.add('selected'); }
                else { mSel.delete(tr); row && row.classList.remove('selected'); }
                updateSelCount();
                if (!mSel.size) exitSelect();
            }
            window.__exitMobileSelect = function () {
                if (!document.body.classList.contains('m-selecting')) return false;
                exitSelect(); return true;
            };
            const selTracks = () => (window.__mobileLibrary || []).filter(t => mSel.has(t));
            document.getElementById('m-sel-cancel')?.addEventListener('click', exitSelect);
            document.getElementById('m-sel-playlist')?.addEventListener('click', () => {
                const list = selTracks();
                if (!list.length) return;
                exitSelect();
                if (typeof window.__openCreatePlaylistFromTracks === 'function') window.__openCreatePlaylistFromTracks(list);
            });
            document.getElementById('m-sel-share')?.addEventListener('click', () => {
                const list = selTracks();
                if (!list.length) return;
                const AB = window.AndroidBridge;
                if (!AB || typeof AB.shareNativeFiles !== 'function') { showToast(tr2('sel.unsupported', 'Chức năng này cần app Android'), 'info'); return; }
                const items = list.map(t => ({
                    id: String(t.nativeId || ''), loc: String(t.nativeLocation || ''),
                    name: String(t.nativeName || ((t.name || 'media') + '.' + (t.ext || 'mp3').toLowerCase())),
                    mime: String((t.file && t.file.type) || '')
                }));
                try { if (typeof openShareSheet === 'function') openShareSheet('locating'); } catch (e) {}
                exitSelect();
                const err = AB.shareNativeFiles(JSON.stringify(items));
                if (err) { try { if (typeof closeShareSheet === 'function') closeShareSheet(); } catch (e) {} showToast('Chia sẻ lỗi: ' + err, 'error'); }
            });
            let pendingDelete = null;
            document.getElementById('m-sel-delete')?.addEventListener('click', () => { const l = selTracks(); if (l.length) deleteTracksFlow(l, true); });
            window.__deleteTracksFlow = (list) => deleteTracksFlow(list, false);
            async function deleteTracksFlow(list, fromSelection) {
                if (!list || !list.length) return;
                const AB = window.AndroidBridge;
                if (!AB || typeof AB.deleteNativeFiles !== 'function') { showToast(tr2('sel.unsupported', 'Chức năng này cần app Android'), 'info'); return; }
                const ok = await confirmDialog(tr2('sel.del_msg', 'Xóa vĩnh viễn {n} tệp khỏi máy? Hành động này không thể hoàn tác.').replace('{n}', list.length),
                    tr2('sel.del_ok', 'Xóa'), tr2('sel.del_title', 'Xóa khỏi máy'));
                if (!ok) return;
                pendingDelete = list;
                if (fromSelection) exitSelect();
                AB.deleteNativeFiles(JSON.stringify(list.map((t, k) => ({ k, id: String(t.nativeId || ''), loc: String(t.nativeLocation || '') }))));
            }
            // Kết quả xóa từ native: gỡ các bài đã xóa khỏi thư viện / hàng đợi
            window.__onNativeDeleteResult = function (res) {
                try {
                    const list = pendingDelete || []; pendingDelete = null;
                    const gone = new Set((res && res.deleted || []).map(k => list[k]).filter(Boolean));
                    if (gone.size) {
                        const cur = playlist[currentIndex] || null;
                        const curId = cur ? mLibTrackId(cur) : '';
                        const playingGone = !!(cur && (gone.has(cur) || (curId && Array.from(gone).some(g => mLibTrackId(g) === curId))));
                        // Bài đang phát bị xóa: chọn trước bài kế (theo đúng thứ tự Playlist/Shuffle) để phát tiếp sau khi dọn hàng đợi
                        let nextTr = null;
                        if (playingGone) {
                            const useShuf = !!(isShuffle && shuffleInitialized && shuffleOrder.length === playlist.length);
                            const order = useShuf ? shuffleOrder : playlist.map((_, i) => i);
                            const pos = order.indexOf(currentIndex);
                            for (let st = 1; st < order.length; st++) {
                                const t = playlist[order[(pos + st) % order.length]];
                                if (t && !gone.has(t) && !(curId && mLibTrackId(t) === curId)) { nextTr = t; break; }
                            }
                            if (!nextTr) { try { audio.pause(); audio.src = ''; } catch (e) {} }
                        }
                        for (let i = playlist.length - 1; i >= 0; i--) {
                            if (gone.has(playlist[i])) { playlist.splice(i, 1); if (currentIndex > i) currentIndex--; else if (currentIndex === i) currentIndex = -1; }
                        }
                        if (playingGone) currentIndex = -1;
                        window.__mobileLibrary = (window.__mobileLibrary || []).filter(t => !gone.has(t));
                        if (typeof shuffleInitialized !== 'undefined' && shuffleInitialized && typeof generateShuffleOrder === 'function') generateShuffleOrder();
                        try { updatePlaylistUI(); } catch (e) {}
                        renderMobileLibrary();
                        try { if (typeof window.__refreshMobileLibraryViews === 'function') window.__refreshMobileLibraryViews(); } catch (e) {}
                        try { syncMobileMiniPlayer(); } catch (e) {}
                        if (playingGone && nextTr) {
                            const ni = playlist.indexOf(nextTr);
                            if (ni >= 0) playTrack(ni);
                        }
                        showToast(tr2('sel.del_done', 'Đã xóa {n} tệp').replace('{n}', gone.size), 'delete');
                    }
                    if (res && res.failed > 0) showToast(tr2('sel.del_fail', 'Không xóa được {n} tệp').replace('{n}', res.failed), 'error');
                } catch (e) {}
            };

            function renderMobileLibrary() {
                if (!document.documentElement.classList.contains('m-ui') || !mLibList) return;
                if (!window.__mobileLibrary.length && playlist.length) syncMobileLibraryFromPlaylist();
                sortMobileLib0Z(window.__mobileLibrary);
                // Dựng lại (đổi sắp xếp, bài đang phát đổi...) không được đẩy danh sách về đầu: nhớ vị trí cuộn, chỉ về đầu khi người dùng đổi từ khóa tìm kiếm
                let keepScroll = mLibList.scrollTop;
                if (renderMobileLibrary._q !== mLibQuery) keepScroll = 0;
                renderMobileLibrary._q = mLibQuery;
                mLibList.innerHTML = '';
                mLibRowMap.clear();
                const q = mLibQuery;
                const activeTrack = playlist[currentIndex] || null;
                const activeId = activeTrack ? mLibTrackId(activeTrack) : '';
                const lib = window.__mobileLibrary.slice();
                const seq = (renderMobileLibrary._seq = (renderMobileLibrary._seq || 0) + 1);
                const makeRow = (tr) => {
                    const tid = mLibTrackId(tr);
                    const isAct = !!(activeId && tid === activeId);
                    const row = document.createElement('div');
                    row.className = 'm-lib-item' + (isAct ? ' active' : '') + (tr._metaLoading ? ' is-scanning' : '');
                    row.dataset.tid = tid;
                    if (tid) mLibRowMap.set(tid, row);
                    row.innerHTML =
                        '<div class="m-lib-art"><span class="material-symbols-rounded">music_note</span>' + (tr.cover ? '<img loading="lazy" decoding="async" src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '') + '</div>' +
                        '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                        '<button type="button" class="m-lib-more" aria-label="More"><span class="material-symbols-rounded" style="font-size:20px;">more_vert</span></button>';
                    row.querySelector('.m-lib-title').textContent = tr.name || '';
                    row.querySelector('.m-lib-artist').textContent = tr.artist || '';
                    if (mSel.has(tr)) row.classList.add('selected');
                    row.addEventListener('click', () => {
                        if (row._lpFired) { row._lpFired = false; return; }
                        if (document.body.classList.contains('m-selecting')) { toggleSelect(tr, row); return; }
                        // Chọn bài từ màn hình chính -> tự reset hàng đợi tạm về toàn bộ thư viện 0–Z
                        replaceQueueAndPlay(window.__mobileLibrary, tr);
                    });
                    // Nhấn giữ -> vào chế độ chọn nhiều
                    (function () {
                        let lpT = null, sx = 0, sy = 0;
                        const cancel = () => { clearTimeout(lpT); lpT = null; };
                        row.addEventListener('pointerdown', (e) => {
                            if (e.target.closest('.m-lib-more') || (e.pointerType === 'mouse' && e.button !== 0)) return;
                            sx = e.clientX; sy = e.clientY; cancel();
                            lpT = setTimeout(() => {
                                lpT = null; row._lpFired = true;
                                try { if (navigator.vibrate) navigator.vibrate(18); } catch (er) {}
                                if (!document.body.classList.contains('m-selecting')) enterSelect();
                                toggleSelect(tr, row, true);
                            }, 450);
                        });
                        row.addEventListener('pointermove', (e) => { if (lpT && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) cancel(); });
                        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => row.addEventListener(ev, cancel));
                        row.addEventListener('contextmenu', (e) => e.preventDefault());
                    })();
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
                    return row;
                };
                // Hàng đầu hiện ngay, phần còn lại dựng dần theo từng đợt để không đứng khựng khi thư viện lớn
                let idx = 0, restoredAt = 0;
                const step = (limit) => {
                    if (seq !== renderMobileLibrary._seq) return;
                    const frag = document.createDocumentFragment();
                    let n = 0;
                    while (idx < lib.length && n < limit) {
                        const tr = lib[idx++];
                        if (!tr) continue;
                        if (q) {
                            const hay = removeVietnameseTones((tr.name || '') + ' ' + (tr.artist || '')).toLowerCase();
                            if (!hay.includes(q)) continue;
                        }
                        frag.appendChild(makeRow(tr)); n++;
                    }
                    mLibList.appendChild(frag);
                    if (keepScroll > 0 && (mLibList.scrollHeight >= keepScroll + mLibList.clientHeight || idx >= lib.length)) {
                        const prevSB = mLibList.style.scrollBehavior;
                        mLibList.style.scrollBehavior = 'auto';
                        mLibList.scrollTop = keepScroll;
                        mLibList.style.scrollBehavior = prevSB;
                        restoredAt = keepScroll; keepScroll = 0;
                    }
                    // Chiều cao hàng chỉ là ước lượng tới khi dựng xong: chốt lại vị trí lần cuối nếu người dùng chưa tự cuộn
                    if (restoredAt > 0 && idx >= lib.length) {
                        if (Math.abs(mLibList.scrollTop - restoredAt) < 400) { mLibList.style.scrollBehavior = 'auto'; mLibList.scrollTop = restoredAt; mLibList.style.scrollBehavior = ''; }
                        restoredAt = 0;
                    }
                    if (idx < lib.length) requestAnimationFrame(() => step(100));
                };
                // Đang ở giữa danh sách dài: dựng đủ số hàng để tới được vị trí cũ ngay trong lần đầu (khỏi nháy về đầu rồi nhảy xuống)
                step(keepScroll > 0 ? Math.min(2000, Math.ceil((keepScroll + mLibList.clientHeight) / 60) + 20) : 40);
            }
            // Nhiều nơi gọi dồn dập khi nạp thư viện -> gộp thành một lần dựng
            let mLibRenderT = null;
            window.__renderMobileLibrary = function () { clearTimeout(mLibRenderT); mLibRenderT = setTimeout(renderMobileLibrary, 90); };
            window.__renderMobileLibraryNow = renderMobileLibrary;

            const mMiniPlayIcon = mMiniPlay ? mMiniPlay.querySelector('.material-symbols-rounded') : null;
            const mPlRepeatIcon = mPlRepeat ? mPlRepeat.querySelector('.material-symbols-rounded') : null;
            const mMiniCache = { title: null, artist: null, scanning: null, loading: null, playIcon: null, shuffle: null, repeatOn: null, repeatIcon: null };

            function syncMobileMiniPlayer() {
                if (!document.documentElement.classList.contains('m-ui')) return;
                const tr = playlist[currentIndex];
                if (tr) {
                    const nextTitle = tr.name || 'Media Player';
                    const nextArtist = tr.artist || 'UNKNOWN ARTIST';
                    if (mMiniTitle && mMiniCache.title !== nextTitle) {
                        mMiniCache.title = nextTitle;
                        mMiniTitle.textContent = nextTitle;
                    }
                    if (mMiniArtist && mMiniCache.artist !== nextArtist) {
                        mMiniCache.artist = nextArtist;
                        mMiniArtist.textContent = nextArtist;
                    }
                    if (mMiniArt && !(mMiniArt._tr === tr && mMiniArt._cv === (tr.cover || ''))) {
                        mMiniArt._tr = tr; mMiniArt._cv = tr.cover || '';
                        mMiniArt.innerHTML = '<span class="material-symbols-rounded">music_note</span>'
                            + (tr.cover ? '<img src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '');
                    }
                    const nextScan = !!tr._metaLoading;
                    if (mMiniArt && mMiniCache.scanning !== nextScan) {
                        mMiniCache.scanning = nextScan;
                        mMiniArt.classList.toggle('is-scanning', nextScan);
                    }
                }
                if (mMiniPlay) {
                    const isLoading = !!(tr && (tr._metaLoading || (audio.currentSrc && !audio.ended && (audio.seeking || (!audio.paused && audio.readyState < 3) || (tr.canOpen === false && !audio.paused)))));
                    if (mMiniCache.loading !== isLoading) {
                        mMiniCache.loading = isLoading;
                        mMiniPlay.classList.toggle('is-loading', isLoading);
                    }
                    const nextPlayIcon = (audio.paused || audio.ended) ? 'play_arrow' : 'pause';
                    if (mMiniPlayIcon && mMiniCache.playIcon !== nextPlayIcon) {
                        mMiniCache.playIcon = nextPlayIcon;
                        mMiniPlayIcon.textContent = nextPlayIcon;
                    }
                }
                const nextShuffle = !!isShuffle;
                if (mPlShuffle && mMiniCache.shuffle !== nextShuffle) {
                    mMiniCache.shuffle = nextShuffle;
                    mPlShuffle.classList.toggle('active', nextShuffle);
                }
                if (mPlRepeat) {
                    const nextRepOn = repeatMode > 0;
                    if (mMiniCache.repeatOn !== nextRepOn) {
                        mMiniCache.repeatOn = nextRepOn;
                        mPlRepeat.classList.toggle('active', nextRepOn);
                    }
                    const nextRepIcon = repeatMode === 2 ? 'repeat_one' : 'repeat';
                    if (mPlRepeatIcon && mMiniCache.repeatIcon !== nextRepIcon) {
                        mMiniCache.repeatIcon = nextRepIcon;
                        mPlRepeatIcon.textContent = nextRepIcon;
                    }
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
            // Nút hẹn giờ trong playlist: khi đang bật thì sáng lên và hiện số phút / số bài còn lại
            window.__syncMPlSleep = function (label) {
                if (!mPlSleep) return;
                mPlSleep.classList.toggle('active', !!label);
                mPlSleep.classList.toggle('has-txt', !!label);
                let tx = mPlSleep.querySelector('.m-pl-sl-txt');
                if (label) {
                    if (!tx) { tx = document.createElement('span'); tx.className = 'm-pl-sl-txt'; mPlSleep.appendChild(tx); }
                    tx.textContent = label;
                } else if (tx) tx.remove();
            };
            if (typeof sleepState !== 'undefined' && sleepState) { try { updateSleepUI(); } catch (e) {} }

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
                const paneAlbums = document.getElementById('m-pane-albums');
                const albumListEl = document.getElementById('m-album-list');
                const paneLiked = document.getElementById('m-pane-liked');
                const paneFolders = document.getElementById('m-pane-folders');
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
                // API cho bottom sheet tùy chọn bài hát (js/15-song-sheet.js)
                window.__plApi = {
                    load: loadPls, save: savePls, key: trackKeyOf,
                    rerender: () => { try { renderMobilePlaylists(); } catch (e) {} },
                    cover: (pl, size, tracks) => renderPlCoverHtml(pl, size, tracks),
                    resolve: (pl) => resolvePlaylistTracks(pl),
                    isAi: (pl) => isAiPl(pl),
                    pool: () => getLibPool(),
                    replaceAndPlay: (list, tr) => replaceQueueAndPlay(list, tr)
                };

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

                // Playlist do AI tạo: cạnh tên có icon Gemini
                const isAiPl = (pl) => !!(pl && (pl.ai || String(pl.id || '').startsWith('pl_ai_')));
                let __gmnN = 0;
                const GEMINI_SVG = (px) => { const gid = 'gmnG' + (++__gmnN); return `<svg class="m-ai-badge" width="${px}" height="${px}" viewBox="0 0 28 28" aria-label="Gemini" role="img" style="flex:none;vertical-align:-3px;margin-left:6px;"><defs><linearGradient id="${gid}" x1="4" y1="24" x2="24" y2="4" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4285f4"/><stop offset=".55" stop-color="#9b72cb"/><stop offset="1" stop-color="#d96570"/></linearGradient></defs><path fill="url(#${gid})" d="M14 0C14.6 7.6 20.4 13.4 28 14 20.4 14.6 14.6 20.4 14 28 13.4 20.4 7.6 14.6 0 14 7.6 13.4 13.4 7.6 14 0Z"/></svg>`; };
                function setPlTitle(el, pl) {
                    el.textContent = pl.name;
                    if (isAiPl(pl)) el.insertAdjacentHTML('beforeend', GEMINI_SVG(16));
                }
                function renderPlCoverHtml(pl, size, tracks) {
                    const S = size || 56;
                    if (isAiPl(pl) && pl.coverType === 'icon' && pl.iconName === 'auto_awesome') pl = Object.assign({}, pl, { coverType: 'default' });   // playlist AI cũ: dùng ảnh ghép mặc định
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
                    return renderAutoCollage(pl, S, tracks);
                }

                // Ảnh ghép tự động: ≥4 bài → 4 ảnh; 3/2/1 bài → bố cục riêng; 0 → icon lưới. Chọn ngẫu nhiên (cố định theo playlist cho đến khi số bài đổi)
                const __collagePick = new Map();
                function renderAutoCollage(pl, S, tracks) {
                    const list = Array.isArray(tracks) ? tracks : [];
                    if (!list.length) {
                        return `<div class="m-pl-cover" style="width:${S}px;height:${S}px;"><span class="material-symbols-rounded" style="font-size:${Math.round(S * 0.5)}px;opacity:.75;">grid_view</span></div>`;
                    }
                    const withArt = list.filter(t => t && t.cover);
                    const sigKey = pl.id + '|' + list.length;
                    let picked = __collagePick.get(sigKey);
                    // chọn lại nếu lần trước chưa có ảnh mà giờ đã có
                    if (!picked || (picked.some(t => !t.cover) && withArt.length > picked.filter(t => t.cover).length)) {
                        const pool = (withArt.length >= Math.min(4, list.length) ? withArt : list).slice();
                        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
                        picked = pool.slice(0, 4);
                        if (__collagePick.size > 200) __collagePick.clear();
                        __collagePick.set(sigKey, picked);
                    }
                    const n = picked.length;
                    const cell = (t, x, y, d, round) => {
                        const img = t.cover ? `<img src="${t.cover}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">` : `<span class="material-symbols-rounded" style="font-size:${Math.round(S * d * 0.5)}px;opacity:.7;">music_note</span>`;
                        return `<div style="position:absolute;left:${x}%;top:${y}%;width:${d}%;height:${d}%;border-radius:${round};overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb, var(--md-sys-color-on-secondary-container) 14%, transparent);">${img}</div>`;
                    };
                    let inner = '';
                    if (n === 1) inner = cell(picked[0], 0, 0, 100, '0');
                    else if (n === 2) inner = cell(picked[0], 4, 4, 58, '50%') + cell(picked[1], 38, 38, 58, '50%');
                    else if (n === 3) inner = cell(picked[0], 26, 2, 48, '50%') + cell(picked[1], 2, 50, 48, '50%') + cell(picked[2], 50, 50, 48, '50%');
                    else inner = cell(picked[0], 2, 6, 44, '50%') + cell(picked[1], 54, 0, 44, '50%') + cell(picked[2], 2, 54, 44, '50%') + cell(picked[3], 54, 48, 44, '50%');
                    return `<div class="m-pl-cover" style="width:${S}px;height:${S}px;display:block;">${inner}</div>`;
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
                    paneAlbums?.classList.toggle('active', tab === 'albums');
                    paneLiked?.classList.toggle('active', tab === 'liked');
                    paneFolders?.classList.toggle('active', tab === 'folders');
                    paneDetail?.classList.remove('active');
                    document.getElementById('m-lib-tabs')?.style.removeProperty('display');
                    if (tab === 'playlists') renderMobilePlaylists();
                    if (tab === 'artists') renderMobileArtists();
                    if (tab === 'albums') renderMobileAlbums();
                    if (tab === 'liked') renderMobileLiked();
                    if (tab === 'folders') renderMobileFolders();
                }

                function rowArtHtml(tr) {
                    return '<div class="m-lib-art"><span class="material-symbols-rounded">music_note</span>' + (tr && tr.cover ? '<img src="' + tr.cover + '" alt="" onload="this.classList.add(\'loaded\')" onerror="this.remove()">' : '') + '</div>';
                }
                function emptyHtml(icon, text) {
                    return '<div class="m-pl-empty"><span class="material-symbols-rounded">' + icon + '</span><p>' + text + '</p></div>';
                }


                // ===== Tách nhiều nghệ sĩ (Cài đặt > Quản lý nhạc > Artists) =====
                const LIB_CFG_KEY = 'settings_mobile_library_v1';
                function libCfgNow() {
                    const d = { charDelims: '/, ;, +, &', wordDelims: 'featuring, feat., feat, ft., ft, vs., x', extractTitle: true, groupAlbumArtist: false };
                    try { Object.assign(d, JSON.parse(localStorage.getItem(LIB_CFG_KEY) || '{}')); } catch (e) {}
                    return d;
                }
                const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Tách một chuỗi nghệ sĩ: dấu phân cách ký tự (có thể escape bằng \), rồi từ phân cách (feat., ft., vs., x...) cách nhau bởi khoảng trắng
                function splitArtistString(str, cfg) {
                    str = String(str || '').trim();
                    if (!str) return [];
                    const chars = String(cfg.charDelims || '').split(',').map(x => x.trim()).filter(x => x.length === 1);
                    const words = String(cfg.wordDelims || '').split(',').map(x => x.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
                    let parts = [''];
                    for (let i = 0; i < str.length; i++) {
                        const ch = str[i];
                        if (ch === '\\' && i + 1 < str.length && chars.indexOf(str[i + 1]) >= 0) { parts[parts.length - 1] += str[i + 1]; i++; continue; }
                        if (chars.indexOf(ch) >= 0) { parts.push(''); continue; }
                        parts[parts.length - 1] += ch;
                    }
                    if (words.length) {
                        const re = new RegExp('\\s+(?:' + words.map(reEsc).join('|') + ')\\s+', 'i');
                        const out = [];
                        parts.forEach(pt => pt.replace(/[()\[\]]/g, ' ').split(re).forEach(x => out.push(x)));
                        parts = out;
                    }
                    return parts.map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
                }
                // Nghệ sĩ của một bài: tag artist (đã tách) + nghệ sĩ khách mời trong tiêu đề, hoặc theo Album Artist nếu bật
                window.__artistsOfTrack = function (t) {
                    const cfg = libCfgNow();
                    const out = [], seen = new Set();
                    const add = (n) => { const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(n); } };
                    const aa = String(t.albumArtist || '').trim();
                    if (cfg.groupAlbumArtist && aa && !/^various artists?$/i.test(aa)) {
                        splitArtistString(aa, cfg).forEach(add);
                        if (out.length) return out;
                    }
                    const raw = String(t.artist || '').trim();
                    if (raw && !/^unknown artist$/i.test(raw)) splitArtistString(raw, cfg).forEach(add);
                    if (cfg.extractTitle) {
                        const title = String(t.name || '');
                        const m = title.match(/[(\[]\s*(?:featuring|feat\.?|ft\.?|with)\s+([^)\]]+)[)\]]/i) || title.match(/\s(?:featuring|feat\.?|ft\.?)\s+(.+)$/i);
                        if (m && m[1]) splitArtistString(m[1], cfg).forEach(add);
                    }
                    return out.length ? out : ['UNKNOWN ARTIST'];
                };

                window.addEventListener('library-cfg-changed', () => { try { if (activeTab === 'artists') renderMobileArtists(); if (activeTab === 'albums') renderMobileAlbums(); } catch (e) {} });


                // --- Tab Album: phân loại theo tag Album trong metadata; ẩn album ít bài hơn "Số bài tối thiểu mỗi album" ---
                const albumNameOf = (t) => { const a = String(t.album || '').trim(); return (!a || /^unknown( album)?$/i.test(a)) ? '' : a; };
                function renderMobileAlbums() {
                    if (!albumListEl) return;
                    const minTracks = Math.max(1, Number(libCfgNow().minTracks) || 1);
                    const unknownLbl = tr2('pl.unknown_album', 'Album không rõ');
                    const groups = new Map();
                    getLibPool().forEach(t => {
                        if (!t) return;
                        const nm = albumNameOf(t);
                        const k = nm.toLowerCase();
                        if (!groups.has(k)) groups.set(k, { key: k, name: nm || unknownLbl, tracks: [] });
                        groups.get(k).tracks.push(t);
                    });
                    const arr = Array.from(groups.values()).filter(g => g.tracks.length >= minTracks).sort((a, b) => {
                        if (!a.key !== !b.key) return a.key ? -1 : 1;   // "Album không rõ" xuống cuối
                        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                    });
                    albumListEl.innerHTML = '';
                    if (!arr.length) { albumListEl.innerHTML = emptyHtml('album', tr2('pl.albums_empty', 'Chưa có album nào.')); return; }
                    arr.forEach(g => {
                        const row = document.createElement('div');
                        row.className = 'm-lib-item';
                        row.innerHTML = rowArtHtml(g.tracks.find(t => t.cover) || g.tracks[0]) +
                            '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                            '<span class="material-symbols-rounded" style="opacity:.5;">chevron_right</span>';
                        row.querySelector('.m-lib-title').textContent = g.name;
                        const arts = new Set(g.tracks.map(t => (String(t.albumArtist || '').trim() || window.__artistsOfTrack(t)[0] || '').toLowerCase()));
                        const who = arts.size === 1 ? (String(g.tracks[0].albumArtist || '').trim() || window.__artistsOfTrack(g.tracks[0])[0] || '') : tr2('pl.various_artists', 'Nhiều nghệ sĩ');
                        row.querySelector('.m-lib-artist').textContent = (who && !/^unknown artist$/i.test(who) ? who + ' • ' : '') + tr2('pl.tracks_count', '{n} bài hát').replace('{n}', g.tracks.length);
                        row.addEventListener('click', () => {
                            const id = 'virt_album_' + g.key;
                            virtualPls[id] = { id, name: g.name, mode: 'virtual', returnTab: 'albums',
                                getTracks: () => getLibPool().filter(t => t && albumNameOf(t).toLowerCase() === g.key) };
                            openPlaylistDetail(id);
                        });
                        albumListEl.appendChild(row);
                    });
                }

                // --- Tab Nghệ sĩ: gom bài theo ca sĩ, chạm để mở danh sách bài của ca sĩ đó ---
                function renderMobileArtists() {
                    if (!artistListEl) return;
                    const groups = new Map();
                    getLibPool().forEach(t => {
                        if (!t) return;
                        window.__artistsOfTrack(t).forEach(name => {
                            const k = name.toLowerCase();
                            if (!groups.has(k)) groups.set(k, { name, tracks: [] });
                            groups.get(k).tracks.push(t);
                        });
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
                                getTracks: () => getLibPool().filter(t => t && window.__artistsOfTrack(t).some(n => n.toLowerCase() === g.name.toLowerCase())) };
                            openPlaylistDetail(id);
                        });
                        artistListEl.appendChild(row);
                    });
                }


                // --- Tab Thư mục: duyệt theo cây thư mục chứa nhạc; đầu trang có breadcrumb (Home > ... >) và tên thư mục hiện tại ---
                let foldPath = [];   // các tên thư mục từ gốc tới thư mục đang xem
                function trackFolderSegs(t) {
                    let loc = String((t && (t.nativeLocation || (t.file && t.file.__nativeLocation))) || '').replace(/\\/g, '/');
                    if (!loc || loc[0] !== '/') return null;
                    let segs = loc.split('/').filter(Boolean);
                    segs.pop();   // bỏ tên tệp
                    if (segs[0] === 'storage' && segs.length >= 2) segs = segs.slice(segs[1] === 'emulated' ? 3 : 2);
                    else if (segs[0] === 'sdcard') segs = segs.slice(1);
                    return segs;
                }
                function buildFolderTree() {
                    const root = { name: '', children: new Map(), tracks: [], total: 0 };
                    getLibPool().forEach(t => {
                        if (!t) return;
                        const segs = trackFolderSegs(t) || [tr2('pl.folder_other', 'Khác')];
                        let node = root;
                        node.total++;
                        segs.forEach(sg => {
                            if (!node.children.has(sg)) node.children.set(sg, { name: sg, children: new Map(), tracks: [], total: 0 });
                            node = node.children.get(sg);
                            node.total++;
                        });
                        node.tracks.push(t);
                    });
                    return root;
                }
                function renderMobileFolders() {
                    const listEl = document.getElementById('m-fold-list');
                    const headEl = document.getElementById('m-fold-head');
                    const crumbsEl = document.getElementById('m-fold-crumbs');
                    const titleEl = document.getElementById('m-fold-title');
                    if (!listEl) return;
                    const root = buildFolderTree();
                    // Đi theo đường dẫn hiện tại; nếu thư mục không còn tồn tại thì lùi lên
                    let node = root; const valid = [];
                    for (const sg of foldPath) { const c = node.children.get(sg); if (!c) break; node = c; valid.push(sg); }
                    foldPath = valid;
                    // Thư mục chỉ có đúng 1 thư mục con và không có bài: không cần dừng ở đó khi ở gốc
                    headEl.classList.toggle('show', foldPath.length > 0);
                    crumbsEl.innerHTML = '';
                    if (foldPath.length) {
                        const mk = (icon, text, depth) => {
                            const b = document.createElement('button');
                            b.type = 'button'; b.className = 'm-fold-crumb';
                            if (icon) b.innerHTML = '<span class="material-symbols-rounded">' + icon + '</span>';
                            else { b.innerHTML = '<span class="t"></span>'; b.firstChild.textContent = text; }
                            b.addEventListener('click', () => { foldPath = foldPath.slice(0, depth); renderMobileFolders(); });
                            crumbsEl.appendChild(b);
                            const sep = document.createElement('span');
                            sep.className = 'material-symbols-rounded m-fold-sep'; sep.textContent = 'chevron_right';
                            crumbsEl.appendChild(sep);
                        };
                        mk('home', '', 0);
                        for (let i = 0; i < foldPath.length - 1; i++) mk('', foldPath[i], i + 1);
                        titleEl.textContent = foldPath[foldPath.length - 1];
                    }
                    const foldKey = foldPath.join('/');
                    const keepFold = (renderMobileFolders._k === foldKey) ? listEl.scrollTop : 0;
                    renderMobileFolders._k = foldKey;
                    listEl.innerHTML = '';
                    if (keepFold) requestAnimationFrame(() => { listEl.scrollTop = keepFold; });
                    const subs = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                    if (!subs.length && !node.tracks.length) { listEl.innerHTML = emptyHtml('folder_off', tr2('pl.folders_empty', 'Chưa có thư mục nào.')); return; }
                    subs.forEach(sub => {
                        const row = document.createElement('div');
                        row.className = 'm-lib-item';
                        row.innerHTML = '<div class="m-fold-ico"><span class="material-symbols-rounded">folder</span></div>' +
                            '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                            '<span class="material-symbols-rounded" style="opacity:.5;">chevron_right</span>';
                        row.querySelector('.m-lib-title').textContent = sub.name;
                        row.querySelector('.m-lib-artist').textContent = tr2('pl.tracks_count', '{n} bài hát').replace('{n}', sub.total);
                        row.addEventListener('click', () => { foldPath = foldPath.concat([sub.name]); renderMobileFolders(); const l = document.getElementById('m-fold-list'); if (l) l.scrollTop = 0; });
                        listEl.appendChild(row);
                    });
                    const activeTr = playlist[currentIndex] || null;
                    const activeKey = activeTr ? trackKeyOf(activeTr) : '';
                    const tracks = node.tracks.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
                    tracks.forEach(tr => {
                        const row = document.createElement('div');
                        row.className = 'm-lib-item' + (activeKey && trackKeyOf(tr) === activeKey ? ' active' : '');
                        row.dataset.key = trackKeyOf(tr);
                        row.innerHTML = rowArtHtml(tr) + '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>';
                        row.querySelector('.m-lib-title').textContent = tr.name || '';
                        row.querySelector('.m-lib-artist').textContent = tr.artist || '';
                        row.addEventListener('click', () => replaceQueueAndPlay(tracks, tr));
                        listEl.appendChild(row);
                    });
                }
                // Back trong tab Thư mục: lên một cấp
                // "Open in Files": thu player, sang tab Thư mục và mở đúng thư mục chứa bài
                window.__openTrackInFolders = function (t) {
                    if (!document.documentElement.classList.contains('m-ui') || !t) return false;
                    const segs = trackFolderSegs(t) || [tr2('pl.folder_other', 'Khác')];
                    document.body.classList.remove('m-player-expanded');
                    if (currentIndex >= 0 && playlist[currentIndex]) document.body.classList.add('m-mini-visible');
                    document.body.classList.remove('m-more-open');
                    foldPath = segs.slice();
                    setMobileLibTab('folders');
                    renderMobileFolders();
                    const l = document.getElementById('m-fold-list'); if (l) l.scrollTop = 0;
                    const k = trackKeyOf(t);
                    requestAnimationFrame(() => {
                        const row = Array.from((l || document).querySelectorAll('.m-lib-item[data-key]')).find(r => r.dataset.key === k);
                        if (row) { row.scrollIntoView({ block: 'center' }); row.classList.remove('m-locate-flash'); void row.offsetWidth; row.classList.add('m-locate-flash'); setTimeout(() => row.classList.remove('m-locate-flash'), 1400); }
                    });
                    return true;
                };
                window.__mobileFoldersBack = function () {
                    if (activeTab === 'folders' && !openedPlId && foldPath.length) { foldPath = foldPath.slice(0, -1); renderMobileFolders(); return true; }
                    return false;
                };

                // --- Tab Yêu thích: các bài đã bấm trái tim ---
                function renderMobileLiked() {
                    if (!likedListEl) return;
                    const liked = getLibPool().filter(t => t && window.__isLiked && window.__isLiked(t));
                    const keepLiked = likedListEl.scrollTop;
                    likedListEl.innerHTML = '';
                    if (keepLiked) requestAnimationFrame(() => { likedListEl.scrollTop = keepLiked; });
                    if (!liked.length) { likedListEl.innerHTML = emptyHtml('favorite', tr2('pl.liked_empty', 'Chưa có bài hát yêu thích nào.')); return; }
                    const activeTr = playlist[currentIndex] || null;
                    const activeKey = activeTr ? trackKeyOf(activeTr) : '';
                    liked.forEach(tr => {
                        const row = document.createElement('div');
                        row.className = 'm-lib-item' + (activeKey && trackKeyOf(tr) === activeKey ? ' active' : '');
                        row.dataset.key = trackKeyOf(tr);
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
                            renderPlCoverHtml(pl, 56, plTracks) +
                            '<div class="m-lib-meta"><div class="m-lib-title"></div><div class="m-lib-artist"></div></div>' +
                            '<button type="button" class="m-lib-more" aria-label="Delete"><span class="material-symbols-rounded" style="font-size:20px;">delete</span></button>';
                        setPlTitle(card.querySelector('.m-lib-title'), pl);
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
                    const t = playlist[currentIndex] || null;
                    const k = t ? trackKeyOf(t) : '';
                    // Chi tiết danh sách phát / nghệ sĩ, tab Yêu thích, tab Thư mục: bài sáng phải đúng bài đang phát
                    [plDetailList, likedListEl, document.getElementById('m-fold-list')].forEach(listEl => {
                        if (!listEl) return;
                        listEl.querySelectorAll('.m-lib-item[data-key]').forEach(r => r.classList.toggle('active', !!k && r.dataset.key === k));
                    });
                };
                // Đổi bài (kể cả tự chuyển bài khi đang ở tab khác) -> cập nhật ngay
                ['loadedmetadata', 'play', 'emptied'].forEach(ev => audio.addEventListener(ev, () => window.__syncPldActive()));


                // Kéo-thả sắp xếp bài trong danh sách phát (giống hàng đợi tạm): bài đang kéo chạy theo ngón tay, các bài khác tự né ra
                function pldStartDrag(e, item, plId) {
                    if (e.button !== undefined && e.button !== 0) return;
                    const container = plDetailList;
                    const items = Array.from(container.querySelectorAll('.m-lib-item'));
                    const i0 = items.indexOf(item);
                    if (i0 < 0) return;
                    e.preventDefault(); e.stopPropagation();
                    container.classList.add('m-reordering');
                    const cTop = () => container.getBoundingClientRect().top;
                    const base = cTop();
                    const tops = items.map(el => el.getBoundingClientRect().top - base + container.scrollTop);
                    const hs = items.map(el => el.getBoundingClientRect().height);
                    const gap = items.length > 1 ? Math.max(0, (tops[1] - tops[0]) - hs[0]) : 0;
                    const step = hs[i0] + gap;
                    const centers = items.map((el, k) => tops[k] + hs[k] / 2);
                    const minDy = tops[0] - tops[i0];
                    const maxDy = tops[items.length - 1] + hs[items.length - 1] - (tops[i0] + hs[i0]);
                    const startY = e.clientY, startScroll = container.scrollTop;
                    let pointerY = e.clientY, target = i0, raf = null, dy = 0;
                    item.classList.add('dragging');
                    item.style.transition = 'none'; item.style.zIndex = '5'; item.style.position = 'relative';
                    items.forEach((el, k) => { if (k !== i0) el.style.transition = 'transform .22s cubic-bezier(.2,0,0,1)'; });
                    const handle = e.currentTarget || e.target;
                    try { handle.setPointerCapture(e.pointerId); } catch (er) {}
                    function layout() {
                        dy = (pointerY - startY) + (container.scrollTop - startScroll);
                        dy = Math.max(minDy, Math.min(maxDy, dy));
                        item.style.transform = 'translateY(' + dy + 'px) scale(1.02)';
                        const dTop = tops[i0] + dy, dBottom = dTop + hs[i0];
                        let t = i0;
                        for (let k = 0; k < items.length; k++) {
                            if (k === i0) continue;
                            if (k > i0 && dBottom > centers[k]) t = Math.max(t, k);
                            if (k < i0 && dTop < centers[k]) t = Math.min(t, k);
                        }
                        target = t;
                        items.forEach((el, k) => {
                            if (k === i0) return;
                            let shift = 0;
                            if (k > i0 && k <= t) shift = -step; else if (k < i0 && k >= t) shift = step;
                            el.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
                        });
                    }
                    function autoScroll() {
                        const r = container.getBoundingClientRect(), zone = 56;
                        let v = 0;
                        if (pointerY < r.top + zone) v = -Math.min(14, (r.top + zone - pointerY) / 3);
                        else if (pointerY > r.bottom - zone) v = Math.min(14, (pointerY - (r.bottom - zone)) / 3);
                        if (v) { container.scrollTop += v; layout(); }
                        raf = requestAnimationFrame(autoScroll);
                    }
                    raf = requestAnimationFrame(autoScroll);
                    layout();
                    const onMove = (ev) => { pointerY = ev.clientY; layout(); };
                    const finish = (cancel) => {
                        handle.removeEventListener('pointermove', onMove);
                        handle.removeEventListener('pointerup', onUp);
                        handle.removeEventListener('pointercancel', onCancel);
                        cancelAnimationFrame(raf);
                        try { handle.releasePointerCapture(e.pointerId); } catch (er) {}
                        const finalT = cancel ? i0 : target;
                        let slotDy = 0;
                        if (finalT > i0) { for (let k = i0 + 1; k <= finalT; k++) slotDy += hs[k] + gap; }
                        else if (finalT < i0) { for (let k = finalT; k < i0; k++) slotDy -= hs[k] + gap; }
                        item.style.transition = 'transform .2s cubic-bezier(.2,0,0,1)';
                        item.style.transform = 'translateY(' + slotDy + 'px)';
                        setTimeout(() => {
                            container.classList.remove('m-reordering');
                            if (!cancel && finalT !== i0) {
                                // Thứ tự mới của các bài đang hiển thị -> ghi lại vào danh sách phát (bài không còn trong thư viện giữ nguyên ở cuối)
                                const order = items.map(el => el.dataset.key);
                                const [mv] = order.splice(i0, 1);
                                order.splice(finalT, 0, mv);
                                const pls = loadPls();
                                const cur = pls.find(x => x.id === plId);
                                if (cur && Array.isArray(cur.trackKeys)) {
                                    const shown = new Set(order);
                                    const rest = cur.trackKeys.filter(k => !shown.has(String(k).toLowerCase()));
                                    cur.trackKeys = order.concat(rest);
                                    savePls(pls);
                                }
                            }
                            openPlaylistDetail(plId, true);
                        }, 210);
                    }
                    const onUp = () => finish(false);
                    const onCancel = () => finish(true);
                    handle.addEventListener('pointermove', onMove);
                    handle.addEventListener('pointerup', onUp);
                    handle.addEventListener('pointercancel', onCancel);
                }

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
                    paneFolders?.classList.remove('active');
                    paneDetail?.classList.add('active');
                    document.getElementById('m-lib-tabs')?.style.setProperty('display', 'none');
                    if (plDetailTitle) setPlTitle(plDetailTitle, pl);
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
                        let leftHtml = pldReorderMode ? '<span class="material-symbols-rounded pld-handle" style="opacity:.7;font-size:24px;">drag_indicator</span>' : '';
                        let rightHtml = '';
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
                        row.querySelector('.pld-handle')?.addEventListener('pointerdown', (ev) => pldStartDrag(ev, row, plId));
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

                    if (titleEl) {
                        if (plc.mode === 'manual' && plc.step === 1 && plc.pickedKeys.size > 0) {
                            titleEl.textContent = tr2('pl.files_selected', '{n} file(s) selected').replace('{n}', String(plc.pickedKeys.size));
                        } else {
                            titleEl.textContent = plc.mode === 'smart' ? tr2('pl.new_smart_title', 'Danh sách phát thông minh') : tr2('pl.new_title', 'Danh sách phát mới');
                        }
                    }
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
                    // Đẩy bài đã chọn lên đầu danh sách chọn, giữ phần còn lại đúng thứ tự 0–Z gốc
                    pool.sort((a, b) => {
                        const ka = trackKeyOf(a);
                        const kb = trackKeyOf(b);
                        const pa = ka ? (plc.pickedKeys.has(ka) ? 1 : 0) : 0;
                        const pb = kb ? (plc.pickedKeys.has(kb) ? 1 : 0) : 0;
                        if (pa !== pb) return pb - pa;
                        return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), undefined, { numeric: true, sensitivity: 'base' });
                    });
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
                            syncCreatorUI();
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

                window.__getMobileNav = function () { return { tab: activeTab, plId: openedPlId }; };
                window.__refreshMobileLibraryViews = function () {
                    try {
                        renderMobilePlaylists();
                        if (activeTab === 'artists') renderMobileArtists();
                        if (activeTab === 'liked') renderMobileLiked();
                        if (activeTab === 'folders') renderMobileFolders();
                        if (openedPlId) openPlaylistDetail(openedPlId, true);
                    } catch (e) {}
                };
                window.__setMobileNav = function (tab, plId) {
                    try {
                        setMobileLibTab(tab || 'songs');
                        if (plId) openPlaylistDetail(plId);
                    } catch (e) {}
                };
                window.__closeMobilePlDetailIfOpen = function () {
                    if (typeof window.__handleAndroidBackAi === 'function' && window.__handleAndroidBackAi()) return true;
                    if (window.__closeSongSheet && window.__closeSongSheet()) return true;
                    if (window.__exitMobileSelect && window.__exitMobileSelect()) return true;
                    if (openedPlId) { setMobileLibTab(detailReturnTab); return true; }
                    if (window.__mobileFoldersBack && window.__mobileFoldersBack()) return true;
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


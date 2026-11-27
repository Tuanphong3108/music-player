        // --- STREAMING_CHUNK:Binding UI elements for settings and accents... ---
        // --- HỆ THỐNG NGÔN NGỮ (i18n) ---
        // Đọc file .lang kiểu Minecraft (key=value, "#" là comment), áp dụng lên mọi phần
        // tử có data-i18n / data-i18n-title / data-i18n-placeholder. Bao phủ: document
        // chính, cửa sổ PiP (customPipWindow.document) và iframe Metadata Editor
        // (metadataIframe.contentDocument) — cả 2 đều same-origin nên gọi thẳng được,
        // không cần postMessage. Riêng about.html/changelog.html/apps.html do bên khác
        // (Gemini) quản lý nội dung, mình chỉ gửi kèm mã ngôn ngữ qua postMessage để bên
        // đó tự xử lý, không đụng vào nội dung 2 file đó.
        let currentLangDict = {};

        function parseLangFile(text) {
            const dict = {};
            text.split('\n').forEach(line => {
                line = line.trim();
                if (!line || line.startsWith('#')) return;
                const eqIdx = line.indexOf('=');
                if (eqIdx === -1) return;
                dict[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1);
            });
            return dict;
        }

        function applyTranslations(dict, root) {
            root = root || document;
            root.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (dict[key] !== undefined) el.innerText = dict[key];
            });
            root.querySelectorAll('[data-i18n-title]').forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                if (dict[key] !== undefined) el.setAttribute('title', dict[key]);
            });
            // md-select cache chữ hiển thị -> cập nhật lại sau khi dịch
            root.querySelectorAll('md-outlined-select').forEach(sel => {
                try { if (sel.selectedIndex >= 0) sel.selectIndex(sel.selectedIndex); } catch (e) {}
            });
            root.querySelectorAll('[data-i18n-label]').forEach(el => {
                const key = el.getAttribute('data-i18n-label');
                if (dict[key] !== undefined) el.setAttribute('label', dict[key]);
            });
            root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
            });
        }

        // Áp dụng ngôn ngữ hiện tại cho PiP (nếu đang mở) và Metadata Editor (nếu đã tải
        // xong) — gọi lại mỗi khi đổi ngôn ngữ, và lúc mới mở/mới tải xong 2 cái đó
        function applyTranslationsEverywhere() {
            applyTranslations(currentLangDict, document);
            if (typeof renderLyrics === 'function') renderLyrics();
            if (typeof window.__onAiLanguageChanged === 'function') {
                try { window.__onAiLanguageChanged(); } catch (e) {}
            }
            try {
                if (typeof customPipWindow !== 'undefined' && customPipWindow) {
                    applyTranslations(currentLangDict, customPipWindow.document);
                }
            } catch (err) { /* Cửa sổ PiP có thể chưa sẵn sàng hoặc đã đóng, bỏ qua */ }
            try {
                if (typeof metadataIframe !== 'undefined' && metadataIframe && metadataIframe.contentDocument) {
                    applyTranslations(currentLangDict, metadataIframe.contentDocument);
                }
            } catch (err) { /* metadataIframe có thể chưa kịp khởi tạo, bỏ qua */ }
        }

        window.__tr = k => (typeof currentLangDict !== 'undefined' && currentLangDict) ? currentLangDict[k] : undefined;
        const EN_FALLBACK = {
            'contextmenu.cut': 'Cut', 'contextmenu.copy': 'Copy', 'contextmenu.paste': 'Paste', 'contextmenu.select_all': 'Select all', 'contextmenu.play_pause': 'Play / Pause', 'contextmenu.add_media': 'Add music / video', 'contextmenu.fullscreen': 'Fullscreen', 'contextmenu.share_current': 'Share current playing file', 'contextmenu.quick_settings': 'Quick Settings', 'topbar.share': 'Share', 'share.no_file': 'No file is playing to share', 'share.unsupported': 'This browser does not support sharing files', 'share.failed': 'Could not share this file',
            "player.error_title": "Playback error",
            "player.error_code": "Error code: {code}",
            "player.error_desc": "“{name}” may not be supported. Playback may experience some issues.",
            "metaeditor.field_subtitle": "Subtitle Embed",
            "metaeditor.section_subtitle": "Subtitle",
            "metaeditor.saved_subtitle": "Subtitle saved in the app (the video file itself is not modified).",
            'player.video_no_edit': "Video files don't support tag or cover editing yet",
            "settings.cat_mixer": "Audio mixer",
            "mixer.preamp": "Volume boost (Preamp)",
            "mixer.preamp_desc": "Raise or lower the level before the filters, from -12 to +12 dB",
            "mixer.eq": "Equalizer",
            "mixer.eq_desc": "Turn on to apply the 5-band equalizer below",
            "mixer.preset": "Presets",
            "mixer.preset_desc": "Pick a sound style quickly, or drag each band below yourself",
            "mixer.preset_flat": "Flat",
            "mixer.preset_bass": "Bass boost",
            "mixer.preset_treble": "Bright treble",
            "mixer.preset_vocal": "Vocal boost",
            "mixer.preset_rock": "Rock",
            "mixer.preset_pop": "Pop",
            "mixer.preset_custom": "Custom",
            "mixer.balance": "Left / right balance",
            "mixer.balance_desc": "Shift the sound to the left (-100) or right (+100) speaker or earbud",
            "mixer.mono": "Mono audio",
            "mixer.mono_desc": "Merge the left and right channels into one, useful when using a single earbud",
            "mixer.compressor": "Normalize volume",
            "mixer.compressor_desc": "Squeezes the gap between quiet and loud parts and helps prevent distortion when boosting",
            "mixer.reset": "Reset audio mixer",
            'metaeditor.lrc_title': '🔍 Find lyrics (lrclib.net)', 'metaeditor.lrc_placeholder': 'Song, artist...',
            'metaeditor.lrc_hint': 'Type a song name to find lyrics.', 'metaeditor.lrc_searching': 'Searching...',
            'metaeditor.lrc_none': 'No results found.', 'metaeditor.lrc_error': 'Could not reach lrclib.net. Check your connection and try again.',
            'metaeditor.lrc_instrumental': 'NO LYRICS', 'metaeditor.lrc_back': 'Back', 'metaeditor.lrc_insert': 'Insert',
            'player.locate': 'Locate current track',
            'pl.tab_artists': 'Artists', 'pl.tab_albums': 'Albums', 'pl.albums_empty': 'No albums yet.', 'pl.unknown_album': 'Unknown album', 'pl.various_artists': 'Various artists', 'pl.tab_liked': 'Liked', 'pl.tab_folders': 'Folders', 'contextmenu.info': 'Info & options', 'ss.play': 'Play', 'ss.pause': 'Pause', 'ss.add_queue': 'Add to queue', 'ss.next': 'Next', 'ss.playlist': 'Playlist', 'ss.delete': 'Delete', 'ss.set_sound': 'Set as sound', 'ss.tab_options': 'OPTIONS', 'ss.tab_info': 'INFO', 'ss.already_queue': 'This song is already in the queue', 'ss.added_queue': 'Added to queue', 'ss.is_current': 'This song is playing now', 'ss.next_done': 'Will play next', 'ss.select_playlists': 'Select playlists', 'ss.search_playlists': 'Search for playlists...', 'ss.new': 'New', 'ss.save': 'Save', 'ss.no_playlists': 'No playlists yet.', 'ss.pl_saved': 'Playlists updated', 'ss.pl_nochange': 'No changes', 'ss.need_write': 'Allow "Modify system settings", then come back and tap again', 'ss.use_as': 'Use this song as', 'ss.use_as_desc': 'Choose where Media Player should install this sound.', 'ss.cancel': 'Cancel', 'ss.ringtone': 'Phone ringtone', 'ss.ringtone_d': 'Incoming calls', 'ss.notif': 'Notification sound', 'ss.notif_d': 'Messages and app alerts', 'ss.alarm': 'Alarm sound', 'ss.alarm_d': 'Clock alarms', 'ss.installing': 'Installing sound...', 'ss.sound_done': 'Set as', 'ss.sound_fail': 'Could not set the sound', 'sel.count': '{n} file(s) selected', 'sel.cancel': 'Cancel selection', 'sel.playlist': 'Create playlist', 'sel.delete': 'Delete', 'sel.share': 'Share', 'sel.del_title': 'Delete from device', 'sel.del_msg': 'Permanently delete {n} file(s) from this device? This cannot be undone.', 'sel.del_ok': 'Delete', 'sel.del_done': 'Deleted {n} file(s)', 'sel.del_fail': 'Could not delete {n} file(s)', 'sel.del_playing': 'Cannot delete the currently playing song', 'ss.open_files': 'Open in Files', 'settings.cat_developer': 'Developer Features', 'settings.desc_developer': 'In-app console and debugging tools', 'dev.enable_console': 'Enable Developer Console', 'dev.enable_console_desc': 'Show a </> button in the 3-dot menu to open the Console, run JavaScript commands, and inspect UI overlays right inside the app.', 'dev.console_title': 'Developer Console', 'dev.console_empty': 'No logs yet. Type a JavaScript command below to run.', 'dev.console_placeholder': 'Enter JavaScript command...', 'dev.inspect_hint': 'Tap anywhere to inspect elements at that point (elementsFromPoint)', 'dev.copied': 'Logs copied', 'dev.state_copied': 'Copied', 'dev.logs': 'View native logs', 'dev.export': 'Export diagnostics', 'dev.copy_state': 'Copy app state', 'dev.bridge_test': 'Test Bridge', 'dev.reload': 'Reload page', 'dev.clear_reload': 'Clear cache & reload', 'dev.reset': 'Reset developer settings', 'dev.reset_done': 'Developer settings reset to default.', 'sel.unsupported': 'This action needs the Android app', 'pl.folders_empty': 'No folders yet.', 'pl.folder_home': 'Home', 'pl.artists_empty': 'No artists yet.', 'pl.liked_empty': 'No liked songs yet. Tap the heart next to the Lyrics button to add one.', 'player.like': 'Like',
            'metaeditor.fill_title': 'Fill in info from the lyrics?', 'metaeditor.fill_body': 'The lyrics include track info. Fill the empty fields as shown below?', 'metaeditor.fill_no': 'Don\'t fill', 'metaeditor.fill_yes': 'Fill in',
            'confirmoverwrite.field_genre': 'Genre: ', 'confirmoverwrite.field_composer': 'Composer: ', 'confirmoverwrite.field_lyric': 'Lyric Embed (read-only)',
            'lyric.search_placeholder': 'Search lyrics on LRCLIB',
            'metaeditor.saved_disk': 'Directly overwrote the original file on disk successfully!',
            'metaeditor.saved_download': 'The browser has no permission to write to the original file, so the MP3 with updated tags was downloaded automatically — use the downloaded file to replace the original if you want to keep it permanently.',
            'metaeditor.saved_success': 'Metadata saved successfully!',
            'settings.download_android': 'Download Android app',
            'android.card_title': 'Media Player for Android',
            'android.card_sub': 'Official Android App (APK) • Free & Open Source',
            'android.desc': 'Enjoy the full Media Player experience on your Android phone with a one-handed touch interface, automatic updates synced with the latest web version, and full offline support.',
            'android.f1_title': 'Background Play & Lock Screen',
            'android.f1_desc': 'Keep listening with the screen off or while switching apps, with full notification media controls.',
            'android.f2_title': 'Open With & Folder Scan',
            'android.f2_desc': 'Supports "Open with" and "Share" from other apps, plus adding entire music folders.',
            'android.f3_title': 'Material You Dynamic Color',
            'android.f3_desc': 'Automatically adapts to your Android 12+ wallpaper accent color and stays up to date automatically.',
            'android.download_btn': 'Download',
            'android.no_video_note': 'Note: The Android version of Media Player does not support video playback (audio and lyrics only).',
            'android.github_note': 'Opens the official GitHub Releases page to download MediaPlayer.apk',
            'settings.cat_experimental': 'Experimental',
            'settings.desc_experimental': 'Experimental interface options',
            'exp.new_info': 'New Other Info menu',
            'exp.new_info_desc': 'Use the phone song info sheet (bottom sheet, without the Options tab).',
            'exp.new_settings': 'New Settings menu',
            'exp.new_settings_desc': 'Use the phone Material 3 Expressive Settings layout (card list + two columns).',
            'dev.flags': 'Flags',
            'dev.flag_old_info': 'Old Other Info menu',
            'dev.flag_old_info_desc': 'Use the PC Info dialog (also in QuickPlay).',
            'dev.flag_old_settings': 'Old Settings menu',
            'dev.flag_old_settings_desc': 'Use the PC Settings layout.',
            'getapp.title': 'Listen better with the Android app',
            'getapp.desc': 'You are using Media Player in a browser. The app plays reliably in the background, has media notification controls and scans music on your device.',
            'getapp.f1_t': 'Reliable background playback',
            'getapp.f1_d': 'The browser will not pause your music when the screen turns off.',
            'getapp.f2_t': 'Automatic music library',
            'getapp.f2_d': 'Add whole folders, use "Open with" and share from other apps.',
            'getapp.f3_t': 'Material You dynamic color',
            'getapp.f3_d': 'Follows your Android 12+ wallpaper colors automatically.',
            'getapp.download': 'Download APK',
            'getapp.releases': 'View on GitHub',
            'getapp.continue': 'Continue on web',
            'getapp.note': 'Requires Android 8.0 or later. Allow installing apps from your browser when asked.'
        };
        async function loadLanguage(lang) {
            try {
                // Lấy file ngôn ngữ: mạng (tối đa 3 giây) -> nếu offline/chậm thì dùng bản đã lưu trong localStorage -> cuối cùng mới dùng bảng chữ dự phòng
                const LKEY = 'lang_cache_' + lang;
                let langText = null;
                try {
                    const ac = new AbortController();
                    const to = setTimeout(() => ac.abort(), 3000);
                    const res = await fetch('./language/' + lang + '.lang', { signal: ac.signal });
                    clearTimeout(to);
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    langText = await res.text();
                    try { localStorage.setItem(LKEY, langText); } catch (e) {}
                } catch (netErr) {
                    try { langText = localStorage.getItem(LKEY); } catch (e) {}
                    if (!langText) {
                        if (lang === 'en') langText = '';   // offline lần đầu: dùng EN_FALLBACK bên dưới thay vì rơi về tiếng Việt
                        else throw netErr;
                    }
                }
                currentLangDict = parseLangFile(langText);
                if (window.IS_ANDROID_APP) {
                    // Bản Android không hỗ trợ video -> bỏ chữ "video" ở các chỗ liên quan tới thêm nhạc
                    ['topbar.addmusic', 'topbar.addmusic_file', 'topbar.addmusic_folder', 'contextmenu.add_media', 'player.load_first_prompt', 'mobile.empty_desc'].forEach(k => {
                        if (typeof currentLangDict[k] === 'string') currentLangDict[k] = currentLangDict[k]
                            .replace(/ \/ video/gi, '').replace(/ hoặc video/gi, '').replace(/ or videos?/gi, '').replace(/ and videos?/gi, '');
                    });
                }
                // Phòng khi file .lang cũ còn nằm trong cache/chưa được thay: bổ sung sẵn các chữ mới (tiếng Anh)
                if (lang === 'en') Object.keys(EN_FALLBACK).forEach(k => { if (currentLangDict[k] === undefined) currentLangDict[k] = EN_FALLBACK[k]; });
                applyTranslationsEverywhere();
                localStorage.setItem('settings_language', lang);
                const langSelectEl = document.getElementById('setting-language');
                if (langSelectEl) langSelectEl.value = lang;
                // Đồng bộ luôn mã ngôn ngữ cho About/What's New/More apps nếu đang mở
                if (typeof sendThemeToChangelog === 'function') sendThemeToChangelog();
            } catch (err) {
                console.warn('Không tải được file ngôn ngữ "' + lang + '" (kiểm tra thư mục /language/ cạnh file index.html):', err);
            }
        }

        const settingLanguage = document.getElementById('setting-language');
        const gettingStartedOverlay = document.getElementById('getting-started-overlay');
        const gettingStartedIframe = document.getElementById('getting-started-iframe');

        const savedLanguage = localStorage.getItem('settings_language');

        // --- Màn hình bắt đầu (Getting Started) ---
        // Hiện lại khi F5 nếu chưa hoàn tất: cờ "pending" được đặt ngay khi hiện lần đầu.
        const gsStore = {
            get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
            set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
            del(k) { try { localStorage.removeItem(k); } catch (e) {} }
        };
        const gsDone = gsStore.get('getting_started_done') === 'true';
        const gsShouldShow = gsStore.get('getting_started_pending') === '1' ||
                             (!savedLanguage && !gsDone);
        let gsPermGateOnly = false;
        function needsAndroidPermGate() {
            if (!window.IS_ANDROID_APP || !window.AndroidBridge || typeof window.AndroidBridge.getPermissionsStatus !== 'function') return false;
            try {
                const info = JSON.parse(window.AndroidBridge.getPermissionsStatus() || '{}');
                return !info.media || info.audio === false || info.images === false || info.allFiles === false;
            } catch (e) { return false; }
        }
        function openAndroidPermGateIfNeeded() {
            if (gsShouldShow || !gsDone) return;
            if (!needsAndroidPermGate()) return;
            if (gettingStartedOverlay.style.display === 'block') return;
            gsPermGateOnly = true;
            gettingStartedIframe.src = 'getting_started.html';
            gettingStartedOverlay.style.display = 'block';
        }
        window.__checkAndroidPermGate = openAndroidPermGateIfNeeded;

        function closeGettingStarted() {
            gsPermGateOnly = false;
            gettingStartedOverlay.style.display = 'none';
            gettingStartedIframe.src = 'about:blank';
        }
        function applyGsSettings(cfg) {
            if (!cfg || typeof cfg !== 'object') return;
            if (cfg.lang === 'vi' || cfg.lang === 'en') {
                settingLanguage.value = cfg.lang;
                loadLanguage(cfg.lang);
            }
            if (['system', 'light', 'dark'].includes(cfg.theme)) {
                settings.theme = cfg.theme;
                gsStore.set('settings_theme', cfg.theme);
                settingTheme.value = cfg.theme;
                applyTheme(cfg.theme);
            }
            if (typeof cfg.accent === 'string' && (accents[cfg.accent] || (cfg.accent === 'system' && window.IS_ANDROID_APP))) {
                settings.accent = cfg.accent;
                gsStore.set('settings_accent', cfg.accent);
                settingAccent.value = cfg.accent;
                applyAccentColor();
            }
            const sc = parseInt(cfg.scale, 10);
            if (sc >= 50 && sc <= 200) {
                gsStore.set('settings_ui_scale', String(sc));
                const sl = document.getElementById('setting-ui-scale');
                const lb = document.getElementById('ui-scale-value');
                if (sl) sl.value = sc;
                if (lb) lb.textContent = sc + '%';
                applyUiScale(sc);
                if (localStorage.getItem('settings_font_scale_sync') !== 'false') {
                    gsStore.set('settings_font_scale', String(sc));
                    const fsl = document.getElementById('setting-font-scale');
                    const flb = document.getElementById('font-scale-value');
                    if (fsl) fsl.value = sc;
                    if (flb) flb.textContent = sc + '%';
                    applyFontScale(sc);
                }
            }
        }
        function sendGsInit() {
            const w = gettingStartedIframe.contentWindow;
            if (!w) return;
            let sc = parseInt(gsStore.get('settings_ui_scale'), 10);
            if (!(sc >= 50 && sc <= 200)) sc = 100;
            let font = null;
            try { font = fontPayload(); } catch (e) {}
            w.postMessage({
                type: 'gs-init',
                lang: gsStore.get('settings_language') || 'vi',
                theme: settings.theme,
                accent: settings.accent,
                scale: sc,
                parentScale: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1,
                accents: JSON.parse(JSON.stringify(accents)),
                isAndroidDevice: !!window.IS_ANDROID_DEVICE,
                isAndroidApp: !!window.IS_ANDROID_APP,
                permGateOnly: !!gsPermGateOnly,
                systemAccent: systemAccentHex || null,
                font
            }, '*');
        }

        if (gsShouldShow) {
            gsStore.set('getting_started_pending', '1');
            gettingStartedIframe.src = 'getting_started.html';
            gettingStartedOverlay.style.display = 'block';
        } else {
            openAndroidPermGateIfNeeded();
        }
        settingLanguage.value = savedLanguage || 'vi';
        loadLanguage(savedLanguage || 'vi');

        window.addEventListener('message', (e) => {
            const d = e.data;
            const fromGs = e.source === gettingStartedIframe.contentWindow;
            if (d && typeof d === 'object' && fromGs) {
                if (d.type === 'gs-ready') sendGsInit();
                else if (d.type === 'gs-lang' && (d.lang === 'vi' || d.lang === 'en')) loadLanguage(d.lang);
                else if (d.type === 'gs-perm-gate-done') {
                    closeGettingStarted();
                    if (window.AndroidBridge && typeof window.AndroidBridge.scanAllDeviceAudio === 'function') {
                        try { window.AndroidBridge.scanAllDeviceAudio(false); } catch (err) {}
                    }
                }
                else if (d.type === 'gs-done') {
                    applyGsSettings(d.settings);
                    gsStore.set('getting_started_done', 'true');
                    gsStore.del('getting_started_pending');
                    closeGettingStarted();
                    if (d.settings && d.settings.scanLibrary && window.AndroidBridge && typeof window.AndroidBridge.scanAllDeviceAudio === 'function') {
                        try { window.AndroidBridge.scanAllDeviceAudio(true); } catch (err) {}
                    }
                }
                return;
            }
            if (d === 'en' || d === 'vi') {
                loadLanguage(d);
            } else if (d === 'tutorial done' && fromGs) {
                gsStore.set('getting_started_done', 'true');
                gsStore.del('getting_started_pending');
                closeGettingStarted();
            }
        });

        settingLanguage.addEventListener('change', (e) => {
            loadLanguage(e.target.value);
        });

        // --- CHƯƠNG TRÌNH ĐIỀU KHIỂN SETTINGS ---
        const settingsBtn = document.getElementById('settings-btn');
        const settingsOverlay = document.getElementById('settings-overlay');
        const settingsDialog = document.getElementById('settings-dialog');
        const settingsCloseBtn = document.getElementById('settings-close-btn');

        const settingMainLyric = document.getElementById('setting-main-lyric');
        const settingPipLyric = document.getElementById('setting-pip-lyric');
        const settingFsLyric = document.getElementById('setting-fs-lyric');
        const perfPreset = document.getElementById('perf-preset');
        const perfSwitches = { motion: 'perf-motion', glass: 'perf-glass', albumBlur: 'perf-album-blur', visualizer: 'perf-visualizer' };
        function syncPerfUI() {
            for (const [k, id] of Object.entries(perfSwitches)) document.getElementById(id).selected = !!settings.perf[k];
            perfPreset.value = perfPresetOf(settings.perf);
        }
        syncPerfUI();
        for (const [k, id] of Object.entries(perfSwitches)) {
            document.getElementById(id).addEventListener('change', (e) => {
                settings.perf[k] = e.target.selected;
                localStorage.setItem('settings_perf', JSON.stringify(settings.perf));
                perfPreset.value = perfPresetOf(settings.perf);
                applyMotionEffectSettings();
            });
        }
        perfPreset.addEventListener('change', (e) => {
            const v = e.target.value;
            if (!PERF_PRESETS[v]) return;     // "Tuỳ chỉnh": giữ nguyên các công tắc hiện tại
            settings.perf = Object.assign({}, PERF_PRESETS[v]);
            localStorage.setItem('settings_perf', JSON.stringify(settings.perf));
            syncPerfUI();
            applyMotionEffectSettings();
        });
        const settingWakeLock = document.getElementById('setting-wake-lock');
        const settingDynamicAccent = document.getElementById('setting-dynamic-accent');
        const settingTheme = document.getElementById('setting-theme');
        const settingAccent = document.getElementById('setting-accent');
        if (window.IS_ANDROID_APP) {
            settingAccent.insertAdjacentHTML('afterbegin', '<md-select-option value="system"><div slot="headline" data-i18n="settings.accent_system">Hệ thống (System)</div></md-select-option>');
            try { applyTranslations(currentLangDict, settingAccent); } catch (e) {}
        }

        settingMainLyric.selected = settings.showMainLyric;
        settingPipLyric.selected = settings.showPipLyric;
        settingFsLyric.selected = settings.showFsLyric;
        settingWakeLock.selected = settings.wakeLockEnabled;
        settingDynamicAccent.selected = settings.dynamicAccent;
        settingTheme.value = settings.theme;
        settingAccent.value = settings.accent;

        settingMainLyric.addEventListener('change', (e) => {
            settings.showMainLyric = e.target.selected;
            localStorage.setItem('settings_show_main_lyric', settings.showMainLyric);
            applyLyricVisibility();
        });

        settingPipLyric.addEventListener('change', (e) => {
            settings.showPipLyric = e.target.selected;
            localStorage.setItem('settings_show_pip_lyric', settings.showPipLyric);
            applyLyricVisibility();
            updatePiPUI();
        });

        settingFsLyric.addEventListener('change', (e) => {
            settings.showFsLyric = e.target.selected;
            localStorage.setItem('settings_show_fs_lyric', settings.showFsLyric);
            applyLyricVisibility();
        });

        settingWakeLock.addEventListener('change', (e) => {
            settings.wakeLockEnabled = e.target.selected;
            localStorage.setItem('settings_wake_lock', settings.wakeLockEnabled);
            // Nếu đang ở Full screen mà người dùng tắt/bật công tắc ngay lúc đó -> áp dụng ngay
            if (document.body.classList.contains('fullscreen-active')) {
                if (settings.wakeLockEnabled) requestWakeLock();
                else releaseWakeLock();
            }
        });

        settingDynamicAccent.addEventListener('change', (e) => {
            settings.dynamicAccent = e.target.selected;
            localStorage.setItem('settings_dynamic_accent', settings.dynamicAccent);
            clearDynamicAccentTimer();
            if (settings.dynamicAccent) {
                const t = playlist[currentIndex];
                if (t && t.cover && !audio.paused) refreshDynamicAccent(t);
                else { dynamicAccentHex = null; applyAccentColor(); if (t && t.cover) refreshDynamicAccent(t); }
            } else {
                applyAccentColor();
            }
        });

        // --- Bộ trộn âm thanh: giao diện ---
        {
            const $ = id => document.getElementById(id);
            const fmtDb = v => (v > 0 ? '+' : '') + v + ' dB';
            const fmtBal = v => v === 0 ? 'C' : (v < 0 ? 'L ' + (-v) : 'R ' + v);
            const preS = $('mixer-preamp'), balS = $('mixer-balance'), eqOn = $('mixer-eq-on'), monoS = $('mixer-mono'), compS = $('mixer-comp'), presetS = $('mixer-preset');
            const eqS = [0,1,2,3,4].map(i => $('mixer-eq-' + i));
            function sync() {
                preS.value = mixer.preamp; $('mixer-preamp-val').textContent = fmtDb(mixer.preamp);
                balS.value = mixer.balance; $('mixer-balance-val').textContent = fmtBal(mixer.balance);
                eqOn.selected = mixer.eqOn; monoS.selected = mixer.mono; compS.selected = mixer.comp;
                eqS.forEach((sl, i) => { sl.value = mixer.eq[i]; $('mixer-eq-' + i + '-val').textContent = fmtDb(mixer.eq[i]); sl.disabled = !mixer.eqOn; });
                $('mixer-bands').style.opacity = mixer.eqOn ? '' : '.45';
                presetS.disabled = !mixer.eqOn;
                presetS.value = mixer.preset;
            }
            function changed() { mixerSave(); if (!audioCtx) { try { initVisualizer(); } catch (e) {} } mixerApply(); }
            function detectPreset() {
                const k = Object.keys(MIXER_PRESETS).find(n => MIXER_PRESETS[n].every((v, i) => v === mixer.eq[i]));
                mixer.preset = k || 'custom';
            }
            preS.addEventListener('input', () => { mixer.preamp = +preS.value; $('mixer-preamp-val').textContent = fmtDb(mixer.preamp); changed(); });
            balS.addEventListener('input', () => { mixer.balance = +balS.value; $('mixer-balance-val').textContent = fmtBal(mixer.balance); changed(); });
            eqS.forEach((sl, i) => sl.addEventListener('input', () => {
                mixer.eq[i] = +sl.value; $('mixer-eq-' + i + '-val').textContent = fmtDb(mixer.eq[i]);
                detectPreset(); presetS.value = mixer.preset; changed();
            }));
            eqOn.addEventListener('change', () => { mixer.eqOn = eqOn.selected; sync(); changed(); });
            monoS.addEventListener('change', () => { mixer.mono = monoS.selected; changed(); });
            compS.addEventListener('change', () => { mixer.comp = compS.selected; changed(); });
            presetS.addEventListener('change', () => {
                const v = presetS.value;
                if (MIXER_PRESETS[v]) { mixer.eq = MIXER_PRESETS[v].slice(); mixer.preset = v; sync(); changed(); }
            });
            $('mixer-reset-btn').addEventListener('click', () => { mixer = JSON.parse(JSON.stringify(MIXER_DEFAULT)); sync(); changed(); });
            sync();
        }

        settingTheme.addEventListener('change', (e) => {
            settings.theme = e.target.value;
            localStorage.setItem('settings_theme', settings.theme);
            applyTheme(settings.theme);
            if (typeof sendThemeToChangelog === 'function') sendThemeToChangelog();
        });

        // Đăng ký tương tác đổi Accent Color điểm nhấn
        settingAccent.addEventListener('change', (e) => {
            settings.accent = e.target.value;
            localStorage.setItem('settings_accent', settings.accent);
            applyAccentColor();
        });


        // --- Kích thước giao diện & Cỡ chữ (áp dụng khi thả thanh trượt để tránh giật) + Phông chữ ---
        {
            const uiSlider = document.getElementById('setting-ui-scale');
            const uiLabel = document.getElementById('ui-scale-value');
            const fontSlider = document.getElementById('setting-font-scale');
            const fontLabel = document.getElementById('font-scale-value');
            const fontScaleCtrl = document.getElementById('setting-font-scale-ctrl');
            const syncCheckbox = document.getElementById('setting-font-scale-sync');

            let uiPct = parseInt(localStorage.getItem('settings_ui_scale'), 10);
            if (!(uiPct >= 50 && uiPct <= 200)) uiPct = 100;
            uiSlider.value = uiPct;
            uiLabel.textContent = uiPct + '%';

            let isSync = localStorage.getItem('settings_font_scale_sync') !== 'false';
            syncCheckbox.checked = isSync;

            let fontPct;
            if (isSync) {
                fontPct = uiPct;
            } else {
                fontPct = parseInt(localStorage.getItem('settings_font_scale'), 10);
                if (!(fontPct >= 50 && fontPct <= 200)) fontPct = 100;
            }
            fontSlider.value = fontPct;
            fontLabel.textContent = fontPct + '%';

            function updateSyncUI(synced) {
                fontSlider.disabled = synced;
                if (fontScaleCtrl) {
                    fontScaleCtrl.style.opacity = synced ? '0.38' : '1';
                    fontScaleCtrl.style.pointerEvents = synced ? 'none' : '';
                    fontScaleCtrl.style.filter = synced ? 'grayscale(0.8)' : 'none';
                    fontScaleCtrl.style.transition = 'opacity 0.2s ease, filter 0.2s ease';
                }
                if (synced) {
                    fontSlider.value = uiSlider.value;
                    fontLabel.textContent = uiSlider.value + '%';
                    localStorage.setItem('settings_font_scale', uiSlider.value);
                    applyFontScale(parseInt(uiSlider.value, 10));
                }
            }

            updateSyncUI(isSync);

            syncCheckbox.addEventListener('change', () => {
                const checked = !!syncCheckbox.checked;
                localStorage.setItem('settings_font_scale_sync', String(checked));
                updateSyncUI(checked);
                if (!checked) {
                    applyFontScale(parseInt(fontSlider.value, 10));
                }
            });

            uiSlider.addEventListener('input', () => {
                uiLabel.textContent = uiSlider.value + '%';
                if (syncCheckbox.checked) {
                    fontSlider.value = uiSlider.value;
                    fontLabel.textContent = uiSlider.value + '%';
                }
            });

            uiSlider.addEventListener('change', () => {
                localStorage.setItem('settings_ui_scale', uiSlider.value);
                applyUiScale(parseInt(uiSlider.value, 10));
                if (syncCheckbox.checked) {
                    localStorage.setItem('settings_font_scale', uiSlider.value);
                    applyFontScale(parseInt(uiSlider.value, 10));
                }
            });

            fontSlider.addEventListener('input', () => {
                fontLabel.textContent = fontSlider.value + '%';
            });

            fontSlider.addEventListener('change', () => {
                localStorage.setItem('settings_font_scale', fontSlider.value);
                applyFontScale(parseInt(fontSlider.value, 10));
            });

            initFontUI();
        }

        // --- Đặt lại cài đặt gốc ---
        document.getElementById('factory-reset-btn').addEventListener('click', async () => {
            // Trong app Android: xóa TOÀN BỘ dữ liệu ứng dụng (cài đặt, danh sách phát, phông chữ, cache WebView...) rồi app tự đóng. Trên PC/web: chỉ xóa dữ liệu trang như cũ.
            const nativeWipe = !!(window.IS_ANDROID_APP && window.AndroidBridge && typeof window.AndroidBridge.factoryResetApp === 'function');
            const ok = await confirmDialog(
                nativeWipe
                    ? (currentLangDict['settings.factory_reset_confirm_android'] || 'Xóa toàn bộ dữ liệu ứng dụng? Cài đặt, danh sách phát, bài đã thích, phông chữ và mọi dữ liệu khác sẽ bị xóa như vừa cài mới, và ứng dụng sẽ tự đóng. Nhạc trên thiết bị không bị ảnh hưởng.')
                    : (currentLangDict['settings.factory_reset_confirm'] || 'Đặt lại toàn bộ cài đặt về mặc định? Phông chữ đã thêm và dữ liệu đã lưu sẽ bị xóa, rồi màn hình bắt đầu sẽ chạy lại.'),
                currentLangDict['settings.factory_reset_btn'] || 'Đặt lại',
                currentLangDict['settings.factory_reset'] || 'Đặt lại cài đặt gốc');
            if (!ok) return;
            if (nativeWipe) {
                try { window.AndroidBridge.factoryResetApp(); return; } catch (e) {}
            }
            const ro = document.getElementById('reset-overlay');
            if (ro) ro.style.display = 'flex';
            await new Promise(r => setTimeout(r, 60));
            // Chỉ xoá đúng các khoá của app này (localStorage dùng chung cho cả tên miền,
            // nên KHÔNG dùng clear() kẻo xoá luôn dữ liệu của các app khác cùng domain).
            ['settings_accent','settings_dynamic_accent','settings_font','settings_font_entries','settings_font_scale',
             'settings_font_scale_sync','settings_language','settings_output_device','settings_playback_speed',
             'settings_reduce_effects','settings_reduce_motion','settings_perf','settings_repeat_mode','settings_show_fs_lyric',
             'settings_show_main_lyric','settings_show_pip_lyric','settings_shuffle','settings_theme','settings_ui_scale',
             'settings_volume','settings_wake_lock','settings_mixer','settings_subs','getting_started_done','getting_started_pending',
             'mp_ai_lyric_trans_v1','mp_ai_lyric_show_v1','mp_ai_integration_v1','mp_ai_usage_v1','mp_gemini_models_v1'
            ].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
            try { localStorage.setItem('getting_started_pending', '1'); } catch (e) {}
            try {
                await new Promise((res) => {
                    const r = indexedDB.deleteDatabase('audioplayer_fonts');
                    r.onsuccess = r.onerror = r.onblocked = () => res();
                    setTimeout(res, 1500);
                });
            } catch (e) {}
            await new Promise(r => setTimeout(r, 900));
            location.reload();
        });

        settingsBtn.addEventListener('click', () => {
            const rect = settingsBtn.getBoundingClientRect();
            const btnCx = rect.left + rect.width / 2;
            const btnCy = rect.top + rect.height / 2;
            const originX = btnCx - window.innerWidth / 2;
            const originY = btnCy - window.innerHeight / 2;
            settingsDialog.style.transformOrigin = `calc(50% + ${originX}px) calc(50% + ${originY}px)`;
            const reduceAnim = document.documentElement.classList.contains('reduce-motion');
            if (!reduceAnim) {
                document.body.classList.add('screen-animating');
                setTimeout(() => document.body.classList.remove('screen-animating'), 480);
            }
            settingsOverlay.classList.add('open');
            try { if (window.__stAutoDetail) window.__stAutoDetail(); } catch (e) {}
        });

        settingsCloseBtn.addEventListener('click', () => {
            const reduceAnim = document.documentElement.classList.contains('reduce-motion');
            if (!reduceAnim) {
                document.body.classList.add('screen-animating');
                setTimeout(() => document.body.classList.remove('screen-animating'), 450);
            }
            settingsOverlay.classList.remove('open');
            setTimeout(() => { if (typeof resetSettingsNavigation === 'function') resetSettingsNavigation(); }, reduceAnim ? 0 : 450);
            setTimeout(() => {
                settingsBtn.classList.add('cl-bounce-anim');
                setTimeout(() => settingsBtn.classList.remove('cl-bounce-anim'), 600);
            }, reduceAnim ? 0 : 400); 
        });

        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) settingsCloseBtn.click();
        });

        // --- HỆ THỐNG CHANGELOG MODAL ---
        const clIframe = document.querySelector('.st-pane-about .cl-iframe');
        const clLoadingOverlay = document.getElementById('cl-loading-overlay');
        const clLoadingSpinner = document.getElementById('cl-loading-spinner');
        const clLoadingError = document.getElementById('cl-loading-error');

        const clBackBtnWrap = document.getElementById('cl-back-btn-wrap');
        const clBackBtn = document.getElementById('cl-back-btn');
        const clTitle = document.getElementById('cl-title');
        const clMadeByBar = document.getElementById('cl-madeby-bar');
        const clLoadingErrorText = document.getElementById('cl-loading-error-text');

        // --- CHẤM ĐỎ CHANGELOG ---
        // Lưu danh sách bản changelog đã xem; có bản mới (id chưa từng thấy) thì bật chấm đỏ ở Cài đặt/About/What's New.
        // Bấm vào What's New: tắt hết chấm đỏ ngoài app, lưu lại, và chỉ đánh dấu các bản mới ngay trong trang changelog.
        const CL_SEEN_KEY = 'changelog_seen_v1';
        let clUnseen = [];        // các bản mới chưa xem
        let clNewForPage = [];    // các bản mới cần chấm đỏ bên trong trang What's New
        function clLoadSeen() { try { const o = JSON.parse(localStorage.getItem(CL_SEEN_KEY) || 'null'); return o && Array.isArray(o.ids) ? o : null; } catch (e) { return null; } }
        function clSaveSeen(ids, hashes) { try { localStorage.setItem(CL_SEEN_KEY, JSON.stringify({ ids: ids, hashes: hashes || {}, latest: ids[0] || null, count: ids.length, savedAt: Date.now() })); } catch (e) {} }
        let clAllIds = [], clAllHashes = {};
        function clHash(t) { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + t.length; }
        function clApplyDots() {
            document.body.classList.toggle('cl-unseen', clUnseen.length > 0);
            try { if (clIframe && clIframe.contentWindow && clPage === 'about') clIframe.contentWindow.postMessage({ changelogDot: clUnseen.length > 0 }, '*'); } catch (e) {}
        }
        async function clCheckNew() {
            try {
                const r = await fetch('changelog-asset/index.json?cb=' + Date.now(), { cache: 'no-store' });
                if (!r.ok) return;
                const j = await r.json();
                const ids = (Array.isArray(j) ? j : (j.versions || [])).map(String);
                if (!ids.length) return;
                // Băm nội dung từng bản để phát hiện cả trường hợp bản cũ được sửa nội dung
                const hashes = {};
                await Promise.all(ids.map(async id => {
                    try {
                        const rr = await fetch('changelog-asset/' + id + '.json?cb=' + Date.now(), { cache: 'no-store' });
                        if (rr.ok) hashes[id] = clHash(await rr.text());
                    } catch (e) {}
                }));
                clAllIds = ids; clAllHashes = hashes;
                const seen = clLoadSeen();
                if (!seen) { clSaveSeen(ids, hashes); return; }         // lần đầu: ghi nhận bản hiện tại làm mốc
                const old = seen.hashes || {};
                const hasOld = Object.keys(old).length > 0;
                clUnseen = ids.filter(id => seen.ids.indexOf(id) < 0 || (hasOld && hashes[id] && old[id] && old[id] !== hashes[id]));
                if (!hasOld && !clUnseen.length) clSaveSeen(ids, hashes);   // bản lưu cũ chưa có mã băm: bổ sung, không báo
                clApplyDots();
            } catch (e) { /* offline: bỏ qua */ }
        }
        function clMarkSeen() {
            clNewForPage = clUnseen.slice();
            clUnseen = [];
            if (clAllIds.length) clSaveSeen(clAllIds, clAllHashes);
            clApplyDots();
        }
        // Hoãn việc kiểm tra changelog tới lúc rảnh để không tranh tài nguyên với lúc khởi động
        (window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 8000 }) : (fn) => setTimeout(fn, 4000))(() => setTimeout(clCheckNew, 2500));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) clCheckNew(); });

        // 3 "trang" dùng chung 1 dialog, điều hướng giữa chúng qua postMessage từ bên
        // trong iframe (về.html tự gửi 'whatsnew' / 'explore more' khi người dùng bấm
        // vào các mục tương ứng bên trong nó)
        const CL_PAGES = {
            about:    { url: 'about.html', title: 'About', errorLabel: 'About', showBack: false, showMadeBy: false },
            whatsnew: { url: 'changelog.html', title: "What's New?", errorLabel: "What's New", showBack: true, showMadeBy: false },
            more:     { url: 'https://tuanphong3108.github.io/apps.html?is_embed=true', title: 'More apps', errorLabel: 'More apps', showBack: true, showMadeBy: true }
        };
        let clPage = 'about';

        // Gửi theme hiện tại ("dark" hoặc "light") sang trang đang mở qua postMessage
        function sendThemeToChangelog() {
            if (!clIframe.contentWindow) return;
            // Gửi bảng màu chủ đạo hiện tại (kể cả màu động theo Album Art) để What's New hợp màu app
            try { clIframe.contentWindow.postMessage({ palette: getActivePalette(resolveThemeMode(settings.theme)) }, '*'); } catch (e) {}
            try { clIframe.contentWindow.postMessage({ font: fontPayload() }, '*'); } catch (e) {}
            try { clIframe.contentWindow.postMessage({ fontScale: getFontScaleState().factor }, '*'); } catch (e) {}
            clIframe.contentWindow.postMessage(resolveThemeMode(settings.theme), '*');
            if (clPage === 'about') clIframe.contentWindow.postMessage({ changelogDot: clUnseen.length > 0 }, '*');
            else if (clPage === 'whatsnew') clIframe.contentWindow.postMessage({ changelogNew: clNewForPage }, '*');
            // Về/What's New/More apps do bên Gemini quản lý nội dung -> chỉ gửi thêm mã
            // ngôn ngữ hiện tại ("vi"/"en") qua postMessage để bên đó tự xử lý, không đụng
            // vào nội dung about.html/changelog.html/apps.html
            clIframe.contentWindow.postMessage(localStorage.getItem('settings_language') || 'vi', '*');
        }

        function showChangelogLoadError() {
            clLoadingSpinner.style.display = 'none';
            clLoadingError.style.display = 'flex';
        }
        function hideChangelogLoadError() {
            clLoadingError.style.display = 'none';
            clLoadingSpinner.style.display = 'flex';
        }

        let clLoaded = false;
        let clLoadTimeoutId = null;
        function markChangelogLoaded() {
            clLoaded = true;
            if (clLoadTimeoutId) { clearTimeout(clLoadTimeoutId); clLoadTimeoutId = null; }
            hideChangelogLoadError();
            clLoadingOverlay.classList.add('hidden');
            sendThemeToChangelog();
        }
        clIframe.addEventListener('load', markChangelogLoaded);
        // Phòng trường hợp iframe đã tải xong trước khi script kịp gắn listener (do src được đặt sẵn trong HTML)
        try {
            const clWin = clIframe.contentWindow;
            if (clWin && clWin.location.href !== 'about:blank' && clIframe.contentDocument.readyState === 'complete') {
                markChangelogLoaded();
            }
        } catch (err) { /* bỏ qua, chờ sự kiện load nếu không truy cập được contentDocument */ }

        // Điều hướng sang 1 trang khác trong cùng dialog: đổi header (title + Back button
        // trượt/zoom vào để đẩy title sang phải), thanh "Made by Phong VN" trượt lên nếu
        // cần, rồi nạp URL tương ứng vào iframe kèm cơ chế loading/timeout 5s y hệt cũ
        function clNavigateTo(pageKey) {
            const page = CL_PAGES[pageKey];
            if (!page) return;
            clPage = pageKey;
            if (pageKey !== 'whatsnew') clNewForPage = [];

            clTitle.innerText = page.title;
            clBackBtnWrap.classList.toggle('show', page.showBack);
            clMadeByBar.classList.toggle('show', page.showMadeBy);
            clLoadingErrorText.innerText = 'Không thể tải ' + page.errorLabel + ', vui lòng thử lại bằng cách khởi động lại ứng dụng hoặc liên hệ với Phong VN qua tính năng "Gửi phản hồi"';

            clLoaded = false;
            if (clLoadTimeoutId) clearTimeout(clLoadTimeoutId);
            hideChangelogLoadError();
            clLoadingOverlay.classList.remove('hidden');
            clIframe.src = page.url;

            clLoadTimeoutId = setTimeout(() => {
                if (!clLoaded) showChangelogLoadError();
            }, 5000);
        }

        clBackBtn.addEventListener('click', () => clNavigateTo('about'));

        // Nhận lệnh điều hướng từ bên trong iframe (About tự gửi ra khi người dùng bấm
        // vào mục "What's New" hoặc "Explore more" bên trong nó)
        window.addEventListener('message', (e) => {
            if (!settingsOverlay.classList.contains('open') || currentSettingsTab !== 'about') return;
            if (e.data === 'whatsnew') { clMarkSeen(); clNavigateTo('whatsnew'); }
            else if (e.data === 'explore more') clNavigateTo('more');
        });

        // Hiện trang About khi người dùng chọn mục About ở sidebar Settings
        function onAboutTabShown() {
            // Phủ lớp loading mỗi lần mở, trừ khi trang hiện tại đã tải xong từ trước
            if (clLoaded) {
                clLoadingOverlay.classList.add('hidden');
                sendThemeToChangelog();
            } else {
                hideChangelogLoadError();
                clLoadingOverlay.classList.remove('hidden');
                // Quá 5 giây mà trang vẫn chưa tải xong -> báo lỗi kèm nút Gửi phản hồi
                if (clLoadTimeoutId) clearTimeout(clLoadTimeoutId);
                clLoadTimeoutId = setTimeout(() => {
                    if (!clLoaded) showChangelogLoadError();
                }, 5000);
            }
        }

        document.getElementById('cl-error-feedback-btn').addEventListener('click', () => {
            settingsCloseBtn.click();
            feedbackBtn.click();
        });

        // --- SIDEBAR DANH MỤC CỦA SETTINGS ---
        let currentSettingsTab = 'general';
        function switchSettingsTab(key) {
            currentSettingsTab = key;
            document.querySelectorAll('.st-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === key));
            document.querySelectorAll('.st-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === key));
            const content = document.querySelector('.st-content');
            if (content) content.scrollTop = 0;
            if (key === 'about') onAboutTabShown();
        }
        document.querySelectorAll('.st-tab').forEach(t => t.addEventListener('click', () => switchSettingsTab(t.dataset.tab)));

        // --- TÌM KIẾM TRONG SETTINGS ---
        const stSearchInput = document.getElementById('st-search-input');
        const stSearchBox = document.querySelector('.st-search');
        const stBody = document.querySelector('.st-body');
        function stNorm(str) { return removeVietnameseTones(String(str || '')).toLowerCase().trim(); }
        function enterSettingsSearch() {
            settingsDialog.classList.add('searching');
            stBody.classList.add('searching');
            runSettingsSearch();
        }
        function exitSettingsSearch() {
            stSearchInput.value = '';
            stSearchBox.classList.remove('has-text');
            settingsDialog.classList.remove('searching');
            stBody.classList.remove('searching', 'no-results');
            document.querySelectorAll('.st-pane').forEach(p => p.classList.remove('no-match'));
            document.querySelectorAll('.st-row-hidden').forEach(r => r.classList.remove('st-row-hidden'));
            stSearchInput.blur();
        }
        function runSettingsSearch() {
            const q = stNorm(stSearchInput.value);
            stSearchBox.classList.toggle('has-text', stSearchInput.value.length > 0);
            let total = 0;
            document.querySelectorAll('.st-pane:not(.st-pane-about)').forEach(pane => {
                if (pane.dataset.pane === 'library' && !document.documentElement.classList.contains('m-ui')) {
                    pane.classList.add('no-match');
                    return;
                }
                const paneTitle = stNorm(pane.querySelector('.st-pane-title')?.textContent);
                let shown = 0;
                Array.from(pane.children).forEach(row => {
                    if (row.classList.contains('st-pane-title')) return;
                    // Khớp theo tên + mô tả của cài đặt, hoặc tên danh mục chứa nó
                    const hit = !q || stNorm(row.textContent).includes(q) || paneTitle.includes(q);
                    row.classList.toggle('st-row-hidden', !hit);
                    if (hit) shown++;
                });
                pane.classList.toggle('no-match', shown === 0);
                total += shown;
            });
            stBody.classList.toggle('no-results', total === 0);
        }
        stSearchInput.addEventListener('focus', enterSettingsSearch);
        stSearchBox.addEventListener('click', () => { if (!settingsDialog.classList.contains('searching')) enterSettingsSearch(); });
        stSearchInput.addEventListener('input', runSettingsSearch);
        document.getElementById('st-search-clear').addEventListener('click', (e) => {
            e.preventDefault(); stSearchInput.value = ''; runSettingsSearch(); stSearchInput.focus();
        });
        document.getElementById('st-search-back').addEventListener('click', exitSettingsSearch);
        stSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); exitSettingsSearch(); } });

        // Đóng Settings: quay về mục đầu và About quay lại trang chính để lần sau mở lại từ đầu
        function resetSettingsNavigation() {
            exitSettingsSearch();
            if (clPage !== 'about') clNavigateTo('about');
            switchSettingsTab('general');
            if (window.__stMobileReset) window.__stMobileReset();
        }


        // --- SETTINGS KIỂU ĐIỆN THOẠI: danh sách danh mục -> trang chi tiết (chỉ khi html.m-ui) ---
        (function () {
            const dlg = document.getElementById('settings-dialog');
            const list = document.getElementById('st-m-list');
            const content = document.querySelector('.st-content');
            const mTitle = document.querySelector('.st-title-m');
            const tr = (k, f) => { try { return (window.__tr && window.__tr(k)) || f; } catch (e) { return f; } };
            // Thanh kéo: thêm vạch chấm tròn & tự thu nhỏ chấm khi bị chèn ép để không bị xén thành hình vuông
            const updateSliderTicks = (sl) => {
                if (!sl) return;
                const mn = parseFloat(sl.getAttribute('min'));
                const mx = parseFloat(sl.getAttribute('max'));
                const st = parseFloat(sl.getAttribute('step')) || 1;
                const minV = Number.isFinite(mn) ? mn : 0;
                const maxV = Number.isFinite(mx) ? mx : 100;
                const steps = Math.max(1, Math.round((maxV - minV) / st));
                if (steps > 60) {
                    sl.removeAttribute('ticks');
                    return;
                }
                if (!sl.hasAttribute('ticks')) sl.setAttribute('ticks', '');
                const rawW = sl.clientWidth || parseFloat(sl.style.width) || 200;
                const trackW = Math.max(40, rawW - 32);
                const pitch = trackW / steps;
                // radial-gradient của md-slider đặt tâm tại x=size nên cần size <= pitch * 0.42 để luôn tròn xoe, thoáng và không bị xén cạnh
                const dotSize = Math.max(1.5, Math.min(4, Math.round(pitch * 0.42 * 4) / 4));
                sl.style.setProperty('--md-slider-with-tick-marks-container-size', dotSize + 'px');
                sl.style.setProperty('--md-slider-with-tick-marks-container-shape', '9999px');
            };
            const sliderTickRo = typeof ResizeObserver === 'function'
                ? new ResizeObserver(entries => entries.forEach(e => updateSliderTicks(e.target)))
                : null;
            document.querySelectorAll('.st-pane md-slider, .m3-expressive-slider').forEach(sl => {
                updateSliderTicks(sl);
                if (sliderTickRo) sliderTickRo.observe(sl);
            });
            const META = {
                general: ['#5b8def', 'settings.desc_general', 'Ngôn ngữ, màn hình luôn sáng, đặt lại'],
                library: ['#4c8bf5', 'settings.desc_library', 'Thư mục loại trừ, nghệ sĩ, bộ lọc và quét thư viện'],
                appearance: ['#e0709a', 'settings.desc_appearance', 'Màu chủ đạo, kích thước giao diện và chữ'],
                lyrics: ['#e8a33d', 'settings.desc_lyrics', 'Cách hiển thị lời bài hát'],
                mixer: ['#3fae86', 'settings.desc_mixer', 'Equalizer, preamp, cân bằng trái/phải'],
                performance: ['#9b72e0', 'settings.desc_performance', 'Hiệu ứng và hiệu năng'],
                ai: ['#8b5cf6', 'settings.desc_ai', 'Nhà cung cấp AI, API Key, model và prompt tạo playlist'],
                experimental: ['#ff7043', 'settings.desc_experimental', 'Tùy chọn giao diện thử nghiệm'],
                developer: ['#00b894', 'settings.desc_developer', 'Bảng điều khiển (Console) và công cụ gỡ lỗi'],
                android: ['#3ddc84', 'settings.desc_android', 'Tải ứng dụng Android'],
                about: ['#7a8794', 'settings.desc_about', 'Thông tin về Media Player']
            };
            document.querySelectorAll('.st-tab').forEach(tab => {
                const key = tab.dataset.tab, m = META[key] || ['#5b8def', '', ''];
                const card = document.createElement('button');
                card.className = 'st-m-card'; card.dataset.tab = key; card.style.setProperty('--hue', m[0]);
                const icon = tab.querySelector('.material-symbols-rounded').textContent;
                const lbl = tab.querySelector('[data-i18n]');
                const fallbackTitle = key === 'ai' ? 'AI Integration (β)' : key;
                card.innerHTML = '<span class="st-m-ic"><span class="material-symbols-rounded">' + icon + '</span></span><span class="st-m-tx"><span class="st-m-t"' + (lbl ? ' data-i18n="' + lbl.getAttribute('data-i18n') + '"' : '') + '></span><span class="st-m-d" data-i18n="' + m[1] + '"></span></span>';
                card.querySelector('.st-m-t').textContent = lbl ? lbl.textContent : fallbackTitle;
                card.querySelector('.st-m-d').textContent = tr(m[1], m[2]);
                if (key === 'android') card.classList.add('st-m-android');
                card.addEventListener('click', () => openDetail(key));
                list.appendChild(card);
            });
            // Bản Android đã là app rồi nên không cần thẻ tải APK
            if (window.IS_ANDROID_APP) list.querySelector('.st-m-android')?.remove();

            function paneTitle(key) {
                const p = document.querySelector('.st-pane[data-pane="' + key + '"] .st-pane-title');
                return p ? p.textContent : '';
            }
            function openDetail(key) {
                switchSettingsTab(key);
                dlg.classList.add('st-m-detail');
                mTitle.textContent = paneTitle(key);
                content.scrollTop = 0; dlg.classList.remove('st-m-scrolled');
                list.querySelectorAll('.st-m-card').forEach(c => c.classList.toggle('on', c.dataset.tab === key));
                refreshPills();
            }
            // Bố cục 2 cột (máy tính bảng / PC bật New Settings): mở sẵn mục đầu tiên cho khung bên phải khỏi trống
            window.__stAutoDetail = function () {
                if (document.documentElement.classList.contains('st-mui') && !dlg.classList.contains('st-m-detail')
                    && window.matchMedia('(orientation: landscape) and (min-width: 600px)').matches) openDetail('general');
            };
            function closeDetail() {
                dlg.classList.remove('st-m-detail', 'st-m-scrolled');
                list.querySelectorAll('.st-m-card.on').forEach(c => c.classList.remove('on'));
                content.scrollTop = 0;
            }
            window.__stMobileReset = closeDetail;
            document.getElementById('st-m-back').addEventListener('click', () => {
                if (dlg.classList.contains('st-m-detail')) closeDetail();
                else settingsCloseBtn.click();
            });
            content.addEventListener('scroll', () => dlg.classList.toggle('st-m-scrolled', content.scrollTop > 48), { passive: true });

            // Dropdown -> nút "pill" + bottom sheet
            const sheet = document.getElementById('st-sheet');
            const sheetList = sheet.querySelector('.st-sheet-list');
            const sheetTitle = sheet.querySelector('.st-sheet-title');
            function selText(sel) {
                const opt = Array.from(sel.querySelectorAll('md-select-option')).find(o => o.value === sel.value);
                return opt ? (opt.querySelector('[slot="headline"]')?.textContent || opt.textContent).trim() : '';
            }
            function refreshPills() {
                document.querySelectorAll('.st-pane md-outlined-select').forEach(sel => {
                    const pill = sel._pill; if (pill) pill.querySelector('.st-pill-t').textContent = selText(sel);
                });
            }
            function closeSheet() {
                sheet.classList.remove('show');
                setTimeout(() => sheet.classList.remove('open'), 260);
            }
            // Bottom sheet dùng chung: items = [{label, sub, icon, selected, pick()}]
            function openSheetItems(title, items) {
                sheetTitle.textContent = title || '';
                sheetList.innerHTML = '';
                items.forEach(it => {
                    const b = document.createElement('button');
                    b.className = 'st-sheet-opt' + (it.selected ? ' sel' : '');
                    const main = document.createElement('span'); main.className = 'st-opt-main';
                    if (it.icon) { const ic = document.createElement('span'); ic.className = 'material-symbols-rounded'; ic.textContent = it.icon; main.appendChild(ic); }
                    const tx = document.createElement('span'); tx.appendChild(document.createTextNode(it.label));
                    if (it.sub) { const sb = document.createElement('span'); sb.className = 'st-opt-sub'; sb.textContent = it.sub; tx.appendChild(sb); }
                    main.appendChild(tx); b.appendChild(main);
                    const chk = document.createElement('span'); chk.className = 'material-symbols-rounded st-chk'; chk.textContent = 'check'; b.appendChild(chk);
                    b.addEventListener('click', () => { closeSheet(); setTimeout(() => { try { it.pick(); } catch (e) {} }, 60); });
                    sheetList.appendChild(b);
                });
                sheet.classList.add('open');
                requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('show')));
            }
            window.__openSheetItems = openSheetItems;
            // Bottom sheet ở trạng thái đang tải (vòng tròn xoay) / thông báo kèm nút
            function openSheetLoading(title) {
                sheetTitle.textContent = title || '';
                sheetList.innerHTML = '<div style="display:flex;justify-content:center;padding:28px 0 24px;"><md-circular-progress indeterminate style="--md-circular-progress-size:44px;"></md-circular-progress></div>';
                sheet.classList.add('open');
                requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('show')));
            }
            function openSheetMessage(title, text, btnLabel, onBtn) {
                sheetTitle.textContent = title || '';
                sheetList.innerHTML = '';
                const p = document.createElement('div');
                p.style.cssText = 'padding:4px 8px 14px;opacity:.8;line-height:1.45;font-size:calc(14px * var(--font-scale-factor, 1));';
                p.textContent = text; sheetList.appendChild(p);
                if (btnLabel) {
                    const b = document.createElement('button');
                    b.className = 'st-sheet-opt sel'; b.style.justifyContent = 'center';
                    b.textContent = btnLabel;
                    b.addEventListener('click', () => { try { onBtn(); } catch (e) {} });
                    sheetList.appendChild(b);
                }
                sheet.classList.add('open');
                requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('show')));
            }
            window.__openSheetLoading = openSheetLoading;
            window.__openSheetMessage = openSheetMessage;
            window.__closeSheet = closeSheet;
            const optLabel = (o) => (o.querySelector('[slot="headline"]')?.textContent || o.textContent).trim();
            function openSheet(sel, title) {
                openSheetItems(title, Array.from(sel.querySelectorAll('md-select-option')).map(o => ({
                    label: optLabel(o), selected: o.value === sel.value,
                    pick: () => {
                        if (sel.value !== o.value) {
                            sel.value = o.value;
                            sel.dispatchEvent(new Event('input', { bubbles: true }));
                            sel.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        refreshPills();
                    }
                })));
            }
            // Menu thả xuống (Hẹn giờ, Thiết bị phát, Thêm nhạc...) và menu Tốc độ -> bottom sheet, chỉ khi đang ở giao diện điện thoại
            const isM = () => document.documentElement.classList.contains('m-ui');
            document.addEventListener('opening', (e) => {
                const menu = e.target;
                if (!isM() || !menu || menu.tagName !== 'MD-MENU') return;
                const anchor = document.getElementById(menu.getAttribute('anchor') || '');
                let title = (anchor && (anchor.title || anchor.getAttribute('aria-label'))) || '';
                if (menu.id === 'sleep-menu') title = document.querySelector('#sleep-dialog [slot="headline"]')?.textContent || title;
                const items = Array.from(menu.querySelectorAll('md-menu-item')).map(mi => ({
                    label: optLabel(mi), sub: mi.querySelector('[slot="supporting-text"]')?.textContent.trim() || '',
                    icon: (mi.querySelector('[slot="start"].material-symbols-rounded, [slot="start"] .material-symbols-rounded') || {}).textContent || '',
                    selected: !!(mi.selected || mi.hasAttribute('selected')),
                    pick: () => mi.click()
                }));
                setTimeout(() => { try { menu.open = false; } catch (_) {} }, 0);
                if (items.length) openSheetItems(title, items);
            }, true);
            // Chọn thiết bị đầu ra (app Android): sheet xoay vòng -> kiểm tra quyền "Thiết bị ở gần" -> liệt kê thiết bị (kể cả Bluetooth)
            let outFlowSeq = 0;
            function runOutputDeviceFlow() {
                const AB = window.AndroidBridge;
                const isEn = /^en/i.test(localStorage.getItem('settings_language') || '');
                const title = (document.getElementById('output-device-btn') || {}).title || (isEn ? 'Choose audio output device' : 'Chọn thiết bị phát âm thanh');
                const seq = ++outFlowSeq;
                const S = {
                    permMsg: isEn ? 'To list Bluetooth devices (such as your earbuds), Media Player needs the "Nearby devices" permission.' : 'Để liệt kê thiết bị Bluetooth (như tai nghe của bạn), Media Player cần quyền "Thiết bị ở gần".',
                    permBtn: isEn ? 'Open permission settings' : 'Mở trang cấp quyền',
                    speaker: isEn ? 'Speaker' : 'Loa ngoài', wired: isEn ? 'Wired headphones' : 'Tai nghe có dây', usb: 'USB', hdmi: 'HDMI', hearing: isEn ? 'Hearing aid' : 'Máy trợ thính',
                    bt: 'Bluetooth', active: isEn ? 'Currently playing' : 'Đang phát ở đây', switchTo: isEn ? 'Tap to switch in system output picker' : 'Chạm để chuyển trong bảng chọn đầu ra của hệ thống',
                    auto: isEn ? 'System default (automatic)' : 'Mặc định hệ thống (tự động)',
                    none: isEn ? 'No output devices found' : 'Không tìm thấy thiết bị đầu ra nào'
                };
                openSheetLoading(title);
                const showList = () => {
                    if (seq !== outFlowSeq) return;
                    let devs = [];
                    try { devs = JSON.parse(AB.getOutputDevicesJson() || '[]'); } catch (e) {}
                    if (!devs.length) { openSheetMessage(title, S.none); return; }
                    const icons = { speaker: 'speaker', bluetooth: 'headphones', wired: 'headphones', usb: 'usb', hdmi: 'tv', hearing: 'hearing' };
                    openSheetItems(title, devs.map(d => ({
                        label: d.kind === 'speaker' ? S.speaker : (d.name || S[d.kind] || S.bt),
                        sub: d.active ? S.active : (d.kind === 'bluetooth' ? S.switchTo : ''),
                        icon: icons[d.kind] || 'speaker', selected: !!d.active,
                        pick: () => {
                            if (d.active) return;
                            // Ưu tiên chọn thẳng trong app (ép ExoPlayer xuất ra thiết bị này); nếu native chưa phát/không áp dụng được thì mở bảng đầu ra của hệ thống
                            let ok = false;
                            try { ok = !!(AB.setOutputDevice && AB.setOutputDevice(d.id)); } catch (e) {}
                            if (ok) { closeSheet(); if (typeof showToast === 'function') showToast((d.kind === 'speaker' ? S.speaker : (d.name || S[d.kind] || S.bt))); }
                            else if (AB.openSystemOutputSwitcher) AB.openSystemOutputSwitcher();
                        }
                    })).concat(devs.some(d => d.pref) ? [{
                        label: S.auto, sub: '', icon: 'auto_mode', selected: false,
                        pick: () => { try { AB.setOutputDevice(-1); } catch (e) {} closeSheet(); }
                    }] : []));
                };
                const showNoPerm = () => {
                    if (seq !== outFlowSeq) return;
                    openSheetMessage(title, S.permMsg, S.permBtn, () => { if (AB.openAppPermissionSettings) AB.openAppPermissionSettings(); closeSheet(); });
                };
                setTimeout(() => {
                    try {
                        if (!AB || !AB.hasNearbyPermission) { showList(); return; }
                        if (AB.hasNearbyPermission()) { showList(); return; }
                        window.__onNearbyPermResult = (ok) => {
                            if (seq !== outFlowSeq) return;
                            if (!sheet.classList.contains('open')) return;
                            if (ok) { openSheetLoading(title); setTimeout(showList, 250); } else showNoPerm();
                        };
                        AB.requestNearbyPermission();   // chưa có quyền -> xin; kết quả về __onNearbyPermResult
                    } catch (e) { showList(); }
                }, 350);
            }
            document.addEventListener('click', (e) => {
                const ob = e.target.closest && e.target.closest('#output-device-btn');
                if (!ob || !isM() || !window.IS_ANDROID_APP || !window.AndroidBridge || !window.AndroidBridge.getOutputDevicesJson) return;
                e.stopPropagation(); e.preventDefault();
                runOutputDeviceFlow();
            }, true);
            document.addEventListener('click', (e) => {
                const b = e.target.closest && e.target.closest('#speed-btn');
                if (!b || !isM()) return;
                e.stopPropagation(); e.preventDefault();
                const opts = Array.from(document.querySelectorAll('.speed-option'));
                openSheetItems(b.title || 'Speed', opts.map(o => ({ label: o.textContent.trim(), selected: o.classList.contains('active'), pick: () => o.click() })));
            }, true);
            sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
            document.querySelectorAll('.st-pane md-outlined-select').forEach(sel => {
                const pill = document.createElement('button');
                pill.type = 'button'; pill.className = 'st-pill';
                pill.innerHTML = '<span class="st-pill-t"></span><span class="material-symbols-rounded">expand_more</span>';
                sel.after(pill); sel._pill = pill;
                // pill nằm dưới phần chữ của hàng: đưa vào cùng cột với tiêu đề
                const row = sel.parentElement, txt = row.firstElementChild;
                if (txt && txt !== sel && txt !== pill) txt.appendChild(pill);
                pill.addEventListener('click', () => openSheet(sel, txt?.querySelector('span')?.textContent || ''));
                sel.addEventListener('change', refreshPills);
            });
            window.addEventListener('lang-applied', refreshPills);
            setInterval(() => { if (dlg.classList.contains('st-m-detail')) refreshPills(); }, 1000);
            refreshPills();

            // --- TAB "QUẢN LÝ NHẠC" (ONLY MOBILE) ---
            (function initMobileMusicManagement() {
                const LIB_KEY = 'settings_mobile_library_v1';
                const defLib = {
                    minDur: 0, minTracks: 1, artCache: 200, autoScanLrc: true,
                    lyricsPriority: 'embedded', charDelims: '/, ;, +, &',
                    wordDelims: 'featuring, feat., feat, ft., ft, vs., x',
                    extractTitle: true, groupAlbumArtist: false
                };
                let libCfg = Object.assign({}, defLib);
                try { Object.assign(libCfg, JSON.parse(localStorage.getItem(LIB_KEY) || '{}')); } catch (e) {}
                const saveLibCfg = () => {
                    try { localStorage.setItem(LIB_KEY, JSON.stringify(libCfg)); } catch (e) {}
                    clearTimeout(saveLibCfg._t);
                    saveLibCfg._t = setTimeout(() => { try { window.dispatchEvent(new Event('library-cfg-changed')); } catch (e) {} }, 250);
                    try {
                        if (window.AndroidBridge && typeof window.AndroidBridge.setLibraryScanPrefs === 'function') {
                            window.AndroidBridge.setLibraryScanPrefs(Number(libCfg.minDur) || 0, !!libCfg.autoScanLrc);
                        }
                        if (window.AndroidBridge && typeof window.AndroidBridge.setArtCacheLimit === 'function') {
                            window.AndroidBridge.setArtCacheLimit(Number(libCfg.artCache) || 200);
                        }
                    } catch (e) {}
                };
                saveLibCfg();

                const minDurSl = document.getElementById('lib-min-dur'), minDurVal = document.getElementById('lib-min-dur-val');
                const minTrSl = document.getElementById('lib-min-tracks'), minTrVal = document.getElementById('lib-min-tracks-val');
                const cacheSl = document.getElementById('lib-art-cache'), cacheVal = document.getElementById('lib-art-cache-val');
                const autoLrcSw = document.getElementById('lib-auto-scan-lrc');
                const prioSel = document.getElementById('lib-lyrics-priority');
                const charIn = document.getElementById('lib-char-delims'), wordIn = document.getElementById('lib-word-delims');
                const extSw = document.getElementById('lib-extract-title'), grpSw = document.getElementById('lib-group-album-artist');

                if (minDurSl && minDurVal) {
                    minDurSl.value = libCfg.minDur; minDurVal.textContent = libCfg.minDur + 's';
                    minDurSl.addEventListener('input', () => { libCfg.minDur = +minDurSl.value; minDurVal.textContent = libCfg.minDur + 's'; saveLibCfg(); });
                }
                if (minTrSl && minTrVal) {
                    minTrSl.value = libCfg.minTracks; minTrVal.textContent = String(libCfg.minTracks);
                    minTrSl.addEventListener('input', () => { libCfg.minTracks = +minTrSl.value; minTrVal.textContent = String(libCfg.minTracks); saveLibCfg(); });
                }
                if (cacheSl && cacheVal) {
                    cacheSl.value = libCfg.artCache; cacheVal.textContent = libCfg.artCache + ' MB';
                    cacheSl.addEventListener('input', () => { libCfg.artCache = +cacheSl.value; cacheVal.textContent = libCfg.artCache + ' MB'; saveLibCfg(); });
                }
                if (autoLrcSw) {
                    autoLrcSw.selected = !!libCfg.autoScanLrc;
                    autoLrcSw.addEventListener('change', () => { libCfg.autoScanLrc = !!autoLrcSw.selected; saveLibCfg(); });
                }
                if (prioSel) {
                    prioSel.value = libCfg.lyricsPriority || 'embedded';
                    prioSel.addEventListener('change', () => { libCfg.lyricsPriority = prioSel.value; saveLibCfg(); refreshPills(); });
                }
                if (charIn) { charIn.value = libCfg.charDelims; charIn.addEventListener('input', () => { libCfg.charDelims = charIn.value; saveLibCfg(); }); }
                if (wordIn) { wordIn.value = libCfg.wordDelims; wordIn.addEventListener('input', () => { libCfg.wordDelims = wordIn.value; saveLibCfg(); }); }
                if (extSw) { extSw.selected = !!libCfg.extractTitle; extSw.addEventListener('change', () => { libCfg.extractTitle = !!extSw.selected; saveLibCfg(); }); }
                if (grpSw) { grpSw.selected = !!libCfg.groupAlbumArtist; grpSw.addEventListener('change', () => { libCfg.groupAlbumArtist = !!grpSw.selected; saveLibCfg(); }); }

                // Modal Thư mục loại trừ
                const exModal = document.getElementById('lib-excluded-modal');
                const exList = document.getElementById('lib-excluded-list');
                const exSet = new Set();
                function renderExcludedModal() {
                    if (!exList) return;
                    exList.innerHTML = '';
                    let dirs = [];
                    try {
                        if (window.AndroidBridge && typeof window.AndroidBridge.listAudioDirectoriesJson === 'function') {
                            dirs = JSON.parse(window.AndroidBridge.listAudioDirectoriesJson() || '[]');
                        }
                    } catch (e) {}
                    if (!dirs.length) {
                        const em = document.createElement('div');
                        em.style.cssText = 'text-align:center; padding:32px 16px; opacity:.65; font-size:14px;';
                        em.textContent = tr('lib.excluded_dirs_empty', 'Không tìm thấy thư mục chứa nhạc nào trên thiết bị.');
                        exList.appendChild(em);
                        return;
                    }
                    dirs.forEach(item => {
                        const isEx = exSet.has(item.path);
                        const row = document.createElement('div');
                        row.className = 'lib-sub-item' + (isEx ? ' excluded' : '');
                        row.innerHTML =
                            '<span class="material-symbols-rounded" style="color:' + (isEx ? 'inherit' : 'var(--md-sys-color-primary)') + '">' + (isEx ? 'folder_off' : 'folder') + '</span>' +
                            '<div style="flex:1; min-width:0;"><div style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div><div style="font-size:11.5px; opacity:.65; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div></div>' +
                            '<span style="font-size:12px; font-weight:700; opacity:.8;">' + item.count + '</span>' +
                            '<span class="material-symbols-rounded" style="color:' + (isEx ? 'inherit' : 'var(--md-sys-color-primary)') + '">' + (isEx ? 'check_box_outline_blank' : 'check_box') + '</span>';
                        row.querySelector('div > div:first-child').textContent = item.name;
                        row.querySelector('div > div:last-child').textContent = item.path;
                        row.addEventListener('click', () => {
                            if (exSet.has(item.path)) exSet.delete(item.path); else exSet.add(item.path);
                            renderExcludedModal();
                        });
                        exList.appendChild(row);
                    });
                }
                document.getElementById('lib-open-excluded')?.addEventListener('click', () => {
                    exSet.clear();
                    try {
                        if (window.AndroidBridge && typeof window.AndroidBridge.getExcludedDirectoriesJson === 'function') {
                            JSON.parse(window.AndroidBridge.getExcludedDirectoriesJson() || '[]').forEach(p => exSet.add(p));
                        }
                    } catch (e) {}
                    renderExcludedModal();
                    exModal?.classList.add('open');
                });
                document.getElementById('lib-excluded-close')?.addEventListener('click', () => exModal?.classList.remove('open'));
                document.getElementById('lib-excluded-save')?.addEventListener('click', () => {
                    try {
                        if (window.AndroidBridge && typeof window.AndroidBridge.setExcludedDirectoriesJson === 'function') {
                            window.AndroidBridge.setExcludedDirectoriesJson(JSON.stringify(Array.from(exSet)));
                        }
                        if (window.AndroidBridge && typeof window.AndroidBridge.scanAllDeviceAudio === 'function') {
                            window.AndroidBridge.scanAllDeviceAudio(true);
                        }
                    } catch (e) {}
                    exModal?.classList.remove('open');
                    showToast(tr('lib.rescan_started', 'Đang quét lại toàn bộ thư viện nhạc...'), 'refresh', 3000);
                });

                // Modal Nghệ sĩ
                const artModal = document.getElementById('lib-artists-modal');
                document.getElementById('lib-open-artists')?.addEventListener('click', () => artModal?.classList.add('open'));
                document.getElementById('lib-artists-close')?.addEventListener('click', () => artModal?.classList.remove('open'));

                // Full Rescan & Rebuild Database
                document.getElementById('lib-full-rescan-btn')?.addEventListener('click', () => {
                    saveLibCfg();
                    if (window.AndroidBridge && typeof window.AndroidBridge.scanAllDeviceAudio === 'function') {
                        window.AndroidBridge.scanAllDeviceAudio(true);
                    }
                    showToast(tr('lib.rescan_started', 'Đang quét lại toàn bộ thư viện nhạc...'), 'refresh', 3000);
                });
                document.getElementById('lib-rebuild-db-btn')?.addEventListener('click', async () => {
                    const ok = await confirmDialog(
                        tr('lib.rebuild_confirm_body', 'Thao tác này sẽ dựng lại toàn bộ thư viện nhạc từ đầu. Các lời bài hát đã nạp thủ công và dữ liệu tạm sẽ bị xóa. Hành động này không thể hoàn tác.'),
                        tr('lib.rebuild_ok', 'Tạo lại'),
                        tr('lib.rebuild_confirm_title', 'Tạo lại cơ sở dữ liệu?')
                    );
                    if (!ok) return;
                    try { localStorage.removeItem('settings_subs'); } catch (e) {}
                    try { localStorage.removeItem('mp_last_card_v1'); } catch (e) {}
                    try { localStorage.removeItem('mp_ai_lyric_trans_v1'); } catch (e) {}
                    if (typeof window.__clearAiLyricTranslations === 'function') window.__clearAiLyricTranslations(true);
                    if (typeof window.__clearMobileMetaCache === 'function') {
                        await window.__clearMobileMetaCache();
                    }
                    if (window.AndroidBridge && typeof window.AndroidBridge.scanAllDeviceAudio === 'function') {
                        window.AndroidBridge.scanAllDeviceAudio(true);
                    } else {
                        if (typeof window.__renderMobileLibraryNow === 'function') window.__renderMobileLibraryNow();
                        if (typeof window.__hydrateMobileLibraryCovers === 'function') window.__hydrateMobileLibraryCovers();
                    }
                    if (typeof playlist !== 'undefined' && typeof currentIndex !== 'undefined' && currentIndex >= 0 && playlist[currentIndex] && typeof hydrateTrackTags === 'function') {
                        setTimeout(() => { try { hydrateTrackTags(playlist[currentIndex], currentIndex); } catch (e) {} }, 150);
                    }
                    showToast(tr('lib.rebuilt_done', 'Đã tạo lại cơ sở dữ liệu và quét lại thư viện!'), 'check_circle', 3500);
                });

                // Reset Imported Lyrics
                document.getElementById('lib-reset-lyrics-btn')?.addEventListener('click', async () => {
                    const ok = await confirmDialog(
                        tr('lib.reset_lyrics_confirm', 'Bạn có chắc muốn xóa toàn bộ lời bài hát đã nạp khỏi danh sách hiện tại?'),
                        tr('misc.confirm', 'Xác nhận'),
                        tr('lib.reset_lyrics', 'Đặt lại lời bài hát đã nạp')
                    );
                    if (!ok) return;
                    playlist.forEach(t => { if (t) { t.lyrics = null; t.lyricsRaw = ''; } });
                    renderLyrics();
                    updatePlaylistUI();
                    showToast(tr('lib.lyrics_reset_done', 'Đã đặt lại lời bài hát đã nạp!'), 'check_circle', 3000);
                });
                refreshPills();
            })();
        })();



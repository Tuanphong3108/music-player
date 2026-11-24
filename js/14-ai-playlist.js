(function () {
    'use strict';
    const CFG_KEY = 'mp_ai_integration_v1';
    const USAGE_KEY = 'mp_ai_usage_v1';
    const MODELS_CACHE_KEY = 'mp_gemini_models_v1';
    const LYRIC_TRANS_KEY = 'mp_ai_lyric_trans_v1';
    const LYRIC_SHOW_KEY = 'mp_ai_lyric_show_v1';
    const TRANSLATE_LANGS = ['Tiếng Việt', 'English', '日本語', '한국어', '中文 (简体)', 'Français', 'Español', 'Deutsch', 'Tùy chỉnh...'];
    const DEFAULT_PROMPTS = {
        curator: "You are 'Vibe-Engine', a professional music curator. Analyze the user's request and listening profile to provide smart music recommendations from the local library. Always prioritize flow, emotional coherence, and exact metadata matching. Respond strictly in valid JSON.",
        creative: "You are 'Vibe-Engine' in creative discovery mode. Craft adventurous, mood-rich local playlists with unexpected transitions while honoring every constraint. Respond strictly in valid JSON."
    };
    const MOODS = ['Chill', 'Energetic', 'Happy', 'Dark', 'Romantic', 'Melancholic'];
    const ACTIVITIES = ['Workout', 'Focus', 'Road trip', 'Party', 'Study', 'Late night'];
    const ERAS = ['Any era', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
    const PROVIDERS = ['Google Gemini'];

    function loadModelsCache(apiKey) {
        if (!apiKey) return [];
        try {
            const raw = JSON.parse(localStorage.getItem(MODELS_CACHE_KEY) || 'null');
            if (raw && raw.keyHash === hashKey(apiKey) && Array.isArray(raw.models)) {
                return raw.models.filter(Boolean);
            }
        } catch (e) {}
        return [];
    }
    function saveModelsCache(apiKey, models) {
        if (!apiKey) return;
        try {
            localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ keyHash: hashKey(apiKey), models: models || [] }));
        } catch (e) {}
    }
    function hashKey(k) {
        let h = 2166136261;
        for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
        return String(h >>> 0);
    }

    function loadCfg() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) {}
        const apiKey = typeof saved.apiKey === 'string' ? saved.apiKey.trim() : '';
        const cachedModels = loadModelsCache(apiKey);
        const savedModel = typeof saved.model === 'string' ? saved.model.trim() : '';
        const model = apiKey && savedModel && (!cachedModels.length || cachedModels.includes(savedModel))
            ? savedModel
            : (apiKey && cachedModels.length ? cachedModels[0] : '');
        const defaultLang = /^en/i.test(localStorage.getItem('settings_language') || '') ? 'English' : 'Tiếng Việt';
        return {
            provider: 'Google Gemini',
            safeToken: saved.safeToken !== false,
            apiKey,
            model,
            preset: saved.preset === 'creative' ? 'creative' : 'curator',
            systemPrompt: typeof saved.systemPrompt === 'string' && saved.systemPrompt.trim() ? saved.systemPrompt : DEFAULT_PROMPTS.curator,
            translateLang: (typeof saved.translateLang === 'string' && saved.translateLang.trim()) ? saved.translateLang.trim() : defaultLang,
            bilingualLyrics: saved.bilingualLyrics !== false
        };
    }
    function saveCfg(nextCfg) {
        const clean = Object.assign({}, nextCfg, { provider: 'Google Gemini' });
        try { localStorage.setItem(CFG_KEY, JSON.stringify(clean)); } catch (e) {}
    }
    function loadUsage() {
        try {
            const u = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}') || {};
            return { runs: Number(u.runs) || 0, tokensEst: Number(u.tokensEst) || 0, lastPlaylist: u.lastPlaylist || '' };
        } catch (e) { return { runs: 0, tokensEst: 0, lastPlaylist: '' }; }
    }
    function addUsage(tokens, plName) {
        const cur = loadUsage();
        const next = { runs: cur.runs + 1, tokensEst: cur.tokensEst + (Number(tokens) || 0), lastPlaylist: plName || cur.lastPlaylist };
        try { localStorage.setItem(USAGE_KEY, JSON.stringify(next)); } catch (e) {}
        return next;
    }

    let cfg = loadCfg();
    let fetchedModels = loadModelsCache(cfg.apiKey);
    let fetchingModels = false;
    let lastModelError = '';
    let labOpen = false;
    let pendingOpenLabAfterSetup = false;
    let labState = {
        name: '', prompt: '', moods: new Set(), activities: new Set(),
        era: 'Any era', energy: 3, discovery: 3, minSongs: 12, maxSongs: 24,
        prioGenres: '', avoidGenres: '', prefLang: '', prioFavs: true, avoidExplicit: false
    };

    async function fetchGeminiModels(apiKey, silent) {
        const key = String(apiKey || '').trim();
        if (!key) {
            fetchedModels = [];
            lastModelError = '';
            cfg.model = '';
            saveCfg(cfg);
            syncAllSettingsHosts();
            return [];
        }
        fetchingModels = true;
        lastModelError = '';
        syncAllSettingsHosts();
        try {
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key));
            const data = await res.json();
            if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
            const list = (Array.isArray(data && data.models) ? data.models : [])
                .filter(m => m && Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => String(m.name || '').replace(/^models\//, ''))
                .filter(name => name && !/embedding|imagen|veo|aqa/i.test(name));
            fetchedModels = Array.from(new Set(list));
            saveModelsCache(key, fetchedModels);
            if (!cfg.model || !fetchedModels.includes(cfg.model)) {
                cfg.model = fetchedModels[0] || '';
            }
            saveCfg(cfg);
            fetchingModels = false;
            syncAllSettingsHosts();
            if (!silent && typeof showToast === 'function') {
                showToast('Đã tải ' + fetchedModels.length + ' mô hình Gemini!', 'check_circle', 2200);
            }
            return fetchedModels;
        } catch (err) {
            fetchingModels = false;
            lastModelError = (err && err.message) ? err.message : String(err);
            syncAllSettingsHosts();
            if (!silent && typeof showToast === 'function') {
                showToast('Không tải được danh sách mô hình: ' + lastModelError, 'error', 3500);
            }
            return [];
        }
    }

    function injectStyles() {
        if (document.getElementById('ai-playlist-lab-style')) return;
        const st = document.createElement('style');
        st.id = 'ai-playlist-lab-style';
        st.textContent = `
          body:has(#ai-playlist-lab-modal.open) #settings-overlay{z-index:9650;}
          body:has(#ai-playlist-lab-modal.open) #st-sheet{z-index:9660;}
          #ai-settings-host{display:contents;}
          html:not(.m-ui) .ai-mobile-only{display:none !important;}
          html.m-ui .ai-pc-only{display:none !important;}
          .ai-sr{display:flex;gap:24px;justify-content:space-between;align-items:center;padding-bottom:20px;border-bottom:1px solid var(--playlist-border);}
          .ai-sr.ai-sr-col{flex-direction:column;align-items:stretch;gap:12px;}
          .ai-sr-text{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;}
          .ai-sr-t{font-size:calc(16px * var(--font-scale-factor, 1));font-weight:700;}
          .ai-sr-d{font-size:calc(12px * var(--font-scale-factor, 1));opacity:.6;line-height:1.45;}
          .ai-sr-banner{flex-direction:column;align-items:stretch;gap:4px;background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);border-radius:20px;padding:16px 20px !important;border:none;}
          .ai-sr.ai-sr-col .ai-sheet-trigger{align-self:flex-start;max-width:100%;}
          #ai-settings-host > .ai-sr:last-child{border-bottom:none;padding-bottom:0;}
          /* PC Settings UI: dùng đúng quy chuẩn hàng ngang + md-outlined-select / md-outlined-text-field / md-filled-tonal-button */
          html:not(.m-ui) .ai-sr.ai-sr-select-row{flex-direction:row;align-items:center;justify-content:space-between;gap:24px;}
          html:not(.m-ui) .ai-sr.ai-sr-key-row{flex-direction:row;align-items:center;justify-content:space-between;gap:24px;}
          html:not(.m-ui) .ai-sr.ai-sr-usage-row{flex-direction:row;align-items:center;justify-content:space-between;gap:24px;}
          html:not(.m-ui) .ai-sr .ai-sheet-trigger{display:none !important;}
          html:not(.m-ui) .ai-sr md-outlined-select.m3-select{flex-shrink:0;min-width:210px;}
          html:not(.m-ui) .ai-key-ctrl{display:flex;align-items:center;gap:10px;flex-shrink:0;}
          html:not(.m-ui) .ai-key-ctrl .ai-input{width:240px;height:48px;border-radius:16px;border-color:var(--md-sys-color-outline);background:transparent;}
          html:not(.m-ui) .ai-key-ctrl .ai-input:hover,html:not(.m-ui) .ai-key-ctrl .ai-input:focus{border-color:var(--md-sys-color-primary);}
          html:not(.m-ui) .ai-key-ctrl md-filled-tonal-button{--md-filled-tonal-button-label-text-font:var(--app-font);--md-filled-tonal-button-container-shape:16px;height:48px;flex-shrink:0;}
          html:not(.m-ui) .ai-sr md-text-button{--md-text-button-label-text-font:var(--app-font);font-family:var(--app-font);flex-shrink:0;}
          html.m-ui .ai-sr md-outlined-select.m3-select{display:none !important;}
          html.m-ui .ai-key-ctrl{display:flex;flex-direction:column;align-items:stretch;gap:10px;width:100%;}
          html.m-ui .st-pane > #ai-settings-host{display:flex;flex-direction:column;gap:2px;background:none !important;padding:0 !important;border-radius:0 !important;border:none !important;}
          html.m-ui .ai-sr:not(.ai-sr-banner){background:var(--md-sys-color-surface-container, color-mix(in srgb, var(--md-sys-color-surface-variant) 60%, var(--md-sys-color-surface)));padding:18px 20px;border:none;border-radius:8px;}
          html.m-ui #ai-settings-host > .ai-sr:first-child{border-radius:28px 28px 8px 8px;}
          html.m-ui #ai-settings-host > .ai-sr:last-child{border-radius:8px 8px 28px 28px;padding-bottom:18px;}
          html.m-ui #ai-settings-host > .ai-sr:only-child{border-radius:28px;}
          html.m-ui .ai-sr-banner{margin-bottom:10px;}
          html.m-ui .ai-sr-banner + .ai-sr{border-radius:28px 28px 8px 8px !important;}
          .ai-st-group{display:flex;flex-direction:column;gap:2px;margin-bottom:20px;}
          .ai-st-sec{font-size:calc(12px * var(--font-scale-factor, 1));font-weight:700;letter-spacing:.4px;color:var(--md-sys-color-primary);margin:0 0 8px;padding:0 4px;text-transform:uppercase;}
          .ai-st-card{background:var(--md-sys-color-surface-container, color-mix(in srgb, var(--md-sys-color-surface-variant) 60%, var(--md-sys-color-surface)));border-radius:8px;padding:16px 20px;display:flex;flex-direction:column;gap:14px;border:none;}
          .ai-st-group > .ai-st-card:first-of-type{border-radius:24px 24px 8px 8px;}
          .ai-st-group > .ai-st-card:last-of-type{border-radius:8px 8px 24px 24px;}
          .ai-st-group > .ai-st-card:only-of-type{border-radius:24px;}
          .ai-row-flex{display:flex;align-items:center;gap:14px;justify-content:space-between;flex-wrap:wrap;}
          .ai-ico-box{width:40px;height:40px;border-radius:14px;background:color-mix(in srgb,var(--md-sys-color-primary) 16%,transparent);color:var(--md-sys-color-primary);display:grid;place-items:center;flex-shrink:0;}
          .ai-card-title{font-size:calc(16px * var(--font-scale-factor, 1));font-weight:700;color:var(--md-sys-color-on-surface);}
          .ai-card-desc{font-size:calc(12.5px * var(--font-scale-factor, 1));line-height:1.45;color:var(--md-sys-color-on-surface-variant);opacity:.78;margin-top:2px;}
          .ai-pill-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:999px;border:1px solid var(--playlist-border);font-family:var(--app-font);font-size:calc(13px * var(--font-scale-factor, 1));font-weight:700;cursor:pointer;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .2s,border-color .2s;}
          .ai-pill-btn:active,.ai-chip:active,.ai-reset-btn:active,.ai-gen-btn:active,.ai-save-btn:active{transform:scale(.96);}
          .ai-pill-btn.active,.ai-pill-btn.sel{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);border-color:var(--md-sys-color-primary);}
          .ai-sheet-trigger{display:inline-flex;align-items:center;gap:8px;padding:10px 14px 10px 18px;border-radius:999px;border:none;background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);font-family:var(--app-font);font-size:calc(14px * var(--font-scale-factor, 1));font-weight:700;cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1),opacity .2s;}
          .ai-sheet-trigger:active:not(:disabled){transform:scale(.96);}
          .ai-sheet-trigger:disabled{opacity:.45;cursor:default;}
          .ai-input,.ai-textarea{width:100%;box-sizing:border-box;border-radius:16px;border:1px solid var(--playlist-border);background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font-family:var(--app-font);font-size:calc(14px * var(--font-scale-factor, 1));padding:12px 16px;outline:none;transition:border-color .2s;}
          .ai-input:focus,.ai-textarea:focus{border-color:var(--md-sys-color-primary);}
          .ai-textarea{min-height:110px;resize:vertical;line-height:1.45;}
          .ai-save-btn{align-self:flex-start;padding:10px 22px;border-radius:999px;border:none;font-family:var(--app-font);font-size:calc(14px * var(--font-scale-factor, 1));font-weight:700;cursor:pointer;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);transition:transform .2s cubic-bezier(.34,1.56,.64,1),opacity .2s;}
          .ai-save-btn:disabled{opacity:.4;cursor:not-allowed;}
          .ai-switch{position:relative;display:inline-block;width:52px;height:30px;flex-shrink:0;}
          .ai-switch input{opacity:0;width:0;height:0;}
          .ai-switch-track{position:absolute;inset:0;border-radius:999px;background:var(--md-sys-color-surface-variant);border:2px solid var(--md-sys-color-outline);transition:.28s cubic-bezier(.34,1.56,.64,1);display:flex;align-items:center;padding:0 4px;cursor:pointer;}
          .ai-switch-thumb{width:18px;height:18px;border-radius:50%;background:var(--md-sys-color-outline);transition:.28s cubic-bezier(.34,1.56,.64,1);display:grid;place-items:center;}
          .ai-switch input:checked + .ai-switch-track{background:var(--md-sys-color-primary);border-color:var(--md-sys-color-primary);}
          .ai-switch input:checked + .ai-switch-track .ai-switch-thumb{transform:translateX(22px);width:20px;height:20px;background:var(--md-sys-color-on-primary);color:var(--md-sys-color-primary);}
          #ai-playlist-lab-modal{position:fixed;inset:0;z-index:9600;display:none;flex-direction:column;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font-family:var(--app-font);padding-top:0;opacity:0;transform:scale(.95);transition:opacity .28s cubic-bezier(.2,0,0,1),transform .36s cubic-bezier(.2,0,0,1);}
          #ai-playlist-lab-modal.open{display:flex;}
          #ai-playlist-lab-modal.show{opacity:1;transform:scale(1);}
          html.reduce-motion #ai-playlist-lab-modal{transition:none !important;transform:none !important;}
          .ai-modal-top{display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid var(--playlist-border);background:var(--md-sys-color-surface-container, var(--md-sys-color-surface));flex-shrink:0;}
          .ai-modal-top h2{margin:0;font-size:calc(22px * var(--font-scale-factor, 1));font-weight:700;flex:1;font-family:var(--app-font);}
          .ai-icon-btn{width:48px;height:48px;border-radius:50%;border:none;background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .2s;}
          .ai-icon-btn:active{transform:scale(.92);}
          .ai-modal-body{flex:1;overflow-y:auto;padding:18px 16px 112px;}
          .ai-banner-info{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);border-radius:24px;padding:16px 20px;margin-bottom:20px;display:flex;flex-direction:column;gap:10px;border:1px solid var(--playlist-border);}
          .ai-chip-wrap{display:flex;flex-wrap:wrap;gap:8px;}
          .ai-chip{padding:9px 15px;border-radius:999px;border:1px solid var(--playlist-border);background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font-family:var(--app-font);font-size:calc(13px * var(--font-scale-factor, 1));font-weight:700;cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .2s,border-color .2s;}
          .ai-chip.active{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);border-color:var(--md-sys-color-primary);}
          .ai-seg-5{display:grid;grid-template-columns:repeat(5,1fr);border-radius:18px;overflow:hidden;border:1px solid var(--playlist-border);background:var(--md-sys-color-surface);}
          .ai-seg-5 button{border:none;border-right:1px solid var(--playlist-border);background:transparent;color:var(--md-sys-color-on-surface);padding:10px 4px;font-family:var(--app-font);font-size:calc(13.5px * var(--font-scale-factor, 1));font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;transition:background .2s,color .2s;}
          .ai-seg-5 button:last-child{border-right:none;}
          .ai-seg-5 button.active{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);}
          .ai-two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
          .ai-lab-footer{position:fixed;left:0;right:0;bottom:0;z-index:9610;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px calc(14px + env(safe-area-inset-bottom, 0px));background:var(--md-sys-color-surface-container, var(--md-sys-color-surface));border-top:1px solid var(--playlist-border);}
          .ai-reset-btn{padding:12px 22px;border-radius:999px;border:none;background:var(--md-sys-color-surface-variant);color:var(--md-sys-color-on-surface-variant);font-family:var(--app-font);font-size:calc(14px * var(--font-scale-factor, 1));font-weight:700;cursor:pointer;transition:transform .2s cubic-bezier(.34,1.56,.64,1);}
          .ai-gen-btn{padding:13px 24px;border-radius:999px;border:none;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);font-family:var(--app-font);font-size:calc(15px * var(--font-scale-factor, 1));font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:transform .2s cubic-bezier(.34,1.56,.64,1),opacity .2s;}
          .ai-gen-btn:disabled{opacity:.5;cursor:wait;}
          #ai-local-sheet{position:fixed;inset:0;z-index:9700;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0);transition:background .25s;}
          #ai-local-sheet.open{display:flex;background:rgba(0,0,0,.5);}
          #ai-local-sheet.show{background:rgba(0,0,0,.5);}
          #ai-local-sheet .ai-ls-box{width:100%;max-width:560px;max-height:80%;overflow-y:auto;background:var(--md-sys-color-surface-container-high, var(--md-sys-color-surface));color:var(--md-sys-color-on-surface);border-radius:28px 28px 0 0;padding:12px 16px calc(20px + env(safe-area-inset-bottom, 0px));display:flex;flex-direction:column;gap:4px;transform:translateY(100%);transition:transform .3s cubic-bezier(.2,.8,.2,1);}
          #ai-local-sheet.show .ai-ls-box{transform:translateY(0);}
          #ai-local-sheet .ai-ls-grip{width:36px;height:4px;border-radius:2px;background:currentColor;opacity:.3;margin:0 auto 8px;flex:0 0 auto;}
          #ai-local-sheet .ai-ls-title{font-weight:700;font-size:calc(18px * var(--font-scale-factor, 1));padding:4px 8px 10px;font-family:var(--app-font);}
          #ai-local-sheet .ai-ls-opt{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border:none;border-radius:18px;background:color-mix(in srgb, var(--md-sys-color-on-surface) 7%, transparent);color:inherit;font-family:var(--app-font);font-size:calc(16px * var(--font-scale-factor, 1));font-weight:600;text-align:left;cursor:pointer;}
          #ai-local-sheet .ai-ls-opt.sel{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);font-weight:700;}
          #ai-local-sheet .ai-ls-opt .st-chk{visibility:hidden;font-size:20px;}
          #ai-local-sheet .ai-ls-opt.sel .st-chk{visibility:visible;}
          html:not(.m-ui) #ai-local-sheet{display:none !important;}
          #ai-pc-menu{
            --md-ref-typeface-plain: var(--app-font);
            --md-ref-typeface-brand: var(--app-font);
            --md-sys-typescale-body-large-font: var(--app-font);
            --md-sys-typescale-label-large-font: var(--app-font);
            --md-menu-container-color: var(--md-sys-color-surface-variant);
            --md-menu-container-shape: 16px;
            --md-menu-item-container-color: transparent;
            --md-menu-item-label-text-color: var(--md-sys-color-on-surface);
            --md-menu-item-selected-container-color: var(--md-sys-color-primary-container);
            --md-menu-item-selected-label-text-color: var(--md-sys-color-on-primary-container);
            --md-menu-item-hover-state-layer-color: var(--md-sys-color-primary);
            --md-menu-item-focus-state-layer-color: var(--md-sys-color-primary);
            --md-menu-item-label-text-font: var(--app-font);
            --md-menu-item-label-text-weight: 600;
            --md-menu-item-selected-label-text-weight: 700;
            --md-menu-item-one-line-container-height: 44px;
            font-family: var(--app-font);
            z-index: 9800;
            --md-menu-z-index: 9800;
          }
          #ai-pc-menu md-menu-item{font-family: var(--app-font); min-width: 190px;}
          #ai-pc-menu md-menu-item[selected]{background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);}
          .lyric-translate-btn{position:absolute;top:16px;right:16px;height:44px;z-index:16;display:inline-flex;align-items:center;gap:6px;padding:0 16px;border-radius:22px;background:var(--md-sys-color-surface-variant);color:var(--md-sys-color-on-surface-variant);border:1px solid var(--playlist-border);cursor:pointer;font-family:var(--app-font);font-size:calc(13.5px * var(--font-scale-factor, 1));font-weight:700;opacity:0;pointer-events:none;transition:var(--m3-transition),background .2s,color .2s;}
          .lyric-translate-btn:hover{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);}
          .lyric-translate-btn.active{background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);border-color:var(--md-sys-color-primary);}
          .lyric-translate-btn.busy .material-symbols-rounded,#m-lyric-translate.busy .material-symbols-rounded{animation:spin 1s linear infinite;}
          .lyric-translate-btn .material-symbols-rounded{font-size:19px;}
          body.lyrics-open .lyric-translate-btn{opacity:1;pointer-events:auto;}
          body.fullscreen-active .lyric-translate-btn,html.m-ui .lyric-translate-btn{display:none !important;}
          #m-lyric-translate.active{background:var(--md-sys-color-primary-container) !important;color:var(--md-sys-color-on-primary-container) !important;}
          .lyric-trans-sub{font-size:.66em;font-weight:500;opacity:.76;margin-top:4px;line-height:1.38;}
          .lyric-line.active .lyric-trans-sub{opacity:.9;}
          .lyric-trans-inline{display:block;font-size:.66em;font-weight:600;opacity:.85;margin-top:4px;line-height:1.32;}
        `;
        document.head.appendChild(st);
    }

    function ensureLocalSheet() {
        if (document.getElementById('ai-local-sheet')) return;
        const sh = document.createElement('div');
        sh.id = 'ai-local-sheet';
        sh.innerHTML = `<div class="ai-ls-box"><div class="ai-ls-grip"></div><div class="ai-ls-title" id="ai-ls-title"></div><div id="ai-ls-list"></div></div>`;
        document.body.appendChild(sh);
        sh.addEventListener('click', (e) => { if (e.target === sh) closeLocalSheet(); });
    }
    function closeLocalSheet() {
        const sh = document.getElementById('ai-local-sheet');
        if (!sh) return;
        sh.classList.remove('show');
        setTimeout(() => sh.classList.remove('open'), 260);
    }
    function isLocalSheetOpen() {
        const sh = document.getElementById('ai-local-sheet');
        return !!(sh && (sh.classList.contains('open') || sh.classList.contains('show')));
    }
    function ensurePcMenu() {
        let menu = document.getElementById('ai-pc-menu');
        if (menu) return menu;
        menu = document.createElement('md-menu');
        menu.id = 'ai-pc-menu';
        menu.setAttribute('positioning', 'popover');
        menu.setAttribute('anchor-corner', 'end-end');
        menu.setAttribute('menu-corner', 'start-end');
        document.body.appendChild(menu);
        return menu;
    }
    function openPcDropdownMenu(options, currentVal, onPick, anchorEl) {
        injectStyles();
        const menu = ensurePcMenu();
        menu.open = false;
        menu.innerHTML = '';
        options.forEach(opt => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const lbl = typeof opt === 'string' ? opt : opt.label;
            const isSel = val === currentVal;
            const item = document.createElement('md-menu-item');
            if (isSel) item.setAttribute('selected', '');
            item.innerHTML = `<div slot="headline">${String(lbl).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>${isSel ? '<span class="material-symbols-rounded" slot="end" style="font-size:18px;color:var(--md-sys-color-primary);">check</span>' : ''}`;
            item.addEventListener('click', () => {
                menu.open = false;
                setTimeout(() => onPick(val), 20);
            });
            menu.appendChild(item);
        });
        if (anchorEl) menu.anchorElement = anchorEl;
        requestAnimationFrame(() => { menu.open = true; });
    }
    function openChoiceSheet(title, options, currentVal, onPick, anchorEl) {
        // Trên PC: luôn dùng Material Web Dropdown (<md-menu>), KHÔNG dùng Bottom Sheet
        if (!document.documentElement.classList.contains('m-ui')) {
            openPcDropdownMenu(options, currentVal, onPick, anchorEl || document.activeElement);
            return;
        }
        if (typeof window.__openSheetItems === 'function') {
            window.__openSheetItems(title, options.map(opt => {
                const val = typeof opt === 'string' ? opt : opt.value;
                const lbl = typeof opt === 'string' ? opt : opt.label;
                return {
                    label: lbl,
                    icon: 'check_circle',
                    selected: val === currentVal,
                    pick: () => onPick(val)
                };
            }));
            return;
        }
        injectStyles();
        ensureLocalSheet();
        const sh = document.getElementById('ai-local-sheet');
        const listEl = document.getElementById('ai-ls-list');
        document.getElementById('ai-ls-title').textContent = title || '';
        listEl.innerHTML = '';
        options.forEach(opt => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const lbl = typeof opt === 'string' ? opt : opt.label;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-ls-opt' + (val === currentVal ? ' sel' : '');
            btn.innerHTML = `<span>${lbl}</span><span class="material-symbols-rounded st-chk">check</span>`;
            btn.addEventListener('click', () => { closeLocalSheet(); setTimeout(() => onPick(val), 60); });
            listEl.appendChild(btn);
        });
        sh.classList.add('open');
        requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add('show')));
    }

    function renderSettingsMarkup(containerId) {
        const host = document.getElementById(containerId);
        if (!host) return;
        const usage = loadUsage();
        const hasKey = !!(cfg.apiKey && cfg.apiKey.trim());
        const modelLabel = fetchingModels
            ? 'Loading models...'
            : (!hasKey ? 'Enter API key first' : (cfg.model || 'No model selected'));
        const modelDesc = fetchingModels
            ? 'Fetching available Gemini models from Google AI Studio...'
            : (!hasKey
                ? 'Model list stays empty until you enter a Gemini API key.'
                : (lastModelError ? ('Fetch error: ' + lastModelError) : (fetchedModels.length ? (fetchedModels.length + ' Gemini models loaded.') : 'Tap to fetch Gemini models.')));

        const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const isMobileUi = document.documentElement.classList.contains('m-ui');
        const modelOptionsHtml = (!hasKey || fetchingModels || !fetchedModels.length)
            ? `<md-select-option value="" selected><div slot="headline">${esc(modelLabel)}</div></md-select-option>`
            : fetchedModels.map(m => `<md-select-option value="${esc(m)}"${m === cfg.model ? ' selected' : ''}><div slot="headline">${esc(m)}</div></md-select-option>`).join('');
        const langList = TRANSLATE_LANGS.slice();
        if (cfg.translateLang && !langList.includes(cfg.translateLang)) langList.unshift(cfg.translateLang);
        const langOptionsHtml = langList.map(l => `<md-select-option value="${esc(l)}"${l === cfg.translateLang ? ' selected' : ''}><div slot="headline">${esc(l)}</div></md-select-option>`).join('');
        const savedTransCount = countSavedTranslations();
        const usageDescHtml = isMobileUi
            ? `Đã tạo <b>${usage.runs}</b> danh sách phát • Đã lưu <b>${savedTransCount}</b> bản dịch lời • Ước tính <b>${usage.tokensEst}</b> token${usage.lastPlaylist ? ' • Gần nhất: <b>' + esc(usage.lastPlaylist) + '</b>' : ''}`
            : `Đã lưu <b>${savedTransCount}</b> bản dịch lời bài hát trong ứng dụng • Ước tính <b>${usage.tokensEst}</b> token`;

        host.innerHTML = `
          ${pendingOpenLabAfterSetup ? `<div class="ai-sr ai-sr-banner ai-mobile-only">
            <div class="ai-sr-t">Thiết lập AI lần đầu để tạo danh sách phát</div>
            <div class="ai-sr-d">Nhập Gemini API Key rồi bấm Save — hệ thống sẽ tải danh sách mô hình và mở AI Playlist Lab.</div>
          </div>` : ''}
          <div class="ai-sr ai-sr-col ai-sr-select-row">
            <div class="ai-sr-text"><span class="ai-sr-t">Provider</span><span class="ai-sr-d">${isMobileUi ? 'Nhà cung cấp AI dùng để tạo danh sách phát và dịch lời bài hát' : 'Nhà cung cấp AI dùng cho các tính năng thông minh (dịch lời bài hát)'}</span></div>
            <md-outlined-select class="m3-select" data-ai-select="provider" value="Google Gemini">
              <md-select-option value="Google Gemini" selected><div slot="headline">Google Gemini</div></md-select-option>
            </md-outlined-select>
            <button type="button" class="ai-sheet-trigger" data-ai-open-sheet="provider"><span>Google Gemini</span><span class="material-symbols-rounded" style="font-size:20px;">expand_more</span></button>
          </div>
          <div class="ai-sr ai-sr-row ai-mobile-only">
            <div class="ai-sr-text"><span class="ai-sr-t">Safe Token Mode</span><span class="ai-sr-d">${cfg.safeToken ? 'Bật — nhanh &amp; tiết kiệm, chỉ gửi metadata rút gọn của bài hát cho AI.' : 'Tắt — gửi đầy đủ metadata và bộ lọc.'}</span></div>
            <md-switch icons data-ai-field="safeToken"${cfg.safeToken ? ' selected' : ''}>
              <span class="material-symbols-rounded" slot="on-icon">check</span>
              <span class="material-symbols-rounded" slot="off-icon">close</span>
            </md-switch>
          </div>
          <div class="ai-sr ai-sr-col ai-sr-key-row">
            <div class="ai-sr-text"><span class="ai-sr-t">Google Gemini API Key</span><span class="ai-sr-d">Lấy tại Google AI Studio (aistudio.google.com)</span></div>
            <div class="ai-key-ctrl">
              <input type="password" class="ai-input" data-ai-field="apiKey" placeholder="Dán Gemini API key..." value="${esc(cfg.apiKey || '')}">
              <md-filled-tonal-button class="ai-pc-only" type="button" data-ai-action="save-key">Lưu &amp; tải mô hình</md-filled-tonal-button>
              <button type="button" class="ai-save-btn ai-mobile-only" data-ai-action="save-key">Lưu &amp; tải mô hình</button>
            </div>
          </div>
          <div class="ai-sr ai-sr-col ai-sr-select-row">
            <div class="ai-sr-text"><span class="ai-sr-t">AI Model</span><span class="ai-sr-d">${esc(modelDesc)}</span></div>
            <md-outlined-select class="m3-select" data-ai-select="model"${(!hasKey || fetchingModels || !fetchedModels.length) ? ' disabled' : ''}>
              ${modelOptionsHtml}
            </md-outlined-select>
            <button type="button" class="ai-sheet-trigger" data-ai-open-sheet="model"${(!hasKey || fetchingModels) ? ' disabled' : ''}><span>${esc(modelLabel)}</span><span class="material-symbols-rounded" style="font-size:20px;">${fetchingModels ? 'sync' : 'expand_more'}</span></button>
          </div>
          <div class="ai-sr ai-sr-col ai-mobile-only">
            <div class="ai-sr-text"><span class="ai-sr-t">System Prompt</span><span class="ai-sr-d">Tùy chỉnh cách AI hành xử và trả về JSON.</span></div>
            <div class="ai-chip-wrap">
              <button type="button" class="ai-pill-btn${cfg.preset === 'curator' ? ' active' : ''}" data-ai-preset="curator">Professional Curator</button>
              <button type="button" class="ai-pill-btn${cfg.preset === 'creative' ? ' active' : ''}" data-ai-preset="creative">Creative</button>
            </div>
            <textarea class="ai-textarea" data-ai-field="systemPrompt">${esc(cfg.systemPrompt)}</textarea>
            <button type="button" class="ai-save-btn" data-ai-action="save-prompt">Lưu</button>
          </div>
          <div class="ai-sr ai-sr-col ai-sr-select-row">
            <div class="ai-sr-text"><span class="ai-sr-t">Ngôn ngữ dịch lời bài hát</span><span class="ai-sr-d">Bản dịch được lưu trực tiếp trong ứng dụng (tự xóa khi đặt lại cài đặt gốc hoặc tạo lại cơ sở dữ liệu).</span></div>
            <md-outlined-select class="m3-select" data-ai-select="translateLang">
              ${langOptionsHtml}
            </md-outlined-select>
            <button type="button" class="ai-sheet-trigger" data-ai-open-sheet="translateLang"><span>${esc(cfg.translateLang)}</span><span class="material-symbols-rounded" style="font-size:20px;">expand_more</span></button>
          </div>
          <div class="ai-sr ai-sr-row">
            <div class="ai-sr-text"><span class="ai-sr-t">Hiển thị lời song ngữ</span><span class="ai-sr-d">${cfg.bilingualLyrics ? 'Bật — hiện lời gốc kèm bản dịch ngay bên dưới.' : 'Tắt — chỉ hiển thị lời đã dịch.'}</span></div>
            <md-switch icons data-ai-field="bilingualLyrics"${cfg.bilingualLyrics ? ' selected' : ''}>
              <span class="material-symbols-rounded" slot="on-icon">check</span>
              <span class="material-symbols-rounded" slot="off-icon">close</span>
            </md-switch>
          </div>
          <div class="ai-sr ai-sr-col ai-sr-usage-row">
            <div class="ai-sr-text"><span class="ai-sr-t">Mức sử dụng AI</span><span class="ai-sr-d">${usageDescHtml}</span></div>
            ${savedTransCount > 0 ? '<md-text-button class="ai-pc-only" type="button" data-ai-action="clear-trans">Xóa bản dịch đã lưu</md-text-button><button type="button" class="ai-pill-btn ai-mobile-only" data-ai-action="clear-trans"><span class="material-symbols-rounded" style="font-size:17px;">delete_sweep</span><span>Xóa bản dịch đã lưu</span></button>' : ''}
          </div>
        `;

        // Đồng bộ sự kiện cho <md-outlined-select> trên PC
        const pcModelSel = host.querySelector('[data-ai-select="model"]');
        if (pcModelSel) {
            if (cfg.model && fetchedModels.includes(cfg.model)) pcModelSel.value = cfg.model;
            pcModelSel.addEventListener('change', () => {
                const v = pcModelSel.value;
                if (v) {
                    cfg.model = v;
                    saveCfg(cfg);
                    syncAllSettingsHosts();
                }
            });
        }
        const pcLangSel = host.querySelector('[data-ai-select="translateLang"]');
        if (pcLangSel) {
            pcLangSel.value = cfg.translateLang;
            pcLangSel.addEventListener('change', async () => {
                const val = pcLangSel.value;
                let chosen = val;
                if (val === 'Tùy chỉnh...') {
                    const custom = await askText('Ngôn ngữ dịch tùy chỉnh', 'Ví dụ: Tiếng Việt, English, Thai...');
                    if (!custom || !custom.trim()) { syncAllSettingsHosts(); return; }
                    chosen = custom.trim();
                }
                cfg.translateLang = chosen;
                saveCfg(cfg);
                syncAllSettingsHosts();
                syncAiTranslateBtn();
                if (typeof renderLyrics === 'function') renderLyrics();
                if (typeof syncLyrics === 'function') syncLyrics();
            });
        }

        host.querySelector('[data-ai-open-sheet="provider"]')?.addEventListener('click', () => {
            openChoiceSheet('Provider', PROVIDERS, 'Google Gemini', () => {
                cfg.provider = 'Google Gemini';
                saveCfg(cfg);
                syncAllSettingsHosts();
            });
        });
        host.querySelector('[data-ai-open-sheet="model"]')?.addEventListener('click', async () => {
            if (!cfg.apiKey) return;
            const list = fetchedModels.length ? fetchedModels : await fetchGeminiModels(cfg.apiKey, false);
            if (!list.length) return;
            openChoiceSheet('AI Model', list, cfg.model, (val) => {
                cfg.model = val;
                saveCfg(cfg);
                syncAllSettingsHosts();
            });
        });
        host.querySelector('[data-ai-open-sheet="translateLang"]')?.addEventListener('click', () => {
            openTranslateLangPicker(false);
        });
        host.querySelector('[data-ai-field="bilingualLyrics"]')?.addEventListener('change', (e) => {
            cfg.bilingualLyrics = !!e.target.selected;
            saveCfg(cfg);
            syncAllSettingsHosts();
            if (typeof renderLyrics === 'function') renderLyrics();
            if (typeof syncLyrics === 'function') syncLyrics();
        });
        host.querySelectorAll('[data-ai-action="clear-trans"]').forEach(btn => {
            btn.addEventListener('click', () => {
                clearAllLyricTranslations(false);
                syncAllSettingsHosts();
            });
        });
        host.querySelector('[data-ai-field="safeToken"]')?.addEventListener('change', (e) => {
            cfg.safeToken = !!e.target.selected;
            saveCfg(cfg);
            syncAllSettingsHosts();
        });
        host.querySelectorAll('[data-ai-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.aiPreset;
                cfg.preset = p;
                cfg.systemPrompt = DEFAULT_PROMPTS[p] || DEFAULT_PROMPTS.curator;
                saveCfg(cfg);
                syncAllSettingsHosts();
            });
        });
        const maybeContinueToLab = () => {
            if (pendingOpenLabAfterSetup && hasAiConfigured()) {
                pendingOpenLabAfterSetup = false;
                syncAllSettingsHosts();
                const closeBtn = document.getElementById('settings-close-btn');
                if (closeBtn) closeBtn.click();
                setTimeout(() => openAiLab(true), 220);
            }
        };
        host.querySelectorAll('[data-ai-action="save-key"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const inp = host.querySelector('[data-ai-field="apiKey"]');
                cfg.apiKey = (inp?.value || '').trim();
                if (!cfg.apiKey) {
                    cfg.model = '';
                    fetchedModels = [];
                    saveCfg(cfg);
                    syncAllSettingsHosts();
                    return;
                }
                saveCfg(cfg);
                if (typeof showToast === 'function') showToast('Đang lưu API Key & tải danh sách mô hình Gemini...', 'sync', 2000);
                await fetchGeminiModels(cfg.apiKey, false);
                maybeContinueToLab();
            });
        });
        host.querySelector('[data-ai-action="save-prompt"]')?.addEventListener('click', () => {
            const ta = host.querySelector('[data-ai-field="systemPrompt"]');
            const sp = host.querySelector('[data-ai-field="safeToken"]');
            if (ta) cfg.systemPrompt = ta.value;
            if (sp) cfg.safeToken = !!sp.selected;
            saveCfg(cfg);
            if (typeof showToast === 'function') showToast('Đã lưu cấu hình AI!', 'check_circle', 2200);
            syncAllSettingsHosts();
            maybeContinueToLab();
        });
    }

    function syncAllSettingsHosts() {
        cfg = loadCfg();
        renderSettingsMarkup('ai-settings-host');
    }

    function openAiSettingsInApp(fromLab) {
        injectStyles();
        ensureModals();
        pendingOpenLabAfterSetup = !!(fromLab && !hasAiConfigured());
        syncAllSettingsHosts();
        const settingsBtn = document.getElementById('settings-btn');
        const settingsOverlay = document.getElementById('settings-overlay');
        if (settingsBtn && settingsOverlay && !settingsOverlay.classList.contains('open')) {
            settingsBtn.click();
        }
        setTimeout(() => {
            const dlg = document.getElementById('settings-dialog');
            const tabBtn = document.querySelector('.st-tab[data-tab="ai"]');
            const mCard = document.querySelector('#st-m-list .st-m-card[data-tab="ai"]');
            if (document.documentElement.classList.contains('m-ui') && dlg && !dlg.classList.contains('st-m-detail') && mCard) {
                mCard.click();
            } else if (tabBtn) {
                tabBtn.click();
            }
            const pane = document.querySelector('.st-pane[data-pane="ai"]');
            if (pane) pane.scrollTop = 0;
        }, 60);
    }

    function ensureModals() {
        const oldModal = document.getElementById('ai-settings-modal');
        if (oldModal) oldModal.remove();

        if (!document.getElementById('ai-playlist-lab-modal')) {
            const lab = document.createElement('div');
            lab.id = 'ai-playlist-lab-modal';
            const moodChips = MOODS.map(x => `<button type="button" class="ai-chip" data-mood="${x}">${x}</button>`).join('') +
                `<button type="button" class="ai-chip" id="ai-add-custom-mood">+ Custom...</button>`;
            const actChips = ACTIVITIES.map(x => `<button type="button" class="ai-chip" data-act="${x}">${x}</button>`).join('') +
                `<button type="button" class="ai-chip" id="ai-add-custom-act">+ Custom...</button>`;
            const eraChips = ERAS.map(x => `<button type="button" class="ai-chip${x === 'Any era' ? ' active' : ''}" data-era="${x}">${x}</button>`).join('');
            const seg5 = (cls) => [1, 2, 3, 4, 5].map(n => `<button type="button" class="${cls}${n === 3 ? ' active' : ''}" data-val="${n}">${n === 3 ? '<span class="material-symbols-rounded" style="font-size:18px;">check</span>3' : n}</button>`).join('');

            lab.innerHTML = `
              <div class="ai-modal-top">
                <button type="button" class="ai-icon-btn" id="ai-lab-close"><span class="material-symbols-rounded">close</span></button>
                <h2>AI Playlist Lab</h2>
                <button type="button" class="ai-icon-btn" id="ai-lab-open-cfg" title="AI Settings"><span class="material-symbols-rounded">tune</span></button>
              </div>
              <div class="ai-modal-body">
                <div class="ai-banner-info">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <span class="material-symbols-rounded" style="font-size:28px;">auto_awesome</span>
                    <div>
                      <div style="font-size:calc(17px * var(--font-scale-factor, 1));font-weight:800;">Curate with precision</div>
                      <div style="font-size:calc(12.5px * var(--font-scale-factor, 1));opacity:.85;">Define mood, activity, constraints and depth.</div>
                    </div>
                  </div>
                  <div style="border-top:1px solid color-mix(in srgb,currentColor 18%,transparent);padding-top:8px;font-size:calc(12.5px * var(--font-scale-factor, 1));opacity:.9;">
                    The AI will only use songs from your local library (sending track name, file type, artist, album, duration &amp; format metadata) and return JSON.
                  </div>
                </div>

                <div class="ai-st-sec">Intent</div>
                <div class="ai-st-group">
                  <div class="ai-st-card">
                    <input type="text" class="ai-input" id="ai-pl-name" placeholder="Playlist name (optional)">
                    <textarea class="ai-textarea" id="ai-pl-feel" placeholder="What should this playlist feel like?"></textarea>
                  </div>
                </div>

                <div class="ai-st-sec">Direction</div>
                <div class="ai-st-group">
                  <div class="ai-st-card">
                    <div class="ai-card-title">Mood</div>
                    <div class="ai-chip-wrap" id="ai-mood-wrap">${moodChips}</div>
                  </div>
                  <div class="ai-st-card">
                    <div class="ai-card-title">Activity</div>
                    <div class="ai-chip-wrap" id="ai-act-wrap">${actChips}</div>
                  </div>
                  <div class="ai-st-card">
                    <div class="ai-card-title">Era</div>
                    <div class="ai-chip-wrap" id="ai-era-wrap">${eraChips}</div>
                  </div>
                </div>

                <div class="ai-st-sec">Curation engine</div>
                <div class="ai-st-group">
                  <div class="ai-st-card">
                    <div class="ai-row-flex"><span class="ai-card-title">Energy</span><span id="ai-energy-lbl" style="font-weight:700;color:var(--md-sys-color-primary);">3/5</span></div>
                    <div class="ai-seg-5" id="ai-energy-seg">${seg5('ai-e-btn')}</div>
                  </div>
                  <div class="ai-st-card">
                    <div class="ai-row-flex"><span class="ai-card-title">Discovery</span><span id="ai-disc-lbl" style="font-weight:700;color:var(--md-sys-color-primary);">3/5</span></div>
                    <div class="ai-seg-5" id="ai-disc-seg">${seg5('ai-d-btn')}</div>
                  </div>
                  <div class="ai-st-card">
                    <div class="ai-two-col">
                      <div><div class="ai-card-desc" style="margin-bottom:6px;">Min songs</div><input type="number" class="ai-input" id="ai-min-songs" min="1" max="100" value="12"></div>
                      <div><div class="ai-card-desc" style="margin-bottom:6px;">Max songs</div><input type="number" class="ai-input" id="ai-max-songs" min="1" max="200" value="24"></div>
                    </div>
                  </div>
                </div>

                <div class="ai-st-sec">Filters</div>
                <div class="ai-st-group">
                  <div class="ai-st-card">
                    <input type="text" class="ai-input" id="ai-prio-genres" placeholder="Prioritize genres (optional)">
                    <input type="text" class="ai-input" id="ai-avoid-genres" placeholder="Avoid genres (optional)">
                    <input type="text" class="ai-input" id="ai-pref-lang" placeholder="Preferred language (optional)">
                  </div>
                  <div class="ai-st-card">
                    <div class="ai-row-flex">
                      <span class="ai-card-title">Prioritize favorites</span>
                      <md-switch icons id="ai-prio-favs" selected><span class="material-symbols-rounded" slot="on-icon">check</span><span class="material-symbols-rounded" slot="off-icon">close</span></md-switch>
                    </div>
                  </div>
                  <div class="ai-st-card">
                    <div class="ai-row-flex">
                      <span class="ai-card-title">Avoid explicit lyrics</span>
                      <md-switch icons id="ai-avoid-exp"><span class="material-symbols-rounded" slot="on-icon">check</span><span class="material-symbols-rounded" slot="off-icon">close</span></md-switch>
                    </div>
                  </div>
                </div>
              </div>
              <div class="ai-lab-footer">
                <button type="button" class="ai-reset-btn" id="ai-lab-reset">Reset</button>
                <button type="button" class="ai-gen-btn" id="ai-lab-generate"><span class="material-symbols-rounded">auto_awesome</span><span>Generate</span></button>
              </div>
            `;
            document.body.appendChild(lab);
            bindLabEvents(lab);
        }
    }

    // Hộp thoại nhập văn bản dùng md-dialog (thay cho prompt() mặc định của trình duyệt/WebView)
    function askText(title, label) {
        return new Promise((resolve) => {
            let dlg = document.getElementById('ai-prompt-dialog');
            if (!dlg) {
                if (!document.getElementById('ai-prompt-dialog-style')) {
                    const st = document.createElement('style');
                    st.id = 'ai-prompt-dialog-style';
                    st.textContent = `#ai-prompt-dialog{--md-ref-typeface-plain:var(--app-font);--md-ref-typeface-brand:var(--app-font);--md-dialog-container-color:var(--md-sys-color-surface);--md-dialog-container-shape:24px;--md-dialog-headline-color:var(--md-sys-color-on-surface);--md-dialog-headline-font:var(--app-font);--md-dialog-headline-weight:700;--md-text-button-label-text-font:var(--app-font);--md-text-button-label-text-color:var(--md-sys-color-primary);--md-filled-button-label-text-font:var(--app-font);--md-filled-button-container-color:var(--md-sys-color-primary);--md-filled-button-label-text-color:var(--md-sys-color-on-primary);--md-outlined-text-field-input-text-font:var(--app-font);--md-outlined-text-field-label-text-font:var(--app-font);font-family:var(--app-font);color:var(--md-sys-color-on-surface);}#ai-prompt-dialog::part(scrim){background:#000;}#ai-prompt-dialog md-outlined-text-field{width:100%;}`;
                    document.head.appendChild(st);
                }
                dlg = document.createElement('md-dialog');
                dlg.id = 'ai-prompt-dialog';
                dlg.style.cssText = 'max-width:min(92vw,420px);font-family:var(--app-font);';
                dlg.innerHTML = `<div slot="headline" id="ai-prompt-title"></div>
                    <form slot="content" id="ai-prompt-form" method="dialog" onsubmit="return false;"><md-outlined-text-field id="ai-prompt-input" type="text"></md-outlined-text-field></form>
                    <div slot="actions"><md-text-button id="ai-prompt-cancel">Huỷ</md-text-button><md-filled-button id="ai-prompt-ok">Thêm</md-filled-button></div>`;
                document.body.appendChild(dlg);
            }
            const input = dlg.querySelector('#ai-prompt-input');
            dlg.querySelector('#ai-prompt-title').textContent = title || '';
            input.label = label || '';
            input.value = '';
            let done = false;
            const finish = (val) => {
                if (done) return;
                done = true;
                cleanup();
                dlg.close();
                resolve(val);
            };
            const onOk = () => finish((input.value || '').trim());
            const onCancel = () => finish('');
            const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); onOk(); } };
            const onClosed = () => finish('');
            const okBtn = dlg.querySelector('#ai-prompt-ok'), cancelBtn = dlg.querySelector('#ai-prompt-cancel');
            function cleanup() {
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                input.removeEventListener('keydown', onKey);
                dlg.removeEventListener('closed', onClosed);
            }
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            input.addEventListener('keydown', onKey);
            dlg.addEventListener('closed', onClosed);
            dlg.show();
            setTimeout(() => { try { input.focus(); } catch (e) {} }, 150);
        });
    }

    function updateSegButtons(containerSelector, val) {
        document.querySelectorAll(containerSelector + ' button').forEach(b => {
            const n = Number(b.dataset.val);
            const active = n === val;
            b.classList.toggle('active', active);
            b.innerHTML = active ? ('<span class="material-symbols-rounded" style="font-size:18px;">check</span>' + n) : String(n);
        });
    }

    function bindLabEvents(lab) {
        document.getElementById('ai-lab-close')?.addEventListener('click', () => closeAiLab());
        document.getElementById('ai-lab-open-cfg')?.addEventListener('click', () => openAiSettingsInApp(false));
        document.getElementById('ai-mood-wrap')?.addEventListener('click', (e) => {
            const chip = e.target.closest('[data-mood]');
            if (!chip) return;
            const m = chip.dataset.mood;
            if (labState.moods.has(m)) labState.moods.delete(m); else labState.moods.add(m);
            chip.classList.toggle('active', labState.moods.has(m));
        });
        document.getElementById('ai-act-wrap')?.addEventListener('click', (e) => {
            const chip = e.target.closest('[data-act]');
            if (!chip) return;
            const a = chip.dataset.act;
            if (labState.activities.has(a)) labState.activities.delete(a); else labState.activities.add(a);
            chip.classList.toggle('active', labState.activities.has(a));
        });
        document.getElementById('ai-add-custom-mood')?.addEventListener('click', async () => {
            const v = await askText('Tâm trạng tùy chỉnh', 'Custom mood');
            if (!v || !v.trim()) return;
            const label = v.trim();
            labState.moods.add(label);
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'ai-chip active'; btn.dataset.mood = label; btn.textContent = label;
            document.getElementById('ai-add-custom-mood')?.before(btn);
        });
        document.getElementById('ai-add-custom-act')?.addEventListener('click', async () => {
            const v = await askText('Hoạt động tùy chỉnh', 'Custom activity');
            if (!v || !v.trim()) return;
            const label = v.trim();
            labState.activities.add(label);
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'ai-chip active'; btn.dataset.act = label; btn.textContent = label;
            document.getElementById('ai-add-custom-act')?.before(btn);
        });
        document.getElementById('ai-era-wrap')?.addEventListener('click', (e) => {
            const chip = e.target.closest('[data-era]');
            if (!chip) return;
            labState.era = chip.dataset.era;
            document.querySelectorAll('#ai-era-wrap [data-era]').forEach(c => c.classList.toggle('active', c.dataset.era === labState.era));
        });
        document.querySelectorAll('.ai-e-btn').forEach(b => b.addEventListener('click', () => {
            labState.energy = Number(b.dataset.val) || 3;
            document.getElementById('ai-energy-lbl').textContent = labState.energy + '/5';
            updateSegButtons('#ai-energy-seg', labState.energy);
        }));
        document.querySelectorAll('.ai-d-btn').forEach(b => b.addEventListener('click', () => {
            labState.discovery = Number(b.dataset.val) || 3;
            document.getElementById('ai-disc-lbl').textContent = labState.discovery + '/5';
            updateSegButtons('#ai-disc-seg', labState.discovery);
        }));
        document.getElementById('ai-lab-reset')?.addEventListener('click', () => {
            labState = {
                name: '', prompt: '', moods: new Set(), activities: new Set(),
                era: 'Any era', energy: 3, discovery: 3, minSongs: 12, maxSongs: 24,
                prioGenres: '', avoidGenres: '', prefLang: '', prioFavs: true, avoidExplicit: false
            };
            if ($('#ai-pl-name')) $('#ai-pl-name').value = '';
            if ($('#ai-pl-feel')) $('#ai-pl-feel').value = '';
            if ($('#ai-min-songs')) $('#ai-min-songs').value = '12';
            if ($('#ai-max-songs')) $('#ai-max-songs').value = '24';
            if ($('#ai-prio-genres')) $('#ai-prio-genres').value = '';
            if ($('#ai-avoid-genres')) $('#ai-avoid-genres').value = '';
            if ($('#ai-pref-lang')) $('#ai-pref-lang').value = '';
            if ($('#ai-prio-favs')) $('#ai-prio-favs').selected = true;
            if ($('#ai-avoid-exp')) $('#ai-avoid-exp').selected = false;
            document.querySelectorAll('#ai-mood-wrap .ai-chip, #ai-act-wrap .ai-chip').forEach(c => c.classList.remove('active'));
            labState.era = 'Any era';
            document.querySelectorAll('#ai-era-wrap [data-era]').forEach(c => c.classList.toggle('active', c.dataset.era === 'Any era'));
            document.getElementById('ai-energy-lbl').textContent = '3/5';
            document.getElementById('ai-disc-lbl').textContent = '3/5';
            updateSegButtons('#ai-energy-seg', 3);
            updateSegButtons('#ai-disc-seg', 3);
        });
        document.getElementById('ai-lab-generate')?.addEventListener('click', handleGeneratePlaylist);
        void lab;
    }

    const $ = (id) => document.getElementById(id);

    function hasAiConfigured() {
        cfg = loadCfg();
        return !!(cfg.apiKey && cfg.apiKey.trim());
    }

    function openAiLab(forceOpenLab) {
        injectStyles();
        ensureModals();
        syncAllSettingsHosts();
        if (!forceOpenLab && !hasAiConfigured()) {
            openAiSettingsInApp(true);
            return;
        }
        const lab = document.getElementById('ai-playlist-lab-modal');
        if (!lab) return;
        labOpen = true;
        lab.classList.add('open');
        if (document.documentElement.classList.contains('reduce-motion')) {
            lab.classList.add('show');
        } else {
            requestAnimationFrame(() => requestAnimationFrame(() => lab.classList.add('show')));
        }
    }
    function closeAiLab() {
        const lab = document.getElementById('ai-playlist-lab-modal');
        labOpen = false;
        pendingOpenLabAfterSetup = false;
        if (!lab) return;
        lab.classList.remove('show');
        if (document.documentElement.classList.contains('reduce-motion')) {
            lab.classList.remove('open');
        } else {
            setTimeout(() => { if (!labOpen) lab.classList.remove('open'); }, 280);
        }
    }

    function handleAndroidBackForAi() {
        if (isLocalSheetOpen()) {
            closeLocalSheet();
            return true;
        }
        const stSheet = document.getElementById('st-sheet');
        if (stSheet && (stSheet.classList.contains('show') || stSheet.classList.contains('open'))) {
            if (typeof window.__closeSheet === 'function') window.__closeSheet();
            return true;
        }
        const lab = document.getElementById('ai-playlist-lab-modal');
        if (lab && (labOpen || lab.classList.contains('open'))) {
            closeAiLab();
            return true;
        }
        const settingsOverlay = document.getElementById('settings-overlay');
        if (pendingOpenLabAfterSetup && settingsOverlay && settingsOverlay.classList.contains('open')) {
            pendingOpenLabAfterSetup = false;
            document.getElementById('settings-close-btn')?.click();
            return true;
        }
        return false;
    }

    function collectLibraryMetadata() {
        const pool = [];
        const seen = new Set();
        const addItem = (t, idx) => {
            if (!t) return;
            const loc = String(t.nativeLocation || t.rawName || t.name || '');
            const key = (loc || (t.name + '|' + idx)).toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const ext = String(t.ext || (String(t.name || '').split('.').pop()) || '').toLowerCase();
            const fileType = (t.file && t.file.type) ? String(t.file.type) : (ext ? ('audio/' + ext) : 'audio/*');
            pool.push({
                index: pool.length,
                key,
                title: String(t.name || ''),
                artist: String(t.artist || 'UNKNOWN ARTIST'),
                album: String(t.album || ''),
                year: String(t.year || ''),
                genre: String(t.genre || ''),
                fileType,
                extension: ext,
                durationSec: Math.round(Number(t.duration) || 0),
                liked: !!(window.__isLiked && window.__isLiked(t))
            });
        };
        if (Array.isArray(window.__mobileLibrary)) window.__mobileLibrary.forEach(addItem);
        if (typeof playlist !== 'undefined' && Array.isArray(playlist)) playlist.forEach(addItem);
        return cfg.safeToken ? pool.slice(0, 120) : pool.slice(0, 350);
    }

    function parseJsonResponse(rawText) {
        const cleaned = String(rawText || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        const jsonStr = (start >= 0 && end > start) ? cleaned.slice(start, end + 1) : cleaned;
        return JSON.parse(jsonStr);
    }

    async function callAiForPlaylist(tracks, reqSpec) {
        cfg = loadCfg();
        if (!cfg.apiKey) throw new Error('Chưa nhập Google Gemini API Key.');
        let activeModel = cfg.model;
        if (!activeModel) {
            const list = await fetchGeminiModels(cfg.apiKey, true);
            activeModel = list[0] || '';
        }
        if (!activeModel) throw new Error('Không tìm thấy mô hình Gemini khả dụng cho API Key này.');

        const schemaInstruction = `Return ONLY a single valid JSON object (no markdown fences, no commentary) with exact schema: {"playlistName":"string","description":"string","trackKeys":["string"]}. Pick only from provided items' "key" values, between ${reqSpec.minSongs} and ${reqSpec.maxSongs} songs.`;
        const userPayload = JSON.stringify({
            request: reqSpec,
            tracks: tracks.map(t => cfg.safeToken
                ? { key: t.key, title: t.title, artist: t.artist, type: t.fileType, ext: t.extension }
                : { key: t.key, title: t.title, artist: t.artist, album: t.album, year: t.year, genre: t.genre, type: t.fileType, ext: t.extension, durationSec: t.durationSec, liked: t.liked })
        });
        const sysMsg = `${cfg.systemPrompt}\n\n${schemaInstruction}`;

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: sysMsg }] },
                contents: [{ role: 'user', parts: [{ text: userPayload }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: Math.min(1.4, 0.4 + reqSpec.discovery * 0.18) }
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const estTokens = Number(data?.usageMetadata?.totalTokenCount) || Math.round((sysMsg.length + userPayload.length + txt.length) / 4);
        return { parsed: parseJsonResponse(txt), tokensEst: estTokens };
    }

    async function handleGeneratePlaylist() {
        if (!hasAiConfigured()) {
            openAiSettingsInApp(true);
            return;
        }
        const tracks = collectLibraryMetadata();
        if (!tracks.length) {
            if (typeof showToast === 'function') showToast('Thư viện nhạc đang trống, hãy thêm nhạc trước!', 'music_off', 3000);
            return;
        }
        const btn = $('ai-lab-generate');
        if (btn) btn.disabled = true;
        try {
            const minS = Math.max(1, Number($('ai-min-songs')?.value) || 12);
            const maxS = Math.max(minS, Number($('ai-max-songs')?.value) || 24);
            const spec = {
                playlistName: ($('ai-pl-name')?.value || '').trim(),
                feel: ($('ai-pl-feel')?.value || '').trim(),
                moods: Array.from(labState.moods),
                activities: Array.from(labState.activities),
                era: labState.era,
                energy: labState.energy,
                discovery: labState.discovery,
                minSongs: minS,
                maxSongs: maxS,
                prioritizeGenres: ($('ai-prio-genres')?.value || '').trim(),
                avoidGenres: ($('ai-avoid-genres')?.value || '').trim(),
                preferredLanguage: ($('ai-pref-lang')?.value || '').trim(),
                prioritizeFavorites: !!$('ai-prio-favs')?.selected,
                avoidExplicitLyrics: !!$('ai-avoid-exp')?.selected
            };
            const { parsed, tokensEst } = await callAiForPlaylist(tracks, spec);
            const validKeys = new Set(tracks.map(t => t.key));
            const rawKeys = Array.isArray(parsed?.trackKeys) ? parsed.trackKeys : [];
            const chosenKeys = [];
            const seenChosen = new Set();
            for (const rk of rawKeys) {
                const k = String(rk || '').toLowerCase().trim();
                if (k && validKeys.has(k) && !seenChosen.has(k)) {
                    seenChosen.add(k);
                    chosenKeys.push(k);
                }
            }
            if (!chosenKeys.length) throw new Error('AI không trả về bài hát hợp lệ nào trong thư viện.');

            const plName = spec.playlistName || String(parsed?.playlistName || '').trim() || ('AI Playlist ' + new Date().toLocaleDateString('vi-VN'));
            let pls = [];
            try { pls = JSON.parse(localStorage.getItem('mp_user_playlists_v1') || '[]') || []; } catch (e) {}
            const newPl = {
                id: 'pl_ai_' + Date.now(),
                name: plName,
                mode: 'manual',
                coverType: 'icon',
                iconBg: '#7c3aed',
                iconName: 'auto_awesome',
                iconShape: 'clover',
                starSides: 6,
                starCurve: 0.25,
                starRot: 0,
                starScale: 1,
                trackKeys: chosenKeys
            };
            pls.unshift(newPl);
            localStorage.setItem('mp_user_playlists_v1', JSON.stringify(pls));
            addUsage(tokensEst, plName);
            closeAiLab();
            if (typeof window.__refreshMobileLibraryViews === 'function') window.__refreshMobileLibraryViews();
            if (typeof showToast === 'function') {
                showToast('Đã tạo "' + plName + '" (' + chosenKeys.length + ' bài)!', 'auto_awesome', 3500);
            }
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast('Lỗi tạo danh sách phát AI: ' + (err && err.message ? err.message : String(err)), 'error', 4200);
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ===== DỊCH LỜI BÀI HÁT BẰNG AI (LƯU TRONG APP, XÓA KHI RESET / REBUILD DB) =====
    let lyricTranslating = false;
    function loadTransMap() {
        try {
            const o = JSON.parse(localStorage.getItem(LYRIC_TRANS_KEY) || '{}');
            return (o && typeof o === 'object') ? o : {};
        } catch (e) { return {}; }
    }
    function saveTransMap(map) {
        try { localStorage.setItem(LYRIC_TRANS_KEY, JSON.stringify(map || {})); } catch (e) {}
    }
    function countSavedTranslations() {
        return Object.keys(loadTransMap()).length;
    }
    function isShowTranslatedOn() {
        try { return localStorage.getItem(LYRIC_SHOW_KEY) !== 'false'; } catch (e) { return true; }
    }
    function setShowTranslatedOn(on) {
        try { localStorage.setItem(LYRIC_SHOW_KEY, on ? 'true' : 'false'); } catch (e) {}
    }
    function lyricTrackStorageKey(track) {
        if (!track) return '';
        const base = String(track.nativeLocation || track.rawName || track.name || '').toLowerCase().trim();
        const artist = String(track.artist || '').toLowerCase().trim();
        const lrcHash = hashKey(String(track.lyricsRaw || (Array.isArray(track.lyrics) ? track.lyrics.map(x => x.text).join('\n') : '')));
        return base + '|' + artist + '|' + lrcHash;
    }
    function getSavedTranslation(track, lang) {
        if (!track || !Array.isArray(track.lyrics) || !track.lyrics.length) return null;
        const map = loadTransMap();
        const entry = map[lyricTrackStorageKey(track)];
        if (!entry || !Array.isArray(entry.lines)) return null;
        if (lang && String(entry.lang || '').toLowerCase() !== String(lang).toLowerCase()) return null;
        return entry;
    }
    function getActiveLyricTranslation(track) {
        if (!track || !isShowTranslatedOn()) return null;
        cfg = loadCfg();
        const entry = getSavedTranslation(track, cfg.translateLang) || getSavedTranslation(track, '');
        if (!entry) return null;
        return { active: true, bilingual: !!cfg.bilingualLyrics, lang: entry.lang || cfg.translateLang, lines: entry.lines };
    }
    function clearAllLyricTranslations(silent) {
        try { localStorage.removeItem(LYRIC_TRANS_KEY); } catch (e) {}
        if (typeof renderLyrics === 'function') renderLyrics();
        if (typeof syncLyrics === 'function') syncLyrics();
        syncAiTranslateBtn();
        if (!silent && typeof showToast === 'function') {
            showToast('Đã xóa toàn bộ bản dịch lời bài hát đã lưu!', 'delete_sweep', 2600);
        }
    }
    function syncAiTranslateBtn() {
        const pcBtn = document.getElementById('lyric-translate-btn');
        const pcLbl = document.getElementById('lyric-translate-label');
        const mBtn = document.getElementById('m-lyric-translate');
        const track = (typeof playlist !== 'undefined' && typeof currentIndex !== 'undefined' && currentIndex >= 0) ? playlist[currentIndex] : null;
        const hasLyrics = !!(track && Array.isArray(track.lyrics) && track.lyrics.length > 0);
        cfg = loadCfg();
        const saved = hasLyrics ? getSavedTranslation(track, cfg.translateLang) : null;
        const active = !!(saved && isShowTranslatedOn());
        [pcBtn, mBtn].forEach(b => {
            if (!b) return;
            b.classList.toggle('active', active);
            b.classList.toggle('busy', lyricTranslating);
            b.disabled = lyricTranslating;
            const ico = b.querySelector('.material-symbols-rounded');
            if (ico) ico.textContent = lyricTranslating ? 'sync' : 'translate';
        });
        if (pcBtn) {
            pcBtn.style.display = hasLyrics ? '' : 'none';
            pcBtn.title = saved
                ? (active ? ('Đang hiển thị bản dịch (' + cfg.translateLang + ') — bấm để ẩn, chuột phải đổi ngôn ngữ') : ('Đã có bản dịch (' + cfg.translateLang + ') — bấm để hiện'))
                : ('Dịch lời sang ' + cfg.translateLang + ' bằng AI (chuột phải để đổi ngôn ngữ)');
        }
        if (pcLbl) {
            pcLbl.textContent = lyricTranslating ? 'Đang dịch...' : (active ? cfg.translateLang : 'Dịch');
        }
    }
    function openTranslateLangPicker(translateAfter, anchorEl) {
        cfg = loadCfg();
        const list = TRANSLATE_LANGS.slice();
        if (cfg.translateLang && !list.includes(cfg.translateLang)) list.unshift(cfg.translateLang);
        openChoiceSheet('Ngôn ngữ dịch lời bài hát', list, cfg.translateLang, async (val) => {
            let chosen = val;
            if (val === 'Tùy chỉnh...') {
                const custom = await askText('Ngôn ngữ dịch tùy chỉnh', 'Ví dụ: Tiếng Việt, English, Thai...');
                if (!custom || !custom.trim()) return;
                chosen = custom.trim();
            }
            cfg.translateLang = chosen;
            saveCfg(cfg);
            syncAllSettingsHosts();
            syncAiTranslateBtn();
            if (translateAfter) {
                await translateCurrentTrackLyrics(true);
            } else {
                if (typeof renderLyrics === 'function') renderLyrics();
                if (typeof syncLyrics === 'function') syncLyrics();
            }
        }, anchorEl);
    }
    async function callAiForLyricTranslation(track, targetLang) {
        cfg = loadCfg();
        if (!cfg.apiKey) throw new Error('Chưa nhập Google Gemini API Key.');
        let activeModel = cfg.model;
        if (!activeModel) {
            const list = await fetchGeminiModels(cfg.apiKey, true);
            activeModel = list[0] || '';
        }
        if (!activeModel) throw new Error('Không tìm thấy mô hình Gemini khả dụng cho API Key này.');

        const items = [];
        track.lyrics.forEach((l, i) => {
            const txt = String(l && l.text || '').trim();
            if (txt) items.push({ i, t: txt });
        });
        if (!items.length) throw new Error('Lời bài hát không có nội dung để dịch.');

        const sysMsg = `You are an expert song lyric translator. Translate every lyric line naturally into "${targetLang}" preserving poetic tone, emotion, and line-by-line alignment. Return ONLY a valid JSON object with exact schema: {"lines":[{"i":0,"t":"translated line"}]}. Keep the exact "i" indices from the input. Do not merge or skip lines.`;
        const userPayload = JSON.stringify({
            title: String(track.name || ''),
            artist: String(track.artist || ''),
            targetLanguage: targetLang,
            lines: items
        });
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: sysMsg }] },
                contents: [{ role: 'user', parts: [{ text: userPayload }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = parseJsonResponse(txt);
        const out = new Array(track.lyrics.length).fill('');
        if (Array.isArray(parsed && parsed.lines)) {
            parsed.lines.forEach((row, pos) => {
                if (typeof row === 'string') {
                    if (items[pos]) out[items[pos].i] = row.trim();
                } else if (row && typeof row.i === 'number' && row.i >= 0 && row.i < out.length) {
                    out[row.i] = String(row.t || '').trim();
                }
            });
        }
        const estTokens = Number(data?.usageMetadata?.totalTokenCount) || Math.round((sysMsg.length + userPayload.length + txt.length) / 4);
        return { lines: out, tokensEst: estTokens };
    }
    async function translateCurrentTrackLyrics(forceRetranslate) {
        if (lyricTranslating) return;
        const track = (typeof playlist !== 'undefined' && typeof currentIndex !== 'undefined' && currentIndex >= 0) ? playlist[currentIndex] : null;
        if (!track || !Array.isArray(track.lyrics) || !track.lyrics.length) {
            if (typeof showToast === 'function') showToast('Bài hát này chưa có lời để dịch!', 'lyrics', 2600);
            return;
        }
        cfg = loadCfg();
        const existing = getSavedTranslation(track, cfg.translateLang);
        if (existing && !forceRetranslate) {
            const nextShow = !isShowTranslatedOn();
            setShowTranslatedOn(nextShow);
            if (typeof renderLyrics === 'function') renderLyrics();
            if (typeof syncLyrics === 'function') syncLyrics();
            syncAiTranslateBtn();
            if (typeof showToast === 'function') {
                showToast(nextShow ? ('Đang hiển thị bản dịch (' + cfg.translateLang + ')') : 'Đã ẩn bản dịch lời bài hát', 'translate', 2000);
            }
            return;
        }
        if (!hasAiConfigured()) {
            openAiSettingsInApp(false);
            if (typeof showToast === 'function') showToast('Hãy nhập Google Gemini API Key để dịch lời bài hát!', 'key', 3000);
            return;
        }
        lyricTranslating = true;
        syncAiTranslateBtn();
        try {
            if (typeof showToast === 'function') showToast('Đang dịch lời sang ' + cfg.translateLang + '...', 'translate', 2400);
            const { lines, tokensEst } = await callAiForLyricTranslation(track, cfg.translateLang);
            if (!lines.some(Boolean)) throw new Error('AI không trả về dòng dịch hợp lệ.');
            const map = loadTransMap();
            const storageKey = lyricTrackStorageKey(track);
            map[storageKey] = { lang: cfg.translateLang, lines, ts: Date.now() };
            // Giới hạn nhẹ ~80 bài để không phình localStorage quá lớn
            const keys = Object.keys(map);
            if (keys.length > 80) {
                keys.sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0));
                keys.slice(0, keys.length - 80).forEach(k => delete map[k]);
            }
            saveTransMap(map);
            setShowTranslatedOn(true);
            addUsage(tokensEst, 'Dịch: ' + (track.name || 'Lyric'));
            syncAllSettingsHosts();
            if (typeof renderLyrics === 'function') renderLyrics();
            if (typeof syncLyrics === 'function') syncLyrics();
            if (typeof showToast === 'function') showToast('Đã dịch & lưu lời (' + cfg.translateLang + ')!', 'check_circle', 3000);
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast('Lỗi dịch lời bài hát: ' + (err && err.message ? err.message : String(err)), 'error', 4000);
            }
        } finally {
            lyricTranslating = false;
            syncAiTranslateBtn();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        injectStyles();
        ensureModals();
        syncAllSettingsHosts();
        if (cfg.apiKey && !fetchedModels.length) {
            fetchGeminiModels(cfg.apiKey, true);
        }
        document.getElementById('m-pl-ai-btn')?.addEventListener('click', () => openAiLab(false));
        const pcTrBtn = document.getElementById('lyric-translate-btn');
        if (pcTrBtn) {
            pcTrBtn.addEventListener('click', () => translateCurrentTrackLyrics(false));
            pcTrBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); openTranslateLangPicker(true, pcTrBtn); });
        }
        const mTrBtn = document.getElementById('m-lyric-translate');
        if (mTrBtn) {
            let lpTimer = 0, lpFired = false;
            mTrBtn.addEventListener('pointerdown', () => {
                lpFired = false;
                clearTimeout(lpTimer);
                lpTimer = setTimeout(() => { lpFired = true; openTranslateLangPicker(true); }, 550);
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => mTrBtn.addEventListener(ev, () => clearTimeout(lpTimer)));
            mTrBtn.addEventListener('click', () => { if (lpFired) { lpFired = false; return; } translateCurrentTrackLyrics(false); });
        }
        syncAiTranslateBtn();
        document.querySelector('.st-tab[data-tab="ai"]')?.addEventListener('click', () => {
            syncAllSettingsHosts();
            if (cfg.apiKey && !fetchedModels.length && !fetchingModels) {
                fetchGeminiModels(cfg.apiKey, true);
            }
        });
        const prevAndroidBack = window.__androidHandleBack;
        window.__androidHandleBack = function () {
            if (handleAndroidBackForAi()) return true;
            return typeof prevAndroidBack === 'function' ? prevAndroidBack.apply(this, arguments) : false;
        };
    });
    window.__openAiPlaylistLab = () => openAiLab(false);
    window.__openAiSettings = () => openAiSettingsInApp(false);
    window.__handleAndroidBackAi = handleAndroidBackForAi;
    window.__getAiLyricTranslation = getActiveLyricTranslation;
    window.__clearAiLyricTranslations = clearAllLyricTranslations;
    window.__syncAiTranslateBtn = syncAiTranslateBtn;
    window.__translateCurrentLyrics = () => translateCurrentTrackLyrics(false);
})();

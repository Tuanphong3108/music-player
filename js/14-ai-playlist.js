(function () {
    'use strict';
    const CFG_KEY = 'mp_ai_integration_v1';
    const USAGE_KEY = 'mp_ai_usage_v1';
    const MODELS_CACHE_KEY = 'mp_gemini_models_v1';
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
        return {
            provider: 'Google Gemini',
            safeToken: saved.safeToken !== false,
            apiKey,
            model,
            preset: saved.preset === 'creative' ? 'creative' : 'curator',
            systemPrompt: typeof saved.systemPrompt === 'string' && saved.systemPrompt.trim() ? saved.systemPrompt : DEFAULT_PROMPTS.curator
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
          #ai-playlist-lab-modal{position:fixed;inset:0;z-index:9600;display:none;flex-direction:column;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font-family:var(--app-font);padding-top:env(safe-area-inset-top, 0px);opacity:0;transform:scale(.95);transition:opacity .28s cubic-bezier(.2,0,0,1),transform .36s cubic-bezier(.2,0,0,1);}
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
    function openChoiceSheet(title, options, currentVal, onPick) {
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

        host.innerHTML = `
          ${pendingOpenLabAfterSetup ? `<div class="ai-banner-info" style="margin-bottom:20px;">
            <div style="font-size:calc(15px * var(--font-scale-factor, 1));font-weight:800;">Thiết lập AI lần đầu để tạo danh sách phát</div>
            <div style="font-size:calc(12.5px * var(--font-scale-factor, 1));opacity:.9;">Nhập Gemini API Key rồi bấm Save — hệ thống sẽ tải danh sách mô hình và mở AI Playlist Lab.</div>
          </div>` : ''}
          <div class="ai-st-sec">AI Provider</div>
          <div class="ai-st-group">
            <div class="ai-st-card">
              <div class="ai-row-flex">
                <div class="ai-ico-box"><span class="material-symbols-rounded">science</span></div>
                <div style="flex:1;min-width:0;">
                  <div class="ai-card-title">Provider</div>
                  <div class="ai-card-desc">Google Gemini</div>
                </div>
                <button type="button" class="ai-sheet-trigger" data-ai-open-sheet="provider">
                  <span>Google Gemini</span>
                  <span class="material-symbols-rounded" style="font-size:18px;">expand_more</span>
                </button>
              </div>
            </div>
            <div class="ai-st-card">
              <div class="ai-row-flex">
                <div class="ai-ico-box"><span class="material-symbols-rounded">monitoring</span></div>
                <div style="flex:1;min-width:0;">
                  <div class="ai-card-title">Safe Token Mode</div>
                  <div class="ai-card-desc">${cfg.safeToken ? 'ON — Fast & cheap. Sends compact track metadata to AI.' : 'OFF — Sends full track metadata & filters.'}</div>
                </div>
                <label class="ai-switch">
                  <input type="checkbox" data-ai-field="safeToken"${cfg.safeToken ? ' checked' : ''}>
                  <span class="ai-switch-track"><span class="ai-switch-thumb"><span class="material-symbols-rounded" style="font-size:13px;">${cfg.safeToken ? 'check' : 'close'}</span></span></span>
                </label>
              </div>
            </div>
          </div>

          <div class="ai-st-sec">Credentials</div>
          <div class="ai-st-group">
            <div class="ai-st-card">
              <div>
                <div class="ai-card-title">Google Gemini API Key</div>
                <div class="ai-card-desc">Get from Google AI Studio (aistudio.google.com)</div>
              </div>
              <input type="password" class="ai-input" data-ai-field="apiKey" placeholder="Paste Gemini API key..." value="${(cfg.apiKey || '').replace(/"/g, '&quot;')}">
              <button type="button" class="ai-save-btn" data-ai-action="save-key">Save &amp; Fetch Models</button>
            </div>
          </div>

          <div class="ai-st-sec">Model Selection</div>
          <div class="ai-st-group">
            <div class="ai-st-card">
              <div class="ai-row-flex">
                <div class="ai-ico-box"><span class="material-symbols-rounded">auto_awesome</span></div>
                <div style="flex:1;min-width:0;">
                  <div class="ai-card-title">AI Model</div>
                  <div class="ai-card-desc">${modelDesc}</div>
                </div>
                <button type="button" class="ai-sheet-trigger" data-ai-open-sheet="model"${(!hasKey || fetchingModels) ? ' disabled' : ''}>
                  <span>${modelLabel}</span>
                  <span class="material-symbols-rounded" style="font-size:18px;">${fetchingModels ? 'sync' : 'expand_more'}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="ai-st-sec">Prompt Behavior</div>
          <div class="ai-st-group">
            <div class="ai-st-card">
              <div>
                <div class="ai-card-title">System Prompt</div>
                <div class="ai-card-desc">Customize how the AI behaves &amp; returns JSON.</div>
              </div>
              <div class="ai-chip-wrap">
                <button type="button" class="ai-pill-btn${cfg.preset === 'curator' ? ' active' : ''}" data-ai-preset="curator">Professional Curator</button>
                <button type="button" class="ai-pill-btn${cfg.preset === 'creative' ? ' active' : ''}" data-ai-preset="creative">Creative</button>
              </div>
              <textarea class="ai-textarea" data-ai-field="systemPrompt">${cfg.systemPrompt.replace(/</g, '&lt;')}</textarea>
              <button type="button" class="ai-save-btn" data-ai-action="save-prompt">Save</button>
            </div>
          </div>

          <div class="ai-st-sec">AI Usage Report</div>
          <div class="ai-st-group">
            <div class="ai-st-card">
              <div class="ai-card-title">Total Consumption</div>
              <div class="ai-card-desc">Generated playlists: <b>${usage.runs}</b> • Est. tokens: <b>${usage.tokensEst}</b>${usage.lastPlaylist ? ' • Latest: <b>' + usage.lastPlaylist.replace(/</g, '&lt;') + '</b>' : ''}</div>
            </div>
          </div>
        `;

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
        host.querySelector('[data-ai-field="safeToken"]')?.addEventListener('change', (e) => {
            cfg.safeToken = !!e.target.checked;
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
        host.querySelector('[data-ai-action="save-key"]')?.addEventListener('click', async () => {
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
        host.querySelector('[data-ai-action="save-prompt"]')?.addEventListener('click', () => {
            const ta = host.querySelector('[data-ai-field="systemPrompt"]');
            const sp = host.querySelector('[data-ai-field="safeToken"]');
            if (ta) cfg.systemPrompt = ta.value;
            if (sp) cfg.safeToken = !!sp.checked;
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
            const seg5 = (cls) => [1, 2, 3, 4, 5].map(n => `<button type="button" class="${cls}${n === 3 ? ' active' : ''}" data-val="${n}">${n === 3 ? '✓ 3' : n}</button>`).join('');

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
                      <label class="ai-switch"><input type="checkbox" id="ai-prio-favs" checked><span class="ai-switch-track"><span class="ai-switch-thumb"><span class="material-symbols-rounded" style="font-size:13px;">check</span></span></span></label>
                    </div>
                  </div>
                  <div class="ai-st-card">
                    <div class="ai-row-flex">
                      <span class="ai-card-title">Avoid explicit lyrics</span>
                      <label class="ai-switch"><input type="checkbox" id="ai-avoid-exp"><span class="ai-switch-track"><span class="ai-switch-thumb"><span class="material-symbols-rounded" style="font-size:13px;">close</span></span></span></label>
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

    function updateSegButtons(containerSelector, val) {
        document.querySelectorAll(containerSelector + ' button').forEach(b => {
            const n = Number(b.dataset.val);
            const active = n === val;
            b.classList.toggle('active', active);
            b.textContent = active ? ('✓ ' + n) : String(n);
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
        document.getElementById('ai-add-custom-mood')?.addEventListener('click', () => {
            const v = prompt('Custom mood:');
            if (!v || !v.trim()) return;
            const label = v.trim();
            labState.moods.add(label);
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'ai-chip active'; btn.dataset.mood = label; btn.textContent = label;
            document.getElementById('ai-add-custom-mood')?.before(btn);
        });
        document.getElementById('ai-add-custom-act')?.addEventListener('click', () => {
            const v = prompt('Custom activity:');
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
            if ($('#ai-prio-favs')) $('#ai-prio-favs').checked = true;
            if ($('#ai-avoid-exp')) $('#ai-avoid-exp').checked = false;
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
                prioritizeFavorites: !!$('ai-prio-favs')?.checked,
                avoidExplicitLyrics: !!$('ai-avoid-exp')?.checked
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

    document.addEventListener('DOMContentLoaded', () => {
        injectStyles();
        ensureModals();
        syncAllSettingsHosts();
        if (cfg.apiKey && !fetchedModels.length) {
            fetchGeminiModels(cfg.apiKey, true);
        }
        document.getElementById('m-pl-ai-btn')?.addEventListener('click', () => openAiLab(false));
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
})();

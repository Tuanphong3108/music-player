(function () {
    'use strict';
    const CFG_KEY = 'mp_ai_integration_v1';
    const USAGE_KEY = 'mp_ai_usage_v1';
    const DEFAULT_PROMPTS = {
        curator: "You are 'Vibe-Engine', a professional music curator. Analyze the user's request and listening profile to provide smart music recommendations from the local library. Always prioritize flow, emotional coherence, and exact metadata matching. Respond strictly in valid JSON.",
        creative: "You are 'Vibe-Engine' in creative discovery mode. Craft adventurous, mood-rich local playlists with unexpected transitions while honoring every constraint. Respond strictly in valid JSON."
    };
    const MOODS = ['Chill', 'Energetic', 'Happy', 'Dark', 'Romantic', 'Melancholic'];
    const ACTIVITIES = ['Workout', 'Focus', 'Road trip', 'Party', 'Study', 'Late night'];
    const ERAS = ['Any era', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
    const PROVIDERS = ['Google Gemini', 'OpenAI', 'OpenRouter'];
    const MODELS = {
        'Google Gemini': ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-flash-lite-preview'],
        'OpenAI': ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
        'OpenRouter': ['google/gemini-2.5-flash', 'anthropic/claude-3.5-haiku', 'openai/gpt-4o-mini']
    };

    function loadCfg() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) {}
        const prov = PROVIDERS.includes(saved.provider) ? saved.provider : 'Google Gemini';
        const modList = MODELS[prov] || MODELS['Google Gemini'];
        return {
            provider: prov,
            safeToken: saved.safeToken !== false,
            apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '',
            model: saved.model || modList[0],
            preset: saved.preset === 'creative' ? 'creative' : 'curator',
            systemPrompt: typeof saved.systemPrompt === 'string' && saved.systemPrompt.trim() ? saved.systemPrompt : DEFAULT_PROMPTS.curator
        };
    }
    function saveCfg(nextCfg) {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(nextCfg)); } catch (e) {}
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
    let aiSettingsOpen = false;
    let labOpen = false;
    let labState = {
        name: '', prompt: '', moods: new Set(), activities: new Set(),
        era: 'Any era', energy: 3, discovery: 3, minSongs: 12, maxSongs: 24,
        prioGenres: '', avoidGenres: '', prefLang: '', prioFavs: true, avoidExplicit: false
    };

    function injectStyles() {
        if (document.getElementById('ai-playlist-lab-style')) return;
        const st = document.createElement('style');
        st.id = 'ai-playlist-lab-style';
        st.textContent = `
          .ai-sec-lbl{font-size:12px;font-weight:700;letter-spacing:.4px;color:var(--md-sys-color-primary);margin:14px 0 8px;text-transform:uppercase;}
          .ai-card{background:var(--md-sys-color-surface-variant,rgba(255,255,255,.06));border-radius:20px;padding:16px;margin-bottom:12px;display:flex;flex-direction:column;gap:14px;border:1px solid var(--playlist-border,rgba(255,255,255,.08));}
          .ai-row-flex{display:flex;align-items:center;gap:14px;justify-content:space-between;}
          .ai-ico-box{width:40px;height:40px;border-radius:14px;background:color-mix(in srgb,var(--md-sys-color-primary) 16%,transparent);color:var(--md-sys-color-primary);display:grid;place-items:center;flex-shrink:0;}
          .ai-card-title{font-size:16px;font-weight:700;color:var(--md-sys-color-on-surface);}
          .ai-card-desc{font-size:12.5px;line-height:1.45;color:var(--md-sys-color-on-surface-variant,#aaa);margin-top:2px;}
          .ai-pill-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:999px;border:1px solid var(--playlist-border,rgba(255,255,255,.14));font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;background:color-mix(in srgb,var(--md-sys-color-on-surface) 10%,transparent);color:var(--md-sys-color-on-surface);align-self:flex-start;}
          .ai-pill-btn.active,.ai-pill-btn.sel{background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);border-color:var(--md-sys-color-primary);}
          .ai-sheet-trigger{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;border:1.5px solid color-mix(in srgb,var(--md-sys-color-primary) 45%,var(--md-sys-color-outline,#888));background:color-mix(in srgb,var(--md-sys-color-primary-container) 55%,var(--md-sys-color-surface));color:var(--md-sys-color-on-surface);font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;align-self:flex-start;transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .2s;}
          .ai-sheet-trigger:active{transform:scale(.97);}
          .ai-input,.ai-textarea{width:100%;box-sizing:border-box;border-radius:14px;border:1.5px solid color-mix(in srgb,var(--md-sys-color-outline,#888) 40%,transparent);background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font-family:inherit;font-size:13.5px;padding:12px 14px;outline:none;}
          .ai-input:focus,.ai-textarea:focus{border-color:var(--md-sys-color-primary);}
          .ai-textarea{min-height:110px;resize:vertical;line-height:1.45;}
          .ai-save-btn{align-self:flex-start;padding:10px 22px;border-radius:999px;border:none;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);}
          .ai-save-btn:disabled{opacity:.4;cursor:not-allowed;}
          .ai-switch{position:relative;display:inline-block;width:52px;height:30px;flex-shrink:0;}
          .ai-switch input{opacity:0;width:0;height:0;}
          .ai-switch-track{position:absolute;inset:0;border-radius:999px;background:var(--md-sys-color-surface-variant);border:2px solid var(--md-sys-color-outline);transition:.25s cubic-bezier(.34,1.56,.64,1);display:flex;align-items:center;padding:0 4px;cursor:pointer;}
          .ai-switch-thumb{width:18px;height:18px;border-radius:50%;background:var(--md-sys-color-outline);transition:.25s cubic-bezier(.34,1.56,.64,1);display:grid;place-items:center;}
          .ai-switch input:checked + .ai-switch-track{background:var(--md-sys-color-primary);border-color:var(--md-sys-color-primary);}
          .ai-switch input:checked + .ai-switch-track .ai-switch-thumb{transform:translateX(22px);width:20px;height:20px;background:var(--md-sys-color-on-primary);color:var(--md-sys-color-primary);}
          #ai-settings-modal,#ai-playlist-lab-modal{position:fixed;inset:0;z-index:9600;display:none;flex-direction:column;background:var(--md-sys-color-surface,#121118);color:var(--md-sys-color-on-surface,#f3eff7);font-family:var(--app-font,inherit);padding-top:env(safe-area-inset-top,0px);}
          #ai-settings-modal.open,#ai-playlist-lab-modal.open{display:flex;}
          .ai-modal-top{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid var(--playlist-border,rgba(255,255,255,.08));flex-shrink:0;}
          .ai-modal-top h2{margin:0;font-size:21px;font-weight:800;flex:1;}
          .ai-icon-btn{width:42px;height:42px;border-radius:50%;border:none;background:color-mix(in srgb,var(--md-sys-color-on-surface) 10%,transparent);color:var(--md-sys-color-on-surface);display:grid;place-items:center;cursor:pointer;flex-shrink:0;}
          .ai-modal-body{flex:1;overflow-y:auto;padding:16px 18px 110px;}
          .ai-banner-info{background:color-mix(in srgb,var(--md-sys-color-primary-container) 78%,var(--md-sys-color-surface));color:var(--md-sys-color-on-primary-container);border-radius:20px;padding:16px;margin-bottom:14px;display:flex;flex-direction:column;gap:8px;}
          .ai-chip-wrap{display:flex;flex-wrap:wrap;gap:8px;}
          .ai-chip{padding:9px 15px;border-radius:14px;border:1.5px solid color-mix(in srgb,var(--md-sys-color-outline,#888) 35%,transparent);background:color-mix(in srgb,var(--md-sys-color-surface-variant) 55%,transparent);color:var(--md-sys-color-on-surface);font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;}
          .ai-chip.active{background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);border-color:var(--md-sys-color-primary);}
          .ai-seg-5{display:grid;grid-template-columns:repeat(5,1fr);border-radius:14px;overflow:hidden;border:1.5px solid color-mix(in srgb,var(--md-sys-color-outline,#888) 40%,transparent);}
          .ai-seg-5 button{border:none;border-right:1px solid color-mix(in srgb,var(--md-sys-color-outline,#888) 30%,transparent);background:transparent;color:var(--md-sys-color-on-surface);padding:10px 4px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;}
          .ai-seg-5 button:last-child{border-right:none;}
          .ai-seg-5 button.active{background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);}
          .ai-two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
          .ai-lab-footer{position:fixed;left:0;right:0;bottom:0;z-index:9610;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px calc(14px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--md-sys-color-surface) 94%,#000);border-top:1px solid var(--playlist-border,rgba(255,255,255,.08));}
          .ai-reset-btn{padding:12px 20px;border-radius:999px;border:none;background:color-mix(in srgb,var(--md-sys-color-on-surface) 12%,transparent);color:var(--md-sys-color-on-surface);font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;}
          .ai-gen-btn{padding:14px 26px;border-radius:20px;border:none;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:8px;}
          .ai-gen-btn:disabled{opacity:.5;cursor:wait;}
          #ai-local-sheet{position:fixed;inset:0;z-index:9700;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);opacity:0;transition:opacity .22s ease;}
          #ai-local-sheet.open{display:flex;}
          #ai-local-sheet.show{opacity:1;}
          #ai-local-sheet .ai-ls-box{width:100%;max-width:540px;max-height:72vh;overflow-y:auto;background:var(--md-sys-color-surface-variant,#222029);color:var(--md-sys-color-on-surface,#f3eff7);border-radius:28px 28px 0 0;padding:10px 16px calc(20px + env(safe-area-inset-bottom,0px));transform:translateY(100%);transition:transform .28s cubic-bezier(.2,0,0,1);}
          #ai-local-sheet.show .ai-ls-box{transform:translateY(0);}
          #ai-local-sheet .ai-ls-grip{width:36px;height:4px;border-radius:999px;background:color-mix(in srgb,currentColor 30%,transparent);margin:0 auto 12px;}
          #ai-local-sheet .ai-ls-title{font-size:17px;font-weight:800;padding:0 6px 10px;}
          #ai-local-sheet .ai-ls-opt{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border:none;border-radius:16px;background:transparent;color:inherit;font-family:inherit;font-size:14.5px;font-weight:600;text-align:left;cursor:pointer;margin-bottom:4px;}
          #ai-local-sheet .ai-ls-opt:hover{background:color-mix(in srgb,currentColor 8%,transparent);}
          #ai-local-sheet .ai-ls-opt.sel{background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);font-weight:700;}
          #ai-local-sheet .ai-ls-opt .st-chk{opacity:0;font-size:20px;}
          #ai-local-sheet .ai-ls-opt.sel .st-chk{opacity:1;}
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
        setTimeout(() => sh.classList.remove('open'), 240);
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
            btn.addEventListener('click', () => { closeLocalSheet(); setTimeout(() => onPick(val), 50); });
            listEl.appendChild(btn);
        });
        sh.classList.add('open');
        requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add('show')));
    }

    function renderSettingsMarkup(containerId) {
        const host = document.getElementById(containerId);
        if (!host) return;
        const usage = loadUsage();
        host.innerHTML = `
          <div class="ai-sec-lbl">AI Provider</div>
          <div class="ai-card">
            <div class="ai-row-flex">
              <div class="ai-ico-box"><span class="material-symbols-rounded">science</span></div>
              <div style="flex:1;min-width:0;">
                <div class="ai-card-title">Provider</div>
                <div class="ai-card-desc">Choose your AI provider</div>
              </div>
              <button type="button" class="ai-sheet-trigger" data-ai-open-sheet="provider">
                <span>${cfg.provider}</span>
                <span class="material-symbols-rounded" style="font-size:18px;">expand_more</span>
              </button>
            </div>
            <div class="ai-row-flex" style="margin-top:2px;">
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

          <div class="ai-sec-lbl">Credentials</div>
          <div class="ai-card">
            <div>
              <div class="ai-card-title">${cfg.provider} API Key</div>
              <div class="ai-card-desc">Get from Google AI Studio (aistudio.google.com)</div>
            </div>
            <input type="password" class="ai-input" data-ai-field="apiKey" placeholder="Paste API key..." value="${(cfg.apiKey || '').replace(/"/g, '&quot;')}">
            <button type="button" class="ai-save-btn" data-ai-action="save-key">Save</button>
          </div>

          <div class="ai-sec-lbl">Model Selection</div>
          <div class="ai-card">
            <div class="ai-row-flex">
              <div class="ai-ico-box"><span class="material-symbols-rounded">auto_awesome</span></div>
              <div style="flex:1;min-width:0;">
                <div class="ai-card-title">AI Model</div>
                <div class="ai-card-desc">Select a model.</div>
              </div>
              <button type="button" class="ai-sheet-trigger" data-ai-open-sheet="model">
                <span>${cfg.model}</span>
                <span class="material-symbols-rounded" style="font-size:18px;">expand_more</span>
              </button>
            </div>
          </div>

          <div class="ai-sec-lbl">Prompt Behavior</div>
          <div class="ai-card">
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

          <div class="ai-sec-lbl">AI Usage Report</div>
          <div class="ai-card">
            <div class="ai-card-title">Total Consumption</div>
            <div class="ai-card-desc">Generated playlists: <b>${usage.runs}</b> • Est. tokens: <b>${usage.tokensEst}</b>${usage.lastPlaylist ? ' • Latest: <b>' + usage.lastPlaylist.replace(/</g, '&lt;') + '</b>' : ''}</div>
          </div>
        `;

        host.querySelector('[data-ai-open-sheet="provider"]')?.addEventListener('click', () => {
            openChoiceSheet('Provider', PROVIDERS, cfg.provider, (val) => {
                cfg.provider = val;
                const list = MODELS[cfg.provider] || MODELS['Google Gemini'];
                if (!list.includes(cfg.model)) cfg.model = list[0];
                saveCfg(cfg);
                syncAllSettingsHosts();
            });
        });
        host.querySelector('[data-ai-open-sheet="model"]')?.addEventListener('click', () => {
            const list = MODELS[cfg.provider] || MODELS['Google Gemini'];
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
        host.querySelector('[data-ai-action="save-key"]')?.addEventListener('click', () => {
            const inp = host.querySelector('[data-ai-field="apiKey"]');
            cfg.apiKey = (inp?.value || '').trim();
            saveCfg(cfg);
            if (typeof showToast === 'function') showToast('Đã lưu API Key!', 'check_circle', 2200);
            syncAllSettingsHosts();
        });
        host.querySelector('[data-ai-action="save-prompt"]')?.addEventListener('click', () => {
            const ta = host.querySelector('[data-ai-field="systemPrompt"]');
            const sp = host.querySelector('[data-ai-field="safeToken"]');
            if (ta) cfg.systemPrompt = ta.value;
            if (sp) cfg.safeToken = !!sp.checked;
            saveCfg(cfg);
            if (typeof showToast === 'function') showToast('Đã lưu cấu hình AI!', 'check_circle', 2200);
            syncAllSettingsHosts();
        });
    }

    function syncAllSettingsHosts() {
        cfg = loadCfg();
        renderSettingsMarkup('ai-settings-host');
        renderSettingsMarkup('ai-settings-modal-host');
    }

    function ensureModals() {
        if (!document.getElementById('ai-settings-modal')) {
            const m = document.createElement('div');
            m.id = 'ai-settings-modal';
            m.innerHTML = `
              <div class="ai-modal-top">
                <button type="button" class="ai-icon-btn" id="ai-settings-back"><span class="material-symbols-rounded">arrow_back</span></button>
                <h2>AI Integration (β)</h2>
              </div>
              <div class="ai-modal-body" id="ai-settings-modal-host"></div>
            `;
            document.body.appendChild(m);
            document.getElementById('ai-settings-back')?.addEventListener('click', closeAiSettings);
        }

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
                      <div style="font-size:17px;font-weight:800;">Curate with precision</div>
                      <div style="font-size:12.5px;opacity:.85;">Define mood, activity, constraints and depth.</div>
                    </div>
                  </div>
                  <div style="border-top:1px solid color-mix(in srgb,currentColor 18%,transparent);padding-top:8px;font-size:12.5px;opacity:.9;">
                    The AI will only use songs from your local library (sending track name, file type, artist, album, duration &amp; format metadata) and return JSON.
                  </div>
                </div>

                <div class="ai-sec-lbl">Intent</div>
                <div class="ai-card">
                  <input type="text" class="ai-input" id="ai-pl-name" placeholder="Playlist name (optional)">
                  <textarea class="ai-textarea" id="ai-pl-feel" placeholder="What should this playlist feel like?"></textarea>
                </div>

                <div class="ai-sec-lbl">Direction</div>
                <div class="ai-card">
                  <div style="font-weight:700;">Mood</div>
                  <div class="ai-chip-wrap" id="ai-mood-wrap">${moodChips}</div>
                  <div style="font-weight:700;margin-top:4px;">Activity</div>
                  <div class="ai-chip-wrap" id="ai-act-wrap">${actChips}</div>
                  <div style="font-weight:700;margin-top:4px;">Era</div>
                  <div class="ai-chip-wrap" id="ai-era-wrap">${eraChips}</div>
                </div>

                <div class="ai-sec-lbl">Curation engine</div>
                <div class="ai-card">
                  <div class="ai-row-flex"><span style="font-weight:700;">Energy</span><span id="ai-energy-lbl" style="font-weight:700;color:var(--md-sys-color-primary);">3/5</span></div>
                  <div class="ai-seg-5" id="ai-energy-seg">${seg5('ai-e-btn')}</div>
                  <div class="ai-row-flex" style="margin-top:4px;"><span style="font-weight:700;">Discovery</span><span id="ai-disc-lbl" style="font-weight:700;color:var(--md-sys-color-primary);">3/5</span></div>
                  <div class="ai-seg-5" id="ai-disc-seg">${seg5('ai-d-btn')}</div>
                  <div class="ai-two-col" style="margin-top:4px;">
                    <div><div class="ai-card-desc" style="margin-bottom:4px;">Min songs</div><input type="number" class="ai-input" id="ai-min-songs" min="1" max="100" value="12"></div>
                    <div><div class="ai-card-desc" style="margin-bottom:4px;">Max songs</div><input type="number" class="ai-input" id="ai-max-songs" min="1" max="200" value="24"></div>
                  </div>
                </div>

                <div class="ai-sec-lbl">Filters</div>
                <div class="ai-card">
                  <input type="text" class="ai-input" id="ai-prio-genres" placeholder="Prioritize genres (optional)">
                  <input type="text" class="ai-input" id="ai-avoid-genres" placeholder="Avoid genres (optional)">
                  <input type="text" class="ai-input" id="ai-pref-lang" placeholder="Preferred language (optional)">
                  <div class="ai-row-flex">
                    <span style="font-weight:700;">Prioritize favorites</span>
                    <label class="ai-switch"><input type="checkbox" id="ai-prio-favs" checked><span class="ai-switch-track"><span class="ai-switch-thumb"><span class="material-symbols-rounded" style="font-size:13px;">check</span></span></span></label>
                  </div>
                  <div class="ai-row-flex">
                    <span style="font-weight:700;">Avoid explicit lyrics</span>
                    <label class="ai-switch"><input type="checkbox" id="ai-avoid-exp"><span class="ai-switch-track"><span class="ai-switch-thumb"><span class="material-symbols-rounded" style="font-size:13px;">close</span></span></span></label>
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
        document.getElementById('ai-lab-close')?.addEventListener('click', closeAiLab);
        document.getElementById('ai-lab-open-cfg')?.addEventListener('click', () => openAiSettings(true));
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

    function openAiSettings() {
        injectStyles();
        ensureModals();
        syncAllSettingsHosts();
        aiSettingsOpen = true;
        document.getElementById('ai-settings-modal')?.classList.add('open');
    }
    function closeAiSettings() {
        aiSettingsOpen = false;
        document.getElementById('ai-settings-modal')?.classList.remove('open');
        if (labOpen && hasAiConfigured() && typeof showToast === 'function') {
            showToast('Đã lưu cấu hình AI, sẵn sàng tạo danh sách phát!', 'auto_awesome', 2500);
        }
    }
    function openAiLab() {
        injectStyles();
        ensureModals();
        syncAllSettingsHosts();
        if (!hasAiConfigured()) {
            labOpen = true;
            openAiSettings();
            return;
        }
        labOpen = true;
        document.getElementById('ai-playlist-lab-modal')?.classList.add('open');
    }
    function closeAiLab() {
        labOpen = false;
        document.getElementById('ai-playlist-lab-modal')?.classList.remove('open');
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
        const schemaInstruction = `Return ONLY a single valid JSON object (no markdown fences, no commentary) with exact schema: {"playlistName":"string","description":"string","trackKeys":["string"]}. Pick only from provided items' "key" values, between ${reqSpec.minSongs} and ${reqSpec.maxSongs} songs.`;
        const userPayload = JSON.stringify({
            request: reqSpec,
            tracks: tracks.map(t => cfg.safeToken
                ? { key: t.key, title: t.title, artist: t.artist, type: t.fileType, ext: t.extension }
                : { key: t.key, title: t.title, artist: t.artist, album: t.album, year: t.year, genre: t.genre, type: t.fileType, ext: t.extension, durationSec: t.durationSec, liked: t.liked })
        });
        const sysMsg = `${cfg.systemPrompt}\n\n${schemaInstruction}`;

        if (cfg.provider === 'Google Gemini') {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
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
            const estTokens = Math.round((sysMsg.length + userPayload.length + txt.length) / 4);
            return { parsed: parseJsonResponse(txt), tokensEst: estTokens };
        }

        const baseUrl = cfg.provider === 'OpenRouter'
            ? 'https://openrouter.ai/api/v1/chat/completions'
            : 'https://api.openai.com/v1/chat/completions';
        const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey };
        if (cfg.provider === 'OpenRouter') headers['HTTP-Referer'] = location.origin || 'https://tuanphong3108.github.io';
        const res = await fetch(baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: cfg.model,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: userPayload }]
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        const txt = data?.choices?.[0]?.message?.content || '';
        const estTokens = Number(data?.usage?.total_tokens) || Math.round((sysMsg.length + userPayload.length + txt.length) / 4);
        return { parsed: parseJsonResponse(txt), tokensEst: estTokens };
    }

    async function handleGeneratePlaylist() {
        if (!hasAiConfigured()) {
            openAiSettings();
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
        document.getElementById('m-pl-ai-btn')?.addEventListener('click', openAiLab);
        document.querySelector('.st-tab[data-tab="ai"]')?.addEventListener('click', syncAllSettingsHosts);
    });
    window.__openAiPlaylistLab = openAiLab;
    window.__openAiSettings = openAiSettings;
})();

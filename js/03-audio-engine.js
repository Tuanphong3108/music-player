        // --- BỘ TRỘN ÂM THANH (Web Audio): preamp -> EQ 5 dải -> mono -> nén -> cân bằng L/R -> analyser -> loa ---
        const MIXER_FREQS = [60, 230, 910, 3600, 14000];
        const MIXER_PRESETS = { flat: [0,0,0,0,0], bass: [7,4,0,0,0], treble: [0,0,0,4,7], vocal: [-2,0,4,3,0], rock: [5,3,-2,2,5], pop: [-1,2,4,2,-1] };
        const MIXER_DEFAULT = { preamp: 0, eqOn: true, eq: [0,0,0,0,0], preset: 'flat', balance: 0, mono: false, comp: false };
        let mixer = (() => {
            try { const o = JSON.parse(localStorage.getItem('settings_mixer') || 'null'); if (o && typeof o === 'object') return Object.assign({}, MIXER_DEFAULT, o, { eq: (Array.isArray(o.eq) && o.eq.length === 5) ? o.eq.map(Number) : [0,0,0,0,0] }); } catch (e) {}
            return JSON.parse(JSON.stringify(MIXER_DEFAULT));
        })();
        function mixerSave() { try { localStorage.setItem('settings_mixer', JSON.stringify(mixer)); } catch (e) {} }
        let mx = null;
        function mixerBuild(source) {
            mx = { source,
                pre: audioCtx.createGain(),
                eq: MIXER_FREQS.map((f, i) => { const b = audioCtx.createBiquadFilter(); b.type = i === 0 ? 'lowshelf' : i === 4 ? 'highshelf' : 'peaking'; b.frequency.value = f; b.Q.value = 1; return b; }),
                mono: audioCtx.createGain(),
                comp: audioCtx.createDynamicsCompressor(),
                pan: audioCtx.createStereoPanner() };
            mx.mono.channelCount = 1; mx.mono.channelCountMode = 'explicit'; mx.mono.channelInterpretation = 'speakers';
            mixerApply();
        }
        function mixerApply() {
            if (!mx) return;
            const nodes = [mx.source, mx.pre, ...mx.eq, mx.mono, mx.comp, mx.pan, analyser];
            nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
            const chain = [mx.source, mx.pre];
            if (mixer.eqOn) chain.push(...mx.eq);
            if (mixer.mono) chain.push(mx.mono);
            if (mixer.comp) chain.push(mx.comp);
            chain.push(mx.pan, analyser);
            for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
            analyser.connect(audioCtx.destination);
            mx.pre.gain.value = Math.pow(10, mixer.preamp / 20);
            mx.eq.forEach((b, i) => { b.gain.value = mixer.eq[i] || 0; });
            mx.pan.pan.value = Math.max(-1, Math.min(1, mixer.balance / 100));
        }
        // Trên điện thoại, video đi qua AudioContext (EQ/analyser) làm lệch tiếng + giật hình. Nếu Mixer đang để mặc định
        // thì bỏ hẳn chuỗi Web Audio cho video, để thẻ <video> tự phát bằng đường âm thanh gốc của hệ thống.
        function mixerIsDefault() { return (!mixer.eqOn || mixer.eq.every(g => !g)) && !mixer.mono && !mixer.comp && !mixer.preamp && !mixer.balance; }
        function initVisualizer() {
            if (audioCtx) return;
            if (document.documentElement.classList.contains('m-ui')) {
                if (!window.IS_ANDROID_APP && !audio.readyState) return;   // bản Android không có video nên dựng đồ thị âm thanh ngay, khỏi chờ metadata   // chưa biết là video hay nhạc -> chờ loadedmetadata (xem listener bên dưới)
                if (audio.videoWidth > 0 && mixerIsDefault()) return;
            }
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaElementSource(audio);
            mixerBuild(source);
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            draw();
            try { if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}

            // Từ đây trở đi, âm thanh thật sự phát ra qua audioCtx.destination (không còn
            // qua thẻ <audio> gốc nữa) -> phải áp lại thiết bị đã lưu NGAY TRÊN audioCtx,
            // nếu không "thiết bị mặc định" cũ (lúc AudioContext mới khởi tạo) sẽ được dùng
            // mãi mãi bất kể trước đó người dùng đã chọn thiết bị nào trong dropdown.
            const savedSinkId = localStorage.getItem('settings_output_device');
            if (savedSinkId && savedSinkId !== 'default' && typeof audioCtx.setSinkId === 'function') {
                audioCtx.setSinkId(savedSinkId).catch(err => {
                    console.warn('Không áp lại được thiết bị phát âm thanh đã lưu:', err);
                });
            }
        }

        // Bản Android: dựng sẵn AudioContext/đồ thị âm thanh khi app rảnh (trước lần phát đầu) để lúc bắt đầu phát không phải khởi tạo
        // giữa chừng làm nhạc khựng 1-2 giây; và đánh thức context ngay ở lần chạm đầu tiên của người dùng.
        if (window.IS_ANDROID_APP) {
            const warm = () => { try { if (!audioCtx && !(!settings.perf.visualizer && mixerIsDefault())) initVisualizer(); } catch (e) {} };
            (window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 3000 }) : (fn) => setTimeout(fn, 1500))(() => setTimeout(warm, 600));
            const wake = () => { try { warm(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} };
            window.addEventListener('pointerdown', wake, { once: true, capture: true, passive: true });
        }
        let vizFrame = 0;
        let vizRGB = null, vizLastColorRead = 0, vizColorSyncTimer = null;
        function readAccentRGB() {
            const c = document.createElement('canvas').getContext('2d');
            c.fillStyle = '#D0BCFF';
            c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim() || '#D0BCFF';
            const hex = c.fillStyle;   // luôn trả về dạng #rrggbb (hoặc rgba(...) nếu có alpha)
            if (hex[0] === '#') return [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16)).join(',');
            const m = hex.match(/[\d.]+/g); return m ? m.slice(0, 3).join(',') : '208,188,255';
        }
        function scheduleVisualizerColorSync() {
            clearTimeout(vizColorSyncTimer);
            vizColorSyncTimer = setTimeout(() => {
                vizRGB = readAccentRGB();
                vizLastColorRead = performance.now();
            }, 500);
        }
        new MutationObserver(scheduleVisualizerColorSync).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style', 'class']
        });
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', scheduleVisualizerColorSync);

        function draw() {
            requestAnimationFrame(draw);
            if (!analyser) return;
            // "Giảm hiệu ứng mờ và chuyển động (Nâng cao)" đang bật -> bỏ hẳn việc phân
            // tích tần số + vẽ canvas mỗi khung hình để tiết kiệm CPU cho máy yếu, chứ
            // không chỉ ẩn bằng CSS (ẩn bằng CSS vẫn tốn CPU vẽ ở dưới nếu không chặn ở đây)
            if (!settings.perf.visualizer) return;
            // Đang xem video (canvas bị ẩn) / tab ẩn / không phát -> khỏi phân tích + vẽ; trên điện thoại chỉ vẽ ~30fps
            if (document.hidden || document.body.classList.contains('has-video') || audio.paused) return;
            if (document.documentElement.classList.contains('m-ui') && (vizFrame & 1)) { vizFrame++; return; }
            analyser.getByteFrequencyData(dataArray);
            const ctx = visualizer.getContext('2d');
            // Gán width/height mỗi khung hình sẽ cấp phát lại canvas -> chỉ đổi khi kích thước thật sự thay đổi
            if (visualizer.width !== visualizer.clientWidth) visualizer.width = visualizer.clientWidth;
            if (visualizer.height !== visualizer.clientHeight) visualizer.height = visualizer.clientHeight;
            const barWidth = (visualizer.width / dataArray.length) * 2.5;
            let x = 0; ctx.clearRect(0,0, visualizer.width, visualizer.height);
            // Màu sóng nhạc đồng bộ với Accent Color (sau khi accent/theme đổi 0.5s và dự phòng mỗi 500ms)
            const now = performance.now();
            if (!vizRGB || (now - vizLastColorRead >= 500)) {
                vizRGB = readAccentRGB();
                vizLastColorRead = now;
            }
            dataArray.forEach(val => {
                const h = (val / 255) * visualizer.height * 0.6;
                ctx.fillStyle = `rgba(${vizRGB}, ${0.2 + (val/255)*0.6})`;
                ctx.beginPath();
                ctx.roundRect(x, (visualizer.height/2) - (h/2), barWidth-2, Math.max(h, 4), 10);
                ctx.fill(); x += barWidth;
            });
        }

        audio.addEventListener('timeupdate', () => {
            if (audio.currentTime > 0.5) window.__lastPos = audio.currentTime;
            // Chạy nền (màn hình tắt / app ẩn): chỉ giữ đồng bộ lyric (cho widget/thông báo), bỏ việc vẽ thanh seek & chữ thời gian
            if (document.hidden && !customPipWindow) { syncLyrics(); return; }
            seekSlider.value = (audio.currentTime / audio.duration) * 100 || 0;
            updateSliderFill(seekSlider);
            document.getElementById('current-time').innerText = formatTime(audio.currentTime, audio.duration);
            document.getElementById('duration').innerText = formatTime(audio.duration, audio.duration);
            updatePipSeek();
            syncLyrics();
        });

        function formatTime(s, totalS = 0) {
            if (isNaN(s)) return "0:00";
            
            const totalH = Math.floor(totalS / 3600);
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = Math.floor(s % 60);
            
            if (totalH > 0) {
                return `${h}:${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
            }
            
            return `${m}:${sec < 10 ? '0' : ''}${sec}`;
        }

        seekSlider.addEventListener('input', (e) => audio.currentTime = (e.target.value / 100) * audio.duration);

        // --- HỆ THỐNG CHỌN THIẾT BỊ PHÁT ÂM THANH (Audio Output Device) ---
        const outputDeviceBtn = document.getElementById('output-device-btn');
        const outputDeviceMenu = document.getElementById('output-device-menu');


        // --- TOAST "Đang sử dụng <đầu ra>" ---
        const outputToast = document.getElementById('output-toast');
        const outputToastText = document.getElementById('output-toast-text');
        let outputToastTimer = null, outputToastFadeTimer = null, lastOutputName = null;

        function hideOutputToast(mode) {
            clearTimeout(outputToastTimer); clearTimeout(outputToastFadeTimer);
            outputToast.classList.remove('show');
            outputToast.classList.add(mode === 'zoom' ? 'zoom-out' : 'fade-out');
            outputToastFadeTimer = setTimeout(() => {
                try { outputToast.hidePopover(); } catch (e) {}
                outputToast.classList.remove('zoom-out', 'fade-out');
            }, mode === 'zoom' ? 250 : 1850);
        }
        function showOutputToast(name) {
            { const g = document.getElementById('getting-started-overlay'); if (g && g.style.display === 'block') return; }
            const tpl = currentLangDict['toast.output_using'] || 'Đang sử dụng {device}';
            showToast(tpl.replace('{device}', name), 'headphones', 5000);
        }

        // Hộp thoại xác nhận Material (thay cho confirm() của trình duyệt) -> trả về Promise<boolean>
        function confirmDialog(message, okText, title) {
            return new Promise((resolve) => {
                const dlg = document.getElementById('confirm-dialog');
                const okBtn = document.getElementById('confirm-dialog-ok');
                const cancelBtn = document.getElementById('confirm-dialog-cancel');
                document.getElementById('confirm-dialog-text').textContent = message;
                if (title) document.getElementById('confirm-dialog-title').textContent = title;
                if (okText) okBtn.textContent = okText;
                let result = false;
                const onOk = () => { result = true; dlg.close(); };
                const onCancel = () => { result = false; dlg.close(); };
                const onClosed = () => {
                    okBtn.removeEventListener('click', onOk);
                    cancelBtn.removeEventListener('click', onCancel);
                    dlg.removeEventListener('closed', onClosed);
                    resolve(result);
                };
                okBtn.addEventListener('click', onOk);
                cancelBtn.addEventListener('click', onCancel);
                dlg.addEventListener('closed', onClosed);
                dlg.show();
            });
        }

        // Toast dùng chung toàn app (thay cho alert() của trình duyệt)
        function showToast(message, icon, ms) {
            document.getElementById('output-toast-icon').textContent = icon || 'info';
            outputToastText.textContent = message;
            if (!ms) ms = String(message).length > 90 ? 9000 : 5000;
            clearTimeout(outputToastTimer); clearTimeout(outputToastFadeTimer);
            outputToast.classList.remove('zoom-out', 'fade-out', 'show');
            // Re-show để luôn nằm trên cùng top layer (kể cả trên dialog/menu mở sau)
            try { if (outputToast.matches(':popover-open')) outputToast.hidePopover(); outputToast.showPopover(); } catch (e) {}
            requestAnimationFrame(() => requestAnimationFrame(() => outputToast.classList.add('show')));
            outputToastTimer = setTimeout(() => hideOutputToast('zoom'), ms);
        }
        document.getElementById('output-toast-close').addEventListener('click', () => hideOutputToast('zoom'));

        async function getCurrentOutputName() {
            const defLabel = currentLangDict['player.output_default'] || 'Mặc định';
            try {
                const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
                const saved = localStorage.getItem('settings_output_device') || 'default';
                const clean = l => (l || '').replace(/^(default|mặc định)\s*[-–]\s*/i, '');
                if (saved !== 'default') {
                    const d = devices.find(x => x.deviceId === saved);
                    if (d && d.label) return clean(d.label);
                }
                const d = devices.find(x => x.deviceId === 'default') || devices[0];
                return d && d.label ? clean(d.label) : defLabel;
            } catch (e) { return defLabel; }
        }
        async function announceOutput(force) {
            const name = await getCurrentOutputName();
            if (!force && name === lastOutputName) return;
            lastOutputName = name;
            showOutputToast(name);
        }
        let outputChangeDebounce = null;
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', () => {
                clearTimeout(outputChangeDebounce);
                outputChangeDebounce = setTimeout(() => announceOutput(false), 600);
            });
        }
        // Mới vào trang (chờ file ngôn ngữ tải xong cho chuỗi dịch)
        setTimeout(() => announceOutput(true), 1200);

        async function selectOutputDevice(deviceId) {
            localStorage.setItem('settings_output_device', deviceId);
            const sinkValue = deviceId === 'default' ? '' : deviceId;
            try {
                if (audioCtx && typeof audioCtx.setSinkId === 'function') {
                    // Đã phát nhạc ít nhất 1 lần -> audio đang được Web Audio API "giữ",
                    // âm thanh ra loa thật sự qua audioCtx.destination, nên phải đổi sink ở đây
                    await audioCtx.setSinkId(sinkValue);
                } else if (typeof audio.setSinkId === 'function') {
                    // Chưa từng phát nhạc -> audioCtx chưa tồn tại, thẻ <audio> vẫn đang tự
                    // kiểm soát output của chính nó nên đổi trực tiếp ở đây vẫn có tác dụng
                    await audio.setSinkId(sinkValue);
                } else {
                    console.warn('Trình duyệt này không hỗ trợ đổi thiết bị phát âm thanh (cần Chrome/Edge bản mới).');
                }
            } catch (err) {
                console.warn('Không đổi được thiết bị phát âm thanh:', err);
            }
            announceOutput(true);
        }

        async function populateOutputDeviceMenu() {
            outputDeviceMenu.innerHTML = '';
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

            let devices = [];
            try {
                devices = await navigator.mediaDevices.enumerateDevices();
            } catch (err) {
                console.warn('Không liệt kê được thiết bị âm thanh:', err);
                return;
            }

            // Tên thiết bị chỉ hiện đầy đủ khi trang có quyền media -> xin quyền micro tạm
            // thời (không thu âm gì cả, chỉ để mở khoá tên loa) nếu tên đang bị trống
            const hasLabels = devices.some(d => d.kind === 'audiooutput' && d.label);
            if (!hasLabels) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    stream.getTracks().forEach(t => t.stop());
                    devices = await navigator.mediaDevices.enumerateDevices();
                } catch (err) {
                    // Người dùng từ chối quyền hoặc trình duyệt không hỗ trợ -> vẫn hiện danh
                    // sách nhưng có thể thiếu tên loa cụ thể, không sao cả
                }
            }

            const outputs = devices.filter(d => d.kind === 'audiooutput');
            const savedSinkId = localStorage.getItem('settings_output_device') || 'default';
            const defaultDevice = outputs.find(d => d.deviceId === 'default');
            const defaultLabelText = currentLangDict['player.output_default'] || 'Mặc định';
            const defaultFullLabel = defaultDevice && defaultDevice.label
                ? `${defaultLabelText} (${defaultDevice.label})`
                : defaultLabelText;

            const createItem = (deviceId, label, selected) => {
                const item = document.createElement('md-menu-item');
                item.innerHTML = `<div slot="headline">${label}</div>`;
                if (selected) item.setAttribute('selected', '');
                item.addEventListener('click', () => selectOutputDevice(deviceId));
                return item;
            };

            outputDeviceMenu.appendChild(createItem('default', defaultFullLabel, savedSinkId === 'default'));
            outputs
                .filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications')
                .forEach(d => {
                    outputDeviceMenu.appendChild(createItem(d.deviceId, d.label || ('Speaker ' + d.deviceId.slice(0, 6)), savedSinkId === d.deviceId));
                });
        }


        // ===== Tạm thời lặp 1 bài khi mở Metadata/Thumbnail editor (tránh lỗi đổi bài giữa chừng) =====
        let repeatLockSaved = null;
        function applyRepeatUI() {
            const b = document.getElementById('repeat-btn');
            b.classList.toggle('active', repeatMode > 0);
            b.classList.toggle('repeat-one', repeatMode === 2);
            b.querySelector('.material-symbols-rounded').textContent = repeatMode === 2 ? 'repeat_one' : 'repeat';
            if (typeof updatePiPUI === 'function') updatePiPUI();
        }
        function isEditorOpen() {
            const ifr = document.getElementById('metadata-iframe');
            if (ifr && (ifr.style.right === '0' || ifr.style.right === '0px')) return true;
            return ['thumbnail-editor-modal', 'crop-rotate-modal', 'save-thumb-confirm-modal']
                .some(id => { const el = document.getElementById(id); return el && el.classList.contains('open'); });
        }
        function syncRepeatLock() {
            const open = isEditorOpen();
            document.body.classList.toggle('editor-locked', open);
            if (open && repeatLockSaved === null) {
                repeatLockSaved = repeatMode;
                if (repeatMode !== 2) {
                    repeatMode = 2; applyRepeatUI();
                    showToast(currentLangDict['toast.repeat_locked'] || 'Đang chỉnh sửa: tạm thời lặp lại 1 bài', 'repeat_one', 4000);
                }
            } else if (!open && repeatLockSaved !== null) {
                const prev = repeatLockSaved; repeatLockSaved = null;
                if (repeatMode !== prev) {
                    repeatMode = prev; applyRepeatUI();
                    showToast(currentLangDict['toast.repeat_restored'] || 'Đã khôi phục chế độ lặp trước đó', 'repeat', 4000);
                }
            }
        }
        {
            const mo = new MutationObserver(syncRepeatLock);
            ['metadata-iframe', 'thumbnail-editor-modal', 'crop-rotate-modal', 'save-thumb-confirm-modal'].forEach(id => {
                const el = document.getElementById(id);
                if (el) mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
            });
        }

        // ===== Hẹn giờ tạm dừng =====
        const sleepBtn = document.getElementById('sleep-btn');
        const sleepMenu = document.getElementById('sleep-menu');
        const sleepBadge = document.getElementById('sleep-badge');
        const sleepDialog = document.getElementById('sleep-dialog');
        const sleepInput = document.getElementById('sleep-input');
        let sleepState = null, sleepTick = null;
        const slT = (k, f) => currentLangDict[k] || f;
        const fmtN = n => String(Math.round(n * 100) / 100);

        const sleepFb = document.getElementById('sleep-fb');
        let sleepAnimating = false, sleepAnimSeq = 0;
        const slWait = ms => new Promise(r => setTimeout(r, ms));
        function updateSleepUI() {
            if (sleepState) {
                if (sleepState.type === 'time') {
                    const m = Math.max(1, Math.ceil((sleepState.endAt - Date.now()) / 60000));
                    sleepBadge.textContent = m + (currentLangDict['sleep.unit_min'] || 'p');
                } else sleepBadge.textContent = sleepState.remaining + (currentLangDict['sleep.unit_track'] || ' bài');
            } else if (!sleepAnimating) sleepBadge.textContent = '';
            sleepBtn.classList.toggle('sleep-active', !!sleepState && !sleepAnimating);
        }
        // Hiệu ứng nút: mọi thứ thu nhỏ + nút co về kích thước cũ -> icon tick/"x" zoom-in ~1s -> thu nhỏ
        // -> icon đồng hồ hiện lại rồi nút giãn ra hiện số phút/bài còn lại (nếu đang có hẹn giờ)
        async function sleepAnimate(kind) {
            const my = ++sleepAnimSeq;
            sleepAnimating = true;
            sleepFb.textContent = kind === 'cancel' ? 'close' : 'check';
            sleepBtn.classList.remove('sleep-active', 'sl-fb-show');
            sleepBtn.classList.add('sl-hide');
            await slWait(380); if (my !== sleepAnimSeq) return;
            sleepBtn.classList.add('sl-fb-show');
            await slWait(1000); if (my !== sleepAnimSeq) return;
            sleepBtn.classList.remove('sl-fb-show');
            await slWait(300); if (my !== sleepAnimSeq) return;
            sleepBtn.classList.remove('sl-hide');
            await slWait(250); if (my !== sleepAnimSeq) return;
            sleepAnimating = false;
            updateSleepUI();
        }
        function clearSleep(silent) { sleepState = null; clearInterval(sleepTick); sleepTick = null; if (!silent) updateSleepUI(); }
        function fireSleep() {
            const st = sleepState;
            clearSleep();
            try { audio.pause(); } catch (e) {}
            // Hiện hộp thoại (không tự ẩn như toast) để người dùng biết vì sao nhạc tự dừng
            const txt = st && st.type === 'tracks'
                ? slT('sleep.fired_tracks', 'Nhạc đã tự tạm dừng vì hẹn giờ sau {n} bài đã hoàn thành.').replace('{n}', st.total)
                : slT('sleep.fired_time', 'Nhạc đã tự tạm dừng vì hẹn giờ {n} phút đã hết.').replace('{n}', st ? fmtN(st.total) : '');
            document.getElementById('sleep-fired-text').textContent = txt;
            document.getElementById('sleep-fired-dialog').show();
        }
        document.getElementById('sleep-fired-ok').addEventListener('click', () => document.getElementById('sleep-fired-dialog').close());
        function setSleepTime(min, preset) {
            clearSleep(true);
            sleepState = { type: 'time', endAt: Date.now() + min * 60000, preset: preset || 'custom', total: min };
            sleepTick = setInterval(() => {
                if (!sleepState) return;
                if (Date.now() >= sleepState.endAt) fireSleep(); else updateSleepUI();
            }, 1000);
            sleepAnimate('set');
            updateSleepUI();
            showToast(slT('toast.sleep_time_set', 'Sẽ tạm dừng sau {n} phút').replace('{n}', fmtN(min)), 'timer', 4000);
        }
        function setSleepTracks(n) {
            clearSleep(true);
            sleepState = { type: 'tracks', remaining: n, preset: 'custom', total: n };
            sleepAnimate('set');
            updateSleepUI();
            showToast(slT('toast.sleep_tracks_set', 'Sẽ tạm dừng sau {n} bài').replace('{n}', n), 'timer', 4000);
        }
        function sleepDialogSync() {
            const isTracks = Array.from(document.querySelectorAll('#sleep-dialog md-radio')).find(r => r.checked)?.value === 'tracks';
            document.getElementById('sleep-field-label').textContent = isTracks
                ? slT('sleep.label_tracks', 'Nhập số bài sau khi phát sẽ tạm dừng:') : slT('sleep.label_time', 'Hãy nhập thời gian:');
            sleepInput.placeholder = isTracks
                ? slT('sleep.ph_tracks', 'Nhập số tự nhiên khác 0...') : slT('sleep.ph_time', 'Nhập số phút...');
            sleepInput.step = isTracks ? '1' : 'any';
            sleepInput.error = false; sleepInput.errorText = '';
            sleepInput.value = '';
        }
        document.querySelectorAll('#sleep-dialog md-radio').forEach(r => r.addEventListener('change', sleepDialogSync));
        function submitSleepDialog() {
            const isTracks = Array.from(document.querySelectorAll('#sleep-dialog md-radio')).find(r => r.checked)?.value === 'tracks';
            const raw = String(sleepInput.value).trim();
            const num = Number(raw);
            let ok = raw !== '' && isFinite(num) && num > 0;
            if (isTracks) ok = ok && /^\d+$/.test(raw);
            if (!ok) {
                sleepInput.error = true;
                sleepInput.errorText = isTracks ? slT('sleep.err_tracks', 'Hãy nhập số tự nhiên khác 0') : slT('sleep.err_time', 'Hãy nhập số phút lớn hơn 0');
                return;
            }
            sleepDialog.close();
            if (isTracks) setSleepTracks(num); else setSleepTime(num, 'custom');
        }
        document.getElementById('sleep-ok').addEventListener('click', submitSleepDialog);
        document.getElementById('sleep-cancel').addEventListener('click', () => sleepDialog.close());
        sleepInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitSleepDialog(); } });
        document.getElementById('sleep-form').addEventListener('submit', e => e.preventDefault());

        sleepMenu.querySelectorAll('md-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const v = item.dataset.sleep;
                if (v === 'off') {
                    if (sleepState) { sleepAnimate('cancel'); clearSleep(); showToast(slT('toast.sleep_off', 'Đã tắt hẹn giờ tạm dừng'), 'timer_off', 3500); }
                } else if (v === 'custom') {
                    sleepDialogSync();
                    const first = document.querySelector('#sleep-dialog md-radio[value="time"]'); if (first) first.checked = true;
                    sleepDialogSync();
                    sleepDialog.show();
                    setTimeout(() => { try { sleepInput.focus(); } catch (e) {} }, 300);
                } else setSleepTime(parseInt(v, 10), v);
            });
        });
        sleepBtn.addEventListener('click', () => {
            sleepMenu.querySelectorAll('md-menu-item').forEach(item => {
                const v = item.dataset.sleep;
                const sel = sleepState ? (v === sleepState.preset) : v === 'off';
                item.toggleAttribute('selected', sel);
            });
            sleepMenu.open = !sleepMenu.open;
        });


        // ===== Định vị lại menu/dropdown khi giao diện đang zoom (CSS zoom làm md-menu tính sai toạ độ) =====
        // Đo vị trí thực tế của menu rồi dịch (translate) đến đúng chỗ dưới/trên ô neo, và giới hạn chiều cao
        // để không tràn khỏi màn hình. Không phụ thuộc cách trình duyệt tính zoom.
        function fixMenuPlacement(host, anchor) {
            const menu = host.tagName === 'MD-MENU' ? host : (host.shadowRoot && host.shadowRoot.querySelector('md-menu'));
            const surf = menu && menu.shadowRoot && menu.shadowRoot.querySelector('.menu');
            if (!surf || !anchor) return;
            const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
            const pad = 12;
            // Giới hạn chiều cao (đơn vị CSS trong vùng đã zoom)
            menu.style.maxHeight = Math.max(120, Math.min(380, (window.innerHeight - pad * 2) / scale)) + 'px';
            const run = () => {
                if (host !== menu) surf.style.setProperty('min-width', anchor.offsetWidth + 'px', 'important'); // md-select đặt min-width theo px đã zoom -> ép về đúng bằng ô chọn
                surf.style.translate = '0px 0px';
                const a = anchor.getBoundingClientRect();
                const r = surf.getBoundingClientRect();
                const z = surf.offsetWidth ? (r.width / surf.offsetWidth) : scale;
                const w = r.width, h = surf.offsetHeight * z;
                const vw = window.innerWidth, vh = window.innerHeight;
                let top;
                if (a.bottom + h + pad <= vh) top = a.bottom;
                else if (a.top - h - pad >= 0) top = a.top - h;
                else top = Math.max(pad, vh - h - pad);
                let left = Math.min(Math.max(pad, a.left), Math.max(pad, vw - w - pad));
                surf.style.translate = ((left - r.left) / z) + 'px ' + ((top - r.top) / z) + 'px';
            };
            run();
            requestAnimationFrame(run);
        }
        function hookMenuPlacement(host, anchor) {
            const go = () => requestAnimationFrame(() => fixMenuPlacement(host, anchor || host));
            host.addEventListener('opening', go);
            host.addEventListener('opened', go);
        }
        document.querySelectorAll('.m3-select').forEach(sel => hookMenuPlacement(sel, sel));
        hookMenuPlacement(document.getElementById('output-device-menu'), document.getElementById('output-device-btn'));
        hookMenuPlacement(document.getElementById('sleep-menu'), document.getElementById('sleep-btn'));

        outputDeviceBtn.addEventListener('click', async () => {
            await populateOutputDeviceMenu();
            outputDeviceMenu.open = !outputDeviceMenu.open;
        });

        // Khôi phục thiết bị đã lưu lúc khởi động (best-effort, ID thiết bị có thể đổi
        // giữa các phiên/trình duyệt nên có thể không còn khớp, không sao cả nếu vậy)
        (async () => {
            const savedSinkId = localStorage.getItem('settings_output_device');
            if (savedSinkId && savedSinkId !== 'default' && typeof audio.setSinkId === 'function') {
                try { await audio.setSinkId(savedSinkId); } catch (err) { /* Thiết bị có thể không còn tồn tại nữa */ }
            }
        })();

        // --- HỆ THỐNG TỐC ĐỘ PHÁT ---
        const speedBtn = document.getElementById('speed-btn');
        const speedDropdown = document.getElementById('speed-dropdown');
        // .player-shell có backdrop-filter -> tự tạo containing block riêng cho mọi phần
        // tử con position:fixed (đúng theo chuẩn CSS), khiến toạ độ viewport tính bằng JS
        // bị lệch hẳn. Kéo dropdown ra khỏi player-shell, gắn thẳng vào <body> để
        // position:fixed định vị đúng theo viewport thật như mong muốn.
        document.body.appendChild(speedDropdown);
        const speedPreviewLabel = document.getElementById('speed-preview-label');
        const speedPreviewCanvas = document.getElementById('speed-preview-canvas');
        const speedPreviewCtx = speedPreviewCanvas.getContext('2d');
        let currentSpeed = 1;
        let previewSpeed = 1;

        function applyPlaybackSpeed(speed) {
            currentSpeed = speed;
            previewSpeed = speed;
            audio.playbackRate = speed;
            speedBtn.innerText = speed + 'x';
            speedBtn.classList.toggle('active', speed !== 1);
            speedPreviewLabel.innerText = speed + 'x';
            document.querySelectorAll('.speed-option').forEach(el => {
                el.classList.toggle('active', parseFloat(el.dataset.speed) === speed);
            });
            localStorage.setItem('settings_playback_speed', speed);
        }

        // Khôi phục tốc độ đã lưu ở lần dùng trước (mặc định 1x nếu chưa từng lưu)
        const persistedSpeed = parseFloat(localStorage.getItem('settings_playback_speed'));
        applyPlaybackSpeed(!isNaN(persistedSpeed) && persistedSpeed > 0 ? persistedSpeed : 1);

        // Vẽ minh hoạ trực quan: 1 quả bóng chạy qua lại trên đường ray, tốc độ chạy tỉ
        // lệ đúng theo previewSpeed đang xem thử -> người dùng "thấy" được tốc độ chứ
        // không chỉ đọc số. Chỉ chạy khi dropdown đang mở để khỏi tốn CPU lúc ẩn.
        let speedPreviewRunning = false;
        let speedPreviewStartTs = null;
        function drawSpeedPreview(ts) {
            if (!speedDropdown.classList.contains('show')) { speedPreviewRunning = false; return; }
            if (speedPreviewStartTs === null) speedPreviewStartTs = ts;
            const elapsed = (ts - speedPreviewStartTs) / 1000;

            const w = speedPreviewCanvas.width, h = speedPreviewCanvas.height;
            speedPreviewCtx.clearRect(0, 0, w, h);

            speedPreviewCtx.strokeStyle = 'rgba(255,255,255,0.18)';
            speedPreviewCtx.lineWidth = 2;
            speedPreviewCtx.beginPath();
            speedPreviewCtx.moveTo(8, h / 2);
            speedPreviewCtx.lineTo(w - 8, h / 2);
            speedPreviewCtx.stroke();

            // 1 vòng qua-lại mất 2 giây ở tốc độ 1x, nhanh/chậm theo đúng previewSpeed
            const cyclesPerSecond = 0.5 * previewSpeed;
            const phase = (elapsed * cyclesPerSecond) % 1;
            const triWave = phase < 0.5 ? phase * 2 : 2 - phase * 2; // sóng tam giác 0->1->0, chạy đều 2 chiều
            const x = 10 + triWave * (w - 20);

            const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim() || '#D0BCFF';
            speedPreviewCtx.fillStyle = accentColor;
            speedPreviewCtx.beginPath();
            speedPreviewCtx.arc(x, h / 2, 6, 0, Math.PI * 2);
            speedPreviewCtx.fill();

            requestAnimationFrame(drawSpeedPreview);
        }
        function startSpeedPreviewAnim() {
            if (speedPreviewRunning) return;
            speedPreviewRunning = true;
            speedPreviewStartTs = null;
            requestAnimationFrame(drawSpeedPreview);
        }

        // Định vị dropdown theo toạ độ thật của màn hình: ưu tiên mở lên trên nút, tự
        // đổi xuống dưới nếu không đủ chỗ phía trên; kẹp theo chiều ngang để không bao
        // giờ tràn ra ngoài mép trái/phải màn hình, bất kể tỉ lệ/kích thước màn hình.
        function positionSpeedDropdown() {
            speedDropdown.style.visibility = 'hidden';
            speedDropdown.classList.add('show');

            const margin = 10;
            const vw = window.innerWidth, vh = window.innerHeight;
            const btnRect = speedBtn.getBoundingClientRect();
            const ddRect = speedDropdown.getBoundingClientRect();

            const spaceAbove = btnRect.top;
            const spaceBelow = vh - btnRect.bottom;
            let top = (spaceAbove >= ddRect.height + margin || spaceAbove >= spaceBelow)
                ? btnRect.top - ddRect.height - margin
                : btnRect.bottom + margin;
            top = Math.max(margin, Math.min(top, vh - ddRect.height - margin));

            let left = btnRect.left + btnRect.width / 2 - ddRect.width / 2;
            left = Math.max(margin, Math.min(left, vw - ddRect.width - margin));

            speedDropdown.style.top = top + 'px';
            speedDropdown.style.left = left + 'px';
            speedDropdown.style.visibility = '';
            speedDropdown.classList.remove('show');
        }

        speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !speedDropdown.classList.contains('show');
            if (willOpen) {
                positionSpeedDropdown();
                speedDropdown.classList.add('show');
                startSpeedPreviewAnim();
            } else {
                speedDropdown.classList.remove('show');
            }
        });
        document.addEventListener('click', () => {
            speedDropdown.classList.remove('show');
        });
        window.addEventListener('resize', () => {
            if (speedDropdown.classList.contains('show')) positionSpeedDropdown();
        });
        document.querySelectorAll('.speed-option').forEach(el => {
            // Rê chuột qua option nào thì minh hoạ + nhãn hiện thử tốc độ đó, rời chuột
            // ra thì trả lại đúng tốc độ đang thực sự áp dụng
            el.addEventListener('mouseenter', () => {
                previewSpeed = parseFloat(el.dataset.speed);
                speedPreviewLabel.innerText = el.dataset.speed + 'x';
            });
            el.addEventListener('mouseleave', () => {
                previewSpeed = currentSpeed;
                speedPreviewLabel.innerText = currentSpeed + 'x';
            });
            el.addEventListener('click', () => {
                applyPlaybackSpeed(parseFloat(el.dataset.speed));
                speedDropdown.classList.remove('show');
            });
        });

        // --- STREAMING_CHUNK:Configuring smart audio volume controls... ---
        // --- HỆ THỐNG ĐIỀU CHỈNH LOA & ÂM LƯỢNG THÔNG MINH ---
        // Khôi phục mức âm lượng đã lưu ở lần dùng trước (mặc định 80% nếu chưa từng lưu)
        const persistedVolPercent = parseFloat(localStorage.getItem('settings_volume'));
        const initialVolPercent = isNaN(persistedVolPercent) ? 80 : Math.min(100, Math.max(0, persistedVolPercent));
        audio.volume = initialVolPercent / 100;
        volumeSlider.value = initialVolPercent;

        let savedVolume = audio.volume > 0 ? audio.volume : 0.8;
        let isMuted = audio.volume === 0;

        function toggleMute() {
            const muteBtnIcon = document.getElementById('mute-btn').querySelector('span');
            if (!isMuted) {
                savedVolume = audio.volume > 0 ? audio.volume : 0.8;
                audio.volume = 0;
                volumeSlider.value = 0;
                muteBtnIcon.innerText = 'volume_off';
                isMuted = true;
            } else {
                audio.volume = savedVolume;
                volumeSlider.value = savedVolume * 100;
                muteBtnIcon.innerText = savedVolume > 0.5 ? 'volume_up' : 'volume_down';
                isMuted = false;
            }
            updateSliderFill(volumeSlider);
            localStorage.setItem('settings_volume', volumeSlider.value);
        }

        document.getElementById('mute-btn').addEventListener('click', toggleMute);

        volumeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            audio.volume = val / 100;
            updateSliderFill(volumeSlider);
            
            const muteBtnIcon = document.getElementById('mute-btn').querySelector('span');
            if (audio.volume === 0) {
                muteBtnIcon.innerText = 'volume_off';
                isMuted = true;
            } else {
                muteBtnIcon.innerText = audio.volume > 0.5 ? 'volume_up' : 'volume_down';
                isMuted = false;
                savedVolume = audio.volume; // Ghi đè âm lượng ghi nhớ bằng giá trị kéo hiện tại
            }
            localStorage.setItem('settings_volume', val);
        });

        // Đồng bộ icon loa + thanh trượt khớp với mức âm lượng vừa khôi phục ở trên
        document.getElementById('mute-btn').querySelector('span').innerText =
            isMuted ? 'volume_off' : (audio.volume > 0.5 ? 'volume_up' : 'volume_down');
        updateSliderFill(volumeSlider);

        const hideLoading = () => {
            const loader = document.getElementById('loading-overlay');
            loader.style.opacity = '0';
            setTimeout(() => loader.style.visibility = 'hidden', 500);
        };
        window.addEventListener('load', hideLoading);
        setTimeout(hideLoading, 1500);


        // --- Nhận tệp từ app khác cùng origin (Photos): thêm thẳng vào danh sách phát ---
        // Cách 1 (Media Player đang mở): BroadcastChannel 'media-player-handoff' nhận {type:'enqueue', id, handles}, trả {type:'ack', id}.
        // Cách 2 (Media Player chưa mở): Photos lưu handle vào IndexedDB 'media-handoff' rồi mở ?handoff=1; trang này đọc và xoá khi khởi động.
        (function () {
            const vi = (localStorage.getItem('settings_language') || 'vi') !== 'en';
            const T = {
                added: n => vi ? `Đã thêm ${n} tệp từ Photos vào danh sách phát` : `Added ${n} file(s) from Photos to the queue`,
                denied: vi ? 'Bấm vào bất kỳ đâu để cấp quyền đọc tệp từ Photos' : 'Click anywhere to allow reading the files from Photos',
                fail: vi ? 'Không đọc được tệp từ Photos' : 'Could not read the files from Photos'
            };
            let retry = null;
            // Đánh dấu đã cài thành PWA (cùng origin) để Photos biết có thể mở bằng protocol web+mediaplayer
            try { if (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches) localStorage.setItem('mp_pwa', '1'); } catch (e) {}
            async function toFiles(items, ask) {
                const out = []; let denied = false;
                for (const h of items) {
                    try {
                        if (h && h.kind === 'file') {
                            if (h.queryPermission && await h.queryPermission({ mode: 'read' }) !== 'granted') {
                                if (!ask || (await h.requestPermission({ mode: 'read' })) !== 'granted') { denied = true; continue; }
                            }
                            const f = await h.getFile(); f.fileHandle = h; out.push(f);
                        } else if (h instanceof File) out.push(h);
                    } catch (e) { denied = true; }
                }
                return { out, denied };
            }
            async function enqueue(items, ask) {
                const { out, denied } = await toFiles(items, ask);
                if (out.length) {
                    await handleFiles(out);   // đúng chức năng thêm bài: thêm, chuyển tới bài vừa thêm (phát) và tự cuộn tới bài đó
                    showToast(T.added(out.length), 'playlist_add');
                }
                if (denied && !out.length) {
                    showToast(T.denied, 'lock');
                    if (retry) document.removeEventListener('click', retry);
                    retry = () => { retry = null; enqueue(items, true).catch(() => showToast(T.fail, 'error')); };
                    document.addEventListener('click', retry, { once: true });
                }
            }
            try {
                const bc = new BroadcastChannel('media-player-handoff');
                // Trang mở bằng ?handoff=focus chỉ để "đánh thức" cửa sổ cũ: nếu đã có bản khác đang chạy thì tự đóng
                const probe = /[?&]handoff=focus/.test(location.search);
                if (probe) {
                    const pid = 'p' + Date.now();
                    const pc = new BroadcastChannel('media-player-handoff');
                    pc.onmessage = e => { if (e.data && e.data.type === 'pong' && e.data.id === pid) { try { window.close(); } catch (err) {} } };
                    pc.postMessage({ type: 'ping', id: pid });
                    setTimeout(() => { pc.close(); history.replaceState(null, '', location.pathname); }, 1500);
                }
                bc.onmessage = e => {
                    const d = e.data;
                    if (d && d.type === 'ping' && !probe) { window.focus(); bc.postMessage({ type: 'pong', id: d.id }); return; }
                    if (!d || d.type !== 'enqueue' || !Array.isArray(d.handles)) return;
                    try { if (localStorage.getItem('mp_handoff_seen') === d.id) return; localStorage.setItem('mp_handoff_seen', d.id); } catch (err) {}
                    bc.postMessage({ type: 'ack', id: d.id });
                    enqueue(d.handles, false);
                };
            } catch (e) {}
            async function takePending() {
                const db = await new Promise((res, rej) => {
                    const r = indexedDB.open('media-handoff', 1);
                    r.onupgradeneeded = () => r.result.createObjectStore('queue', { autoIncrement: true });
                    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
                });
                return new Promise((res, rej) => {
                    const t = db.transaction('queue', 'readwrite'), st = t.objectStore('queue'), rq = st.getAll();
                    rq.onsuccess = () => { st.clear(); };
                    t.oncomplete = () => { db.close(); res(rq.result || []); }; t.onerror = t.onabort = () => rej(t.error);
                });
            }
            window.addEventListener('load', () => setTimeout(async () => {
                try {
                    const rows = (await takePending()).filter(r => r && Date.now() - r.t < 5 * 60 * 1000);
                    const items = rows.flatMap(r => r.items || []);
                    if (rows.length) { try { const ack = new BroadcastChannel('media-player-handoff'); rows.forEach(r => r.id && ack.postMessage({ type: 'ack', id: r.id })); setTimeout(() => ack.close(), 500); } catch (e) {} }
                    if (items.length) await enqueue(items, false);
                    if (/[?&]handoff=1/.test(location.search)) history.replaceState(null, '', location.pathname);
                } catch (e) {}
            }, 700));
        })();

        if ('launchQueue' in window) {
            window.launchQueue.setConsumer((params) => {
                if (params.files && params.files.length) {
                    // params.files là FileSystemFileHandle thật (đến từ hệ điều hành khi
                    // double-click mở file bằng app), nên phải gắn lại .fileHandle để
                    // ghi thẳng vào file gốc được, giống hệt flow "Chọn file" và kéo-thả.
                    Promise.all(params.files.map(async (h) => {
                        const file = await h.getFile();
                        file.fileHandle = h;
                        return file;
                    })).then(handleFiles);
                }
            });
        }

        // Tỉ lệ video để khung hình trên điện thoại khớp đúng video
        (function () {
            const root = document.documentElement;
            // Tính kích thước khung video đúng tỉ lệ (ngang hay dọc) vừa trong vùng trống, không méo, không viền đen
            const fit = () => {
                const mc = document.querySelector('.main-content');
                if (!(root.classList.contains('m-ui') && document.body.classList.contains('has-video') && !document.body.classList.contains('fullscreen-active') && audio.videoWidth && audio.videoHeight && mc)) {
                    root.style.removeProperty('--stage-w'); root.style.removeProperty('--stage-h'); return;
                }
                const ar = audio.videoWidth / audio.videoHeight;
                const cw = mc.clientWidth, ch = mc.clientHeight;
                if (!cw || !ch) return;
                const w = Math.min(cw, ch * ar);
                root.style.setProperty('--stage-w', Math.floor(w) + 'px');
                root.style.setProperty('--stage-h', Math.floor(w / ar) + 'px');
            };
            const upd = () => { if (audio.videoWidth && audio.videoHeight) root.style.setProperty('--vid-ar', audio.videoWidth + ' / ' + audio.videoHeight); fit(); };
            ['loadedmetadata', 'resize'].forEach(ev => audio.addEventListener(ev, upd));
            window.addEventListener('resize', fit);
            try { new ResizeObserver(fit).observe(document.querySelector('.main-content')); } catch (e) {}
            new MutationObserver(fit).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        })();


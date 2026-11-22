const CACHE_PREFIX = 'media-player-';
const LEGACY_PREFIX = 'audio-player-';   // tên cũ trước khi đổi sang Media Player, để dọn cache cũ
const CACHE_VERSION = 'v2026_11_23_resume_after_idle';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './css/app.css',
  './language/vi.lang',
  './language/en.lang',
  './js/01-theme-fonts.js',
  './js/02-player-core.js',
  './js/03-audio-engine.js',
  './js/04-mobile-ui.js',
  './js/05-android-bridge.js',
  './js/06-pip.js',
  './js/07-settings-i18n.js',
  './js/08-seek-wave-pwa.js',
  './js/09-editors-info.js',
  './js/10-fullscreen-hotkeys.js',
  './js/11-liked.js',
  './index_md1.html',
  './index_indev.html',
  './changelog.html',
  './changelog_indev.html',
  './about.html',
  './getting_started.html',
  './404.html',
  './manifest.json',
  './manifest_md1.json',
  './minecraft.ttf',
  './MinecraftTen-VGORe.ttf',
  './error.png',
  './error-dark.png',
  './music_note.png'
];

const CDN_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'esm.run',
  'tuanphong3108.github.io',
  'cdn.tailwindcss.com',
  'unpkg.com',
  'code.jquery.com'
]);

// Link CSS phông chữ cần có sẵn khi offline (tải best-effort lúc cài đặt)
const FONT_CSS_PRECACHE = [
  'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@100..1000&display=swap',
  'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght,ROND@100..1000,0..100&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
];

const CACHEABLE_DESTINATIONS = new Set([
  'script',
  'style',
  'font',
  'image',
  'worker'
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(APP_SHELL);
    const rt = await caches.open(RUNTIME_CACHE);
    await Promise.all(FONT_CSS_PRECACHE.map(url =>
      fetch(new Request(url, { mode: 'no-cors' })).then(res => rt.put(url, res)).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => (name.startsWith(CACHE_PREFIX) || name.startsWith(LEGACY_PREFIX)) && name !== SHELL_CACHE && name !== RUNTIME_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      try { c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }); } catch (e) {}
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  const isSameOrigin = requestUrl.origin === scopeUrl.origin;

  if (request.mode === 'navigate' && isSameOrigin) {
    event.respondWith(staleWhileRevalidateNavigation(request));
    return;
  }

  // File ngôn ngữ / changelog nạp bằng fetch() có destination rỗng -> trước đây không qua SW nên offline là hỏng (rơi về tiếng Việt)
  if (isSameOrigin && /\.lang$/i.test(requestUrl.pathname) && requestUrl.href.startsWith(scopeUrl.href)) {
    event.respondWith(networkFirstWithTimeout(request, 3000));
    return;
  }

  const isAllowedCdn = !isSameOrigin && CDN_HOSTS.has(requestUrl.hostname);
  if (!CACHEABLE_DESTINATIONS.has(request.destination) || (!isSameOrigin && !isAllowedCdn)) return;

  if (isSameOrigin) {
    event.respondWith(staleWhileRevalidateAsset(request));
  } else {
    event.respondWith(cacheFirstAsset(request));
  }
});

async function staleWhileRevalidateNavigation(request) {
  const shellCache = await caches.open(SHELL_CACHE);
  const cachedPage = await caches.match(request);
  const networkPromise = fetch(request).then(async (response) => {
    if (response && response.ok) {
      await shellCache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  if (cachedPage) {
    eventOrBackground(networkPromise);
    return cachedPage;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  const indexUrl = new URL('./index.html', self.registration.scope);
  const cachedIndex = await caches.match(indexUrl.href);
  if (cachedIndex) return cachedIndex;

  return new Response('Bạn đang offline và trang này chưa được lưu trên thiết bị.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// Ưu tiên bản mới nhất; mạng chậm/offline quá 3 giây thì trả bản đã lưu ngay
async function networkFirstWithTimeout(request, ms) {
  const cache = await caches.open(RUNTIME_CACHE);
  const net = fetch(request).then(async (response) => {
    if (response && response.ok) { try { await cache.put(request, response.clone()); } catch (e) {} }
    return response;
  });
  const cachedLookup = () => caches.match(request);
  try {
    return await Promise.race([
      net,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
  } catch (e) {
    const cached = await cachedLookup();
    if (cached) { net.catch(() => {}); return cached; }
    try { return await net; } catch (e2) { return Response.error(); }
  }
}

async function staleWhileRevalidateAsset(request) {
  const cachedResponse = await caches.match(request);
  const fetchPromise = fetch(request).then(async (response) => {
    if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
      const runtimeCache = await caches.open(RUNTIME_CACHE);
      await runtimeCache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  if (cachedResponse) {
    eventOrBackground(fetchPromise);
    return cachedResponse;
  }
  const networkResponse = await fetchPromise;
  return networkResponse || Response.error();
}

function eventOrBackground(promise) {
  try { promise.catch(() => {}); } catch (e) {}
}

async function cacheFirstAsset(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  const response = await fetch(request);
  const isCdn = CDN_HOSTS.has(new URL(request.url).hostname);
  // <link rel="stylesheet"> tới Google Fonts là no-cors -> response "opaque" (ok=false), vẫn phải cache
  const cacheable = (response.ok && (response.type === 'basic' || response.type === 'cors'))
    || (isCdn && response.type === 'opaque');
  if (cacheable) {
    const runtimeCache = await caches.open(RUNTIME_CACHE);
    await runtimeCache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const scopeUrl = new URL(self.registration.scope);
    const requestedUrl = event.notification.data?.url;
    let targetUrl = scopeUrl.href;

    if (requestedUrl) {
      const candidate = new URL(requestedUrl, scopeUrl);
      if (candidate.origin === scopeUrl.origin && candidate.href.startsWith(scopeUrl.href)) {
        targetUrl = candidate.href;
      }
    }

    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (new URL(client.url).origin === scopeUrl.origin && 'focus' in client) {
        if ('navigate' in client && client.url !== targetUrl) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

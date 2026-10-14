const CACHE_PREFIX = 'audio-player-';
const CACHE_VERSION = 'v2026_10_14_201302-add-feature';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
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
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
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
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE && name !== RUNTIME_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  const isSameOrigin = requestUrl.origin === scopeUrl.origin;

  if (request.mode === 'navigate' && isSameOrigin) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isAllowedCdn = !isSameOrigin && CDN_HOSTS.has(requestUrl.hostname);
  if (!CACHEABLE_DESTINATIONS.has(request.destination) || (!isSameOrigin && !isAllowedCdn)) return;

  event.respondWith(cacheFirstAsset(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const shellCache = await caches.open(SHELL_CACHE);
      await shellCache.put(request, response.clone());
    }
    return response;
  } catch {
    const cachedPage = await caches.match(request);
    if (cachedPage) return cachedPage;

    const indexUrl = new URL('./index.html', self.registration.scope);
    const cachedIndex = await caches.match(indexUrl.href);
    if (cachedIndex) return cachedIndex;

    return new Response('Bạn đang offline và trang này chưa được lưu trên thiết bị.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
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

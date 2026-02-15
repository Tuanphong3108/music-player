const CACHE_NAME = 'studio-pro-v5';

// ===== FILE TĨNH PRECACHE =====
const STATIC_ASSETS = [
  './',
  './index.html',
  './index_md1.html',
  './manifest.json',
  './music_note.png',

  // assets ngoài nhưng ổn định
  'https://tuanphong3108.github.io/md3-loading/Loading_Indicator.gif',
  'https://tuanphong3108.github.io/google-sans-do-not-access/minecraft.ttf'
];


// ===== INSTALL =====
self.addEventListener('install', (e) => {
  self.skipWaiting();

  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});


// ===== ACTIVATE =====
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});


// ===== FETCH – CACHE EVERYTHING POSSIBLE =====
self.addEventListener('fetch', (e) => {
  const req = e.request;

  e.respondWith(
    caches.match(req).then(cached => {
      // 1. Có cache → trả luôn
      if (cached) return cached;

      // 2. Không có → thử network
      return fetch(req)
        .then(res => {

          // Chỉ cache request GET hợp lệ
          if (req.method === 'GET') {
            const clone = res.clone();

            caches.open(CACHE_NAME)
              .then(cache => cache.put(req, clone));
          }

          return res;
        })
        .catch(() => {
          // 3. Offline hoàn toàn → fallback navigation
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

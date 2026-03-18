const CACHE_NAME = 'music-player-v2026.03.18';

// ===== FILE TĨNH PRECACHE =====
const STATIC_ASSETS = [
  './',
  './index.html',
  './index_md1.html',
  './manifest.json',
  './music_note.png',
  'https://tuanphong3108.github.io/md3-loading/Loading_Indicator.gif',
  'https://tuanphong3108.github.io/google-sans-do-not-access/minecraft.ttf'
];

// ===== INSTALL =====
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// ===== ACTIVATE - DỌN RÁC CACHE CŨ =====
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ===== FETCH – CACHE MỌI THỨ CHO MẸ DÙNG OFFLINE =====
self.addEventListener('fetch', (e) => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req).then(res => {
        // Chỉ cache request GET hợp lệ (tránh cache mấy cái rác)
        if (req.method === 'GET' && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ===== SINGLETON LOGIC - GỘP CỬA SỔ KHI MẸ BẤM NOTIFICATION HOẶC ICON =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow('./');
      })
  );
});

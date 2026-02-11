const CACHE_NAME = 'studio-pro-v1';

// Danh sách tài nguyên cần cache để chạy offline hoàn hảo
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './music_note.png',
  // Assets từ GitHub của bro
  'https://tuanphong3108.github.io/md3-loading/Loading_Indicator.gif',
  'https://tuanphong3108.github.io/google-sans-do-not-access/minecraft.ttf',
  // Google Fonts & Material Symbols (Hệ thống icon và font chữ)
  'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@100..1000&display=swap',
  'https://fonts.material.com/icon?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

// Cài đặt Service Worker và cache tài nguyên
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Ép SW mới hoạt động ngay lập tức
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Kích hoạt và dọn dẹp cache cũ để giải phóng bộ nhớ cho con OPPO A6x
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Phản hồi các yêu cầu từ cache (Cache First strategy)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).then((response) => {
        // Nếu là request thành công, có thể cân nhắc cache thêm vào đây
        return response;
      });
    })
  );
});

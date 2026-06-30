/*
 * service-worker.js — 离线缓存（只缓存程序文件，不碰用户数据；数据在 IndexedDB）
 * 改动代码后，把 CACHE 版本号 +1，旧缓存会自动清理。
 */
const CACHE = 'thermo-v9';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './js/store.js',
  './js/cycle.js',
  './js/icons.js',
  './js/chart.js',
  './js/views.js',
  './js/app.js',
  './manifest.json',
  './调理主页.html',
  './脂肪燃烧卡.html',
  './脂肪燃烧卡.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 网络优先：在线时总取最新，更新即时生效；离线时回退到缓存（仍可离线用）
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});

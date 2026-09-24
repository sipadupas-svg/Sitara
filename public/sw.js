// SITARA — Service Worker: cache-first untuk aset, network-first untuk API
const VERSION = 'sitara-v1.8.1';
const STATIC_CACHE = `${VERSION}-static`;
const API_CACHE = `${VERSION}-api`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/css/fonts.css',
  '/css/app.css',
  '/js/app.js',
  '/js/api.js',
  '/js/idb.js',
  '/js/ui.js',
  '/js/scan.js',
  '/js/pages.js',
  '/js/pages-sambutan.js',
  '/js/pages-barang.js',
  '/js/pages-pegawai.js',
  '/js/pages-scan.js',
  '/js/pages-labels.js',
  '/js/pages-ajukan.js',
  '/js/pages-riwayat.js',
  '/js/pages-import.js',
  '/js/pages-laporan.js',
  '/js/pages-users.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png'
];

// Catatan: /vendor/*.js (ZXing 336 kB, QRCode 57 kB) sengaja TIDAK diprecache
// agar pemasangan/aktivasi tidak berebut bandwidth saat pembukaan pertama.
// Keduanya tetap tersimpan otomatis (cache-first) begitu dipakai halaman
// Scan/Label, sehingga offline tetap berjalan setelah sekali dibuka.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => Promise.allSettled(CORE_ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigasi halaman: network-first, fallback cache (shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // API: network-first + cache fallback (data terakhir tetap tampil offline)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(API_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Font Google & aset statis: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          const cacheName = url.hostname.includes('fonts') ? API_CACHE : STATIC_CACHE;
          caches.open(cacheName).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});

// Terima pesan dari halaman (mis. trigger sync nanti)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Chaajao Technologies — Service Worker
// Offline support + caching for PWA

const CACHE_NAME = 'chaajao-analytics-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap'
];

// Install: cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network first, fallback to cache
self.addEventListener('fetch', e => {
  // Don't cache Google Sheets API calls
  if (e.request.url.includes('docs.google.com')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Clone and cache the response
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => {
          if (e.request.method === 'GET') {
            cache.put(e.request, clone);
          }
        });
        return res;
      })
      .catch(() => {
        return caches.match(e.request);
      })
  );
});

/* Chaajao Analytics - Service Worker
   Version CONFIG.version se aata hai (js/config.js). Version badlo => naya cache => clean update.
   - Static files: cache-first (precached, versioned cache)
   - Google Sheet data: network-first, internet na ho to aakhri saved copy
   - Update: naya SW "waiting" mein rehta hai; page par "Update" button dabane par hi activate hota hai. */
importScripts('./js/config.js');

const STATIC_CACHE = 'chaajao-static-' + CONFIG.version;
const DATA_CACHE = 'chaajao-data-s' + CONFIG.schemaVersion;
const PRECACHE = [
  './', './index.html', './css/app.css',
  './js/config.js', './js/data.js', './js/app.js',
  './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-192-maskable.png', './icons/icon-512-maskable.png', './icons/apple-touch-icon.png'
];
const SHEET_HOSTS = ['docs.google.com', 'googleusercontent.com'];
const isSheet = (url) => SHEET_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // cache:'reload' => GitHub Pages ka HTTP cache bypass, hamesha taaza files
      Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' }))))
    )
  );
  // skipWaiting jaan boojh kar nahi: user "Update" dabaye to message aata hai (neeche)
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function networkFirstSheet(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await withTimeout(fetch(request), CONFIG.sheet.timeoutMs);
    // sirf asli CSV/JSON jawab save karo (login ka HTML page nahi)
    const type = res.headers.get('content-type') || '';
    if (res.ok && !/text\/html/i.test(type)) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) {
      // page ko batao ke ye purani saved copy hai (taake wo "taaza" na samjhe)
      const headers = new Headers(hit.headers);
      headers.set('x-chaajao-cache', '1');
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
    }
    throw err;
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isSheet(url)) { event.respondWith(networkFirstSheet(req)); return; }
  if (url.origin === self.location.origin) event.respondWith(cacheFirstStatic(req));
});

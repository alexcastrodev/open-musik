const SHELL_CACHE = 'musik-shell-v1';
const AUDIO_CACHE = 'musik-audio-v1';
const AUDIO_CACHE_LIMIT = 10;
const PRECACHE_URLS = ['/', '/manifest.json', '/icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== AUDIO_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

async function cacheAudioUrl(url) {
  if (!url) return;
  const cache = await caches.open(AUDIO_CACHE);

  const existing = await cache.match(url);
  if (existing) return;

  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok || response.status === 206) return;
    await cache.put(url, response);

    const keys = await cache.keys();
    if (keys.length > AUDIO_CACHE_LIMIT) {
      await cache.delete(keys[0]);
    }
  } catch (_) {}
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_AUDIO' && event.data.url) {
    cacheAudioUrl(event.data.url);
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Audio from SeaweedFS: cache-first (url is stable s3_url, no expiry)
  if (event.request.destination === 'audio') {
    event.respondWith(
      caches.match(event.request.url).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then(async (response) => {
            if (response.ok && response.status !== 206) {
              const cache = await caches.open(AUDIO_CACHE);
              await cache.put(event.request.url, response.clone());
              const keys = await cache.keys();
              if (keys.length > AUDIO_CACHE_LIMIT) await cache.delete(keys[0]);
            }
            return response;
          })
          .catch(() => caches.match(event.request.url));
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Network-first for HTML navigation
  if (
    event.request.mode === 'navigate' ||
    event.request.headers.get('Accept')?.includes('text/html')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets
  if (url.pathname.match(/\.(js|css|png|svg|ico|woff2?|ttf|eot)(\?.*)?$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

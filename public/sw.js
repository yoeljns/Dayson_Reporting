// Dayson Raporlama — service worker (v3).
// Network-first everywhere so deploys are never masked by a stale cache. Pages
// that loaded successfully are kept as an offline fallback (same URL, query
// ignored), so a rep who opened the visit screens online can reopen them in
// the field without signal. Login/auth pages are never cached.

const CACHE = "dayson-v3";
const OFFLINE_URL = "/offline.html";
const NEVER_CACHE = [/^\/login/, /^\/auth/, /^\/setup/, /^\/api\//];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => caches.open(CACHE).then((c) => c.add(OFFLINE_URL)))
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase etc.
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only plain successful HTML — a redirect (to /login) must not be
          // stored as the page.
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((hit) => hit || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Static assets / RSC payloads: network-first, cache successful responses.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: false }))
  );
});

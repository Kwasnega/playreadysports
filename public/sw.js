const CACHE = "prs-v1";
const STATIC = ["/", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// FIX: PrivateMatchJoin - Bypass service worker for Supabase API calls
// Never intercept Supabase requests - let them go straight to network
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  
  // Bypass service worker for asset files (dynamic imports) to avoid stale cache issues
  if (url.pathname.startsWith('/assets/')) {
    return;
  }
  
  // Only cache same-origin GET requests
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
      return cached ?? network;
    })
  );
});

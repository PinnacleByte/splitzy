// Minimal, safe offline shell for Splitzy.
// It deliberately stays out of the way of Next.js: it never touches /_next/
// assets or React Server Component (RSC) navigation requests, so client-side
// navigation always goes straight to the network.
const CACHE = "splitzy-v2";
const APP_SHELL = ["/", "/activity", "/account", "/new", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass through anything we must not interfere with:
  //  - non-GET, cross-origin
  //  - Next.js internals (/_next/) and RSC data requests
  if (
    request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.startsWith("/_next/") ||
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    (request.headers.get("accept") || "").includes("text/x-component")
  ) {
    return; // let the browser handle it normally
  }

  // Full-page navigations: always try the network; fall back to the cached
  // shell only when genuinely offline. Never reject.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  // Static assets (icon, manifest): cache-first, then network.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached); // never throw
    }),
  );
});

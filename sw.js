/* Road to £20k service worker: makes the app open with no signal.
   The page is fetched fresh when online (so updates arrive), and served from the phone's cache when not. */
const VERSION = "v1";
const SHELL = "r20k-shell-" + VERSION;
const FONTS = "r20k-fonts";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "maskable-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("r20k-shell-") && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms){ return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fonts: use the cached copy, refresh in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // The page itself: network first (3 s limit for weak train signal), then cache.
  if (req.mode === "navigate"){
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      try {
        const r = await Promise.race([fetch(req), timeout(3000)]);
        if (r.ok) c.put("index.html", r.clone());
        return r;
      } catch(err){
        return (await c.match("index.html")) || (await c.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Icons and manifest: cache first.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok){ const copy = r.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
    return r;
  })));
});

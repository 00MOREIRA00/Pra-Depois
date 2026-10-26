// Service worker: deixa o app abrir offline.
// Ao mudar qualquer arquivo listado em ASSETS, aumente VERSION para os aparelhos baixarem a nova versão.
const VERSION = "v3";
const CACHE = `pra-depois-${VERSION}`;
const FONT_CACHE = "pra-depois-fonts";
const ASSETS = [
  "./",
  "index.html",
  "css/styles.css",
  "js/app.js",
  "js/utils.js",
  "js/store.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Fontes do Google: usa o cache e atualiza em segundo plano.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((res) => {
          if (res.ok || res.type === "opaque") cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navegação (inclui ?share=1): rede primeiro, cache se estiver offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
        }
        return res;
      }).catch(() => caches.match("index.html")),
    );
    return;
  }

  // Arquivos do app: cache primeiro.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});

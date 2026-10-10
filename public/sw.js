// Service worker: la app abre sin conexión después de la primera visita.
// Red primero: con conexión siempre se usa (y se guarda) la versión nueva,
// así un deploy llega enseguida; sin conexión, o si la red tarda más de 4 s,
// se usa la copia guardada. Los datos offline los maneja Firestore aparte.

const CACHE = "mj-v1";
const SDK = "https://www.gstatic.com/firebasejs/12.3.0";

// Todo lo necesario para abrir cualquier sección sin red. Si falta algún
// archivo nuevo acá, igual se guarda la primera vez que se usa.
const SHELL = [
  "./", "index.html", "css/styles.css", "manifest.webmanifest", "icon.svg",
  "js/app.js", "js/config.js", "js/habits.js", "js/store.js",
  ...["activity", "apis", "collections", "coverSheet", "dates", "deezer", "image", "luz",
    "prefs", "presence", "shelf", "sky", "tracks", "ui"].map((f) => `js/lib/${f}.js`),
  ...["coleccion", "coleccionPropia", "home", "juego", "misc", "musica", "notas", "registro", "stats"]
    .map((f) => `js/views/${f}.js`),
  `${SDK}/firebase-app.js`, `${SDK}/firebase-firestore.js`, `${SDK}/firebase-auth.js`,
];

self.addEventListener("install", (e) => {
  // Uno por uno: si un archivo falla, el resto igual queda guardado.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const cacheable = (url) =>
  (url.origin === location.origin && !url.pathname.startsWith("/__/"))
  || url.href.startsWith(SDK)
  || url.origin === "https://fonts.googleapis.com";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Archivos de fuentes: no cambian nunca, caché primero.
  if (url.origin === "https://fonts.gstatic.com") return e.respondWith(cacheFirst(req));
  if (cacheable(url)) e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const fresh = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  });
  fresh.catch(() => {}); // si gana la copia, el error de red no importa
  const slow = new Promise((ok) => setTimeout(ok, 4000));
  try {
    const res = await Promise.race([fresh, slow.then(() => null)]);
    if (res) return res;
  } catch { /* sin conexión */ }
  const copy = await cache.match(req, { ignoreSearch: req.mode === "navigate" })
    || (req.mode === "navigate" ? await cache.match("index.html") : null);
  return copy || fresh; // sin copia: esperar a la red de todas formas
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

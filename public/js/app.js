import { initStore, onUser, signIn, signOut, isLocal, list, clearCache } from "./store.js";
import { dayKey } from "./lib/dates.js";
import { esc } from "./lib/ui.js";
import { isCollectionId } from "./lib/collections.js";

const ROUTES = [
  ["inicio", "Inicio", () => import("./views/home.js")],
  ["registro", "Registro", () => import("./views/registro.js")],
  ["stats", "Stats", () => import("./views/stats.js")],
  ["coleccion", "Colección", () => import("./views/coleccion.js")],
  ["musica", "Música", () => import("./views/musica.js")],
  ["misc", "Miscelánea", () => import("./views/misc.js")],
  ["notas", "Notas", () => import("./views/notas.js")],
];

const nav = document.getElementById("nav");
const navToggle = document.getElementById("nav-toggle");
const view = document.getElementById("view");
const gate = document.getElementById("gate");

let cleanup = null;
let renderSeq = 0;
let started = false;
let lastDay = dayKey();

// ---------- navegación ----------
function buildNav() {
  nav.innerHTML = `
    <ul>${ROUTES.map(([k, l], i) => `<li style="--i:${i}"><a href="#/${k}" data-route="${k}">${l}</a></li>`).join("")}</ul>
    <div class="nav-foot mono">
      <button class="nav-theme"></button>
      ${isLocal ? `<span class="muted">modo local</span>` : `<button class="nav-out">salir</button>`}
    </div>`;
  nav.querySelector(".nav-out")?.addEventListener("click", async () => { await signOut(); location.hash = ""; });
  nav.querySelector(".nav-theme").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setNavOpen(false); });
  paintThemeButton();
}

// ---------- tema claro / oscuro ----------
const THEME_BG = { dark: "#0c0b0a", light: "#f3efe7" };
let themeTimer;

function paintThemeButton() {
  const light = document.documentElement.dataset.theme === "light";
  const b = nav.querySelector(".nav-theme");
  b.textContent = light ? "modo oscuro" : "modo claro";
  b.setAttribute("aria-label", light ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BG[light ? "light" : "dark"]);
}

function setTheme(t) {
  const root = document.documentElement;
  root.classList.add("theming");
  root.dataset.theme = t;
  try { localStorage.setItem("mj:theme", t); } catch {}
  paintThemeButton();
  clearTimeout(themeTimer);
  themeTimer = setTimeout(() => root.classList.remove("theming"), 500);
}

function setNavOpen(v) {
  document.body.classList.toggle("nav-open", v);
  navToggle.setAttribute("aria-expanded", v);
  navToggle.setAttribute("aria-label", v ? "Cerrar menú" : "Abrir menú");
}
navToggle.addEventListener("click", () => setNavOpen(!document.body.classList.contains("nav-open")));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setNavOpen(false); });

// "#/coleccion/musica" -> sección "coleccion" con parámetros ["musica"].
const hashParts = () => location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
const currentRoute = () => ROUTES.find((r) => r[0] === hashParts()[0]) || ROUTES[0];
const routeParams = () => hashParts().slice(1).map((p) => decodeURIComponent(p));

// Enlaces viejos que siguen funcionando: #/coleccion/{idJuego} (antes de
// que Colección tuviera varias colecciones) -> #/coleccion/videojuegos/{idJuego}.
function redirectFor() {
  const [key, sub, ...rest] = hashParts();
  if (key === "coleccion" && sub && !isCollectionId(decodeURIComponent(sub)))
    return `#/coleccion/videojuegos/${[sub, ...rest].join("/")}`;
  return "";
}

// Cada colección usa la tipografía y el fondo de su estilo (Música tiene el suyo).
const styleKey = (key, [sub] = []) => (key === "coleccion" && sub === "musica" ? "musica" : key);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Transición: la vista actual se desvanece, se carga la nueva por detrás y
// entra con un fade + leve desplazamiento (ver .view-host en styles.css).
async function route() {
  const to = redirectFor();
  if (to) return location.replace(to); // vuelve a entrar por hashchange
  const [key, label, load] = currentRoute();
  const params = routeParams();
  const seq = ++renderSeq;
  setNavOpen(false);
  nav.querySelectorAll("a").forEach((a) =>
    a.dataset.route === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  document.title = key === "inicio" ? "My Journal" : `${label} — My Journal`;
  const old = view.firstElementChild;
  old?.classList.add("leaving");
  try {
    const [mod] = await Promise.all([load(), old ? sleep(220) : null]);
    if (seq !== renderSeq) return;
    cleanup?.();
    cleanup = null;
    document.body.dataset.route = styleKey(key, params);
    scrollTo(0, 0);
    const host = document.createElement("div");
    host.className = "view-host";
    view.replaceChildren(host);
    const rendered = Promise.resolve(mod.render(host, ...params));
    // Esperamos a que la vista tenga contenido (máx. 350 ms) antes de mostrarla.
    await Promise.race([rendered.catch(() => {}), sleep(350)]);
    if (seq === renderSeq) host.classList.add("in");
    prefetchViews();
    const c = await rendered;
    if (seq !== renderSeq) { typeof c === "function" && c(); return; }
    cleanup = typeof c === "function" ? c : null;
  } catch (err) {
    console.error(err);
    if (err?.code === "permission-denied") return showDenied();
    view.innerHTML = `<section class="page"><p class="mono muted">Algo falló al cargar esta sección.</p></section>`;
  }
}

// Al volver a la app después de medianoche, refrescar la vista.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && started && dayKey() !== lastDay) {
    lastDay = dayKey();
    route();
  }
});

// ---------- acceso ----------
function showGate(html) {
  document.body.classList.add("gated");
  gate.innerHTML = html;
  gate.hidden = false;
}

function showLogin() {
  showGate(`
    <div class="gate-box">
      <h1>My Journal</h1>
      <button class="btn gate-in">Entrar con Google</button>
      <p class="mono muted gate-msg"></p>
    </div>`);
  gate.querySelector(".gate-in").addEventListener("click", async () => {
    try { await signIn(); }
    catch (e) { gate.querySelector(".gate-msg").textContent = "No se pudo iniciar sesión."; console.error(e); }
  });
}

let currentUid = "";
function showDenied() {
  showGate(`
    <div class="gate-box">
      <h1>Sin acceso</h1>
      <p class="mono muted">No se pudo abrir tu diario. Probá salir y volver a entrar; si sigue igual, pasale este código a quien te invitó:</p>
      <code class="mono gate-uid">${esc(currentUid)}</code>
      <button class="btn btn-ghost gate-out">Salir</button>
    </div>`);
  gate.querySelector(".gate-out").addEventListener("click", () => signOut());
}

function start() {
  document.body.classList.remove("gated");
  gate.hidden = true;
  if (!started) {
    started = true;
    window.addEventListener("hashchange", route);
  }
  route();
}

// Después de mostrar la primera sección, bajamos el resto en segundo plano
// para que cambiar de menú no tenga que esperar a la red.
let prefetched = false;
function prefetchViews() {
  if (prefetched) return;
  prefetched = true;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  idle(() => ROUTES.forEach(([, , load]) => load().catch(() => {})));
}

// Recordamos si la última vez había sesión: así la sección empieza a dibujarse
// mientras Firebase arranca, en vez de esperar a que confirme el usuario.
const SIGNED = "mj:signed";
const wasSignedIn = () => { try { return localStorage.getItem(SIGNED) === "1"; } catch { return false; } };
const rememberSignedIn = (v) => { if (isLocal) return; try { v ? localStorage.setItem(SIGNED, "1") : localStorage.removeItem(SIGNED); } catch {} };

async function boot() {
  buildNav();
  // El código de la sección se baja al mismo tiempo que Firebase.
  currentRoute()[2]().catch(() => {});
  let optimistic = isLocal || wasSignedIn();
  if (optimistic) start();
  try {
    await initStore();
  } catch (e) {
    console.error(e);
    view.replaceChildren();
    showGate(`<div class="gate-box"><h1>My Journal</h1><p class="mono muted">No se pudo conectar. Revisá la conexión y recargá.</p></div>`);
    return;
  }
  onUser((user) => {
    if (!user) {
      optimistic = false;
      rememberSignedIn(false);
      renderSeq++; // cancela una sección que se estuviera dibujando
      cleanup?.();
      cleanup = null;
      clearCache();
      view.replaceChildren();
      return showLogin();
    }
    currentUid = user.uid;
    rememberSignedIn(true);
    if (optimistic) optimistic = false; // ya se está mostrando
    else start();
    // Verifica permisos (y precarga la racha) sin frenar la primera pantalla.
    list("days").catch((e) => {
      if (e?.code === "permission-denied") showDenied();
      else console.error(e);
    });
  });
}

boot();

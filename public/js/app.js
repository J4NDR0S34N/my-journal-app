import { initStore, onUser, signIn, signOut, isLocal, list, clearCache } from "./store.js";
import { dayKey } from "./lib/dates.js";
import { esc, openSheet } from "./lib/ui.js";
import { hapticsOn, setHaptics, MOTIONS, motion, setMotion, applyMotion } from "./lib/prefs.js";
import { isCollectionId } from "./lib/collections.js";
import { startLuz } from "./lib/luz.js";

const ROUTES = [
  ["inicio", "Inicio", () => import("./views/home.js")],
  ["registro", "Hoy", () => import("./views/registro.js")],
  ["estadistica", "Progreso", () => import("./views/stats.js")],
  ["coleccion", "Colección", () => import("./views/coleccion.js")],
  ["misc", "Miscelánea", () => import("./views/misc.js")],
  ["notas", "Notas", () => import("./views/notas.js")],
];

const nav = document.getElementById("nav");
const navToggle = document.getElementById("nav-toggle");
const navCurrent = document.getElementById("nav-current");
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
      <button class="nav-settings">ajustes</button>
      ${isLocal ? `<span class="muted">modo local</span>` : `<button class="nav-out">salir</button>`}
    </div>`;
  nav.querySelector(".nav-out")?.addEventListener("click", async () => { await signOut(); location.hash = ""; });
  nav.querySelector(".nav-theme").addEventListener("click", () =>
    setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
  nav.querySelector(".nav-settings").addEventListener("click", () => { setNavOpen(false); openSettings(); });
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setNavOpen(false); });
  paintThemeButton();
}

// ---------- ajustes (de este dispositivo) ----------
function openSettings() {
  const sh = openSheet(`
    <div class="settings">
      <h2>Ajustes</h2>
      <div class="setting">
        <div>
          <p class="setting-name">Háptica</p>
          <p class="mono muted setting-hint">Vibración breve al marcar un hábito.</p>
        </div>
        <button class="toggle" role="switch" data-set="haptics" aria-checked="${hapticsOn()}" aria-label="Háptica"></button>
      </div>
      <div class="setting setting-col">
        <div>
          <p class="setting-name">Movimiento</p>
          <p class="mono muted setting-hint">Suave quita los desplazamientos; quieto deja todo estático, también la ilustración de puntos.</p>
        </div>
        <div class="chips" role="radiogroup" aria-label="Movimiento">
          ${MOTIONS.map(([k, l]) => `<button class="chip mono" role="radio" data-set-motion="${k}" aria-checked="${motion() === k}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="detail-actions"><button class="btn btn-ghost" data-close>Listo</button></div>
    </div>`);
  sh.el.addEventListener("click", (e) => {
    const m = e.target.closest("[data-set-motion]");
    if (m) {
      setMotion(m.dataset.setMotion);
      sh.el.querySelectorAll("[data-set-motion]").forEach((b) => b.setAttribute("aria-checked", b === m));
      return;
    }
    const t = e.target.closest('[data-set="haptics"]');
    if (!t) return;
    const on = t.getAttribute("aria-checked") !== "true";
    setHaptics(on);
    t.setAttribute("aria-checked", on);
  });
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

// Menú: el botón dice "Menú" (aria-expanded indica si está abierto). Abierto,
// el foco queda atrapado entre el botón y el menú, y lo de atrás queda inerte.
const isNavOpen = () => document.body.classList.contains("nav-open");
function setNavOpen(v, { focus = false } = {}) {
  if (v === isNavOpen()) return;
  document.body.classList.toggle("nav-open", v);
  navToggle.setAttribute("aria-expanded", v);
  view.inert = v;
  if (v) (nav.querySelector("[aria-current]") || nav.querySelector("a"))?.focus({ preventScroll: true });
  else if (focus) navToggle.focus();
}
navToggle.addEventListener("click", () => setNavOpen(!isNavOpen(), { focus: true }));
document.addEventListener("keydown", (e) => {
  if (!isNavOpen()) return;
  if (e.key === "Escape") return setNavOpen(false, { focus: true });
  if (e.key !== "Tab") return;
  const items = [navToggle, ...nav.querySelectorAll("a, button")];
  const i = items.indexOf(document.activeElement);
  const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
  e.preventDefault();
  items[next].focus();
});

// "#/coleccion/musica" -> sección "coleccion" con parámetros ["musica"].
const hashParts = () => location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
const currentRoute = () => ROUTES.find((r) => r[0] === hashParts()[0]) || ROUTES[0];
const routeParams = () => hashParts().slice(1).map((p) => decodeURIComponent(p));

// Enlaces viejos que siguen funcionando:
//   #/stats -> #/estadistica · #/musica -> #/coleccion/musica
//   #/coleccion/{idJuego} (antes de que Colección tuviera varias colecciones)
//     -> #/coleccion/videojuegos/{idJuego}
const MOVED = { stats: "estadistica", musica: "coleccion/musica" };
function redirectFor() {
  const [key, sub, ...rest] = hashParts();
  if (MOVED[key]) return `#/${[MOVED[key], sub, ...rest].filter(Boolean).join("/")}`;
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
  navCurrent.textContent = label;
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
  startLuz();
  applyMotion();
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
    // Verifica permisos (y precarga la presencia) sin frenar la primera pantalla.
    list("days").catch((e) => {
      if (e?.code === "permission-denied") showDenied();
      else console.error(e);
    });
  });
}

boot();

// Sin conexión: el service worker guarda la app (ver sw.js). Se registra
// cuando el navegador está libre, para no competir con la primera carga.
if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2000));
    idle(() => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("sw", e)));
  });
}

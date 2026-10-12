import { initStore, onUser, signIn, signOut, isLocal, list, clearCache, onRemoteChange, usedCollections, resetUsed } from "./store.js";
import { dayKey } from "./lib/dates.js";
import { esc, toast } from "./lib/ui.js";
import { applyMotion, startTheme } from "./lib/prefs.js";
import { mountProfile, setProfile } from "./lib/profile.js";
import { syncScenes } from "./lib/scenes.js";
import { isCollectionId } from "./lib/collections.js";
import { startLuz } from "./lib/luz.js";

const ROUTES = [
  ["inicio", "Inicio", () => import("./views/home.js")],
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
// El menú tiene solo las secciones; tema, ajustes y salir están en el panel
// del perfil (burbuja abajo a la izquierda, ver lib/profile.js).
function buildNav() {
  nav.innerHTML = `<ul>${ROUTES.map(([k, l], i) => `<li style="--i:${i}"><a href="#/${k}" data-route="${k}">${l}</a></li>`).join("")}</ul>`;
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setNavOpen(false); });
}

async function logOut() {
  await signOut();
  location.hash = "";
}

// Abre la lista de cuentas de Google; si se cancela, sigue la sesión actual.
async function switchAccount() {
  try {
    await signIn({ pickAccount: true });
  } catch (e) {
    if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") {
      toast("No se pudo cambiar de cuenta");
      console.error(e);
    }
  }
}

// Menú: el botón muestra la sección actual (aria-expanded indica si está abierto). Abierto,
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
  const items = [navToggle, ...nav.querySelectorAll("a")];
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
//   #/registro, #/progreso, #/stats y #/estadistica -> #/inicio (los hábitos
//   y el progreso están en Inicio) · #/musica -> #/coleccion/musica
//   #/coleccion/{idJuego} (antes de que Colección tuviera varias colecciones)
//     -> #/coleccion/videojuegos/{idJuego}
const MOVED = { registro: "inicio", progreso: "inicio", stats: "inicio", estadistica: "inicio", musica: "coleccion/musica" };
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
// quiet: redibujo por un cambio llegado de otro dispositivo. La sección nueva
// se arma por detrás y reemplaza a la vieja sin transición ni salto de scroll.
async function route({ quiet = false } = {}) {
  const to = redirectFor();
  if (to) return location.replace(to); // vuelve a entrar por hashchange
  const [key, label, load] = currentRoute();
  const params = routeParams();
  const seq = ++renderSeq;
  if (!quiet) setNavOpen(false);
  resetUsed();
  nav.querySelectorAll("a").forEach((a) =>
    a.dataset.route === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  // El botón del menú muestra la sección actual (el nombre accesible lo incluye).
  navCurrent.textContent = label;
  navToggle.setAttribute("aria-label", `Menú: ${label}`);
  document.title = key === "inicio" ? "My Journal" : `${label} — My Journal`;
  const old = view.firstElementChild;
  if (!quiet) old?.classList.add("leaving");
  try {
    const [mod] = await Promise.all([load(), old && !quiet ? sleep(220) : null]);
    if (seq !== renderSeq) return;
    cleanup?.();
    cleanup = null;
    document.body.dataset.route = styleKey(key, params);
    const y = scrollY;
    if (!quiet) scrollTo(0, 0);
    const host = document.createElement("div");
    host.className = quiet ? "view-host in quiet staging" : "view-host";
    if (quiet) view.append(host); else view.replaceChildren(host);
    const rendered = Promise.resolve(mod.render(host, ...params));
    // Esperamos a que la vista tenga contenido (máx. 350 ms) antes de mostrarla.
    await Promise.race([rendered.catch(() => {}), sleep(350)]);
    if (seq === renderSeq) {
      if (quiet) {
        [...view.children].forEach((el) => el !== host && el.remove());
        host.classList.remove("staging");
        scrollTo(0, y);
      } else host.classList.add("in");
    }
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

// En el teléfono no hay "pasar el cursor": al tocar el logo del menú o la
// burbuja del perfil se reproduce la misma microanimación (ver .tap en el CSS).
function tapPulse(el) {
  if (!el) return;
  let t;
  const end = () => { clearTimeout(t); el.classList.remove("tap"); };
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    el.classList.remove("tap");
    void el.offsetWidth; // reinicia la animación si se toca seguido
    el.classList.add("tap");
    clearTimeout(t);
    t = setTimeout(end, 800); // por si animationend no llega (pestaña en segundo plano)
  });
  el.addEventListener("animationend", end);
}

// ---------- tiempo real ----------
// Si otro dispositivo cambia algo que usa la sección abierta, se redibuja.
// Espera si hay una hoja o el menú abiertos, si estás escribiendo o si quedó
// texto sin guardar en algún campo (no se pierde un borrador); varios
// cambios seguidos se juntan en un solo redibujo.
let refreshPending = false, refreshTimer;
const TEXT_FIELDS = "textarea, input:not([type=checkbox]):not([type=file]):not([type=radio])";
const busy = () => isNavOpen() || document.querySelector(".sheet-wrap, .lightbox")
  || (view.contains(document.activeElement) && document.activeElement.matches(`${TEXT_FIELDS}, select`))
  || [...view.querySelectorAll(TEXT_FIELDS)].some((f) => f.value !== f.defaultValue)
  || !!view.querySelector("[data-dirty]"); // ej. hábitos marcados sin guardar
function refreshSoon() {
  refreshPending = true;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(function tryRefresh() {
    if (!refreshPending || !started) return;
    if (busy() || document.hidden) { refreshTimer = setTimeout(tryRefresh, 1000); return; }
    refreshPending = false;
    route({ quiet: true });
  }, 150);
}
onRemoteChange((col) => { if (usedCollections().has(col)) refreshSoon(); });

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
  startTheme();
  applyMotion();
  buildNav();
  mountProfile({ isLocal, signOut: logOut, switchAccount, parent: document.querySelector(".topbar") });
  tapPulse(navToggle);
  tapPulse(document.querySelector(".profile-bubble"));
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
      setProfile(null);
      renderSeq++; // cancela una sección que se estuviera dibujando
      cleanup?.();
      cleanup = null;
      clearCache();
      view.replaceChildren();
      return showLogin();
    }
    currentUid = user.uid;
    if (!isLocal) setProfile(user);
    rememberSignedIn(true);
    syncScenes();
    if (optimistic) optimistic = false; // ya se está mostrando
    else start();
    // Verifica permisos (y precarga la presencia) sin frenar la primera pantalla.
    list("days", { track: false }).catch((e) => {
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

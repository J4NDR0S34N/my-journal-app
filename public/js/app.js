import { initStore, onUser, signIn, signOut, isLocal, list, clearCache, onRemoteChange, usedCollections, resetUsed } from "./store.js";
import { dayKey } from "./lib/dates.js";
import { esc, toast } from "./lib/ui.js";
import { applyMotion, startTheme, motion } from "./lib/prefs.js";
import { mountProfile, setProfile } from "./lib/profile.js";
import { syncScenes } from "./lib/scenes.js";
import { modules, moduleById, loadModules, onModules, iconSvg } from "./lib/modules.js";
import { openModuleSheet } from "./lib/moduleSheet.js";
import { isCollectionId } from "./lib/collections.js";
import { startLuz } from "./lib/luz.js";

const ROUTES = [
  ["inicio", "Inicio", () => import("./views/home.js")],
  ["coleccion", "Colección", () => import("./views/coleccion.js")],
  ["misc", "Miscelánea", () => import("./views/misc.js")],
  ["notas", "Notas", () => import("./views/notas.js")],
];
// Módulos propios (#/m/{id}): no van en ROUTES; el menú los agrega aparte.
const MODULE_ROUTE = ["m", "Módulo", () => import("./views/modulo.js")];

// Íconos del menú (trazo, en el color del texto).
const ico = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// Cada uno tiene partes con clase para su microanimación (ver .ico-play en
// styles.css): la puerta y el techo de Inicio, las páginas de Colección, las
// estrellas de Miscelánea y las líneas de Notas.
const ICONS = {
  inicio: ico(`<path class="i-roof" d="M3.5 10.5 12 3.8l8.5 6.7"/><path d="M5.8 9v11h12.4V9"/><path class="i-door" d="M10.2 20v-6.2h3.6V20"/>`),
  coleccion: ico(`<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 3.5v17"/><path class="i-lines" d="M11.5 8h4.5M11.5 11.5h4.5"/><path class="i-page" d="M8.5 5h8.8v14H8.5"/><path class="i-page i-page2" d="M8.5 5h8.8v14H8.5"/>`),
  misc: ico(`<path class="i-star1" d="M10 3.5c.6 3.7 2.3 5.4 6 6-3.7.6-5.4 2.3-6 6-.6-3.7-2.3-5.4-6-6 3.7-.6 5.4-2.3 6-6z"/><path class="i-star2" d="M18 14.5c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8z"/>`),
  notas: ico(`<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path class="i-line" pathLength="1" d="M9 12h6"/><path class="i-line i-line2" pathLength="1" d="M9 15.5h6"/>`),
};

const nav = document.getElementById("nav");
const tabbar = document.getElementById("tabbar");
const dockAdd = document.getElementById("dock-add");
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
// del perfil (burbuja arriba a la derecha, ver lib/profile.js).
// El logo abre el menú completo (a pantalla completa). Cerrado, los íconos
// quedan a la vista: en escritorio, una columna a la izquierda; en el
// celular, una barra abajo.
// Junto a la barra, la burbuja + agrega módulos propios (lib/modules.js).
function navItems() {
  return [
    ...ROUTES.map(([k, l]) => ({ route: k, label: l, icon: ICONS[k], mod: false })),
    ...modules().map((m) => ({ route: `m/${m.id}`, label: m.name, icon: iconSvg(m.icon), mod: true })),
  ];
}
function paintNav() {
  const items = navItems();
  nav.innerHTML = `<ul>${items.map((it, i) => `<li style="--i:${i}"><a href="#/${it.route}" data-route="${it.route}"${it.mod ? ' class="is-mod"' : ""}><span class="nav-ico">${it.icon}</span><span class="nav-lbl">${esc(it.label)}</span></a></li>`).join("")}</ul>`;
  tabbar.innerHTML = items.map((it) => `<a href="#/${it.route}" data-route="${it.route}"${it.mod ? ' class="is-mod"' : ""} aria-label="${esc(it.label)}" title="${esc(it.label)}">${it.icon}</a>`).join("");
  markCurrent(false);
}
function buildNav() {
  paintNav();
  onModules(() => { paintNav(); if (currentRoute()[0] === "m") paintLabel(); });
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setNavOpen(false); });
  dockAdd.addEventListener("click", () => openModuleSheet());
  // microanimación del ícono: al pasar el cursor y al tocarlo
  for (const el of [nav, tabbar]) {
    el.addEventListener("pointerover", (e) => {
      const a = e.target.closest("a");
      if (a && e.pointerType === "mouse" && !a.contains(e.relatedTarget)) playIcon(a);
    });
    el.addEventListener("pointerdown", (e) => { const a = e.target.closest("a"); if (a && e.pointerType !== "mouse") playIcon(a); });
  }
}

function playIcon(a) {
  a.classList.remove("ico-play");
  void a.offsetWidth; // reinicia la animación si ya estaba corriendo
  a.classList.add("ico-play");
  clearTimeout(a._ico);
  a._ico = setTimeout(() => a.classList.remove("ico-play"), 1200);
}

// La ruta del menú que corresponde a la sección actual ("inicio", "m/{id}").
const currentNavRoute = () => {
  const [key] = currentRoute();
  return key === "m" ? `m/${routeParams()[0] || ""}` : key;
};
let lastNavRoute = "";
// Marca la sección actual; si cambió (entered), su ícono hace la animación.
function markCurrent(entered = true) {
  const r = currentNavRoute();
  document.querySelectorAll("#nav a, #tabbar a").forEach((a) => {
    const on = a.dataset.route === r;
    on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    if (on && entered && r !== lastNavRoute) playIcon(a);
  });
  if (entered) lastNavRoute = r;
  // en el celular, que el ícono actual quede a la vista si la barra se desliza
  const cur = tabbar.querySelector("[aria-current]");
  if (cur && tabbar.scrollWidth > tabbar.clientWidth) {
    const left = cur.offsetLeft - (tabbar.clientWidth - cur.offsetWidth) / 2;
    tabbar.scrollTo({ left, behavior: entered ? "smooth" : "auto" });
  }
}

// El botón del menú muestra la sección actual (el nombre accesible lo incluye).
function paintLabel() {
  const [key, label] = currentRoute();
  const name = key === "m" ? moduleById(routeParams()[0])?.name || label : label;
  navCurrent.textContent = name;
  navToggle.setAttribute("aria-label", `Menú: ${name}`);
  document.title = key === "inicio" ? "My Journal" : `${name} — My Journal`;
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
const currentRoute = () => (hashParts()[0] === "m" ? MODULE_ROUTE : ROUTES.find((r) => r[0] === hashParts()[0]) || ROUTES[0]);
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
  const [key, , load] = currentRoute();
  const params = routeParams();
  const seq = ++renderSeq;
  if (!quiet) setNavOpen(false);
  resetUsed();
  markCurrent(!quiet);
  paintLabel();
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
// El logo gira a medida que se scrollea: hacia abajo en un sentido, hacia
// arriba en el otro (un tercio de grado por píxel). En movimiento "quieto", no.
function spinWithScroll(logo) {
  let queued = false;
  const paint = () => {
    queued = false;
    logo.style.setProperty("--spin", motion() === "still" ? "0deg" : `${(scrollY * 0.33).toFixed(1)}deg`);
  };
  addEventListener("scroll", () => {
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  }, { passive: true });
  paint();
}

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
  spinWithScroll(navToggle.querySelector(".nav-logo"));
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
    loadModules();
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

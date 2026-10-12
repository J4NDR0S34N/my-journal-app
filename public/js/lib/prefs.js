// Preferencias de este dispositivo (localStorage), editables en el panel
// del perfil (burbuja arriba a la derecha): movimiento y tema.

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// ---------- movimiento ----------
// "completo" o "quieto" (sin animaciones; la ilustración de puntos queda
// estática). Si nunca se eligió, se sigue a prefers-reduced-motion del
// sistema. Queda en data-motion de <html> para el CSS.
const MOTION = "mj:motion";
export const MOTIONS = [["full", "completo"], ["still", "quieto"]];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const listeners = new Set();

export function motion() {
  const v = read(MOTION);
  return MOTIONS.some(([k]) => k === v) ? v : reduced.matches ? "still" : "full";
}

export function setMotion(v) {
  write(MOTION, v);
  applyMotion();
}

export function applyMotion() {
  const m = motion();
  document.documentElement.dataset.motion = m;
  listeners.forEach((fn) => fn(m));
}

// Avisa cuando cambia (ajuste propio o del sistema). Devuelve la baja.
export function onMotion(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
reduced.addEventListener?.("change", applyMotion);

// ---------- tema ----------
// claro, oscuro o automático (según la hora: claro de 8 a 20, oscuro el
// resto). Lo resuelto queda en data-theme de <html>; el script del <head>
// hace lo mismo antes de pintar.
const THEME = "mj:theme";
export const THEMES = [["light", "claro"], ["dark", "oscuro"], ["auto", "automático"]];
const THEME_BG = { dark: "#0c0b0a", light: "#f3efe7" };

export function themePref() {
  const v = read(THEME);
  if (v === "system" || v === "hour") return "auto"; // opciones anteriores
  return THEMES.some(([k]) => k === v) ? v : "dark";
}

function resolveTheme(pref = themePref(), d = new Date()) {
  if (pref === "auto") return d.getHours() >= 8 && d.getHours() < 20 ? "light" : "dark";
  return pref;
}

let themeTimer;
// animate: funde los colores (al elegir en ajustes o al cambiar solo).
export function applyTheme({ animate = true } = {}) {
  const root = document.documentElement;
  const t = resolveTheme();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BG[t]);
  if (root.dataset.theme === t) return;
  if (animate) {
    root.classList.add("theming");
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => root.classList.remove("theming"), 500);
  }
  root.dataset.theme = t;
}

export function setThemePref(v) {
  write(THEME, v);
  applyTheme();
}

// Automático se revisa cada 10 minutos y al volver a la app.
export function startTheme() {
  applyTheme({ animate: false });
  setInterval(() => applyTheme(), 10 * 60_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && applyTheme());
}

// Preferencias de este dispositivo (localStorage), editables en "ajustes".

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// ---------- háptica ----------
// Dos vías: el atributo `switch` de los checkbox de Registro (Safari iOS 18+
// vibra solo al tocarlos) y navigator.vibrate(10) donde exista (Android).
// Apagarla desactiva ambas.
const HAPTICS = "mj:haptics";
export const hapticsOn = () => read(HAPTICS) !== "0";

export function setHaptics(on) {
  write(HAPTICS, on ? "1" : "0");
  document.querySelectorAll(".habit-input").forEach((i) => i.toggleAttribute("switch", on));
}

export function haptic() {
  if (hapticsOn() && "vibrate" in navigator) navigator.vibrate(10);
}

// ---------- movimiento ----------
// "completo", "suave" (sin desplazamientos, ilustración más lenta) o "quieto"
// (sin animaciones; la ilustración de puntos queda estática). Si nunca se
// eligió, se sigue a prefers-reduced-motion del sistema. Queda en
// data-motion de <html> para el CSS.
const MOTION = "mj:motion";
export const MOTIONS = [["full", "completo"], ["soft", "suave"], ["still", "quieto"]];
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

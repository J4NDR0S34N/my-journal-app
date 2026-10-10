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

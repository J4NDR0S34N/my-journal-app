// Ilustración del cielo de Inicio: qué se dibuja de día y qué de noche.
// Se elige en el panel del perfil y se guarda en la cuenta (settings/ui), así
// cambia en todos los dispositivos en tiempo real. Una copia en este
// dispositivo deja el cielo correcto desde el primer cuadro.

import { list, get, set, onRemoteChange } from "../store.js";

export const DAY_SCENES = [["clouds", "Soleado + nubes"], ["clear", "Soleado despejado"]];
export const NIGHT_SCENES = [
  ["comets", "Luna + cometas"], ["clear", "Nocturno despejado"], ["saturn", "Saturno"], ["mars", "Marte"],
];

const KEY = "mj:scenes";
const DEFAULT = { day: "clouds", night: "comets" };
const listeners = new Set();

// Valores desconocidos (o de una versión futura) vuelven al de fábrica.
// Júpiter fue reemplazado por Saturno.
const clean = (v) => {
  const night = v?.night === "jupiter" ? "saturn" : v?.night;
  return {
    day: DAY_SCENES.some(([k]) => k === v?.day) ? v.day : DEFAULT.day,
    night: NIGHT_SCENES.some(([k]) => k === night) ? night : DEFAULT.night,
  };
};

let cur = clean((() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })());

export const scenes = () => ({ ...cur });

// Avisa cuando cambia (elección propia o de otro dispositivo). Devuelve la baja.
export function onScenes(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply(v) {
  const next = clean(v);
  if (next.day === cur.day && next.night === cur.night) return;
  cur = next;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {}
  listeners.forEach((fn) => fn(scenes()));
}

// part: "day" | "night"
export function setScene(part, value) {
  apply({ ...cur, [part]: value });
  set("settings", "ui", { sky: scenes() }).catch((e) => console.warn("ilustración", e));
}

// Al entrar con una cuenta: toma la elección guardada y queda escuchando.
export async function syncScenes() {
  try {
    await list("settings", { track: false });
    apply((await get("settings", "ui"))?.sky);
  } catch (e) {
    console.warn("ilustración", e);
  }
}
onRemoteChange((col) => { if (col === "settings") syncScenes(); });

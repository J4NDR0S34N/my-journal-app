// Módulos propios: secciones que agregás desde la burbuja + junto a la barra
// de íconos. Cada uno tiene nombre, ícono (de ICONS) y plantilla. Por ahora
// solo existe la plantilla "En blanco" (texto libre); las demás se ven como
// "próximamente". Se guardan en la cuenta (colección `modules`) y se
// sincronizan en vivo entre dispositivos.
//   { name, icon, template: "blank", text, order, createdAt }

import { list, add, update, remove, onRemoteChange } from "../store.js";

const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

// Íconos para elegir al crear un módulo (mismo trazo que los del menú).
export const ICONS = {
  libro: ["Libro", `<path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z"/><path d="M5 17.5a2 2 0 0 1 2-2h11"/>`],
  estrella: ["Estrella", `<path d="M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7z"/>`],
  corazon: ["Corazón", `<path d="M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>`],
  musica: ["Música", `<path d="M9 18V5.5l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>`],
  camara: ["Cámara", `<path d="M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.5"/>`],
  hoja: ["Hoja", `<path d="M5 19c0-8 5-13.5 14-14 .5 9-5 14-13 14z"/><path d="M5 19l8-8"/>`],
  taza: ["Taza", `<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5V6M12 3.5V6"/>`],
  mapa: ["Mapa", `<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>`],
  lista: ["Lista", `<path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="M4 6.5l1.5 1.5L8 5.5M4 12l1.5 1.5L8 11M4 17.5l1.5 1.5L8 16.5"/>`],
  reloj: ["Reloj", `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`],
  mundo: ["Mundo", `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5s-1.1 6.1-3.6 8.5c-2.5-2.4-3.6-5.2-3.6-8.5S9.5 5.9 12 3.5z"/>`],
  lapiz: ["Lápiz", `<path d="M15.5 4.5l4 4L8.5 19.5h-4v-4z"/><path d="M13 7l4 4"/>`],
};
export const iconSvg = (k) => svg((ICONS[k] || ICONS.libro)[1]);

// ready: false = se muestra como "próximamente".
export const TEMPLATES = [
  ["blank", "En blanco", "Una página de texto libre.", true],
  ["list", "Lista", "Ítems para tachar.", false],
  ["gallery", "Galería", "Imágenes con portada.", false],
  ["table", "Tabla", "Filas y columnas.", false],
];

let mods = [];
const listeners = new Set();
const sorted = (arr) => [...arr].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || "").localeCompare(b.createdAt || ""));

export const modules = () => mods;
export const moduleById = (id) => mods.find((m) => m.id === id) || null;

// Avisa cuando la lista cambia (propia o de otro dispositivo). Devuelve la baja.
export function onModules(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(mods));

// Al entrar con una cuenta: carga la lista y queda escuchando.
export async function loadModules() {
  try {
    mods = sorted(await list("modules", { track: false }));
  } catch (e) {
    console.warn("módulos", e);
    mods = [];
  }
  emit();
}
onRemoteChange((col) => { if (col === "modules") loadModules(); });

export async function createModule({ name, icon, template = "blank" }) {
  const data = { name, icon, template, text: "", order: Math.max(0, ...mods.map((m) => m.order ?? 0)) + 1, createdAt: new Date().toISOString() };
  const id = await add("modules", data);
  mods = sorted([...mods, { id, ...data }]);
  emit();
  return id;
}

export async function updateModule(id, patch, { quiet = false } = {}) {
  await update("modules", id, patch);
  mods = sorted(mods.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  if (!quiet) emit(); // quiet: el texto no cambia el menú
}

export async function removeModule(id) {
  await remove("modules", id);
  mods = mods.filter((m) => m.id !== id);
  emit();
}

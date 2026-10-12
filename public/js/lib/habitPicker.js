// Botones de hábitos (grilla 3×3). Tocarlos solo cambia un borrador; se guarda
// con el botón Guardar de quien la usa: Inicio (hoy) y Progreso (otros días).

import { HABITS } from "../habits.js";
import { set } from "../store.js";
import { esc } from "./ui.js";
import { logHabit } from "./activity.js";

export function habitButtons(h = {}, cls = "") {
  return `<div class="habits ${cls}">${HABITS.map((x) => `
    <button type="button" class="habit${h[x.key] ? " on" : ""}" data-k="${x.key}" aria-pressed="${!!h[x.key]}">
      <span class="habit-emo" aria-hidden="true">${x.emoji}</span>
      <span class="habit-lbl">${esc(x.label)}</span>
    </button>`).join("")}</div>`;
}

// Conecta la grilla al borrador `draft` (se modifica en el lugar).
export function bindHabitButtons(el, draft, onChange) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".habit");
    if (!b) return;
    const k = b.dataset.k;
    draft[k] = !draft[k];
    b.classList.toggle("on", draft[k]);
    b.setAttribute("aria-pressed", draft[k]);
    onChange?.(draft);
  });
}

export const sameHabits = (a = {}, b = {}) => HABITS.every((x) => !!a[x.key] === !!b[x.key]);

// Guarda el día y anota en la actividad los hábitos que cambiaron.
export async function saveDay(key, saved, draft) {
  const h = Object.fromEntries(HABITS.map((x) => [x.key, !!draft[x.key]]));
  await set("days", key, { h });
  for (const x of HABITS) if (!!saved[x.key] !== h[x.key]) logHabit(key, x.key, h[x.key]);
  return h;
}

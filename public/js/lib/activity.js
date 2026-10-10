// Registro de actividad reciente (colección `activity`).
// Cada entrada: { kind, text, at, img?, emoji? }. Los errores al registrar
// nunca interrumpen la acción principal.

import { add, set, remove, since } from "../store.js";
import { HABITS } from "../habits.js";
import { dayKey, fmtShort } from "./dates.js";

const now = () => new Date().toISOString();

export function logActivity(kind, text, extra = {}) {
  return add("activity", { kind, text, at: now(), ...extra }).catch((e) => console.warn("activity", e));
}

// Hábitos: una entrada por día+hábito. Marcar la crea, desmarcar la borra,
// así prender/apagar varias veces no llena el registro.
export function logHabit(date, key, on) {
  const id = `h_${date}_${key}`;
  const h = HABITS.find((x) => x.key === key);
  const when = date === dayKey() ? "" : ` (${fmtShort(date).replace(/ \d{4}$/, "")})`;
  const p = on
    ? set("activity", id, { kind: "habit", text: `Marcaste ${h.label}${when}`, emoji: h.emoji, at: now() }, { merge: false })
    : remove("activity", id);
  return p.catch((e) => console.warn("activity", e));
}

// Actividad desde el comienzo (hora local) de hace `days` días.
export function activitySince(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return since("activity", "at", d.toISOString());
}

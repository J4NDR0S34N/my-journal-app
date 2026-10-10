// Presencia: cuántos días del mes estuviste. No hay rachas que se "pierdan":
// solo se cuenta lo que hubo. Un día cuenta como presente si marcaste al
// menos un hábito o respondiste la pregunta del día.
// Función pura (sin DOM ni Firebase): ver tests/presence.test.mjs.

import { dayKey } from "./dates.js";
import { countDone } from "../habits.js";

export const isPresent = (d) => !!d && (countDone(d.h) > 0 || !!String(d.respuesta ?? "").trim());

const shift = (key, n) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

/**
 * @param {{id: string, h?: object, respuesta?: string}[]} days  documentos days/{YYYY-MM-DD}
 * @param {string} [today]  YYYY-MM-DD
 * @returns {{ present: number, total: number, week: {key: string, present: boolean}[], welcomeBack: boolean }}
 *   present/total: días presentes / días transcurridos del mes (hoy incluido).
 *   week: los últimos 7 días, de más viejo a hoy.
 *   welcomeBack: ayer no hubo registro, pero sí antes.
 */
export function presenceStats(days, today = dayKey()) {
  const here = new Set(days.filter(isPresent).map((d) => d.id));
  const month = today.slice(0, 8); // "YYYY-MM-"
  const present = [...here].filter((k) => k.startsWith(month) && k <= today).length;
  const total = Number(today.slice(8, 10));
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = shift(today, i - 6);
    return { key, present: here.has(key) };
  });
  const yesterday = shift(today, -1);
  const welcomeBack = !here.has(yesterday) && [...here].some((k) => k < yesterday);
  return { present, total, week, welcomeBack };
}

// Texto y puntos de la semana (● presente, ○ sin registro), en mono.
export const presenceText = (s) => `Presente ${s.present}/${s.total} este mes`;
export const weekDots = (s) => s.week.map((d) => (d.present ? "●" : "○")).join("");
export const weekLabel = (s) => `Últimos 7 días: ${s.week.filter((d) => d.present).length} con registro`;

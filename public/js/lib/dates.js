const pad = (n) => String(n).padStart(2, "0");

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isDaytime = (d = new Date()) => d.getHours() >= 6 && d.getHours() < 18;

export const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function fmtLong(d = new Date()) {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function fmtShort(key) {
  // "2026-09-28" -> "28 sep 2026"
  if (!key) return "";
  const [y, m, dd] = key.split("-");
  if (!m) return y;
  const mon = MONTHS[+m - 1].slice(0, 3);
  return dd ? `${+dd} ${mon} ${y}` : `${mon} ${y}`;
}

export function fmtStamp(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fmtTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

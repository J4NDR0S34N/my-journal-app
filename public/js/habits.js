// Hábitos, stats y racha.

// done: cómo se lee en Inicio ("hoy: corriste, leíste").
export const HABITS = [
  { key: "gym", label: "Gimnasio", emoji: "💪", done: "entrenaste" },
  { key: "run", label: "Correr", emoji: "⚡", done: "corriste" },
  { key: "gaming", label: "Gaming", emoji: "🎮", done: "jugaste" },
  { key: "hydration", label: "Hidratación", emoji: "🚰", done: "te hidrataste" },
  { key: "rest", label: "Descanso", emoji: "💤", done: "descansaste" },
  { key: "projects", label: "Proyectos", emoji: "💼", done: "avanzaste un proyecto" },
  { key: "reading", label: "Lectura", emoji: "📚", done: "leíste" },
  { key: "drawing", label: "Dibujar", emoji: "🎨", done: "dibujaste" },
  { key: "movies", label: "Cine", emoji: "🎬", done: "viste una película" },
];

// PROVISORIO — reemplazar por el mapeo exacto del prototipo anterior.
// Cada hábito marcado suma 1 punto a cada stat donde aparece.
export const STATS = [
  { key: "str", label: "Fuerza", habits: ["gym"] },
  { key: "dex", label: "Destreza", habits: ["run", "gaming", "drawing"] },
  { key: "int", label: "Inteligencia", habits: ["reading", "projects"] },
  { key: "hap", label: "Felicidad", habits: ["gaming", "movies", "drawing"] },
  { key: "hp", label: "Salud", habits: ["hydration", "rest", "run", "gym"] },
];

export const POINTS_PER_LEVEL = 5;
export const BAR_SEGMENTS = 20;

export function computeStats(days) {
  const pts = Object.fromEntries(STATS.map((s) => [s.key, 0]));
  for (const d of days) {
    const h = d.h || {};
    for (const s of STATS) for (const k of s.habits) if (h[k]) pts[s.key]++;
  }
  return STATS.map((s) => {
    const points = pts[s.key];
    const level = Math.floor(points / POINTS_PER_LEVEL);
    return { ...s, points, level, filled: Math.min(level, BAR_SEGMENTS) };
  });
}

export const countDone = (h = {}) => HABITS.filter((x) => h[x.key]).length;

// Un día cuenta para la racha si tiene al menos 1 hábito. Si hoy todavía
// está vacío, la racha no se corta: se cuenta desde ayer.
export const STREAK_MIN = 1;
const shift = (key, n, dayKeyFn) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKeyFn(d);
};

export function computeStreak(days, todayKey, dayKeyFn) {
  const map = new Map(days.map((d) => [d.id, d.h || {}]));
  const ok = (k) => countDone(map.get(k)) >= STREAK_MIN;
  let k = ok(todayKey) ? todayKey : shift(todayKey, -1, dayKeyFn);
  let n = 0;
  while (ok(k)) {
    n++;
    k = shift(k, -1, dayKeyFn);
  }
  return n;
}

// "Bienvenido de vuelta": ayer sin hábitos, pero hubo alguno antes.
export function welcomeBack(days, todayKey, dayKeyFn) {
  const yesterday = shift(todayKey, -1, dayKeyFn);
  const done = days.filter((d) => countDone(d.h) >= STREAK_MIN).map((d) => d.id);
  return !done.includes(yesterday) && done.some((k) => k < yesterday);
}

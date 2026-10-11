// Hábitos y stats.

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
// Cada área suma como máximo 1 punto por día si se marcó alguno de sus hábitos.
export const STATS = [
  { key: "str", label: "Fuerza", habits: ["gym"] },
  { key: "dex", label: "Destreza", habits: ["run", "gaming", "drawing"] },
  { key: "int", label: "Inteligencia", habits: ["reading", "projects"] },
  { key: "hap", label: "Felicidad", habits: ["gaming", "movies", "drawing"] },
  { key: "hp", label: "Salud", habits: ["hydration", "rest", "run", "gym"] },
];

export const POINTS_PER_LEVEL = 5;
export const LEVELS_PER_CYCLE = 5;
export const POINTS_PER_CYCLE = POINTS_PER_LEVEL * LEVELS_PER_CYCLE;
export const BAR_SEGMENTS = POINTS_PER_CYCLE;

export function computeStats(days) {
  const pts = Object.fromEntries(STATS.map((s) => [s.key, 0]));
  for (const d of days) {
    const h = d.h || {};
    for (const s of STATS) if (s.habits.some((k) => h[k])) pts[s.key]++;
  }
  return STATS.map((s) => {
    const points = pts[s.key];
    const level = Math.floor(points / POINTS_PER_LEVEL);
    const cycle = points === 0 ? 1 : Math.floor((points - 1) / POINTS_PER_CYCLE) + 1;
    const cyclePoints = points === 0 ? 0 : ((points - 1) % POINTS_PER_CYCLE) + 1;
    return { ...s, points, level, cycle, cyclePoints, filled: cyclePoints };
  });
}

export const countDone = (h = {}) => HABITS.filter((x) => h[x.key]).length;

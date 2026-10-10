// Hábitos y stats.

export const HABITS = [
  { key: "gym", label: "Gimnasio", emoji: "💪" },
  { key: "run", label: "Correr", emoji: "⚡" },
  { key: "gaming", label: "Gaming", emoji: "🎮" },
  { key: "hydration", label: "Hidratación", emoji: "🚰" },
  { key: "rest", label: "Descanso", emoji: "💤" },
  { key: "projects", label: "Proyectos", emoji: "💼" },
  { key: "reading", label: "Lectura", emoji: "📚" },
  { key: "drawing", label: "Dibujar", emoji: "🎨" },
  { key: "movies", label: "Cine", emoji: "🎬" },
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

// Hábitos y racha.

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

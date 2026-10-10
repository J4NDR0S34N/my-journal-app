// Umbral: una pregunta por día, la misma para todo el día (elegida por fecha).
// La respuesta se guarda en days/{YYYY-MM-DD}.respuesta.

import { dayKey } from "./dates.js";

export const PREGUNTAS = [
  "¿Qué te gustaría recordar de hoy?",
  "¿Qué pequeña cosa salió bien?",
  "¿Con quién hablaste hoy que te hizo bien?",
  "¿Qué canción te acompañó hoy?",
  "¿Qué aprendiste, aunque sea algo chico?",
  "¿Qué te hizo reír?",
  "¿Cómo está tu cuerpo ahora mismo?",
  "¿Qué agradecés de este día?",
  "¿Qué te dio calma hoy?",
  "¿Qué te gustaría hacer mañana?",
  "¿Qué viste hoy que te pareció lindo?",
  "¿En qué estuviste pensando más?",
  "¿Qué te sorprendió?",
  "¿Qué te dio energía?",
  "¿Qué te gustaría soltar antes de dormir?",
  "¿Qué comida disfrutaste hoy?",
  "¿Qué te gustaría decirle a alguien?",
  "¿Qué hiciste solo por gusto?",
  "¿Qué lugar te gustaría visitar pronto?",
  "¿Qué te hace sentir en casa?",
  "¿Qué libro, película o juego tenés en la cabeza?",
  "¿Qué idea querés anotar antes de que se escape?",
  "¿Qué parte del día fue la más tranquila?",
  "¿Qué te gustaría repetir de hoy?",
  "¿Qué hiciste hoy por vos?",
  "¿Qué olor, sonido o color te quedó del día?",
  "¿A quién tenés presente hoy?",
  "¿Qué te dio curiosidad?",
  "¿Qué te gustaría aprender este mes?",
  "¿Cuál fue el mejor momento de la tarde?",
  "¿Qué te gustaría que fuera más simple?",
  "¿Qué hiciste hoy que te dejó conforme?",
  "¿Qué te gustaría escuchar ahora?",
  "¿Qué te ayudó cuando algo se complicó?",
  "¿Qué te gustaría crear?",
  "¿Qué cosa chica te alegró?",
  "¿Qué te gustaría recordar dentro de un año?",
  "¿Cómo describirías el día en tres palabras?",
  "¿Qué tenés ganas de empezar?",
  "¿Qué conversación te quedó dando vueltas?",
  "¿Qué te gustaría agradecerle a alguien?",
  "¿Cómo estuvo el cielo hoy?",
  "¿Qué te hizo bien esta semana?",
  "¿Qué puede esperar hasta mañana?",
  "¿Qué te dio paz?",
  "¿Qué descubriste hoy?",
  "¿Qué te gustaría cuidar más?",
  "¿Qué momento de hoy guardarías en una foto?",
  "¿Quién te acompañó hoy, aunque sea de lejos?",
  "¿Qué estás esperando con ganas?",
  "¿Qué te salió mejor de lo que pensabas?",
  "¿Qué te gustaría probar por primera vez?",
  "¿Qué te gusta de quien sos hoy?",
  "¿Qué tarea chica te sacaste de encima?",
  "¿Qué le contarías a tu yo de hace un año?",
  "¿Qué te inspiró hoy?",
  "¿En qué lugar estuviste más a gusto hoy?",
  "¿Qué palabra resume este momento?",
  "¿Qué te gustaría hacer más seguido?",
  "¿Qué te gustaría que pase este fin de semana?",
];

// Misma pregunta todo el día y para cualquier zona horaria: cuenta días desde 1970.
export function preguntaDelDia(key = dayKey()) {
  const [y, m, d] = key.split("-").map(Number);
  const n = Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
  return PREGUNTAS[n % PREGUNTAS.length];
}

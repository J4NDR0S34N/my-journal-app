// Luz del día: pone data-luz="alba|dia|tarde|noche" en <html> según la hora.
// El CSS ajusta apenas --paper, --ink y --muted para cada momento.

export const luzFor = (h) => (h >= 5 && h < 8 ? "alba" : h >= 8 && h < 17 ? "dia" : h >= 17 && h < 20 ? "tarde" : "noche");

export function setLuz(d = new Date()) {
  const luz = luzFor(d.getHours());
  if (document.documentElement.dataset.luz !== luz) document.documentElement.dataset.luz = luz;
}

// Al cargar, cada 10 minutos y al volver a la app (el teléfono pudo dormir horas).
export function startLuz() {
  setLuz();
  setInterval(setLuz, 10 * 60_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && setLuz());
}

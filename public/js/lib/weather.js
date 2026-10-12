// Temperatura local para Inicio, de Open-Meteo (gratis y sin clave).
// La ubicación la da el navegador (pide permiso una vez); se redondea a ~1 km
// y solo se usa para pedir el clima, no se guarda. Lo que sí se guarda en este
// dispositivo es la última temperatura, para mostrarla al instante.

const KEY = "mj:temp"; // { t, at }
const FRESH = 30 * 60_000; // se vuelve a pedir cada 30 min
const STALE = 3 * 60 * 60_000; // sin conexión, se muestra la guardada hasta 3 h

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

// La última temperatura guardada, si no es demasiado vieja (o null).
export function cachedTemp() {
  const c = read();
  return c && Date.now() - c.at < STALE ? c.t : null;
}

function position() {
  return new Promise((ok, fail) => {
    if (!("geolocation" in navigator)) return fail(new Error("sin geolocalización"));
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: false, maximumAge: 6 * 60 * 60_000, timeout: 15_000 });
  });
}

// Temperatura actual en °C (entera), o null si no hay permiso o conexión.
export async function currentTemp() {
  const c = read();
  if (c && Date.now() - c.at < FRESH) return c.t;
  try {
    const { coords } = await position();
    const lat = coords.latitude.toFixed(2), lon = coords.longitude.toFixed(2);
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const t = Math.round((await res.json()).current.temperature_2m);
    write({ t, at: Date.now() });
    return t;
  } catch (e) {
    if (e?.code !== 1) console.warn("temperatura", e); // 1 = permiso denegado: no se insiste
    return cachedTemp();
  }
}

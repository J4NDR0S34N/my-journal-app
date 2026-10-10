// Deezer (gratis, sin key): búsqueda de álbumes para canciones y portadas.
// Deezer no permite pedidos directos desde el navegador (CORS), así que se
// consulta por JSONP. Sus portadas salen de un CDN rápido (≈0,3 s), mucho más
// que Cover Art Archive (4–8 s con redirecciones).

let jsonpSeq = 0;
export function deezer(path, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = `mjDeezer${Date.now()}${jsonpSeq++}`;
    const s = document.createElement("script");
    const u = new URL(`https://api.deezer.com${path}`);
    u.search = new URLSearchParams({ ...params, output: "jsonp", callback: cb });
    const done = () => { delete window[cb]; s.remove(); clearTimeout(t); };
    const t = setTimeout(() => { done(); reject(new Error("Deezer no respondió")); }, 9000);
    window[cb] = (data) => { done(); data?.error ? reject(new Error(data.error.message)) : resolve(data); };
    s.onerror = () => { done(); reject(new Error("No se pudo contactar a Deezer")); };
    s.src = u;
    document.head.append(s);
  });
}

// Normaliza títulos: sin tildes, sin "(Deluxe Edition)", "- Single", etc.
const norm = (s = "") => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/\s+-\s+(single|ep)$/, "").replace(/[^a-z0-9]+/g, " ").trim();

// Busca el álbum en Deezer. Devuelve { id, cover } (cover = 500×500) o null.
export async function findAlbum(artist, title) {
  const tries = [`artist:"${artist}" album:"${title}"`, `${artist} ${title}`];
  for (const q of tries) {
    const r = await deezer("/search/album", { q, limit: 10 });
    const list = r.data || [];
    const hit = list.find((a) => norm(a.title) === norm(title) && norm(a.artist?.name).includes(norm(artist).split(" ")[0]))
      || list.find((a) => norm(a.title) === norm(title));
    if (hit) return { id: hit.id, cover: hit.cover_big || "" };
  }
  return null;
}

// Portada de Deezer en otro tamaño (las URLs llevan "500x500" en el nombre).
export const deezerCoverSize = (url, px) => url.replace(/\/\d+x\d+-/, `/${px}x${px}-`);

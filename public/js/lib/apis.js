import { RAWG_KEY } from "../config.js";

// ---------- RAWG (videojuegos) ----------
export const hasRawg = () => !!RAWG_KEY;

// Pide a RAWG una versión redimensionada de la imagen (más liviana).
export const rawgImg = (url, w = 640) =>
  url ? url.replace("/media/games/", `/media/resize/${w}/-/games/`) : "";

export async function searchGames(q, signal) {
  const u = new URL("https://api.rawg.io/api/games");
  u.search = new URLSearchParams({ key: RAWG_KEY, search: q, page_size: "8", search_precise: "true" });
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`RAWG ${r.status}`);
  const j = await r.json();
  return (j.results || []).map((g) => ({
    title: g.name,
    coverUrl: g.background_image || "",
    thumb: rawgImg(g.background_image, 200),
    releaseDate: g.released || "",
    platforms: (g.platforms || []).map((p) => p.platform.name),
    genres: (g.genres || []).map((x) => x.name),
  }));
}

// ---------- MusicBrainz + Cover Art Archive ----------
// Límite: 1 request por segundo. Todas las llamadas pasan por esta cola.
const MB = "https://musicbrainz.org/ws/2";
let nextSlot = 0;
async function mbFetch(path, params, attempt = 0) {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(Date.now(), nextSlot) + 1100;
  const u = new URL(MB + path);
  u.search = new URLSearchParams({ ...params, fmt: "json" });
  await new Promise((res) => setTimeout(res, wait));
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  // 503 = MusicBrainz está limitando: esperamos y reintentamos (máx. 3 veces).
  if (r.status === 503 && attempt < 3) {
    nextSlot = Math.max(nextSlot, Date.now() + 1500 * (attempt + 1));
    return mbFetch(path, params, attempt + 1);
  }
  if (!r.ok) throw new Error(`MusicBrainz ${r.status}`);
  return r.json();
}

export const caaCover = (id, size = 500) => `https://coverartarchive.org/release-group/${id}/front-${size}`;

const TYPE = { Album: "album", EP: "ep", Single: "single" };
const topTags = (arr = []) =>
  [...arr].sort((a, b) => (b.count || 0) - (a.count || 0)).map((t) => t.name).slice(0, 6);

export async function searchMusic(q) {
  const j = await mbFetch("/release-group", { query: q, dismax: "true", limit: "8" });
  return (j["release-groups"] || []).map((g) => ({
    mbid: g.id,
    title: g.title,
    artist: (g["artist-credit"] || []).map((a) => a.name + (a.joinphrase || "")).join("") || "",
    releaseDate: g["first-release-date"] || "",
    type: TYPE[g["primary-type"]] || "album",
    coverUrl: caaCover(g.id, 500),
    thumb: caaCover(g.id, 250),
    genres: topTags(g.tags),
  }));
}

export async function musicGenres(mbid) {
  try {
    const j = await mbFetch(`/release-group/${mbid}`, { inc: "genres tags" });
    const g = topTags(j.genres);
    return g.length ? g : topTags(j.tags);
  } catch {
    return [];
  }
}

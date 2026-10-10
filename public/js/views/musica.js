import { mountShelf, byDate } from "../lib/shelf.js";
import { searchMusic, musicGenres } from "../lib/apis.js";
import { mountTracks } from "../lib/tracks.js";
import { findAlbum, deezerCoverSize } from "../lib/deezer.js";
import { fmtShort } from "../lib/dates.js";
import { update } from "../store.js";

const TYPES = [
  { v: "album", l: "Álbum" },
  { v: "ep", l: "EP" },
  { v: "single", l: "Sencillo" },
];
const typeLabel = (t) => TYPES.find((x) => x.v === t)?.l || "";

// Portadas: Cover Art Archive tarda 4–8 s por imagen (y a veces falla), así que
// cada disco guarda la portada de Deezer (coverFast), que carga en ≈0,3 s.
// La de Cover Art Archive (coverUrl) queda de respaldo.
const caaThumb = (x) => (x.coverUrl || "").replace(/front-500$/, "front-250");

// Discos guardados sin coverFast: se buscan en Deezer de a dos (para no pasar
// su límite de pedidos) y se guardan; si no está, se marca para no reintentar.
let backfilling = false;
async function backfillCovers(items, repaint) {
  if (backfilling) return;
  const todo = items.filter((x) => !x.coverFast && !x.coverChecked && x.title);
  if (!todo.length) return;
  backfilling = true;
  let found = 0;
  const worker = async () => {
    for (let x; (x = todo.shift()); ) {
      try {
        const hit = await findAlbum(x.artist || "", x.title);
        const patch = hit?.cover ? { coverFast: hit.cover, deezerId: hit.id } : { coverChecked: true };
        Object.assign(x, patch);
        await update("music", x.id, patch);
        if (hit?.cover && ++found % 6 === 0) repaint();
      } catch (e) {
        console.warn("portada", x.title, e); // sin red / Deezer caído: se reintenta otro día
      }
    }
  };
  await Promise.all([worker(), worker()]);
  backfilling = false;
  if (found % 6) repaint();
}

export function render(root, { title = "Música", back } = {}) {
  return mountShelf(root, {
    col: "music",
    title,
    back,
    statusField: "status",
    tabs: [["listened", "Escuchados"], ["pending", "Pendientes"]],
    // Accesos directos junto a las pestañas (se abren en otra pestaña).
    links: [["Descubrir", "https://everynoise.com/engenremap-hiphop.html"]],
    noun: ["disco", "discos"],
    empty: {
      listened: "Todavía no hay discos. Buscá uno arriba para agregarlo.",
      pending: "No hay nada pendiente por escuchar.",
    },
    placeholder: "Buscar álbum, EP o sencillo…",
    searchEnabled: () => true,
    // MusicBrainz permite 1 request/seg: esperamos a que dejes de tipear.
    debounce: 700,
    search: (q) => searchMusic(q),
    enrich: async (r) => {
      r.loadingGenres = true;
      // La portada rápida se busca en paralelo con los géneros.
      const fast = findAlbum(r.artist || "", r.title).then((hit) => {
        if (hit?.cover) Object.assign(r, { coverFast: hit.cover, deezerId: hit.id });
      }).catch(() => {});
      const g = await musicGenres(r.mbid);
      r.genres = [...new Set([...g, ...r.genres])].slice(0, 8);
      r.loadingGenres = false;
      // Esperamos la portada como mucho 3 s más (si no, se completa al recargar).
      await Promise.race([fast, new Promise((ok) => setTimeout(ok, 3000))]);
    },
    // Al agregar, la ficha cambia a la portada rápida apenas aparece.
    resultImg: (r) => r.coverFast,
    afterLoad: backfillCovers,
    shapes: { big: 12, wide: 0 },
    // Portada propia (link o imagen subida) en coverCustom; si no, la de MusicBrainz.
    cover: { field: "coverCustom", ratio: "1 / 1" },
    // Ficha: canciones con fragmentos de 15 s y ♥. Tarjeta: contador de ♥.
    detailExtra: (x, sheet, repaint) => mountTracks(x, sheet, "music", repaint),
    badge: (x) => (x.liked?.length ? `<span class="tile-badge mono" aria-label="${x.liked.length} canciones favoritas">♥ ${x.liked.length}</span>` : ""),
    img: (x) => x.coverCustom || x.coverFast || x.coverUrl,
    imgAlt: (x) => (x.coverCustom ? x.coverFast || x.coverUrl : x.coverUrl),
    thumb: (x) => (x.coverCustom && !x.coverCustom.startsWith("data:") ? x.coverCustom
      : x.coverFast ? deezerCoverSize(x.coverFast, 250) : caaThumb(x)),
    sub: (x) => [x.artist, fmtShort(x.releaseDate)].filter(Boolean).join(" · "),
    resultSub: (r) => [r.artist, r.releaseDate?.slice(0, 4), typeLabel(r.type)].filter(Boolean).join(" · "),
    sorts: [
      ["release-desc", "lanzamiento ↓", byDate(-1)],
      ["release-asc", "lanzamiento ↑", byDate(1)],
      ["artist", "artista a–z", (a, b) => (a.artist || "").localeCompare(b.artist || "") || byDate(1)(a, b)],
      ["added", "agregados", (a, b) => (b.addedAt || "").localeCompare(a.addedAt || "")],
    ],
    filters: [
      { field: "genre", label: "Género", all: "todo género" },
      { field: "artist", label: "Artista", all: "todo artista" },
    ],
    pickers: async (r) => [
      { field: "type", label: "Tipo", options: TYPES, preselect: false, initial: r.type },
      { field: "genre", label: "Género", options: r.genres.map((v) => ({ v, l: v })), preselect: true, loading: r.loadingGenres !== false },
    ],
    details: (x) => [
      ["artista", x.artist],
      ["tipo", typeLabel(x.type)],
      ["lanzamiento", fmtShort(x.releaseDate)],
      ["género", x.genre],
    ],
    same: (x, r) => x.title === r.title && x.artist === r.artist,
    toDoc: (r, p) => ({
      title: r.title,
      artist: r.artist,
      coverUrl: r.coverUrl,
      ...(r.coverFast ? { coverFast: r.coverFast, deezerId: r.deezerId } : {}),
      releaseDate: r.releaseDate || "",
      type: p.type || r.type || "album",
      genre: p.genre || "",
    }),
  });
}

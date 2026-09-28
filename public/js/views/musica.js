import { mountShelf, byDate } from "../lib/shelf.js";
import { searchMusic, musicGenres } from "../lib/apis.js";
import { fmtShort } from "../lib/dates.js";

const TYPES = [
  { v: "album", l: "Álbum" },
  { v: "ep", l: "EP" },
  { v: "single", l: "Sencillo" },
];
const typeLabel = (t) => TYPES.find((x) => x.v === t)?.l || "";

export function render(root) {
  return mountShelf(root, {
    col: "music",
    title: "Música",
    statusField: "status",
    tabs: [["listened", "Escuchados"], ["pending", "Pendientes"]],
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
      const g = await musicGenres(r.mbid);
      r.genres = [...new Set([...g, ...r.genres])].slice(0, 8);
      r.loadingGenres = false;
    },
    shapes: { big: 12, wide: 0 },
    img: (x) => x.coverUrl,
    thumb: (x) => (x.coverUrl || "").replace(/front-500$/, "front-250"),
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
      releaseDate: r.releaseDate || "",
      type: p.type || r.type || "album",
      genre: p.genre || "",
    }),
  });
}

import { mountShelf, byDate } from "../lib/shelf.js";
import { searchGames, hasRawg, rawgImg } from "../lib/apis.js";
import { fmtShort } from "../lib/dates.js";

const opts = (arr) => arr.map((v) => ({ v, l: v }));

export function render(root) {
  return mountShelf(root, {
    col: "games",
    title: "Colección",
    statusField: "status",
    tabs: [["owned", "Colección"], ["wishlist", "Wishlist"]],
    noun: ["juego", "juegos"],
    empty: {
      owned: "Todavía no hay juegos. Buscá uno arriba para agregarlo.",
      wishlist: "La wishlist está vacía.",
    },
    placeholder: "Buscar juego para agregar…",
    searchEnabled: hasRawg,
    disabledMsg: "Falta la API key de RAWG en config.js",
    debounce: 350,
    search: searchGames,
    shapes: { big: 10, wide: 14 },
    img: (x) => rawgImg(x.coverUrl, 640),
    thumb: (x) => rawgImg(x.coverUrl, 200),
    sub: (x) => fmtShort(x.releaseDate) || "sin fecha",
    resultSub: (r) => [r.releaseDate?.slice(0, 4), r.platforms.slice(0, 3).join(", ")].filter(Boolean).join(" · "),
    sorts: [
      ["release-desc", "lanzamiento ↓", byDate(-1)],
      ["release-asc", "lanzamiento ↑", byDate(1)],
      ["added", "agregados", (a, b) => (b.addedAt || "").localeCompare(a.addedAt || "")],
    ],
    filters: [
      { field: "platform", label: "Plataforma", all: "toda plataforma" },
      { field: "genre", label: "Género", all: "todo género" },
    ],
    pickers: async (r) => [
      { field: "platform", label: "Plataforma", options: opts(r.platforms) },
      { field: "genre", label: "Género", options: opts(r.genres), preselect: true },
    ],
    details: (x) => [
      ["lanzamiento", fmtShort(x.releaseDate)],
      ["plataforma", x.platform],
      ["género", x.genre],
    ],
    same: (x, r) => x.title === r.title && (x.releaseDate || "") === (r.releaseDate || ""),
    toDoc: (r, p) => ({
      title: r.title,
      coverUrl: r.coverUrl,
      releaseDate: r.releaseDate || "",
      platform: p.platform || "",
      genre: p.genre || "",
    }),
  });
}

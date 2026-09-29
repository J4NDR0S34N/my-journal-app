import { mountShelf, byDate } from "../lib/shelf.js";
import { searchGames, hasRawg, rawgImg, steamBox, findSlug } from "../lib/apis.js";
import { fmtShort } from "../lib/dates.js";
import { update } from "../store.js";
import { render as renderGame } from "./juego.js";

const opts = (arr) => arr.map((v) => ({ v, l: v }));

// Portada de la tarjeta: carátula vertical (Steam o personalizada) o, si no
// hay, la imagen horizontal de RAWG.
export const boxImg = (g) => g.boxUrl || rawgImg(g.coverUrl, 640);

// Juegos guardados antes de las carátulas verticales: se buscan una sola vez
// en segundo plano y se guardan (boxChecked evita repetir la búsqueda).
let backfilling = false;
async function backfillBoxes(items, repaint) {
  if (backfilling || !hasRawg()) return;
  backfilling = true;
  for (const g of items.filter((x) => !x.boxChecked)) {
    const slug = g.slug || (await findSlug(g.title));
    const boxUrl = g.boxUrl || (await steamBox(slug));
    const patch = { boxChecked: true, slug: slug || "", ...(boxUrl ? { boxUrl } : {}) };
    try {
      await update("games", g.id, patch);
      Object.assign(g, patch);
      if (boxUrl) repaint();
    } catch (err) {
      console.warn("carátula", err);
    }
  }
  backfilling = false;
}

// Posición del scroll del listado, para volver al mismo lugar desde un juego.
let listScroll = 0;

export async function render(root, id) {
  if (id) return renderGame(root, id);
  if (listScroll) setTimeout(() => scrollTo(0, listScroll), 80);
  return mountShelf(root, {
    // Tocar un juego abre su página (#/coleccion/{id}).
    onOpen: (gameId) => {
      listScroll = scrollY;
      sessionStorage.setItem("mj:fromList", "1");
      location.hash = `#/coleccion/${encodeURIComponent(gameId)}`;
    },
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
    // Al elegir un resultado, buscamos su carátula vertical en Steam.
    enrich: async (r) => {
      r.boxUrl = await steamBox(r.slug);
      r.boxChecked = true;
    },
    afterLoad: backfillBoxes,
    // Tarjetas grandes con nombre y año debajo de la portada.
    captionBelow: true,
    shapes: { big: 0, wide: 0 },
    img: boxImg,
    thumb: (x) => rawgImg(x.coverUrl, 200),
    sub: (x) => x.releaseDate?.slice(0, 4) || "sin fecha",
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
      slug: r.slug || "",
      boxUrl: r.boxUrl || "",
      boxChecked: !!r.boxChecked,
    }),
  });
}

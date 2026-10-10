import { mountShelf, byDate } from "../lib/shelf.js";
import { searchGames, hasRawg, rawgImg, steamBox, findSlug } from "../lib/apis.js";
import { fmtShort } from "../lib/dates.js";
import { update } from "../store.js";
import { esc } from "../lib/ui.js";
import { listCollections, getCollection, FACTORY } from "../lib/collections.js";
import { render as renderGame } from "./juego.js";
import { render as renderMusic } from "./musica.js";

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

// #/coleccion                    portal (una tarjeta por colección)
// #/coleccion/videojuegos        juegos · #/coleccion/videojuegos/{id} un juego
// #/coleccion/musica             música · #/coleccion/c-xxxx creada por vos
export async function render(root, sub, extra) {
  if (!sub) return renderPortal(root);
  // Nombre actual de la colección (se puede renombrar); mientras carga, el de fábrica.
  const fallback = FACTORY.find((f) => f.id === sub)?.name || "Colección";
  const meta = await getCollection(sub).catch(() => null);
  const name = meta?.name || fallback;
  if (!root.isConnected) return;
  document.title = `${name} — My Journal`;
  const back = { href: "#/coleccion", label: "Colección" };
  if (sub === "videojuegos") return extra ? renderGame(root, extra, name) : renderGames(root, name, back);
  if (sub === "musica") return renderMusic(root, { title: name, back });
  root.innerHTML = `
    <section class="page">
      <a class="back mono" href="#/coleccion">‹ Colección</a>
      <p class="empty mono muted">Esta colección ya no existe.</p>
    </section>`;
}

async function renderPortal(root) {
  root.innerHTML = `
    <section class="page portal">
      <header class="page-head"><h1>Colección</h1></header>
      <ul class="portal-grid"></ul>
    </section>`;
  const grid = root.querySelector(".portal-grid");
  const paint = (cols) => {
    grid.innerHTML = cols.map((c, i) => `
      <li style="--i:${i}">
        <a class="portal-tile" href="#/coleccion/${encodeURIComponent(c.id)}">
          <span class="portal-name">${esc(c.name)}</span>
        </a>
      </li>`).join("");
  };
  paint(FACTORY);
  paint(await listCollections());
}

function renderGames(root, title, back) {
  if (listScroll) setTimeout(() => scrollTo(0, listScroll), 80);
  return mountShelf(root, {
    // Tocar un juego abre su página (#/coleccion/videojuegos/{id}).
    onOpen: (gameId) => {
      listScroll = scrollY;
      sessionStorage.setItem("mj:fromList", "1");
      location.hash = `#/coleccion/videojuegos/${encodeURIComponent(gameId)}`;
    },
    col: "games",
    title,
    back,
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

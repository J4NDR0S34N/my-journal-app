// Estante genérico: buscador con autocompletar + grid mosaico + filtros.
// Con cfg.sortMenu (solo Música) los filtros pasan a un botón con panel de
// orden y aparecen tres vistas: mosaico, simple (tarjetas) y lista.
// Lo usan las colecciones de Videojuegos (games) y Música (music).

import { list, add, update, remove } from "../store.js";
import { esc, debounce, toast, confirmTap, openSheet, plural } from "./ui.js";
import { logActivity } from "./activity.js";
import { openCoverSheet } from "./coverSheet.js";

// Tamaño estable por id para el mosaico (1x1, ancho 2x1, grande 2x2).
function tileSize(id, shapes) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const r = h % 100;
  if (r < shapes.big) return "big";
  if (r < shapes.big + shapes.wide) return "wide";
  return "";
}

const byDate = (dir) => (a, b) => {
  const x = a.releaseDate || "", y = b.releaseDate || "";
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return dir * x.localeCompare(y);
};

// Íconos SVG simples (trazo 1.5, color del texto).
const ICON = {
  filter: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  mosaic: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4h9v9H4zM15 4h5v5h-5zM15 11h5v9h-5zM4 15h9v5H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  simple: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 15h7M13 15h7M4 19h5M13 19h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  list: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h4v4H4zM4 15h4v4H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M11 6h9M11 9h6M11 16h9M11 19h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};
const VIEWS = [["mosaic", "Vista mosaico"], ["simple", "Vista simple"], ["list", "Vista lista"]];

export function mountShelf(root, cfg) {
  const prefKey = `mj:shelf:${cfg.col}`;
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(prefKey)) || {}; } catch {}
  const sorts = cfg.sortMenu || cfg.sorts;
  const state = {
    tab: pref.tab || cfg.tabs[0][0],
    sort: sorts.some(([k]) => k === pref.sort) ? pref.sort : sorts[0][0],
    view: cfg.sortMenu && VIEWS.some(([k]) => k === pref.view) ? pref.view : "mosaic",
    filters: {},
    items: [],
    open: null,
  };
  const tabLabel = (k) => cfg.tabs.find(([t]) => t === k)?.[1] || "";
  const savePref = () => {
    try { localStorage.setItem(prefKey, JSON.stringify({ tab: state.tab, sort: state.sort, view: state.view })); } catch {}
  };

  root.innerHTML = `
    <section class="page shelf shelf-${cfg.col}">
      ${cfg.back ? `<a class="back mono" href="${cfg.back.href}">‹ ${esc(cfg.back.label)}</a>` : ""}
      <header class="page-head">
        <h1>${esc(cfg.title)}</h1>
        <nav class="tabs mono">
          <span class="tabs-list" role="tablist">${cfg.tabs.map(([k, l]) => `<button role="tab" data-tab="${k}">${l}</button>`).join("")}</span>
          ${(cfg.links || []).map(([l, href]) => `<a class="tab-link" href="${esc(href)}" target="_blank" rel="noopener">${esc(l)}<span aria-hidden="true">↗</span></a>`).join("")}
        </nav>
      </header>
      <div class="search">
        <input type="search" class="search-in" placeholder="${cfg.placeholder}" autocomplete="off" enterkeyhint="search" />
        <div class="search-pop" hidden></div>
      </div>
      ${cfg.sortMenu ? `
      <div class="shelf-tools">
        <div class="sort-menu">
          <button class="tool-btn sort-btn" aria-label="Filtrar y ordenar" aria-haspopup="menu" aria-expanded="false">${ICON.filter}<span class="sort-current"></span></button>
          <div class="sort-pop" role="menu" aria-label="Ordenar por" hidden>
            ${sorts.map(([k, l]) => `<button role="menuitemradio" data-sort="${k}" aria-checked="false">${l}</button>`).join("")}
          </div>
        </div>
        <div class="view-switch" role="group" aria-label="Vista">
          ${VIEWS.map(([k, l]) => `<button class="tool-btn" data-view="${k}" aria-label="${l}" aria-pressed="false">${ICON[k]}</button>`).join("")}
        </div>
        <span class="f-count muted"></span>
      </div>` : `
      <div class="filters mono">
        <select class="f-sort" aria-label="Orden">
          ${sorts.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}
        </select>
        ${cfg.filters.map((f) => `<select class="f-filter" data-field="${f.field}" aria-label="${f.label}"></select>`).join("")}
        <span class="f-count muted"></span>
      </div>`}
      <div class="grid-wrap"></div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const input = $(".search-in"), pop = $(".search-pop"), grid = $(".grid-wrap");

  if (!cfg.searchEnabled()) {
    input.disabled = true;
    input.placeholder = cfg.disabledMsg;
  }

  // ---------- grid ----------
  function visible() {
    let arr = state.items.filter((x) => x[cfg.statusField] === state.tab);
    for (const [field, val] of Object.entries(state.filters)) {
      if (val) arr = arr.filter((x) => (x[field] || "") === val);
    }
    const s = sorts.find(([k]) => k === state.sort)?.[2] || byDate(-1);
    return arr.sort(s);
  }

  // Orden "Género": un grupo por género (A–Z, sin género al final).
  function groups(arr) {
    const group = sorts.find(([k]) => k === state.sort)?.[3];
    if (!group) return [{ label: "", items: arr }];
    const map = new Map();
    for (const x of arr) {
      const g = group(x) || "";
      map.has(g) || map.set(g, []);
      map.get(g).push(x);
    }
    return [...map].map(([label, items]) => ({ label: label || "Sin género", items, none: !label }))
      .sort((a, b) => a.none - b.none || a.label.localeCompare(b.label, "es"));
  }

  function paintFilters() {
    if (cfg.sortMenu) return paintTools();
    const inTab = state.items.filter((x) => x[cfg.statusField] === state.tab);
    root.querySelectorAll(".f-filter").forEach((sel) => {
      const f = cfg.filters.find((x) => x.field === sel.dataset.field);
      const vals = [...new Set(inTab.map((x) => x[f.field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const cur = state.filters[f.field] || "";
      if (cur && !vals.includes(cur)) state.filters[f.field] = "";
      sel.innerHTML = `<option value="">${f.all}</option>` +
        vals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      sel.value = state.filters[f.field] || "";
      sel.hidden = vals.length === 0;
    });
    $(".f-sort").value = state.sort;
  }

  function paintGrid() {
    root.querySelectorAll("[data-tab]").forEach((b) =>
      b.setAttribute("aria-selected", b.dataset.tab === state.tab));
    paintFilters();
    const arr = visible();
    $(".f-count").textContent = plural(arr.length, cfg.noun[0], cfg.noun[1]);
    if (!arr.length) {
      grid.innerHTML = `<p class="empty mono muted">${state.loaded ? cfg.empty[state.tab] : "cargando…"}</p>`;
      return;
    }
    // Vistas: "cards" (portada con el texto debajo), "rows" (lista de una
    // columna) o mosaico (texto encima de la portada al tocar).
    const view = cfg.captionBelow ? "simple" : state.view;
    const cls = { simple: "grid cards", list: "grid rows", mosaic: "grid" }[view];
    const tile = { simple: cardHtml, list: rowHtml, mosaic: mosaicHtml }[view];
    grid.innerHTML = groups(arr).map((g) => `
      ${g.label ? `<h3 class="grid-group">${esc(g.label)} <span class="mono muted">${g.items.length}</span></h3>` : ""}
      <div class="${cls}${cfg.squareCards ? " square" : ""}">${g.items.map(tile).join("")}</div>`).join("");
    grid.querySelectorAll("img").forEach((img) => img.addEventListener("error", onTileImgError));
  }

  const cardHtml = (x) => `
      <figure class="tile card" data-id="${x.id}" data-detail tabindex="0">
        <div class="tile-media">
          <img src="${esc(cfg.img(x))}"${altAttr(x)} alt="" loading="lazy" decoding="async" />
          <span class="tile-fallback">${esc(x.title)}</span>
          ${cfg.badge && !cfg.captionBelow ? cfg.badge(x) : ""}
        </div>
        <figcaption>
          <b>${esc(x.title)}</b>
          <span class="mono">${esc((cfg.cardSub || cfg.sub)(x))}</span>
        </figcaption>
      </figure>`;

  const mosaicHtml = (x) => `
      <figure class="tile ${tileSize(x.id, cfg.shapes)}${state.open === x.id ? " open" : ""}" data-id="${x.id}" tabindex="0">
        <img src="${esc(cfg.img(x))}"${altAttr(x)} alt="" loading="lazy" decoding="async" />
        <span class="tile-fallback">${esc(x.title)}</span>
        ${cfg.badge ? cfg.badge(x) : ""}
        <figcaption>
          <b>${esc(x.title)}</b>
          <span class="mono">${esc(cfg.sub(x))}</span>
          <button class="tile-more mono" data-act="more">opciones</button>
        </figcaption>
      </figure>`;

  // Fila: portada chica a la izquierda; título, artista, año y ♥ a la derecha.
  const rowHtml = (x) => {
    const src = cfg.listImg?.(x) || cfg.img(x);
    const alt = cfg.img(x) !== src ? ` data-alt="${esc(cfg.img(x))}"` : "";
    const likes = x.liked?.length || 0;
    return `
      <article class="tile row" data-id="${x.id}" data-detail tabindex="0">
        <span class="row-cover">
          <img src="${esc(src)}"${alt} alt="" loading="lazy" decoding="async" />
          <span class="tile-fallback"></span>
        </span>
        <span class="row-txt">
          <b>${esc(x.title)}</b>
          <span>${esc(x.artist || "")}</span>
        </span>
        <span class="row-meta mono">
          <span>${esc(x.releaseDate?.slice(0, 4) || "")}</span>
          ${likes ? `<span class="row-likes" aria-label="${likes} canciones favoritas">♥ ${likes}</span>` : ""}
        </span>
      </article>`;
  };

  // ---------- orden y vista (Música) ----------
  function paintTools() {
    const cur = sorts.find(([k]) => k === state.sort);
    $(".sort-current").textContent = cur[1];
    root.querySelectorAll("[data-sort]").forEach((b) => b.setAttribute("aria-checked", b.dataset.sort === state.sort));
    root.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === state.view));
  }

  // cfg.imgAlt(x): imagen de respaldo si la principal no carga (p. ej. la
  // portada rápida de Deezer → la de Cover Art Archive).
  function altAttr(x) {
    const alt = cfg.imgAlt?.(x);
    return alt && alt !== cfg.img(x) ? ` data-alt="${esc(alt)}"` : "";
  }
  function onTileImgError(e) {
    const img = e.currentTarget;
    if (img.dataset.alt) {
      img.src = img.dataset.alt;
      delete img.dataset.alt;
      return;
    }
    img.removeEventListener("error", onTileImgError);
    img.closest(".tile").classList.add("noimg");
  }

  grid.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const id = tile.dataset.id;
    if (cfg.onOpen) return cfg.onOpen(id);
    if ("detail" in tile.dataset || e.target.closest('[data-act="more"]')) return openDetail(id);
    state.open = state.open === id ? null : id;
    grid.querySelectorAll(".tile.open").forEach((t) => t !== tile && t.classList.remove("open"));
    tile.classList.toggle("open", state.open === id);
  });
  grid.addEventListener("keydown", (e) => {
    const tile = e.target.closest(".tile");
    if (tile && e.key === "Enter") (cfg.onOpen || openDetail)(tile.dataset.id);
  });

  function openDetail(id) {
    const x = state.items.find((i) => i.id === id);
    if (!x) return;
    const other = cfg.tabs.find(([k]) => k !== x[cfg.statusField]);
    const sh = openSheet(`
      <div class="detail">
        <img class="detail-img" src="${esc(cfg.img(x))}"${altAttr(x)} alt="" />
        <div class="detail-body">
          <h2>${esc(x.title)}</h2>
          <dl class="mono">${cfg.details(x).filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
          <div class="detail-actions">
            <button class="btn" data-act="move">Mover a ${other[1]}</button>
            ${cfg.cover ? `<button class="btn btn-ghost" data-act="cover">Cambiar portada</button>` : ""}
            <button class="btn btn-ghost" data-act="del">Borrar</button>
          </div>
        </div>
      </div>`);
    sh.el.querySelector(".detail-img").addEventListener("error", function onErr(e) {
      const img = e.currentTarget;
      if (img.dataset.alt) { img.src = img.dataset.alt; delete img.dataset.alt; return; }
      img.removeEventListener("error", onErr);
      img.remove();
    });
    // Contenido extra de la ficha (ej. canciones de un disco en Música).
    cfg.detailExtra?.(x, sh, paintGrid);
    sh.el.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "cover") {
        // Portada propia: se guarda en cfg.cover.field y reemplaza a la original.
        const field = cfg.cover.field;
        sh.close();
        openCoverSheet({
          current: cfg.img(x),
          ratio: cfg.cover.ratio,
          canReset: !!x[field],
          save: async (url) => {
            await update(cfg.col, id, { [field]: url });
            x[field] = url;
            paintGrid();
            toast(url ? "Portada actualizada" : "Volvió la portada original");
            if (url) logActivity(cfg.col, `Cambiaste la portada de ${x.title}`, { img: url.startsWith("data:") ? "" : url });
          },
        });
      } else if (act === "move") {
        const status = other[0];
        await update(cfg.col, id, { [cfg.statusField]: status });
        x[cfg.statusField] = status;
        logActivity(cfg.col, `Moviste ${x.title} a ${other[1]}`, { img: cfg.thumb(x) });
        sh.close();
        toast(`Movido a ${other[1]}`);
        paintGrid();
      } else if (act === "del") {
        confirmTap(e.target.closest("button"), async () => {
          await remove(cfg.col, id);
          logActivity(cfg.col, `Borraste ${x.title} de ${tabLabel(x[cfg.statusField])}`);
          state.items = state.items.filter((i) => i.id !== id);
          sh.close();
          paintGrid();
        });
      }
    });
  }

  // ---------- tabs / filtros ----------
  $(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    state.filters = {};
    state.open = null;
    savePref();
    paintGrid();
  });
  $(".f-sort")?.addEventListener("change", (e) => { state.sort = e.target.value; savePref(); paintGrid(); });

  // Panel de orden: se cierra al elegir, al tocar afuera o con Escape.
  const sortBtn = $(".sort-btn"), sortPop = $(".sort-pop");
  const setSortOpen = (v, focusBtn) => {
    if (!sortPop) return;
    sortPop.hidden = !v;
    sortBtn.setAttribute("aria-expanded", v);
    if (v) sortPop.querySelector('[aria-checked="true"]')?.focus();
    else if (focusBtn) sortBtn.focus();
  };
  sortBtn?.addEventListener("click", () => setSortOpen(sortPop.hidden));
  sortPop?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    state.sort = b.dataset.sort;
    state.open = null;
    savePref();
    setSortOpen(false, true);
    paintGrid();
  });
  sortPop?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...sortPop.querySelectorAll("[data-sort]")];
    const i = items.indexOf(document.activeElement) + (e.key === "ArrowDown" ? 1 : -1);
    items[(i + items.length) % items.length].focus();
  });
  const onSortKey = (e) => { if (e.key === "Escape" && sortPop && !sortPop.hidden) setSortOpen(false, true); };
  document.addEventListener("keydown", onSortKey);
  root.querySelector(".view-switch")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b || b.dataset.view === state.view) return;
    state.view = b.dataset.view;
    state.open = null;
    savePref();
    paintGrid();
  });
  root.querySelectorAll(".f-filter").forEach((sel) =>
    sel.addEventListener("change", () => { state.filters[sel.dataset.field] = sel.value; paintGrid(); }));

  // ---------- búsqueda ----------
  let results = [], seq = 0, ctrl;
  const closePop = () => { pop.hidden = true; pop.innerHTML = ""; };

  const runSearch = debounce(async (q) => {
    const my = ++seq;
    ctrl?.abort();
    ctrl = new AbortController();
    pop.hidden = false;
    pop.innerHTML = `<p class="pop-msg mono muted">buscando…</p>`;
    try {
      const r = await cfg.search(q, ctrl.signal);
      if (my !== seq) return;
      results = r;
      if (!r.length) { pop.innerHTML = `<p class="pop-msg mono muted">sin resultados</p>`; return; }
      pop.innerHTML = r.map((x, i) => `
        <button class="result" data-i="${i}">
          <span class="result-img"><img src="${esc(x.thumb)}" alt="" loading="lazy" /></span>
          <span class="result-txt">
            <b>${esc(x.title)}</b>
            <span class="mono muted">${esc(cfg.resultSub(x))}</span>
          </span>
        </button>`).join("");
      pop.querySelectorAll("img").forEach((img) =>
        img.addEventListener("error", () => img.remove(), { once: true }));
    } catch (err) {
      if (err.name === "AbortError" || my !== seq) return;
      pop.innerHTML = `<p class="pop-msg mono muted">error al buscar — probá de nuevo</p>`;
      console.error(err);
    }
  }, cfg.debounce);

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (q.length < 2) { seq++; closePop(); return; }
    runSearch(q);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { input.value = ""; closePop(); } });
  const outside = (e) => {
    if (!e.target.closest(".search")) closePop();
    if (sortPop && !sortPop.hidden && !e.target.closest(".sort-menu")) setSortOpen(false);
  };
  document.addEventListener("pointerdown", outside);

  pop.addEventListener("click", async (e) => {
    const b = e.target.closest(".result");
    if (!b) return;
    const r = results[+b.dataset.i];
    closePop();
    input.blur();
    openAdd(r);
  });

  async function openAdd(r) {
    const picks = {};
    const status = { v: state.tab };
    const chips = (group, opts, cur) => `
      <div class="chips" data-group="${group}">
        ${opts.map((o) => `<button class="chip mono" data-v="${esc(o.v)}" aria-pressed="${o.v === cur}">${esc(o.l)}</button>`).join("")}
      </div>`;
    const sh = openSheet(`
      <div class="detail add">
        <img class="detail-img" src="${esc(r.coverUrl)}" alt="" />
        <div class="detail-body">
          <h2>${esc(r.title)}</h2>
          <p class="mono muted">${esc(cfg.resultSub(r))}</p>
          <div class="pickers"></div>
          <p class="mono label">Guardar en</p>
          ${chips("__status", cfg.tabs.map(([v, l]) => ({ v, l })), status.v)}
          <div class="detail-actions">
            <button class="btn" data-act="save">Agregar</button>
            <button class="btn btn-ghost" data-close>Cancelar</button>
          </div>
        </div>
      </div>`);
    sh.el.querySelector(".detail-img").addEventListener("error", (e) => e.target.remove(), { once: true });

    const pickersEl = sh.el.querySelector(".pickers");
    async function paintPickers() {
      const groups = await cfg.pickers(r);
      pickersEl.innerHTML = groups.map((g) => {
        if (picks[g.field] === undefined && g.options.length)
          picks[g.field] = g.initial ?? (g.options.length === 1 || g.preselect ? g.options[0].v : "");
        return g.options.length
          ? `<p class="mono label">${g.label}</p>${chips(g.field, g.options, picks[g.field])}`
          : `<p class="mono label">${g.label} <span class="muted">— ${g.loading ? "cargando…" : "sin datos"}</span></p>`;
      }).join("");
    }
    paintPickers();
    cfg.enrich?.(r).then(() => {
      if (!sh.el.isConnected) return;
      paintPickers();
      const fast = cfg.resultImg?.(r), img = sh.el.querySelector(".detail-img");
      if (fast && img) img.src = fast;
    });

    sh.el.addEventListener("click", async (e) => {
      const chip = e.target.closest(".chip");
      if (chip) {
        const group = chip.parentElement.dataset.group;
        const v = chip.dataset.v;
        if (group === "__status") status.v = v;
        else picks[group] = picks[group] === v ? "" : v;
        chip.parentElement.querySelectorAll(".chip").forEach((c) =>
          c.setAttribute("aria-pressed", c.dataset.v === (group === "__status" ? status.v : picks[group])));
        return;
      }
      if (e.target.closest('[data-act="save"]')) {
        const dup = state.items.find((x) => cfg.same(x, r));
        if (dup) { toast("Ya está guardado"); return; }
        const doc = { ...cfg.toDoc(r, picks), [cfg.statusField]: status.v, addedAt: new Date().toISOString() };
        try {
          const id = await add(cfg.col, doc);
          state.items.push({ id, ...doc });
          logActivity(cfg.col, `Agregaste ${doc.title} a ${tabLabel(status.v)}`, { img: cfg.thumb(doc) });
          state.tab = status.v;
          savePref();
          sh.close();
          input.value = "";
          paintGrid();
          toast("Agregado");
        } catch (err) {
          toast("No se pudo guardar");
          console.error(err);
        }
      }
    });
  }

  // ---------- carga ----------
  list(cfg.col).then((items) => {
    state.items = items;
    state.loaded = true;
    paintGrid();
    cfg.afterLoad?.(state.items, () => root.isConnected && paintGrid());
  });
  paintGrid();

  return () => {
    document.removeEventListener("pointerdown", outside);
    document.removeEventListener("keydown", onSortKey);
  };
}

export { byDate };

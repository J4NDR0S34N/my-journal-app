// Estante genérico: buscador con autocompletar + grid mosaico + filtros.
// Lo usan Colección (games) y Música (music).

import { list, add, update, remove } from "../store.js";
import { esc, debounce, toast, confirmTap, openSheet, plural } from "./ui.js";
import { logActivity } from "./activity.js";

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

export function mountShelf(root, cfg) {
  const prefKey = `mj:shelf:${cfg.col}`;
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(prefKey)) || {}; } catch {}
  const state = {
    tab: pref.tab || cfg.tabs[0][0],
    sort: pref.sort || "release-desc",
    filters: {},
    items: [],
    open: null,
  };
  const tabLabel = (k) => cfg.tabs.find(([t]) => t === k)?.[1] || "";
  const savePref = () => {
    try { localStorage.setItem(prefKey, JSON.stringify({ tab: state.tab, sort: state.sort })); } catch {}
  };

  root.innerHTML = `
    <section class="page shelf shelf-${cfg.col}">
      <header class="page-head">
        <h1>${cfg.title}</h1>
        <nav class="tabs mono" role="tablist">
          ${cfg.tabs.map(([k, l]) => `<button role="tab" data-tab="${k}">${l}</button>`).join("")}        </nav>
      </header>
      <div class="search">
        <input type="search" class="search-in" placeholder="${cfg.placeholder}" autocomplete="off" enterkeyhint="search" />
        <div class="search-pop" hidden></div>
      </div>
      <div class="filters mono">
        <select class="f-sort" aria-label="Orden">
          ${cfg.sorts.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}
        </select>
        ${cfg.filters.map((f) => `<select class="f-filter" data-field="${f.field}" aria-label="${f.label}"></select>`).join("")}
        <span class="f-count muted"></span>
      </div>
      <div class="grid-wrap"><div class="grid"></div></div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const input = $(".search-in"), pop = $(".search-pop"), grid = $(".grid");

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
    const s = cfg.sorts.find(([k]) => k === state.sort)?.[2] || byDate(-1);
    return arr.sort(s);
  }

  function paintFilters() {
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
    // "cards": portada grande con el texto debajo; si no, mosaico con el texto encima.
    grid.classList.toggle("cards", !!cfg.captionBelow);
    grid.innerHTML = arr.map((x) => cfg.captionBelow ? `
      <figure class="tile card" data-id="${x.id}" tabindex="0">
        <div class="tile-media">
          <img src="${esc(cfg.img(x))}" alt="" loading="lazy" decoding="async" />
          <span class="tile-fallback">${esc(x.title)}</span>
        </div>
        <figcaption>
          <b>${esc(x.title)}</b>
          <span class="mono">${esc(cfg.sub(x))}</span>
        </figcaption>
      </figure>` : `
      <figure class="tile ${tileSize(x.id, cfg.shapes)}${state.open === x.id ? " open" : ""}" data-id="${x.id}" tabindex="0">
        <img src="${esc(cfg.img(x))}" alt="" loading="lazy" decoding="async" />
        <span class="tile-fallback">${esc(x.title)}</span>
        <figcaption>
          <b>${esc(x.title)}</b>
          <span class="mono">${esc(cfg.sub(x))}</span>
          <button class="tile-more mono" data-act="more">opciones</button>
        </figcaption>
      </figure>`).join("");
    grid.querySelectorAll("img").forEach((img) =>
      img.addEventListener("error", () => img.closest(".tile").classList.add("noimg"), { once: true }));
  }

  grid.addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const id = tile.dataset.id;
    if (cfg.onOpen) return cfg.onOpen(id);
    if (cfg.captionBelow || e.target.closest('[data-act="more"]')) return openDetail(id);
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
        <img class="detail-img" src="${esc(cfg.img(x))}" alt="" />
        <div class="detail-body">
          <h2>${esc(x.title)}</h2>
          <dl class="mono">${cfg.details(x).filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
          <div class="detail-actions">
            <button class="btn" data-act="move">Mover a ${other[1]}</button>
            <button class="btn btn-ghost" data-act="del">Borrar</button>
            <button class="btn btn-ghost" data-close>Cerrar</button>
          </div>
        </div>
      </div>`);
    sh.el.querySelector(".detail-img").addEventListener("error", (e) => e.target.remove(), { once: true });
    sh.el.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "move") {
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
  $(".f-sort").addEventListener("change", (e) => { state.sort = e.target.value; savePref(); paintGrid(); });
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
  const outside = (e) => { if (!e.target.closest(".search")) closePop(); };
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
    cfg.enrich?.(r).then(() => sh.el.isConnected && paintPickers());

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

  return () => document.removeEventListener("pointerdown", outside);
}

export { byDate };

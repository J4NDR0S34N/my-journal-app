// Colección genérica (creada por vos): ítems cargados a mano, sin búsqueda.
// Cada ítem vive en `collectionItems` con el id de su colección.

import { add, update, remove } from "../store.js";
import { listItems } from "../lib/collections.js";
import { compressCover } from "../lib/image.js";
import { logActivity } from "../lib/activity.js";
import { fmtShort } from "../lib/dates.js";
import { esc, toast, confirmTap, openSheet, plural } from "../lib/ui.js";

const TABS = [["owned", "En colección"], ["wishlist", "Deseado"]];
const tabLabel = (k) => TABS.find(([t]) => t === k)?.[1] || "";
const SORTS = [
  ["recent", "reciente", (a, b) => (b.addedAt || "").localeCompare(a.addedAt || "")],
  ["old", "antiguo", (a, b) => (a.addedAt || "").localeCompare(b.addedAt || "")],
  ["title", "alfabético", (a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" })],
];

export async function render(root, col, back) {
  const prefKey = `mj:shelf:${col.id}`;
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(prefKey)) || {}; } catch {}
  const state = {
    tab: TABS.some(([k]) => k === pref.tab) ? pref.tab : "owned",
    sort: SORTS.some(([k]) => k === pref.sort) ? pref.sort : "recent",
    items: [],
    loaded: false,
  };
  const savePref = () => {
    try { localStorage.setItem(prefKey, JSON.stringify({ tab: state.tab, sort: state.sort })); } catch {}
  };
  const where = { route: `coleccion/${col.id}`, where: col.name };

  root.innerHTML = `
    <section class="page shelf shelf-custom">
      <a class="back mono" href="${back.href}">‹ ${esc(back.label)}</a>
      <header class="page-head">
        <h1>${esc(col.name)}</h1>
        <nav class="tabs mono"><span class="tabs-list" role="tablist">
          ${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}">${l}</button>`).join("")}
        </span></nav>
      </header>
      <div class="filters mono">
        <button class="btn btn-sm" data-act="add">+ Agregar</button>
        <select class="f-sort" aria-label="Orden">
          ${SORTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}
        </select>
        <span class="f-count muted"></span>
      </div>
      <div class="grid-wrap"><div class="grid cards"></div></div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const grid = $(".grid");

  function paint() {
    root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === state.tab));
    $(".f-sort").value = state.sort;
    const arr = state.items.filter((x) => x.status === state.tab).sort(SORTS.find(([k]) => k === state.sort)[2]);
    $(".f-count").textContent = plural(arr.length, "ítem", "ítems");
    if (!arr.length) {
      grid.innerHTML = `<p class="empty mono muted">${!state.loaded ? "cargando…"
        : state.tab === "owned" ? "Todavía no hay nada. Tocá “+ Agregar” para sumar el primero." : "No hay nada deseado por ahora."}</p>`;
      return;
    }
    grid.innerHTML = arr.map((x) => `
      <figure class="tile card${x.coverUrl ? "" : " noimg"}" data-id="${x.id}" tabindex="0">
        <div class="tile-media">
          ${x.coverUrl ? `<img src="${esc(x.coverUrl)}" alt="" loading="lazy" decoding="async" />` : ""}
          <span class="tile-fallback">${esc(x.title)}</span>
        </div>
        <figcaption>
          <b>${esc(x.title)}</b>
          <span class="mono">${esc(fmtShort(x.addedAt?.slice(0, 10)))}</span>
        </figcaption>
      </figure>`).join("");
    grid.querySelectorAll("img").forEach((img) =>
      img.addEventListener("error", () => img.closest(".tile").classList.add("noimg"), { once: true }));
  }

  // ---------- formulario (agregar / editar) ----------
  function openForm(x = null) {
    let cover = x?.coverUrl || "";
    const sh = openSheet(`
      <form class="form item-form">
        <h2>${x ? "Editar" : "Agregar"}</h2>
        <label class="mono label">Título
          <input name="title" type="text" required maxlength="200" autocomplete="off" value="${esc(x?.title)}" />
        </label>
        <div class="item-cover">
          <div class="cover-preview"><img alt="" ${cover ? `src="${esc(cover)}"` : "hidden"} /></div>
          <div class="item-cover-in">
            <label class="mono label">Portada (link)
              <input name="cover" type="text" inputmode="url" autocomplete="off" placeholder="https://…" value="${cover.startsWith("data:") ? "" : esc(cover)}" />
            </label>
            <div class="detail-actions">
              <label class="btn btn-ghost btn-sm">Subir imagen<input type="file" accept="image/*" hidden class="cover-file" /></label>
              <button type="button" class="btn btn-ghost btn-sm" data-act="nocover" ${cover ? "" : "hidden"}>Quitar</button>
            </div>
          </div>
        </div>
        <label class="mono label">Nota (opcional)
          <textarea name="note" rows="3" maxlength="2000">${esc(x?.note)}</textarea>
        </label>
        <p class="mono label">Estado</p>
        <div class="chips" data-group="status">
          ${TABS.map(([k, l]) => `<button type="button" class="chip mono" data-v="${k}" aria-pressed="${k === (x?.status || state.tab)}">${l}</button>`).join("")}
        </div>
        <p class="mono muted cover-msg"></p>
        <div class="detail-actions">
          <button class="btn" type="submit">${x ? "Guardar" : "Agregar"}</button>
          <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
        </div>
      </form>`);
    const f = sh.el.querySelector("form");
    const img = sh.el.querySelector(".cover-preview img");
    const msg = (t) => (sh.el.querySelector(".cover-msg").textContent = t);
    let status = x?.status || state.tab;
    const showCover = (url) => {
      cover = url;
      img.hidden = !url;
      if (url) img.src = url; else img.removeAttribute("src");
      sh.el.querySelector('[data-act="nocover"]').hidden = !url;
    };
    img.addEventListener("error", () => { if (cover) msg("No se pudo cargar esa imagen; probá con el link directo a la imagen."); });
    f.cover.addEventListener("change", () => {
      let url = f.cover.value.trim();
      if (url && !/^(https?:|data:)/i.test(url)) url = `https://${url}`;
      msg("");
      showCover(url);
    });
    sh.el.querySelector(".cover-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      msg("comprimiendo…");
      try { showCover(await compressCover(file)); f.cover.value = ""; msg(""); }
      catch (err) { msg("No se pudo leer la imagen."); console.error(err); }
    });
    sh.el.addEventListener("click", (e) => {
      if (e.target.closest('[data-act="nocover"]')) { f.cover.value = ""; showCover(""); return; }
      const chip = e.target.closest(".chip");
      if (!chip) return;
      status = chip.dataset.v;
      chip.parentElement.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === chip));
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = f.title.value.trim();
      if (!title) return;
      const note = f.note.value.trim();
      const data = { title, status, coverUrl: cover, note };
      try {
        if (x) {
          await update("collectionItems", x.id, data);
          Object.assign(x, data);
          toast("Guardado");
        } else {
          const doc = { collectionId: col.id, ...data, addedAt: new Date().toISOString() };
          const id = await add("collectionItems", doc);
          state.items.push({ id, ...doc });
          logActivity("custom", `Agregaste ${title} a ${col.name}`, { img: cover.startsWith("data:") ? "" : cover, ...where });
          toast("Agregado");
        }
        state.tab = status;
        savePref();
        sh.close();
        paint();
      } catch (err) {
        msg("No se pudo guardar.");
        console.error(err);
      }
    });
  }

  // ---------- ficha ----------
  function openDetail(id) {
    const x = state.items.find((i) => i.id === id);
    if (!x) return;
    const other = TABS.find(([k]) => k !== x.status);
    const sh = openSheet(`
      <div class="detail">
        ${x.coverUrl ? `<img class="detail-img" src="${esc(x.coverUrl)}" alt="" />` : ""}
        <div class="detail-body">
          <h2>${esc(x.title)}</h2>
          <dl class="mono">
            <dt>estado</dt><dd>${tabLabel(x.status)}</dd>
            <dt>agregado</dt><dd>${esc(fmtShort(x.addedAt?.slice(0, 10)))}</dd>
          </dl>
          ${x.note ? `<p class="item-note">${esc(x.note)}</p>` : ""}
          <div class="detail-actions">
            <button class="btn" data-act="move">Mover a ${other[1]}</button>
            <button class="btn btn-ghost" data-act="edit">Editar</button>
            <button class="btn btn-ghost" data-act="del">Borrar</button>
            <button class="btn btn-ghost" data-close>Cerrar</button>
          </div>
        </div>
      </div>`);
    sh.el.querySelector(".detail-img")?.addEventListener("error", (e) => e.target.remove(), { once: true });
    sh.el.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      try {
        if (act === "edit") { sh.close(); openForm(x); }
        else if (act === "move") {
          await update("collectionItems", x.id, { status: other[0] });
          x.status = other[0];
          logActivity("custom", `Moviste ${x.title} a ${other[1]}`, where);
          sh.close();
          toast(`Movido a ${other[1]}`);
          paint();
        } else if (act === "del") {
          confirmTap(btn, async () => {
            await remove("collectionItems", x.id);
            state.items = state.items.filter((i) => i !== x);
            logActivity("custom", `Borraste ${x.title} de ${col.name}`, where);
            sh.close();
            paint();
          });
        }
      } catch (err) {
        toast("No se pudo guardar");
        console.error(err);
      }
    });
  }

  // ---------- eventos ----------
  $(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    savePref();
    paint();
  });
  $(".f-sort").addEventListener("change", (e) => { state.sort = e.target.value; savePref(); paint(); });
  $('[data-act="add"]').addEventListener("click", () => openForm());
  grid.addEventListener("click", (e) => { const t = e.target.closest(".tile"); if (t) openDetail(t.dataset.id); });
  grid.addEventListener("keydown", (e) => { const t = e.target.closest(".tile"); if (t && e.key === "Enter") openDetail(t.dataset.id); });

  paint();
  state.items = await listItems(col.id);
  state.loaded = true;
  if (root.isConnected) paint();
}

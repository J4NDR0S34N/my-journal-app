// Miscelánea: inbox libre de capturas y links.
// Imágenes: la miniatura vive en misc/{id}.imageUrl y la versión completa
// en miscImages/{id}.data (para no bajar todas las imágenes grandes juntas).

import { list, add, get, set, remove } from "../store.js";
import { compressImage } from "../lib/image.js";
import { esc, toast, confirmTap, openSheet, plural } from "../lib/ui.js";
import { fmtStamp } from "../lib/dates.js";
import { logActivity } from "../lib/activity.js";

const normUrl = (u) => {
  u = u.trim();
  if (!u) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
};
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

// Inclinación estable por ítem (-2.5° a 2.5°) para el look de corcho.
const tilt = (id) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 51) / 10 - 2.5).toFixed(1);
};

export async function render(root) {
  let items = [];

  root.innerHTML = `
    <section class="page misc">
      <header class="page-head">
        <h1>Miscelánea</h1>
        <p class="mono label count"></p>
      </header>
      <div class="misc-actions">
        <label class="btn">+ imagen<input type="file" accept="image/*" multiple hidden class="file-in" /></label>
        <button class="btn btn-ghost add-link">+ link</button>
      </div>
      <p class="mono muted hint-paste">también podés pegar una imagen o un link con ctrl/⌘+v</p>
      <div class="mgrid"></div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const grid = $(".mgrid");

  function paint() {
    const arr = [...items].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    $(".count").textContent = plural(arr.length, "ítem", "ítems");
    if (!arr.length) {
      grid.innerHTML = `<p class="empty mono muted">Vacío. Subí una captura o guardá un link.</p>`;
      return;
    }
    grid.innerHTML = arr.map((x) => x.kind === "image" ? `
      <figure class="m-item m-img" data-id="${x.id}" style="--rot:${tilt(x.id)}deg">
        <span class="tape" aria-hidden="true"></span>
        <img src="${esc(x.imageUrl)}" alt="${esc(x.title || "")}" loading="lazy" style="aspect-ratio:${x.ratio || "auto"}" />
        <button class="m-del mono" data-del aria-label="Borrar imagen">borrar</button>
      </figure>` : `
      <div class="m-item m-link" data-id="${x.id}" style="--rot:${tilt(x.id)}deg">
        <span class="tape" aria-hidden="true"></span>
        <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">
          <span class="mono muted">${esc(host(x.url))}</span>
          <b>${esc(x.title || x.url)}</b>
          ${x.note ? `<p>${esc(x.note)}</p>` : ""}
          <span class="mono muted m-date">${fmtStamp(x.createdAt)}</span>
        </a>
        <button class="m-del mono" data-del aria-label="Borrar link">borrar</button>
      </div>`).join("");
  }

  async function addImages(files) {
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      toast("Comprimiendo imagen…");
      try {
        const { full, thumb, ratio } = await compressImage(f);
        const doc = { kind: "image", imageUrl: thumb, ratio: +ratio.toFixed(4), createdAt: new Date().toISOString() };
        const id = await add("misc", doc);
        await set("miscImages", id, { data: full }, { merge: false });
        items.push({ id, ...doc });
        paint();
        toast("Imagen guardada");
        logActivity("misc", "Guardaste una imagen en Miscelánea");
      } catch (err) {
        toast(err.message || "No se pudo subir la imagen");
        console.error(err);
      }
    }
  }

  async function addLink(data) {
    const doc = { kind: "link", url: normUrl(data.url), createdAt: new Date().toISOString() };
    if (data.title?.trim()) doc.title = data.title.trim();
    if (data.note?.trim()) doc.note = data.note.trim();
    const id = await add("misc", doc);
    items.push({ id, ...doc });
    logActivity("misc", `Guardaste un link: ${doc.title || host(doc.url)}`);
    paint();
  }

  function linkSheet(url = "") {
    const sh = openSheet(`
      <form class="form link-form">
        <h2>Guardar link</h2>
        <label class="mono label">URL<input name="url" type="url" inputmode="url" required value="${esc(url)}" placeholder="https://…" /></label>
        <label class="mono label">Título <span class="muted">(opcional)</span><input name="title" type="text" /></label>
        <label class="mono label">Nota <span class="muted">(opcional)</span><textarea name="note" rows="3"></textarea></label>
        <div class="detail-actions">
          <button class="btn" type="submit">Guardar</button>
          <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
        </div>
      </form>`);
    const form = sh.el.querySelector("form");
    form.url.type = "text"; // acepta "ejemplo.com" sin https://
    setTimeout(() => (url ? form.title : form.url).focus(), 50);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      if (!fd.url.trim()) return;
      try {
        await addLink(fd);
        sh.close();
        toast("Link guardado");
      } catch (err) {
        toast("No se pudo guardar");
        console.error(err);
      }
    });
  }

  $(".file-in").addEventListener("change", (e) => { addImages([...e.target.files]); e.target.value = ""; });
  $(".add-link").addEventListener("click", () => linkSheet());

  const onPaste = (e) => {
    if (e.target.closest("input, textarea")) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addImages(files); return; }
    const text = e.clipboardData?.getData("text")?.trim();
    if (text && /^(https?:\/\/|www\.)\S+$/i.test(text)) { e.preventDefault(); linkSheet(text); }
  };
  document.addEventListener("paste", onPaste);

  grid.addEventListener("click", async (e) => {
    const item = e.target.closest(".m-item");
    if (!item) return;
    const id = item.dataset.id;
    const del = e.target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      confirmTap(del, async () => {
        const x = items.find((i) => i.id === id);
        try {
          await remove("misc", id);
          if (x?.kind === "image") await remove("miscImages", id);
          logActivity("misc", x?.kind === "image" ? "Borraste una imagen de Miscelánea" : `Borraste el link ${x?.title || host(x?.url || "")}`);
          items = items.filter((i) => i.id !== id);
          paint();
        } catch (err) {
          toast("No se pudo borrar");
          console.error(err);
        }
      });
      return;
    }
    if (item.classList.contains("m-img")) openLightbox(id);
  });

  async function openLightbox(id) {
    const x = items.find((i) => i.id === id);
    const lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML = `<img src="${esc(x.imageUrl)}" alt="" /><p class="mono muted">${fmtStamp(x.createdAt)} · tocá para cerrar</p>`;
    document.body.append(lb);
    const close = () => { lb.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => e.key === "Escape" && close();
    lb.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    const full = await get("miscImages", id).catch(() => null);
    if (full?.data && lb.isConnected) lb.querySelector("img").src = full.data;
  }

  items = await list("misc");
  paint();

  return () => document.removeEventListener("paste", onPaste);
}

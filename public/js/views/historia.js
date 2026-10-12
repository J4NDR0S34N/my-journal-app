import { list, since } from "../store.js";
import { HABITS } from "../habits.js";
import { dayKey, fmtShort, fmtTime, MONTHS } from "../lib/dates.js";
import { esc } from "../lib/ui.js";

const WINDOWS = [30, 90, 365, 36500];
const WINDOW_LABELS = new Map([[30, "30 días"], [90, "90 días"], [365, "12 meses"], [36500, "Todo"]]);
const TYPES = [
  ["all", "Todo"], ["notes", "Notas"], ["games", "Videojuegos"],
  ["music", "Música"], ["misc", "Recuerdos"], ["custom", "Colecciones"], ["days", "Hábitos"],
];
const TYPE_LABEL = Object.fromEntries(TYPES);

function cutoff(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function noteHeading(note) {
  const heading = (note.title || "").trim();
  if (heading) return heading;
  const line = (note.text || "").trim().split("\n").find(Boolean) || "Nota sin título";
  return line.length > 68 ? `${line.slice(0, 68).trim()}…` : line;
}

function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }

function dayHeading(date) {
  const today = dayKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(date) === today) return "Hoy";
  if (dayKey(date) === dayKey(yesterday)) return "Ayer";
  return `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

function entryLink(item) {
  if (item.kind === "games") return "#/coleccion/videojuegos";
  if (item.kind === "music") return "#/coleccion/musica";
  if (item.kind === "notes") return "#/notas";
  if (item.kind === "misc") return "#/misc";
  if (item.kind === "custom") return `#/coleccion/${encodeURIComponent(item.collectionId || "")}`;
  if (item.kind === "days") return "#/progreso";
  return "#/inicio";
}

function makeEntries({ notes, games, music, misc, collections, collectionItems, days }, from) {
  const entries = [];
  const add = (item) => {
    const date = toDate(item.date);
    if (!date || date.toISOString() < from) return;
    entries.push({ ...item, date });
  };

  notes.forEach((x) => add({ kind: "notes", date: x.createdAt, title: noteHeading(x), body: x.text || "" }));
  games.forEach((x) => add({ kind: "games", date: x.addedAt, title: x.title || "Videojuego", body: [x.platform, x.releaseDate?.slice(0, 4)].filter(Boolean).join(" · "), image: x.coverUrl }));
  music.forEach((x) => add({ kind: "music", date: x.addedAt, title: x.title || "Música", body: [x.artist, x.type === "album" ? "Álbum" : x.type === "ep" ? "EP" : x.type === "single" ? "Sencillo" : ""].filter(Boolean).join(" · "), image: x.coverCustom || x.coverFast || x.coverUrl }));
  misc.forEach((x) => add({ kind: "misc", date: x.createdAt, title: x.title || (x.kind === "image" ? "Imagen guardada" : x.url || "Recuerdo guardado"), body: x.note || (x.kind === "link" ? x.url : ""), image: x.imageUrl }));
  const collectionNames = new Map(collections.map((x) => [x.id, x.name]));
  collectionItems.forEach((x) => add({ kind: "custom", date: x.addedAt, title: x.title || "Elemento guardado", body: collectionNames.get(x.collectionId) || "Colección", image: x.coverUrl, collectionId: x.collectionId }));
  days.forEach((x) => {
    const habitList = HABITS.filter((habit) => x.h?.[habit.key]);
    const reflection = (x.respuesta || "").trim();
    if (!habitList.length && !reflection) return;
    add({ kind: "days", date: `${x.id}T12:00:00`, title: habitList.length ? `${habitList.length} ${habitList.length === 1 ? "hábito" : "hábitos"} completados` : "Una nota para recordar", body: reflection, emojis: habitList.slice(0, 5).map((habit) => habit.emoji) });
  });
  return entries.sort((a, b) => b.date - a.date);
}

function card(item) {
  const thumb = item.image
    ? `<img src="${esc(item.image)}" alt="" loading="lazy" />`
    : item.emojis?.length
      ? `<span class="story-emojis" aria-hidden="true">${item.emojis.map((emoji) => `<i>${emoji}</i>`).join("")}</span>`
      : `<span class="story-glyph" aria-hidden="true">${item.kind === "notes" ? "✎" : item.kind === "music" ? "♫" : item.kind === "games" ? "◈" : item.kind === "days" ? "✳" : "↗"}</span>`;
  const body = item.body ? `<p class="story-card-body">${esc(item.body.slice(0, 180))}${item.body.length > 180 ? "…" : ""}</p>` : "";
  return `<a class="story-card" href="${esc(entryLink(item))}" data-kind="${esc(item.kind)}">
    <span class="story-art">${thumb}</span>
    <span class="story-card-copy"><span class="story-card-meta mono">${esc(TYPE_LABEL[item.kind] || "Registro")} <i aria-hidden="true">·</i> ${fmtTime(item.date)}</span><strong>${esc(item.title)}</strong>${body}</span>
    <span class="story-card-arrow" aria-hidden="true">↗</span>
  </a>`;
}

export async function render(root) {
  root.innerHTML = `
    <section class="page story-page">
      <header class="story-head">
        <p class="mono label">TU ARCHIVO PERSONAL</p>
        <div class="story-title-row"><div><h1>Mi historia</h1><p>Un recorrido por lo que guardaste, viviste y fuiste construyendo.</p></div><span class="story-orbit" aria-hidden="true">✳</span></div>
      </header>
      <section class="story-tools" aria-label="Buscar y filtrar tu historia">
        <label class="story-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><input type="search" class="story-query" placeholder="Buscar en tu historia" autocomplete="off" aria-label="Buscar en tu historia" /></label>
        <label class="story-range-label mono">PERÍODO<select class="story-range" aria-label="Período de la historia">${WINDOWS.map((days) => `<option value="${days}"${days === 90 ? " selected" : ""}>${WINDOW_LABELS.get(days)}</option>`).join("")}</select></label>
      </section>
      <nav class="story-filters" aria-label="Filtrar por tipo">${TYPES.map(([id, label]) => `<button type="button" data-story-filter="${id}" aria-pressed="${id === "all"}">${label}</button>`).join("")}</nav>
      <div class="story-result-line"><span class="story-count mono" aria-live="polite">Preparando tu historia…</span><span class="story-period mono">ÚLTIMOS 90 DÍAS</span></div>
      <div class="story-content"><p class="story-loading mono">Reuniendo tus momentos…</p></div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  let allEntries = [], activeFilter = "all", loading = false;
  const content = $(".story-content"), query = $(".story-query"), range = $(".story-range");

  function paint() {
    const term = query.value.trim().toLocaleLowerCase("es");
    const entries = allEntries.filter((item) => (activeFilter === "all" || item.kind === activeFilter)
      && (!term || `${item.title} ${item.body} ${TYPE_LABEL[item.kind] || ""}`.toLocaleLowerCase("es").includes(term)));
    $(".story-count").textContent = `${entries.length} ${entries.length === 1 ? "momento" : "momentos"}`;
    if (!entries.length) {
      const filtered = allEntries.length > 0 || !!term || activeFilter !== "all";
      content.innerHTML = `<div class="story-empty"><span aria-hidden="true">${filtered ? "⌕" : "✳"}</span><h2>${filtered ? "No encontramos coincidencias" : "Tu historia empieza acá"}</h2><p>${filtered ? "Probá otra búsqueda o elegí una categoría distinta." : "Tus notas, hábitos y cosas favoritas se van reuniendo acá, por fecha."}</p>${filtered ? `<button type="button" class="story-reset">Quitar filtros</button>` : `<a class="story-empty-link" href="#/notas">Escribir una nota <span aria-hidden="true">↗</span></a>`}</div>`;
      return;
    }
    const groups = new Map();
    for (const item of entries) {
      const key = monthKey(item.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    content.innerHTML = [...groups].map(([key, group]) => {
      const first = group[0].date;
      const heading = `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
      let currentDay = "";
      const rows = group.map((item) => {
        const keyDay = dayKey(item.date);
        const dayLabel = currentDay === keyDay ? "" : `<h3 class="story-day-heading">${dayHeading(item.date)}${keyDay !== dayKey() ? `<span>${fmtShort(keyDay)}</span>` : ""}</h3>`;
        currentDay = keyDay;
        return `${dayLabel}${card(item)}`;
      }).join("");
      return `<section class="story-month"><h2 class="story-month-heading">${heading}<span class="mono">${group.length} ${group.length === 1 ? "registro" : "registros"}</span></h2><div class="story-month-list">${rows}</div></section>`;
    }).join("");
    content.querySelectorAll(".story-art img").forEach((img) => img.addEventListener("error", () => img.closest(".story-art").classList.add("no-image"), { once: true }));
  }

  async function load() {
    if (loading) return;
    loading = true;
    range.disabled = true;
    content.innerHTML = `<p class="story-loading mono">Reuniendo tus momentos…</p>`;
    const from = cutoff(+range.value);
    const [notes, games, music, misc, collections, collectionItems, days] = await Promise.all([
      since("notes", "createdAt", from), since("games", "addedAt", from), since("music", "addedAt", from),
      since("misc", "createdAt", from), list("collections"), since("collectionItems", "addedAt", from), list("days"),
    ]);
    if (!root.isConnected) return;
    allEntries = makeEntries({ notes, games, music, misc, collections, collectionItems, days }, from);
    const period = $(".story-period");
    period.textContent = +range.value === 36500 ? "TODO TU HISTORIAL" : `ÚLTIMOS ${+range.value === 365 ? "12 MESES" : `${range.value} DÍAS`}`;
    loading = false;
    range.disabled = false;
    paint();
  }

  query.addEventListener("input", paint);
  range.addEventListener("change", () => load().catch(showError));
  root.querySelector(".story-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-story-filter]");
    if (!button) return;
    activeFilter = button.dataset.storyFilter;
    root.querySelectorAll("[data-story-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    paint();
  });
  content.addEventListener("click", (event) => {
    if (!event.target.closest(".story-reset")) return;
    query.value = "";
    activeFilter = "all";
    root.querySelectorAll("[data-story-filter]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.storyFilter === "all")));
    paint();
  });
  function showError(error) {
    loading = false;
    range.disabled = false;
    console.error("No se pudo cargar Mi historia:", error);
    content.innerHTML = `<div class="story-empty"><span aria-hidden="true">↻</span><h2>No pudimos cargar tu historia</h2><p>Revisá tu conexión e intentá de nuevo.</p><button type="button" class="story-retry">Reintentar</button></div>`;
    content.querySelector(".story-retry").addEventListener("click", () => load().catch(showError));
  }
  await load().catch(showError);
}

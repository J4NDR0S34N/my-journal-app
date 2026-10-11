import { createSky } from "../lib/sky.js";
import { dayKey, isDaytime, fmtLong, fmtTime, fmtShort } from "../lib/dates.js";
import { list, set } from "../store.js";
import { HABITS, POINTS_PER_LEVEL, computeStats } from "../habits.js";
import { esc, debounce, openSheet, toast } from "../lib/ui.js";
import { preguntaDelDia } from "../lib/umbral.js";
import { presenceStats, presenceText, weekDots, weekLabel } from "../lib/presence.js";
import { activitySince } from "../lib/activity.js";
import { motion, onMotion } from "../lib/prefs.js";

const SUN = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></g></svg>`;
const MOON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10.5 1.8A6.3 6.3 0 1 0 14.2 11 5.2 5.2 0 0 1 10.5 1.8z" fill="currentColor"/></svg>`;

// Textos del footer: variante de día y de noche.
const FOOT = {
  day: "hecho a mano, un hábito a la vez",
  night: "hecho a mano, una noche a la vez",
};

const WHERE = { habit: "Hoy", games: "Colección", music: "Música", notes: "Notas", misc: "Miscelánea" };
const ROUTE = { habit: "registro", games: "coleccion/videojuegos", music: "coleccion/musica", notes: "notas", misc: "misc" };

function greeting(d) {
  const h = d.getHours();
  if (h >= 6 && h < 12) return "Buen día";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

// Tres columnas: hoy, ayer y anteayer.
const DAY_NAMES = ["Hoy", "Ayer", "Anteayer"];
const HOME_LAYOUT_KEY = "mj:home-layout:v2";
const LEGACY_HOME_LAYOUT_KEY = "mj:home-layout:v1";
const HOME_STYLES = [
  ["classic", "Original", "Portada amplia y estantes para recorrer."],
  ["editorial", "Editorial", "Una historia destacada, con más aire."],
  ["studio", "Estudio", "Todo a la vista en una grilla práctica."],
];
const HOME_ACCENTS = ["sand", "rose", "sage", "blue"];
const HOME_WIDGETS = [
  ["spotlight", "En portada", "El juego o la música que agregaste más recientemente."],
  ["games", "Juegos añadidos", "Tus últimos juegos de la colección."],
  ["wishlist", "Por jugar", "Juegos que guardaste para más adelante."],
  ["music", "Música añadida", "Álbumes, EP y sencillos de tu biblioteca."],
  ["summary", "Resumen diario", "Hábitos y presencia del mes."],
  ["progress", "Tu próximo nivel", "Tu avance más cercano en hábitos."],
  ["activity", "Actividad reciente", "Registros de hoy, ayer y anteayer."],
  ["reflection", "Pregunta del día", "Tus respuestas se conservan aunque ocultes este módulo."],
];
const DEFAULT_HOME_ORDER = HOME_WIDGETS.map(([id]) => id);
const DEFAULT_HOME_VISIBLE = new Set(["spotlight", "games", "music", "activity", "summary", "progress"]);

function defaultHomeLayout() {
  return {
    order: [...DEFAULT_HOME_ORDER],
    visible: Object.fromEntries(DEFAULT_HOME_ORDER.map((id) => [id, DEFAULT_HOME_VISIBLE.has(id)])),
    style: "classic",
    accent: "sand",
  };
}

function readHomeLayout() {
  const defaults = defaultHomeLayout();
  try {
    const stored = JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY) || localStorage.getItem(LEGACY_HOME_LAYOUT_KEY) || "null");
    if (!stored || typeof stored !== "object") return defaults;
    const savedOrder = Array.isArray(stored.order) ? stored.order.filter((id, i, all) =>
      DEFAULT_HOME_ORDER.includes(id) && all.indexOf(id) === i) : [];
    // Conserva el orden elegido e inserta módulos nuevos junto a sus vecinos
    // predeterminados, para que los módulos largos no queden desplazados.
    const order = [...savedOrder];
    for (const id of DEFAULT_HOME_ORDER) {
      if (order.includes(id)) continue;
      const canonicalIndex = DEFAULT_HOME_ORDER.indexOf(id);
      const previous = DEFAULT_HOME_ORDER.slice(0, canonicalIndex).reverse().find((candidate) => order.includes(candidate));
      order.splice(previous ? order.indexOf(previous) + 1 : order.length, 0, id);
    }
    const visible = { ...defaults.visible };
    for (const id of DEFAULT_HOME_ORDER) {
      if (typeof stored.visible?.[id] === "boolean") visible[id] = stored.visible[id];
    }
    return {
      order,
      visible,
      style: HOME_STYLES.some(([id]) => id === stored.style) ? stored.style : defaults.style,
      accent: HOME_ACCENTS.includes(stored.accent) ? stored.accent : defaults.accent,
    };
  } catch { return defaults; }
}

function applyHomeLayout(container, layout) {
  const home = container.closest(".home");
  home.dataset.homeStyle = layout.style;
  home.dataset.homeAccent = layout.accent;
  for (const id of layout.order) {
    const widget = container.querySelector(`[data-home-widget="${id}"]`);
    if (!widget) continue;
    widget.hidden = !layout.visible[id];
    container.append(widget);
  }
}

function homeStyleCards(selected) {
  return HOME_STYLES.map(([id, name, description]) => `
    <button class="home-style-card${selected === id ? " selected" : ""}" type="button" data-home-style="${id}" aria-pressed="${selected === id}" aria-label="${name}: ${description}">
      <span class="home-style-preview preview-${id}" aria-hidden="true"><i class="mini-brand"></i><i class="mini-feature"></i><i class="mini-shelf"></i><i class="mini-shelf"></i></span>
      <span class="home-style-copy"><b>${name}</b><small>${description}</small></span>
      <span class="home-style-check" aria-hidden="true">${selected === id ? "✓" : ""}</span>
    </button>`).join("");
}

function homeAccentChoices(selected) {
  const labels = { sand: "Arena", rose: "Rosa", sage: "Salvia", blue: "Azul" };
  return HOME_ACCENTS.map((id) => `
    <button class="home-accent${selected === id ? " selected" : ""}" type="button" data-home-accent-choice="${id}" aria-label="Acento ${labels[id]}" aria-pressed="${selected === id}">
      <span class="home-accent-dot accent-${id}" aria-hidden="true"></span>
      <span>${labels[id]}</span>
    </button>`).join("");
}

function homeLayoutRows(layout, filter = "active") {
  const rows = layout.order.filter((id) => filter === "active" ? layout.visible[id] : !layout.visible[id]);
  if (!rows.length) {
    return `<p class="home-module-empty mono">${filter === "active" ? "Tu Inicio está vacío. Sumá un módulo desde «Agregar módulos»." : "Ya agregaste todos los módulos disponibles."}</p>`;
  }
  return rows.map((id, index) => {
    const [name, description] = HOME_WIDGETS.find(([key]) => key === id).slice(1);
    const icon = { spotlight: "✦", games: "▣", wishlist: "⌁", music: "♫", reflection: "✎", summary: "◷", activity: "↗", progress: "⌁" }[id];
    const visible = layout.visible[id];
    return `
      <article class="home-module-card${visible ? " active" : ""}">
        <div class="home-module-top"><span class="mono">${String(index + 1).padStart(2, "0")}</span><span class="home-module-state mono">${visible ? "EN TU INICIO" : "DISPONIBLE"}</span></div>
        <h4><i aria-hidden="true">${icon}</i>${name}</h4>
        <p>${description}</p>
        <div class="home-module-bottom">
          ${filter === "active" ? `<div class="home-layout-order">
            <button type="button" data-home-move="${id}:up" aria-label="Subir ${name}" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-home-move="${id}:down" aria-label="Bajar ${name}" ${index === rows.length - 1 ? "disabled" : ""}>↓</button>
          </div>` : `<span class="home-layout-position mono">SE SUMA AL FINAL</span>`}
          <button class="home-module-toggle${visible ? " added" : ""}" type="button" data-home-toggle="${id}" aria-pressed="${visible}" aria-label="${visible ? "Ocultar" : "Agregar"} ${name}${visible ? " del Inicio" : ""}">${visible ? "− Ocultar" : "+ Agregar"}</button>
        </div>
      </article>`;
  }).join("");
}

function homePreviewMarkup(layout, latest = null) {
  const active = layout.order.filter((id) => layout.visible[id]);
  const names = Object.fromEntries(HOME_WIDGETS.map(([id, name]) => [id, name]));
  const icons = { games: "▣", wishlist: "⌁", music: "♫", reflection: "✎", summary: "◷", activity: "↗", progress: "⌁" };
  return `<div class="home-editor-preview" data-preview-style="${layout.style}" data-preview-accent="${layout.accent}">
    <div class="home-preview-heading"><span class="mono label">ASÍ SE VERÁ</span><span class="home-preview-live mono"><i></i> EN VIVO</span></div>
    <div class="home-preview-screen">
      <div class="home-preview-top"><span class="mono">MY JOURNAL</span><span class="home-preview-orb"></span></div>
      <div class="home-preview-greeting"><span class="mono">TU ESPACIO PERSONAL</span><b>Buenas tardes.</b></div>
      ${active.includes("spotlight") ? `<div class="home-preview-feature"><span class="home-preview-art" aria-hidden="true"></span><span class="mono">${latest ? "RECIÉN AÑADIDO" : "EN PORTADA"}</span><b>${esc(latest?.title || "Tu historia, al frente.")}</b><small>${esc(latest ? (latest.kind === "games" ? "VIDEOJUEGO · COLECCIÓN" : "MÚSICA · BIBLIOTECA") : "Lo más reciente de tu diario")}</small></div>` : ""}
      <div class="home-preview-modules">${active.filter((id) => id !== "spotlight").map((id) => `<div class="home-preview-module" data-module="${id}"><i>${icons[id]}</i><span>${names[id]}</span><b></b><b></b></div>`).join("") || (!active.includes("spotlight") ? `<p class="home-preview-empty mono">TU INICIO, A TU MANERA</p>` : "")}</div>
    </div>
    <div class="home-preview-caption"><span>${active.length} ${active.length === 1 ? "módulo visible" : "módulos visibles"}</span><span>Vista completa · desplazate para recorrerla</span></div>
  </div>`;
}

function itemHtml(a) {
  const icon = a.img
    ? `<img src="${esc(a.img)}" alt="" loading="lazy" />`
    : a.emoji ? `<span class="act-emo">${a.emoji}</span>` : `<span class="act-dot"></span>`;
  return `
    <li><a class="act-item" href="#/${esc(a.route || ROUTE[a.kind] || "inicio")}">
      <span class="act-icon" aria-hidden="true">${icon}</span>
      <span class="act-txt">${esc(a.text)}<small class="muted">${esc(a.where || WHERE[a.kind] || "")}</small></span>
      <span class="act-time mono">${fmtTime(new Date(a.at))}</span>
    </a></li>`;
}

function activityHtml(items) {
  const cols = DAY_NAMES.map((name, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return { name, key: dayKey(d), items: [] };
  });
  for (const a of items) cols.find((c) => c.key === dayKey(new Date(a.at)))?.items.push(a);
  return `<div class="act-cols">${cols.map((c) => `
    <div class="act-col">
      <h3 class="act-day label">${c.name} <span class="muted">${fmtShort(c.key).replace(/ \d{4}$/, "")}</span></h3>
      ${c.items.length
        ? `<ol class="act-list">${c.items.map(itemHtml).join("")}</ol>`
        : `<p class="act-empty muted">Sin actividad.</p>`}
    </div>`).join("")}</div>`;
}

export async function render(root) {
  const layout = readHomeLayout();
  let latestPreviewItem = null;
  let refreshHomeEditor = null;
  root.innerHTML = `
    <section class="home">
      <canvas class="sky" aria-hidden="true"></canvas>
      <div class="hero">
        <div class="home-main">
          <p class="mono label home-date"></p>
          <h1 class="home-greet"></h1>
          <button class="home-customize mono" type="button" aria-label="Personalizar Inicio">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M4 10h12M4 15h12M7 3v4M13 8v4M9 13v4" /></svg>
            <span>Personalizar espacio</span>
          </button>
        </div>
        <button class="home-scroll-cue mono" type="button"><span>DESLIZÁ PARA EXPLORAR</span><i aria-hidden="true">↓</i></button>
      </div>
      <div class="home-content" id="home-content">
        <div class="home-widgets">
            <section class="home-widget home-spotlight-widget" data-home-widget="spotlight" aria-label="En portada"><div class="home-spotlight-content"><p class="home-shelf-loading mono muted">Preparando tu portada…</p></div></section>
            <section class="home-widget home-shelf-widget" data-home-widget="games" aria-label="Juegos añadidos"><div class="home-shelf-content"><p class="home-shelf-loading mono muted">Cargando juegos…</p></div></section>
            <section class="home-widget home-shelf-widget" data-home-widget="wishlist" aria-label="Juegos por jugar"><div class="home-shelf-content"><p class="home-shelf-loading mono muted">Cargando wishlist…</p></div></section>
            <section class="home-widget home-shelf-widget" data-home-widget="music" aria-label="Música añadida"><div class="home-shelf-content"><p class="home-shelf-loading mono muted">Cargando música…</p></div></section>
            <section class="home-widget" data-home-widget="reflection" aria-label="Pregunta del día">
              <form class="umbral" autocomplete="off">
                <label class="umbral-q" for="umbral-in"></label>
                <input id="umbral-in" class="umbral-in" type="text" maxlength="280" enterkeyhint="done" placeholder="Una línea alcanza…" />
                <span class="umbral-ok mono muted" aria-live="polite"></span>
              </form>
            </section>
            <section class="home-widget home-summary" data-home-widget="summary" aria-label="Resumen diario">
              <p class="mono home-welcome" hidden>Bienvenido de vuelta</p>
              <p class="mono home-status muted"></p>
              <a class="presence mono" href="#/estadistica" hidden>
                <span class="presence-txt"></span>
                <span class="presence-week" role="img"></span>
              </a>
            </section>
            <section class="home-widget home-progress-widget" data-home-widget="progress" aria-label="Progreso de hábitos">
              <div class="home-progress-content"><p class="home-progress-title mono">Tu siguiente nivel</p><p class="muted">Cargando progreso…</p></div>
            </section>
            <section class="home-widget" data-home-widget="activity" aria-label="Actividad reciente">
              <section class="activity" aria-labelledby="act-h">
                <h2 id="act-h" class="act-head">Actividad reciente</h2>
                <div class="act-body"><p class="act-empty muted">cargando…</p></div>
              </section>
            </section>
          </div>
        </div>
      <footer class="home-foot mono"><span class="foot-ico"></span><span class="foot-txt"></span></footer>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const widgets = $(".home-widgets");
  applyHomeLayout(widgets, layout);
  $(".home-scroll-cue").addEventListener("click", () => $("#home-content").scrollIntoView({ behavior: motion() === "full" ? "smooth" : "auto" }));
  let revealObserver;
  const revealNodes = [...widgets.querySelectorAll(".home-widget")];
  if (motion() === "still" || !("IntersectionObserver" in window)) {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
  } else {
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -36px 0px" });
    revealNodes.forEach((node, index) => {
      node.style.setProperty("--reveal-order", index);
      revealObserver.observe(node);
    });
  }

  Promise.all([list("games"), list("music")]).then(([games, music]) => {
    if (!root.isConnected) return;
    const recent = (items) => [...items].sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
    const latest = recent([
      ...games.filter((x) => x.status === "owned").map((x) => ({ ...x, kind: "games" })),
      ...music.map((x) => ({ ...x, kind: "music" })),
    ])[0];
    latestPreviewItem = latest || null;
    refreshHomeEditor?.();
    const spotlight = widgets.querySelector("[data-home-widget=spotlight] .home-spotlight-content");
    if (spotlight) spotlight.innerHTML = spotlightHtml(latest);
    const shelves = {
      games: shelfHtml("Añadidos recientemente", recent(games.filter((x) => x.status === "owned")), "games", "Tu estante de juegos empieza acá. Agregá uno a tu colección.", "#/coleccion/videojuegos"),
      wishlist: shelfHtml("Por jugar", recent(games.filter((x) => x.status === "wishlist")), "games", "Guardá juegos que quieras tener en el radar.", "#/coleccion/videojuegos"),
      music: shelfHtml("Escuchá cuando quieras", recent(music), "music", "Tus discos favoritos y pendientes, reunidos en un solo estante.", "#/coleccion/musica"),
    };
    for (const [id, html] of Object.entries(shelves)) {
      const content = widgets.querySelector(`[data-home-widget="${id}"] .home-shelf-content`);
      if (content) content.innerHTML = html;
    }
    widgets.querySelectorAll(".home-shelf-art img").forEach((img) => img.addEventListener("error", () => img.closest(".home-shelf-art").classList.add("image-failed"), { once: true }));
  }).catch((error) => {
    console.error("No se pudieron cargar los estantes de Inicio:", error);
    for (const id of ["games", "wishlist", "music"]) {
      const content = widgets.querySelector(`[data-home-widget="${id}"] .home-shelf-content`);
      if (content) content.innerHTML = `<p class="home-shelf-loading mono muted">No se pudo cargar este estante.</p>`;
    }
  });

  function openHomeCustomizer() {
    const activeCount = Object.values(layout.visible).filter(Boolean).length;
    const availableCount = HOME_WIDGETS.length - activeCount;
    const sheet = openSheet(`
      <div class="home-editor">
        <header class="home-editor-head">
          <div><span class="mono label">MY JOURNAL · DESIGN STUDIO</span><h2 id="home-layout-title">Tu espacio.<br /><em>Tus reglas.</em></h2><p>Armá una portada que se sienta completamente tuya.</p></div>
          <div class="home-editor-head-mark" aria-hidden="true"><span>MJ</span><i></i><i></i><i></i></div>
        </header>
        <div class="home-editor-body">
          <div class="home-editor-controls">
            <section class="home-editor-section" aria-labelledby="home-style-label">
              <div class="home-editor-section-head">
                <div><span class="mono label">01 · ESTÉTICA</span><h3 id="home-style-label">Encontrá tu lenguaje visual</h3></div>
              </div>
              <div class="home-style-list">${homeStyleCards(layout.style)}</div>
              <div class="home-accent-head"><span class="setting-name">Color de acento</span><span class="mono muted">UN DETALLE TUYO</span></div>
              <div class="home-accent-list">${homeAccentChoices(layout.accent)}</div>
            </section>
            <section class="home-editor-section" aria-labelledby="home-modules-label">
              <div class="home-editor-section-head">
                <div><span class="mono label">02 · TU TABLERO</span><h3 id="home-modules-label">Armá tu Inicio</h3></div>
                <span class="mono muted" data-home-visible-count>${Object.values(layout.visible).filter(Boolean).length} ACTIVOS</span>
              </div>
              <p class="mono muted home-layout-note">Ocultar un módulo no borra sus registros. Ordená tu Inicio y sumá solo lo que te sirve.</p>
              <div class="home-module-tabs" role="tablist" aria-label="Biblioteca de módulos">
                <button type="button" role="tab" data-home-catalog="active" aria-selected="true">En mi Inicio <b data-home-tab-count="active">${activeCount}</b></button>
                <button type="button" role="tab" data-home-catalog="available" aria-selected="false">Agregar módulos <b data-home-tab-count="available">${availableCount}</b></button>
              </div>
              <div class="home-layout-list">${homeLayoutRows(layout, "active")}</div>
            </section>
          </div>
          <aside class="home-editor-preview-wrap" aria-label="Vista previa del Inicio">${homePreviewMarkup(layout, latestPreviewItem)}</aside>
        </div>
        <footer class="home-editor-foot">
          <button class="home-reset" type="button" data-home-reset><span aria-hidden="true">↺</span> Restaurar panel recomendado</button>
          <span class="mono home-editor-saved"><i></i> GUARDADO EN ESTE DISPOSITIVO</span>
          <button class="btn" type="button" data-close>Listo <span aria-hidden="true">↗</span></button>
        </footer>
      </div>`);
    sheet.el.classList.add("home-customizer-sheet");
    sheet.el.setAttribute("aria-labelledby", "home-layout-title");
    let moduleFilter = "active";
    const refreshEditor = () => {
      sheet.el.querySelector(".home-style-list").innerHTML = homeStyleCards(layout.style);
      sheet.el.querySelector(".home-accent-list").innerHTML = homeAccentChoices(layout.accent);
      const activeCount = Object.values(layout.visible).filter(Boolean).length;
      const availableCount = HOME_WIDGETS.length - activeCount;
      sheet.el.querySelector(".home-layout-list").innerHTML = homeLayoutRows(layout, moduleFilter);
      sheet.el.querySelector("[data-home-visible-count]").textContent = `${activeCount} ACTIVOS`;
      sheet.el.querySelector('[data-home-tab-count="active"]').textContent = activeCount;
      sheet.el.querySelector('[data-home-tab-count="available"]').textContent = availableCount;
      sheet.el.querySelectorAll("[data-home-catalog]").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.homeCatalog === moduleFilter)));
      sheet.el.querySelector(".home-editor-preview-wrap").innerHTML = homePreviewMarkup(layout, latestPreviewItem);
    };
    refreshHomeEditor = () => { if (sheet.el.isConnected) refreshEditor(); };
    sheet.el.addEventListener("click", (event) => {
      const catalog = event.target.closest("[data-home-catalog]");
      if (catalog) {
        moduleFilter = catalog.dataset.homeCatalog;
        refreshEditor();
        return;
      }
      const style = event.target.closest("[data-home-style]");
      if (style) {
        layout.style = style.dataset.homeStyle;
        applyHomeLayout(widgets, layout);
        refreshEditor();
        if (!saveHomeLayout(layout)) toast("No se pudo guardar la personalización.");
        return;
      }
      const accent = event.target.closest("[data-home-accent-choice]");
      if (accent) {
        layout.accent = accent.dataset.homeAccentChoice;
        applyHomeLayout(widgets, layout);
        refreshEditor();
        if (!saveHomeLayout(layout)) toast("No se pudo guardar la personalización.");
        return;
      }
      const toggle = event.target.closest("[data-home-toggle]");
      if (toggle) {
        const id = toggle.dataset.homeToggle;
        layout.visible[id] = !layout.visible[id];
        if (layout.visible[id]) {
          const index = layout.order.indexOf(id);
          if (index >= 0 && index !== layout.order.length - 1) {
            layout.order.splice(index, 1);
            layout.order.push(id);
          }
        }
        applyHomeLayout(widgets, layout);
        refreshEditor();
        if (!saveHomeLayout(layout)) toast("No se pudo guardar la personalización.");
        return;
      }
      if (event.target.closest("[data-home-reset]")) {
        const reset = defaultHomeLayout();
        layout.order.splice(0, layout.order.length, ...reset.order);
        Object.assign(layout.visible, reset.visible);
        layout.style = reset.style;
        layout.accent = reset.accent;
        applyHomeLayout(widgets, layout);
        refreshEditor();
        if (!saveHomeLayout(layout)) toast("No se pudo guardar la personalización.");
        return;
      }
      const move = event.target.closest("[data-home-move]");
      if (!move || move.disabled) return;
      const [id, direction] = move.dataset.homeMove.split(":");
      const shownOrder = layout.order.filter((widgetId) => layout.visible[widgetId]);
      const shownIndex = shownOrder.indexOf(id);
      const nextShownIndex = shownIndex + (direction === "up" ? -1 : 1);
      if (shownIndex < 0 || nextShownIndex < 0 || nextShownIndex >= shownOrder.length) return;
      const index = layout.order.indexOf(id);
      const next = layout.order.indexOf(shownOrder[nextShownIndex]);
      [layout.order[index], layout.order[next]] = [layout.order[next], layout.order[index]];
      applyHomeLayout(widgets, layout);
      refreshEditor();
      if (!saveHomeLayout(layout)) toast("No se pudo guardar la personalización.");
      sheet.el.querySelector(`[data-home-move="${id}:${direction}"]`)?.focus();
    });
  }
  $(".home-customize").addEventListener("click", openHomeCustomizer);

  let day = isDaytime();
  const sky = createSky($(".sky"), { day, motion: motion() });
  const offMotion = onMotion((m) => sky.setMotion(m));

  function tick() {
    const now = new Date();
    day = isDaytime(now);
    sky.setDay(day);
    $(".home-date").textContent = `${fmtLong(now)} · ${fmtTime(now)}`;
    $(".home-greet").textContent = greeting(now);
    $(".foot-ico").innerHTML = day ? SUN : MOON;
    $(".foot-txt").textContent = `© ${now.getFullYear()} · ${day ? FOOT.day : FOOT.night}`;
  }
  tick();
  const timer = setInterval(tick, 20_000);

  // ---------- umbral: pregunta del día ----------
  const today = dayKey();
  const input = $(".umbral-in");
  $(".umbral-q").textContent = preguntaDelDia(today);
  let saved = "", touched = false, okTimer;
  async function save() {
    const v = input.value.trim();
    if (v === saved) return;
    try {
      await set("days", today, { respuesta: v });
      saved = v;
      const ok = $(".umbral-ok");
      ok.textContent = "guardado";
      clearTimeout(okTimer);
      okTimer = setTimeout(() => (ok.textContent = ""), 1800);
      list("days").then(paintDays); // la respuesta también cuenta como presencia
    } catch (e) {
      $(".umbral-ok").textContent = "sin guardar, se reintenta al escribir";
      console.error(e);
    }
  }
  const saveSoon = debounce(save, 1200);
  input.addEventListener("input", () => { touched = true; saveSoon(); });
  input.addEventListener("change", save);
  $(".umbral").addEventListener("submit", (e) => { e.preventDefault(); save(); input.blur(); });

  // ---------- hoy y presencia ----------
  let progressStats = [];
  let progressIndex = 0;
  let progressRotationTimer;
  let progressRotationStarted = false;
  let progressPointerInside = false;
  let progressFocusInside = false;
  let progressTouchActive = false;
  const progressCard = widgets.querySelector('[data-home-widget="progress"]');
  function syncProgressRotation() {
    clearInterval(progressRotationTimer);
    progressRotationTimer = undefined;
    if (!progressRotationStarted || !root.isConnected || document.hidden || progressPointerInside || progressFocusInside || progressTouchActive || progressStats.length < 2) return;
    progressRotationTimer = setInterval(() => {
      progressIndex = (progressIndex + 1) % progressStats.length;
      paintProgress();
    }, 5000);
  }
  const onProgressPointerEnter = (event) => {
    if (event.pointerType === "touch") return;
    progressPointerInside = true;
    syncProgressRotation();
  };
  const onProgressPointerLeave = (event) => {
    if (event.pointerType === "touch") return;
    progressPointerInside = false;
    syncProgressRotation();
  };
  const onProgressFocusIn = () => {
    progressFocusInside = true;
    syncProgressRotation();
  };
  const onProgressFocusOut = (event) => {
    progressFocusInside = progressCard.contains(event.relatedTarget);
    syncProgressRotation();
  };
  const onProgressPointerDown = (event) => {
    if (event.pointerType !== "touch") return;
    progressTouchActive = true;
    syncProgressRotation();
  };
  const onProgressPointerUp = (event) => {
    if (event.pointerType !== "touch") return;
    progressTouchActive = false;
    syncProgressRotation();
  };
  const onProgressVisibilityChange = () => syncProgressRotation();
  progressCard.addEventListener("pointerenter", onProgressPointerEnter);
  progressCard.addEventListener("pointerleave", onProgressPointerLeave);
  progressCard.addEventListener("pointerdown", onProgressPointerDown);
  progressCard.addEventListener("pointerup", onProgressPointerUp);
  progressCard.addEventListener("pointercancel", onProgressPointerUp);
  progressCard.addEventListener("focusin", onProgressFocusIn);
  progressCard.addEventListener("focusout", onProgressFocusOut);
  document.addEventListener("visibilitychange", onProgressVisibilityChange);

  function paintProgress() {
    if (!progressStats.length) return;
    const focusedStat = progressStats[progressIndex];
    const progress = focusedStat.points % POINTS_PER_LEVEL;
    const progressWidget = widgets.querySelector("[data-home-widget=progress] .home-progress-content");
    if (progressWidget) progressWidget.innerHTML = `
      <p class="home-progress-title mono">Tu siguiente nivel</p>
      <div class="home-progress-main"><strong>${focusedStat.label}</strong><span>${progress}/${POINTS_PER_LEVEL} puntos</span></div>
      <div class="home-progress-meter" role="meter" aria-label="${focusedStat.label}: ${progress} de ${POINTS_PER_LEVEL} puntos para el siguiente nivel" aria-valuemin="0" aria-valuemax="${POINTS_PER_LEVEL}" aria-valuenow="${progress}"><i style="width:${progress / POINTS_PER_LEVEL * 100}%"></i></div>
      <a class="home-progress-link" href="#/estadistica">Ver progreso <span aria-hidden="true">↗</span></a>`;
  }

  function paintDays(days) {
    if (!root.isConnected) return;
    const doc = days.find((d) => d.id === today);
    if (!touched) input.value = saved = doc?.respuesta || "";
    const done = HABITS.filter((x) => doc?.h?.[x.key]).map((x) => x.done);
    $(".home-status").textContent = `hoy: ${done.length ? done.join(", ") : "nada marcado todavía"}`;
    const p = presenceStats(days, today);
    $(".presence-txt").textContent = presenceText(p);
    $(".presence-week").textContent = weekDots(p);
    $(".presence-week").setAttribute("aria-label", weekLabel(p));
    $(".presence").hidden = false;
    $(".home-welcome").hidden = !p.welcomeBack;
    progressStats = computeStats(days);
    paintProgress();
    if (!progressRotationStarted && progressStats.length > 1) {
      const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000);
      progressIndex = dayNumber % progressStats.length;
      progressRotationStarted = true;
      paintProgress();
      syncProgressRotation();
    }
  }
  list("days").then(paintDays).catch(() => {});

  activitySince(2).then((items) => {
    if (!root.isConnected) return;
    const body = $(".act-body");
    body.innerHTML = activityHtml(items);
    body.querySelectorAll("img").forEach((img) =>
      img.addEventListener("error", () => img.replaceWith(Object.assign(document.createElement("span"), { className: "act-dot" })), { once: true }));
  }).catch((e) => {
    console.error(e);
    $(".act-body").innerHTML = `<p class="act-empty muted">No se pudo cargar la actividad.</p>`;
  });

  return () => {
    clearInterval(timer);
    clearInterval(progressRotationTimer);
    clearTimeout(okTimer);
    progressCard.removeEventListener("pointerenter", onProgressPointerEnter);
    progressCard.removeEventListener("pointerleave", onProgressPointerLeave);
    progressCard.removeEventListener("pointerdown", onProgressPointerDown);
    progressCard.removeEventListener("pointerup", onProgressPointerUp);
    progressCard.removeEventListener("pointercancel", onProgressPointerUp);
    progressCard.removeEventListener("focusin", onProgressFocusIn);
    progressCard.removeEventListener("focusout", onProgressFocusOut);
    document.removeEventListener("visibilitychange", onProgressVisibilityChange);
    revealObserver?.disconnect();
    offMotion();
    sky.destroy();
    save();
  };
}

function shelfHtml(title, items, kind, emptyText, href) {
  const isGame = kind === "games";
  const cards = items.slice(0, 8).map((item) => {
    const cover = isGame ? (item.boxUrl || item.coverUrl) : (item.coverCustom || item.coverFast || item.coverUrl);
    const sub = isGame ? [item.platform, item.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ") : item.artist;
    const target = isGame ? `#/coleccion/videojuegos/${encodeURIComponent(item.id)}` : "#/coleccion/musica";
    return `<a class="home-shelf-card${cover ? "" : " no-cover"}${items.length === 1 ? " featured" : ""}" href="${target}" aria-label="${isGame ? `Abrir ${esc(item.title)}` : `Ir a Música: ${esc(item.title)}`} ">
      ${items.length === 1 && cover ? `<span class="home-shelf-backdrop" aria-hidden="true"><img src="${esc(cover)}" alt="" /></span>` : ""}
      <span class="home-shelf-art">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async" />` : `<span aria-hidden="true">${isGame ? "✳" : "♫"}</span>`}</span>
      <span class="home-shelf-title">${esc(item.title)}</span><span class="home-shelf-sub">${esc(sub || (isGame ? "Juego" : "Disco"))}</span>
    </a>`;
  }).join("");
  return `<div class="home-shelf-head"><div><span class="mono label">${isGame ? "VIDEOJUEGOS" : "EN TU BIBLIOTECA"}</span><h2>${title}</h2></div><a class="home-shelf-more mono" href="${href}">Ver todo <span aria-hidden="true">↗</span></a></div>
    ${cards ? `<div class="home-shelf-row${items.length === 1 ? " single" : ""}">${cards}</div>` : `<a class="home-shelf-empty" href="${href}">${emptyText}<span aria-hidden="true">↗</span></a>`}`;
}

function spotlightHtml(item) {
  if (!item) return `<div class="home-spotlight-empty"><span class="mono label">TU ARCHIVO · EN PORTADA</span><h2>Tu historia toma forma acá.</h2><p>Agregá un juego o un disco y aparecerá en este espacio.</p></div>`;
  const game = item.kind === "games";
  const cover = game ? (item.boxUrl || item.coverUrl) : (item.coverCustom || item.coverFast || item.coverUrl);
  const title = item.title || "Sin título";
  const context = game
    ? [item.platform, item.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ")
    : [item.artist, item.type === "album" ? "Álbum" : item.type?.toUpperCase()].filter(Boolean).join(" · ");
  const destination = game ? `#/coleccion/videojuegos/${encodeURIComponent(item.id)}` : "#/coleccion/musica";
  const label = game ? "JUEGO · AÑADIDO RECIENTEMENTE" : "MÚSICA · AÑADIDA RECIENTEMENTE";
  return `<section class="home-spotlight-card" data-kind="${game ? "game" : "music"}">
    ${cover ? `<div class="home-spotlight-wash" aria-hidden="true"><img src="${esc(cover)}" alt="" /></div><div class="home-spotlight-cover" aria-hidden="true"><img src="${esc(cover)}" alt="" /></div>` : ""}
    <div class="home-spotlight-copy"><span class="mono label">TU ARCHIVO PERSONAL <i></i> EN PORTADA</span>
      <p class="home-spotlight-kicker">${label}</p><h2>${esc(title)}</h2><p class="home-spotlight-context">${esc(context || (game ? "Videojuego" : "Tu biblioteca musical"))}</p>
      <a class="home-spotlight-link" href="${destination}">${game ? "Ver juego" : "Explorar álbum"}<span aria-hidden="true">↗</span></a>
    </div><span class="home-spotlight-index mono">LO ÚLTIMO <b>01</b></span>
  </section>`;
}

function saveHomeLayout(layout) {
  try {
    localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(layout));
    return true;
  } catch { return false; }
}

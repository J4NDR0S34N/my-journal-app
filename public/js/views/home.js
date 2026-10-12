import { createSky } from "../lib/sky.js";
import { dayKey, isDaytime, fmtLong, fmtTime, fmtShort } from "../lib/dates.js";
import { list, set } from "../store.js";
import { HABITS, countDone, computeStreak } from "../habits.js";
import { habitButtons, bindHabitButtons, sameHabits, saveDay } from "../lib/habitPicker.js";
import { esc, plural, toast, openSheet } from "../lib/ui.js";
import { firstName, onProfile } from "../lib/profile.js";
import { activitySince } from "../lib/activity.js";
import { cachedTemp, currentTemp } from "../lib/weather.js";
import { motion, onMotion } from "../lib/prefs.js";

const SUN = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></g></svg>`;
const MOON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10.5 1.8A6.3 6.3 0 1 0 14.2 11 5.2 5.2 0 0 1 10.5 1.8z" fill="currentColor"/></svg>`;

// Textos del footer: variante de día y de noche.
const FOOT = {
  day: "hecho a mano, un hábito a la vez",
  night: "hecho a mano, una noche a la vez",
};

const WHERE = { habit: "Hábitos", games: "Colección", music: "Música", notes: "Notas", misc: "Miscelánea" };
const ROUTE = { habit: "inicio", games: "coleccion/videojuegos", music: "coleccion/musica", notes: "notas", misc: "misc" };
const HOME_PREFS = "mj:home-layout:v2";
const HOME_MODULES = ["spotlight", "games", "wishlist", "music", "today", "progress", "activity", "reflection"];
const PROGRESS_AREAS = [
  { label: "Fuerza", habits: ["gym"], cue: "Cada día de gimnasio suma 1 punto." },
  { label: "Destreza", habits: ["run", "gaming", "drawing"], cue: "Correr, jugar o dibujar suma 1 punto al día." },
  { label: "Inteligencia", habits: ["reading", "projects"], cue: "Leer o avanzar un proyecto suma 1 punto al día." },
  { label: "Felicidad", habits: ["gaming", "movies", "drawing"], cue: "Disfrutar tus juegos, películas o dibujos suma 1 punto al día." },
  { label: "Salud", habits: ["hydration", "rest", "run", "gym"], cue: "Cuidar tu cuerpo suma 1 punto al día." },
];
const MODULE_INFO = {
  spotlight: ["En portada", "Lo último que sumaste a tu colección."],
  games: ["Juegos añadidos", "Tus últimos juegos guardados."],
  wishlist: ["Por jugar", "Los juegos que dejaste en tu radar."],
  music: ["Música añadida", "Álbumes y sencillos de tu biblioteca."],
  today: ["Hábitos de hoy", "Tu registro diario."],
  progress: ["Tu progreso", "Un resumen de tus días registrados."],
  activity: ["Actividad reciente", "Tus movimientos más recientes."],
  reflection: ["Pregunta del día", "Una nota breve para vos."]
};
const HOME_PRESETS = {
  classic: { label: "Original", hint: "Equilibrado y familiar", accent: "#c5a26f" },
  editorial: { label: "Editorial", hint: "Más aire y foco en el contenido", accent: "#c68491" },
  studio: { label: "Estudio", hint: "Compacto y funcional", accent: "#8da98d" },
};
function homePrefs() {
  try {
    const value = JSON.parse(localStorage.getItem(HOME_PREFS) || "{}");
    const storedOrder = Array.isArray(value.order) ? value.order.filter((id) => HOME_MODULES.includes(id)) : [];
    const order = [...new Set(storedOrder)];
    for (const id of HOME_MODULES) {
      if (order.includes(id)) continue;
      const position = HOME_MODULES.indexOf(id);
      const previous = HOME_MODULES.slice(0, position).reverse().find((candidate) => order.includes(candidate));
      order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, id);
    }
    const visible = Object.fromEntries(HOME_MODULES.map((id) => [id, true]));
    for (const id of HOME_MODULES) if (typeof value.visible?.[id] === "boolean") visible[id] = value.visible[id];
    return {
      preset: HOME_PRESETS[value.style] ? value.style : "classic",
      visible,
      order,
    };
  } catch { return { preset: "classic", visible: Object.fromEntries(HOME_MODULES.map((id) => [id, true])), order: [...HOME_MODULES] }; }
}
function saveHomePrefs(prefs) {
  try { localStorage.setItem(HOME_PREFS, JSON.stringify({ style: prefs.preset, visible: prefs.visible, order: prefs.order })); return true; }
  catch { return false; }
}

function greeting(d) {
  const h = d.getHours();
  if (h >= 6 && h < 12) return "Buen día";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
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

// Solo la actividad de hoy, de la más reciente a la más vieja.
function activityHtml(items) {
  return items.length
    ? `<ol class="act-list">${items.map(itemHtml).join("")}</ol>`
    : `<p class="act-empty muted">Todavía no hay actividad hoy.</p>`;
}

export async function render(root) {
  root.innerHTML = `
    <section class="home">
      <div class="hero">
        <canvas class="sky" aria-hidden="true"></canvas>
        <div class="home-main">
          <p class="mono label home-date"><span class="home-clock"></span><span class="home-temp" hidden></span></p>
          <h1 class="home-greet"></h1>
          <button class="home-customize" type="button">Personalizar Inicio <span aria-hidden="true">✳</span></button>
          <a class="streak mono" href="#/progreso" hidden></a>
        </div>
      </div>
      <div class="home-content" id="home-content"><div class="home-widgets">
      <section class="home-widget home-spotlight-widget" data-home-widget="spotlight" aria-label="En portada"><div class="home-spotlight-content"><p class="home-shelf-loading mono muted">Preparando tu portada…</p></div></section>
      <section class="home-widget home-shelf-widget" data-home-widget="games" aria-label="Juegos añadidos"><div class="home-shelf-content"><p class="home-shelf-loading mono muted">Cargando juegos…</p></div></section>
      <section class="home-widget home-shelf-widget" data-home-widget="wishlist" aria-label="Juegos por jugar"><div class="home-shelf-content"><p class="home-shelf-loading mono muted">Cargando wishlist…</p></div></section>
      <section class="home-widget home-shelf-widget" data-home-widget="music" aria-label="Música añadida"><div class="home-shelf-content"><p class="home-shelf-loading mono muted">Cargando música…</p></div></section>
      <section class="home-widget today" data-home-widget="today" aria-labelledby="today-h">
        <header class="today-head">
          <h2 id="today-h" class="act-head">Hoy</h2>
          <span class="today-count mono muted" aria-live="polite"></span>
        </header>
        <div class="today-pick">
          <div class="today-grid">${habitButtons({})}</div>
          <button class="btn today-save" disabled>Guardar</button>
        </div>
      </section>
      <section class="home-widget home-progress-widget" data-home-widget="progress" aria-label="Progreso personal">
        <div class="home-progress-content"><p class="mono label">TU SIGUIENTE NIVEL</p><strong class="strength-name">Fuerza</strong><span class="strength-count mono">Calculando progreso…</span><div class="strength-meter" role="progressbar" aria-label="Progreso de Fuerza" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0"><i></i></div><span class="strength-level mono"></span><small class="strength-hint">Cada día de gimnasio suma 1 punto · 5 para subir.</small><a class="home-progress-link" href="#/progreso">Ver progreso <span aria-hidden="true">↗</span></a></div>
      </section>
      <section class="home-widget home-activity-widget" data-home-widget="activity" aria-labelledby="act-h">
        <h2 id="act-h" class="act-head">Actividad reciente</h2>
        <div class="act-body"><p class="act-empty muted">cargando…</p></div>
      </section>
      <section class="home-widget home-reflection" data-home-widget="reflection" aria-label="Pregunta del día"><form class="umbral" autocomplete="off"><label class="umbral-q" for="umbral-in">¿Qué te gustaría recordar dentro de un año?</label><input id="umbral-in" class="umbral-in" type="text" maxlength="280" enterkeyhint="done" placeholder="Una línea alcanza…" /><span class="umbral-ok mono muted" aria-live="polite"></span></form></section>
      </div></div>
      <footer class="home-foot mono"><span class="foot-ico"></span><span class="foot-txt"></span></footer>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const prefs = homePrefs();
  const applyHomePrefs = () => {
    const home = $(".home");
    home.dataset.homeStyle = prefs.preset;
    home.style.setProperty("--home-accent", HOME_PRESETS[prefs.preset].accent);
    for (const id of HOME_MODULES) {
      const widget = root.querySelector(`[data-home-widget="${id}"]`);
      if (widget) widget.hidden = !prefs.visible[id];
    }
    prefs.order.forEach((id) => {
      const widget = root.querySelector(`[data-home-widget="${id}"]`);
      if (widget) widget.parentNode.append(widget);
    });
  };
  applyHomePrefs();
  $(".home-customize").addEventListener("click", () => {
    const sectionCards = () => prefs.order.map((id, index) => {
      const [label, hint] = MODULE_INFO[id];
      return `<div class="home-section-toggle"><span class="home-section-position mono">0${index + 1}</span><span class="home-section-copy"><b>${label}</b><small>${hint}</small></span><span class="home-section-actions"><button type="button" data-home-move="${id}:up" aria-label="Mover ${label} arriba" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-home-move="${id}:down" aria-label="Mover ${label} abajo" ${index === prefs.order.length - 1 ? "disabled" : ""}>↓</button><input type="checkbox" data-home-visible="${id}" aria-label="Mostrar ${label}" ${prefs.visible[id] ? "checked" : ""}></span></div>`;
    }).join("");
    const sheet = openSheet(`<div class="home-customizer"><p class="mono label">TU ESPACIO</p><h2>Personalizar Inicio</h2><p class="muted">Elegí una presentación, mové los módulos con ↑ ↓ y activá solo los que quieras ver.</p>
      <h3>Estilo visual</h3><div class="home-preset-list">${Object.entries(HOME_PRESETS).map(([id, item]) => `<button type="button" data-home-preset="${id}" class="home-preset${prefs.preset === id ? " selected" : ""}"><span class="home-preset-swatch" style="--swatch:${item.accent}"></span><span><b>${item.label}</b><small>${item.hint}</small></span><span class="home-preset-check">${prefs.preset === id ? "✓" : ""}</span></button>`).join("")}</div>
      <h3>Módulos · ordenar y mostrar</h3><div class="home-preset-list home-section-list">${sectionCards()}</div>
      <p class="home-customizer-note mono">Tus preferencias quedan guardadas en este dispositivo.</p></div>`);
    sheet.el.classList.add("home-customizer-sheet");
    sheet.el.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-home-preset]");
      if (!choice) return;
      prefs.preset = choice.dataset.homePreset;
      saveHomePrefs(prefs); applyHomePrefs(); sheet.close();
    });
    sheet.el.addEventListener("click", (event) => {
      const move = event.target.closest("[data-home-move]");
      if (!move) return;
      const [id, direction] = move.dataset.homeMove.split(":");
      const index = prefs.order.indexOf(id), next = index + (direction === "up" ? -1 : 1);
      if (next < 0 || next >= prefs.order.length) return;
      [prefs.order[index], prefs.order[next]] = [prefs.order[next], prefs.order[index]];
      saveHomePrefs(prefs); applyHomePrefs();
      sheet.el.querySelector(".home-section-list").innerHTML = sectionCards();
    });
    sheet.el.addEventListener("change", (event) => {
      const toggle = event.target.closest("[data-home-visible]");
      if (!toggle) return;
      if (!toggle.checked && !HOME_MODULES.some((id) => id !== toggle.dataset.homeVisible && prefs.visible[id])) {
        toggle.checked = true;
        toast("Dejá al menos una sección visible");
        return;
      }
      prefs.visible[toggle.dataset.homeVisible] = toggle.checked;
      saveHomePrefs(prefs); applyHomePrefs();
    });
  });
  let day = isDaytime();
  const sky = createSky($(".sky"), { day, motion: motion() });
  const offMotion = onMotion((m) => sky.setMotion(m));

  function tick() {
    const now = new Date();
    day = isDaytime(now);
    sky.setDay(day);
    $(".home-clock").textContent = `${fmtLong(now)} · ${fmtTime(now)}`;
    paintNames(now);
    $(".foot-ico").innerHTML = day ? SUN : MOON;
    $(".foot-txt").textContent = `© ${now.getFullYear()} · ${day ? FOOT.day : FOOT.night}`;
  }
  // Saludo con el nombre de la cuenta de Google: "Buenas tardes, Alejandro".
  function paintNames(now = new Date()) {
    const name = firstName();
    $(".home-greet").textContent = name ? `${greeting(now)}, ${name}` : greeting(now);
  }
  // El reloj se actualiza justo al cambiar el minuto (y al volver a la app).
  let clockTimer;
  const scheduleTick = () => {
    clockTimer = setTimeout(() => { tick(); scheduleTick(); }, 60_000 - (Date.now() % 60_000) + 30);
  };
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    clearTimeout(clockTimer);
    tick();
    scheduleTick();
    paintTemp();
  };
  document.addEventListener("visibilitychange", onVisible);
  tick();
  scheduleTick();

  // Temperatura local al lado de la hora: la guardada al instante, la nueva
  // cuando llega (cada 30 min como mucho; ver lib/weather.js).
  const showTemp = (t) => {
    const el = $(".home-temp");
    if (!el) return;
    el.hidden = t == null;
    el.textContent = t == null ? "" : ` · ${t}°`;
  };
  const paintTemp = () => currentTemp().then(showTemp);
  showTemp(cachedTemp());
  paintTemp();
  const tempTimer = setInterval(paintTemp, 30 * 60_000);
  const offProfile = onProfile(() => paintNames());

  // ---------- hoy: hábitos (se guardan con Guardar) y racha ----------
  const today = dayKey();
  const todayEl = $(".today"), saveBtn = $(".today-save");
  let saved = {}, draft = {}, touched = false;
  const paintToday = () => {
    const dirty = !sameHabits(saved, draft);
    // Con cambios sin guardar, la sección no se redibuja por cambios de otro dispositivo.
    dirty ? (todayEl.dataset.dirty = "") : delete todayEl.dataset.dirty;
    $(".today-count").textContent = `${countDone(draft)} de ${HABITS.length}${dirty ? " · sin guardar" : ""}`;
    saveBtn.disabled = !dirty;
  };
  bindHabitButtons($(".today-grid"), draft, () => { touched = true; paintToday(); });
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      saved = await saveDay(today, saved, draft);
      paintToday();
      toast("Guardado");
      list("days").then(paintDays);
    } catch (err) {
      paintToday();
      toast("No se pudo guardar");
      console.error(err);
    }
  });

  let progressAreas = [], progressIndex = 0, progressRotationTimer;

  function paintDays(days) {
    if (!root.isConnected) return;
    saved = { ...(days.find((d) => d.id === today)?.h || {}) };
    paintStrength(days);
    const reflection = $(".umbral-in");
    const reflectionValue = days.find((d) => d.id === today)?.respuesta || "";
    savedReflection = reflectionValue;
    if (!reflection.dataset.touched) reflection.value = reflectionValue;
    if (!touched) {
      Object.keys(draft).forEach((k) => delete draft[k]);
      Object.assign(draft, saved);
      $(".today-grid .habits").outerHTML = habitButtons(draft);
    }
    paintToday();
    const s = $(".streak");
    s.textContent = `🔥 ${plural(computeStreak(days, today, dayKey), "día", "días")}`;
    s.hidden = false;
  }
  function paintStrength(days) {
    if (!days) return;
    progressAreas = PROGRESS_AREAS.map((area) => {
      const total = days.filter((day) => area.habits.some((key) => day.h?.[key])).length;
      return { ...area, total, points: total % 5, level: Math.floor(total / 5) + 1 };
    });
    showStrength();
    if (!progressRotationTimer && progressAreas.length > 1)
      progressRotationTimer = setInterval(rotateStrength, 5000);
  }
  function showStrength() {
    const { points, level, total, label, cue } = progressAreas[progressIndex];
    const meter = $(".strength-meter");
    $(".strength-name").textContent = label;
    $(".strength-count").textContent = `${points}/5 puntos`;
    $(".strength-level").textContent = `Nivel ${level} · ${total} ${total === 1 ? "día" : "días"} sumados`;
    $(".strength-hint").textContent = `${cue} Con 5 puntos subís un nivel.`;
    meter.setAttribute("aria-label", `${label}, nivel ${level}: ${points} de 5 puntos para el siguiente nivel`);
    meter.setAttribute("aria-valuenow", points);
    meter.querySelector("i").style.width = `${points * 20}%`;
  }
  function rotateStrength() {
    if (!root.isConnected || progressAreas.length < 2) return;
    progressIndex = (progressIndex + 1) % progressAreas.length;
    showStrength();
  }
  list("days").then((days) => { paintDays(days); }).catch(() => {});

  const reflectionInput = $(".umbral-in");
  let savedReflection = "", reflectionTimer;
  const saveReflection = async () => {
    const value = reflectionInput.value.trim();
    if (value === savedReflection) return;
    try {
      await set("days", today, { respuesta: value });
      savedReflection = value;
      $(".umbral-ok").textContent = "guardado";
      clearTimeout(reflectionTimer);
      reflectionTimer = setTimeout(() => { if (root.isConnected) $(".umbral-ok").textContent = ""; }, 1800);
    } catch (error) { $(".umbral-ok").textContent = "no se pudo guardar"; console.error(error); }
  };
  let saveReflectionTimer;
  reflectionInput.addEventListener("input", () => {
    reflectionInput.dataset.touched = "1";
    clearTimeout(saveReflectionTimer);
    saveReflectionTimer = setTimeout(saveReflection, 900);
  });
  reflectionInput.addEventListener("change", saveReflection);

  Promise.all([list("games"), list("music")]).then(([games, music]) => {
    if (!root.isConnected) return;
    const recent = (items) => [...items].sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
    const owned = recent(games.filter((item) => item.status === "owned"));
    const wishlist = recent(games.filter((item) => item.status === "wishlist"));
    const albums = recent(music);
    const latest = recent([...owned.map((item) => ({ ...item, kind: "games" })), ...albums.map((item) => ({ ...item, kind: "music" }))])[0];
    $(".home-spotlight-content").innerHTML = spotlightHtml(latest);
    const shelves = {
      games: shelfHtml("Añadidos recientemente", owned, "games", "Tu estante de juegos empieza acá. Agregá uno a tu colección.", "#/coleccion/videojuegos"),
      wishlist: shelfHtml("Por jugar", wishlist, "games", "Guardá juegos que quieras tener en el radar.", "#/coleccion/videojuegos"),
      music: shelfHtml("Escuchá cuando quieras", albums, "music", "Tus discos favoritos y pendientes, reunidos en un solo estante.", "#/coleccion/musica"),
    };
    for (const [id, html] of Object.entries(shelves)) $(`[data-home-widget="${id}"] .home-shelf-content`).innerHTML = html;
    root.querySelectorAll(".home-shelf-art img, .home-spotlight-card img").forEach((img) => img.addEventListener("error", () => img.closest(".home-shelf-art")?.classList.add("image-failed"), { once: true }));
  }).catch((error) => console.error("No se pudieron cargar las secciones multimedia de Inicio:", error));

  activitySince(0).then((items) => {
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
    clearTimeout(clockTimer);
    clearInterval(tempTimer);
    clearInterval(progressRotationTimer);
    clearTimeout(saveReflectionTimer);
    clearTimeout(reflectionTimer);
    document.removeEventListener("visibilitychange", onVisible);
    offMotion();
    offProfile();
    sky.destroy();
  };
}

function shelfHtml(title, items, kind, emptyText, href) {
  const isGame = kind === "games";
  const cards = items.slice(0, 8).map((item) => {
    const cover = isGame ? (item.boxUrl || item.coverUrl) : (item.coverCustom || item.coverFast || item.coverUrl);
    const sub = isGame ? [item.platform, item.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ") : item.artist;
    const target = isGame ? `#/coleccion/videojuegos/${encodeURIComponent(item.id)}` : "#/coleccion/musica";
    return `<a class="home-shelf-card${cover ? "" : " no-cover"}" href="${target}" aria-label="Abrir ${esc(item.title)}"><span class="home-shelf-art">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy" decoding="async" />` : `<span aria-hidden="true">${isGame ? "✳" : "♫"}</span>`}</span><span class="home-shelf-title">${esc(item.title)}</span><span class="home-shelf-sub">${esc(sub || (isGame ? "Juego" : "Disco"))}</span></a>`;
  }).join("");
  return `<div class="home-shelf-head"><div><span class="mono label">${isGame ? "VIDEOJUEGOS" : "EN TU BIBLIOTECA"}</span><h2>${title}</h2></div><a class="home-shelf-more mono" href="${href}">Ver todo <span aria-hidden="true">↗</span></a></div>${cards ? `<div class="home-shelf-row">${cards}</div>` : `<a class="home-shelf-empty" href="${href}">${emptyText}<span aria-hidden="true">↗</span></a>`}`;
}

function spotlightHtml(item) {
  if (!item) return `<div class="home-spotlight-empty"><span class="mono label">TU ARCHIVO · EN PORTADA</span><h2>Tu historia toma forma acá.</h2><p>Agregá un juego o un disco y aparecerá en este espacio.</p></div>`;
  const game = item.kind === "games";
  const cover = game ? (item.boxUrl || item.coverUrl) : (item.coverCustom || item.coverFast || item.coverUrl);
  const context = game ? [item.platform, item.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ") : [item.artist, item.type === "album" ? "Álbum" : item.type?.toUpperCase()].filter(Boolean).join(" · ");
  const href = game ? `#/coleccion/videojuegos/${encodeURIComponent(item.id)}` : "#/coleccion/musica";
  return `<article class="home-spotlight-card" data-kind="${game ? "game" : "music"}">${cover ? `<div class="home-spotlight-wash" aria-hidden="true"><img src="${esc(cover)}" alt="" /></div><div class="home-spotlight-cover" aria-hidden="true"><img src="${esc(cover)}" alt="" /></div>` : ""}<div class="home-spotlight-copy"><span class="mono label">TU ARCHIVO PERSONAL · EN PORTADA</span><p class="home-spotlight-kicker">${game ? "JUEGO" : "MÚSICA"} · AÑADIDO RECIENTEMENTE</p><h2>${esc(item.title || "Sin título")}</h2><p class="home-spotlight-context">${esc(context || (game ? "Videojuego" : "Tu biblioteca musical"))}</p><a class="home-spotlight-link" href="${href}">${game ? "Ver juego" : "Explorar álbum"} <span aria-hidden="true">↗</span></a></div></article>`;
}

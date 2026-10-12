import { createSky } from "../lib/sky.js";
import { dayKey, isDaytime, fmtLong, fmtTime } from "../lib/dates.js";
import { list } from "../store.js";
import { HABITS, countDone } from "../habits.js";
import { habitButtons, bindHabitButtons, sameHabits, saveDay } from "../lib/habitPicker.js";
import { mountProgress } from "../lib/progress.js";
import { esc, toast } from "../lib/ui.js";
import { firstName, onProfile } from "../lib/profile.js";
import { activitySince } from "../lib/activity.js";
import { cachedTemp, currentTemp } from "../lib/weather.js";
import { motion, onMotion } from "../lib/prefs.js";
import { scenes, onScenes } from "../lib/scenes.js";

const SUN = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></g></svg>`;
const MOON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10.5 1.8A6.3 6.3 0 1 0 14.2 11 5.2 5.2 0 0 1 10.5 1.8z" fill="currentColor"/></svg>`;

// Textos del footer: variante de día y de noche.
const FOOT = {
  day: "hecho a mano, un hábito a la vez",
  night: "hecho a mano, una noche a la vez",
};

const WHERE = { habit: "Hábitos", games: "Colección", music: "Música", notes: "Notas", misc: "Miscelánea" };
const ROUTE = { habit: "inicio", games: "coleccion/videojuegos", music: "coleccion/musica", notes: "notas", misc: "misc" };

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
        </div>
      </div>
      <div class="today-row">
      <section class="today widget" aria-labelledby="today-h">
        <header class="today-head widget-head">
          <h2 id="today-h" class="act-head">Hoy</h2>
          <span class="today-count mono muted" aria-live="polite"></span>
        </header>
        <div class="today-pick">
          <div class="today-grid">${habitButtons({})}</div>
          <button class="btn today-save" disabled>Guardar</button>
        </div>
      </section>
      <div class="today-progress"></div>
      </div>
      <section class="activity" aria-labelledby="act-h">
        <div class="widget">
          <header class="widget-head"><h2 id="act-h" class="act-head">Actividad reciente</h2></header>
          <div class="act-body"><p class="act-empty muted">cargando…</p></div>
        </div>
      </section>
      <footer class="home-foot mono"><span class="foot-ico"></span><span class="foot-txt"></span></footer>
    </section>`;

  const $ = (s) => root.querySelector(s);
  let day = isDaytime();
  const sky = createSky($(".sky"), { day, motion: motion(), scene: scenes() });
  const offMotion = onMotion((m) => sky.setMotion(m));
  const offScenes = onScenes((sc) => sky.setScene(sc));

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

  // Cuadro de Progreso al lado de "Hoy" (debajo en el celular).
  let progress = null;

  function paintDays(days) {
    if (!root.isConnected) return;
    if (progress) progress.update(days);
    else progress = mountProgress($(".today-progress"), days, { onSaved: () => list("days").then(paintDays) });
    saved = { ...(days.find((d) => d.id === today)?.h || {}) };
    if (!touched) {
      Object.keys(draft).forEach((k) => delete draft[k]);
      Object.assign(draft, saved);
      $(".today-grid .habits").outerHTML = habitButtons(draft);
    }
    paintToday();
  }
  list("days").then(paintDays).catch(() => {});

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
    progress?.destroy();
    document.removeEventListener("visibilitychange", onVisible);
    offMotion();
    offScenes();
    offProfile();
    sky.destroy();
  };
}

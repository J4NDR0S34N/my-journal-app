import { createSky } from "../lib/sky.js";
import { dayKey, isDaytime, fmtLong, fmtTime, fmtShort } from "../lib/dates.js";
import { list, set } from "../store.js";
import { HABITS } from "../habits.js";
import { esc, debounce } from "../lib/ui.js";
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

const WHERE = { habit: "Registro", games: "Colección", music: "Música", notes: "Notas", misc: "Miscelánea" };
const ROUTE = { habit: "registro", games: "coleccion/videojuegos", music: "coleccion/musica", notes: "notas", misc: "misc" };

function greeting(d) {
  const h = d.getHours();
  if (h >= 6 && h < 12) return "Buen día";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

// Tres columnas: hoy, ayer y anteayer.
const DAY_NAMES = ["Hoy", "Ayer", "Anteayer"];

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
  root.innerHTML = `
    <section class="home">
      <div class="hero">
        <canvas class="sky" aria-hidden="true"></canvas>
        <div class="home-main">
          <p class="mono label home-date"></p>
          <h1 class="home-greet"></h1>
          <p class="mono home-welcome" hidden>Bienvenido de vuelta</p>
          <form class="umbral" autocomplete="off">
            <label class="umbral-q" for="umbral-in"></label>
            <input id="umbral-in" class="umbral-in" type="text" maxlength="280" enterkeyhint="done" placeholder="Una línea alcanza…" />
            <span class="umbral-ok mono muted" aria-live="polite"></span>
          </form>
          <p class="mono home-status muted"></p>
          <a class="presence mono" href="#/estadistica" hidden>
            <span class="presence-txt"></span>
            <span class="presence-week" role="img"></span>
          </a>
        </div>
      </div>
      <section class="activity" aria-labelledby="act-h">
        <h2 id="act-h" class="act-head">Actividad reciente</h2>
        <div class="act-body"><p class="act-empty muted">cargando…</p></div>
      </section>
      <footer class="home-foot mono"><span class="foot-ico"></span><span class="foot-txt"></span></footer>
    </section>`;

  const $ = (s) => root.querySelector(s);
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

  return () => { clearInterval(timer); clearTimeout(okTimer); offMotion(); sky.destroy(); save(); };
}

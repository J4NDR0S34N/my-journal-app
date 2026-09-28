import { createSky } from "../lib/sky.js";
import { dayKey, isDaytime, fmtLong, fmtTime, fmtShort } from "../lib/dates.js";
import { list } from "../store.js";
import { HABITS, countDone, computeStreak } from "../habits.js";
import { plural, esc } from "../lib/ui.js";
import { recentActivity } from "../lib/activity.js";

const SUN = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></g></svg>`;
const MOON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10.5 1.8A6.3 6.3 0 1 0 14.2 11 5.2 5.2 0 0 1 10.5 1.8z" fill="currentColor"/></svg>`;

// Textos del footer: variante de día y de noche.
const FOOT = {
  day: "hecho a mano, un hábito a la vez",
  night: "hecho a mano, una noche a la vez",
};

const WHERE = { habit: "Registro", games: "Colección", music: "Música", notes: "Notas", misc: "Miscelánea" };
const ROUTE = { habit: "registro", games: "coleccion", music: "musica", notes: "notas", misc: "misc" };

function greeting(d) {
  const h = d.getHours();
  if (h >= 6 && h < 12) return "Buen día";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function dayLabel(iso) {
  const d = new Date(iso);
  const k = dayKey(d);
  if (k === dayKey()) return "Hoy";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (k === dayKey(y)) return "Ayer";
  return fmtShort(k);
}

function activityHtml(items) {
  if (!items.length) {
    return `<p class="act-empty muted">Todavía no hay actividad. Lo que registres, agregues o escribas va a aparecer acá.</p>`;
  }
  let out = "", group = "";
  for (const a of items) {
    const g = dayLabel(a.at);
    if (g !== group) {
      if (group) out += `</ol>`;
      out += `<h3 class="act-day label">${g}</h3><ol class="act-list">`;
      group = g;
    }
    const icon = a.img
      ? `<img src="${esc(a.img)}" alt="" loading="lazy" />`
      : a.emoji ? `<span class="act-emo">${a.emoji}</span>` : `<span class="act-dot"></span>`;
    out += `
      <li><a class="act-item" href="#/${ROUTE[a.kind] || "inicio"}">
        <span class="act-time mono">${fmtTime(new Date(a.at))}</span>
        <span class="act-icon" aria-hidden="true">${icon}</span>
        <span class="act-txt">${esc(a.text)}<small class="muted">${WHERE[a.kind] || ""}</small></span>
      </a></li>`;
  }
  return out + `</ol>`;
}

export async function render(root) {
  root.innerHTML = `
    <section class="home">
      <div class="hero">
        <canvas class="sky" aria-hidden="true"></canvas>
        <div class="home-main">
          <p class="mono label home-date"></p>
          <h1 class="home-greet"></h1>
          <p class="mono home-status muted"></p>
          <a class="streak mono" href="#/stats" hidden></a>
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
  const sky = createSky($(".sky"), { day });

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

  list("days").then((days) => {
    if (!root.isConnected) return;
    const today = dayKey();
    const done = countDone(days.find((d) => d.id === today)?.h);
    $(".home-status").textContent =
      done === 0 ? "hoy todavía no registraste nada" : `hoy · ${done} de ${HABITS.length} hábitos`;
    const n = computeStreak(days, today, dayKey);
    const s = $(".streak");
    s.textContent = `🔥 ${plural(n, "día", "días")}`;
    s.hidden = false;
  }).catch(() => {});

  recentActivity(30).then((items) => {
    if (!root.isConnected) return;
    const body = $(".act-body");
    body.innerHTML = activityHtml(items);
    body.querySelectorAll("img").forEach((img) =>
      img.addEventListener("error", () => img.replaceWith(Object.assign(document.createElement("span"), { className: "act-dot" })), { once: true }));
  }).catch((e) => {
    console.error(e);
    $(".act-body").innerHTML = `<p class="act-empty muted">No se pudo cargar la actividad.</p>`;
  });

  return () => { clearInterval(timer); sky.destroy(); };
}

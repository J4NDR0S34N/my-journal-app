import { HABITS, BAR_SEGMENTS, computeStats, countDone } from "../habits.js";
import { dayKey, MONTHS, WEEKDAYS } from "../lib/dates.js";
import { list } from "../store.js";
import { presenceStats, presenceText, weekDots, weekLabel } from "../lib/presence.js";
import { habitGrid, bindHabitGrid } from "./registro.js";

export async function render(root) {
  const days = await list("days");
  const byId = new Map(days.map((d) => [d.id, d]));
  const now = new Date();
  let ym = { y: now.getFullYear(), m: now.getMonth() };
  let openKey = null;

  root.innerHTML = `
    <section class="page stats">
      <div class="hud">
        <header class="hud-head">
          <h1>Estadística</h1>
          <span class="presence mono"><span class="presence-txt"></span><span class="presence-week" role="img"></span></span>
        </header>
        <div class="hud-rows"></div>
      </div>
      <div class="dots-sep" aria-hidden="true"></div>
      <section class="hist">
        <div class="month-nav mono">
          <button class="mn-prev" aria-label="Mes anterior">‹</button>
          <span class="mn-label"></span>
          <button class="mn-next" aria-label="Mes siguiente">›</button>
        </div>
        <ul class="days"></ul>
      </section>
    </section>`;

  const $ = (s) => root.querySelector(s);

  function paintHud() {
    const all = [...byId.values()];
    const p = presenceStats(all);
    $(".presence-txt").textContent = presenceText(p);
    $(".presence-week").textContent = weekDots(p);
    $(".presence-week").setAttribute("aria-label", weekLabel(p));
    $(".hud-rows").innerHTML = computeStats(all).map((s) => `
      <div class="stat">
        <div class="stat-top">
          <span class="stat-name">${s.label}</span>
          <span class="stat-lvl"><span class="mono">NVL</span><b class="stat-num">${s.level}</b><span class="mono">${s.points} PTS</span></span>
        </div>
        <div class="bar" role="meter" aria-label="${s.label}" aria-valuemin="0" aria-valuemax="${BAR_SEGMENTS}" aria-valuenow="${s.filled}">
          ${Array.from({ length: BAR_SEGMENTS }, (_, i) => `<i${i < s.filled ? ' class="on"' : ""}></i>`).join("")}
        </div>
      </div>`).join("");
  }

  const mini = (h = {}) =>
    `<span class="mini" aria-hidden="true">${HABITS.map((x) => `<i${h[x.key] ? ' class="on"' : ""} title="${x.label}"></i>`).join("")}</span>`;

  function paintMonth() {
    const { y, m } = ym;
    $(".mn-label").textContent = `${MONTHS[m]} ${y}`;
    const isCurrent = y === now.getFullYear() && m === now.getMonth();
    $(".mn-next").disabled = isCurrent;
    const last = isCurrent ? now.getDate() : new Date(y, m + 1, 0).getDate();
    const rows = [];
    for (let d = last; d >= 1; d--) {
      const date = new Date(y, m, d);
      const key = dayKey(date);
      const h = byId.get(key)?.h || {};
      const open = key === openKey;
      rows.push(`
        <li class="day${open ? " open" : ""}" data-key="${key}">
          <button class="day-row" aria-expanded="${open}">
            <span class="day-date mono">${WEEKDAYS[date.getDay()].slice(0, 3)} ${String(d).padStart(2, "0")}</span>
            ${mini(h)}
            <span class="day-count mono">${countDone(h)}/${HABITS.length}</span>
          </button>
          ${open ? `<div class="day-edit">${habitGrid({ ...h }, "small")}</div>` : ""}
        </li>`);
    }
    $(".days").innerHTML = rows.join("");
    if (openKey) {
      const li = root.querySelector(`.day[data-key="${openKey}"]`);
      if (li) {
        const h = { ...(byId.get(openKey)?.h || {}) };
        const k = openKey;
        bindHabitGrid(li.querySelector(".habits"), k, h, (nh) => {
          byId.set(k, { id: k, h: { ...nh } });
          li.querySelector(".mini").outerHTML = mini(nh);
          li.querySelector(".day-count").textContent = `${countDone(nh)}/${HABITS.length}`;
          paintHud();
        });
      }
    }
  }

  $(".days").addEventListener("click", (e) => {
    const row = e.target.closest(".day-row");
    if (!row) return;
    const key = row.parentElement.dataset.key;
    openKey = openKey === key ? null : key;
    paintMonth();
  });
  $(".mn-prev").addEventListener("click", () => {
    ym = ym.m === 0 ? { y: ym.y - 1, m: 11 } : { y: ym.y, m: ym.m - 1 };
    openKey = null;
    paintMonth();
  });
  $(".mn-next").addEventListener("click", () => {
    ym = ym.m === 11 ? { y: ym.y + 1, m: 0 } : { y: ym.y, m: ym.m + 1 };
    openKey = null;
    paintMonth();
  });

  paintHud();
  paintMonth();
}

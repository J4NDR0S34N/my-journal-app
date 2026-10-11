import { HABITS, BAR_SEGMENTS, POINTS_PER_CYCLE, computeStats, countDone } from "../habits.js";
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
  let editKey = null;

  root.innerHTML = `
    <section class="page stats">
      <div class="hud">
        <header class="hud-head">
          <h1>Progreso</h1>
          <span class="presence mono"><span class="presence-txt"></span><span class="presence-week" role="img"></span></span>
        </header>
        <p class="stats-guide">Un día con un hábito asociado suma 1 punto al área. Cada 5 puntos subís 1 nivel.</p>
        <div class="hud-rows"></div>
      </div>
      <div class="dots-sep" aria-hidden="true"></div>
      <section class="hist">
        <p class="hist-guide">Tocá un día para ver o editar sus hábitos.</p>
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
    $(".hud-rows").innerHTML = computeStats(all).map((s) => {
      const progressSegments = s.filled;
      return `
      <div class="stat">
        <div class="stat-top">
          <span class="stat-copy"><span class="stat-name">${s.label}</span><span class="stat-related">Hábitos · ${s.habits.map((key) => HABITS.find((habit) => habit.key === key)?.label).filter(Boolean).join(" · ")}</span></span>
          <span class="stat-lvl"><span class="stat-level-label">NIVEL</span><b class="stat-num">${s.level}</b></span>
        </div>
        <p class="stat-progress-label">${s.points} ${s.points === 1 ? "pto" : "ptos"} total <span aria-hidden="true">·</span> Ciclo ${s.cycle}: ${s.cyclePoints}/${POINTS_PER_CYCLE}</p>
        <div class="bar" role="meter" aria-label="${s.label}: ciclo ${s.cycle}, ${s.cyclePoints} de ${POINTS_PER_CYCLE} puntos; nivel ${s.level}" aria-valuemin="0" aria-valuemax="${BAR_SEGMENTS}" aria-valuenow="${progressSegments}">
          ${Array.from({ length: BAR_SEGMENTS }, (_, i) => `<i${i < progressSegments ? ' class="on"' : ""}></i>`).join("")}
        </div>
      </div>`;
    }).join("");
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
      const record = byId.get(key);
      const open = key === openKey;
      const editing = key === editKey;
      const done = HABITS.filter((habit) => h[habit.key]);
      rows.push(`
        <li class="day${open ? " open" : ""}" data-key="${key}">
          <button class="day-row" aria-expanded="${open}">
            <span class="day-date mono">${WEEKDAYS[date.getDay()].slice(0, 3)} ${String(d).padStart(2, "0")}</span>
            ${mini(h)}
            <span class="day-count mono">${countDone(h)}/${HABITS.length}</span>
          </button>
          ${open ? `<div class="day-detail">
            <p class="day-detail-label mono">${done.length ? `${done.length} ${done.length === 1 ? "hábito registrado" : "hábitos registrados"}` : "Sin hábitos registrados"}</p>
            ${done.length ? `<ul class="day-habits">${done.map((habit) => `<li>${habit.emoji} ${habit.label}</li>`).join("")}</ul>` : `<p class="day-detail-empty">Este día todavía no tiene hábitos marcados.</p>`}
            ${record?.respuesta ? `<p class="day-reflection">También respondiste la pregunta del día.</p>` : ""}
            <button class="day-edit-toggle mono" type="button" data-edit-day="${key}">${editing ? "Listo" : "Editar este día"}</button>
            ${editing ? `<div class="day-edit">${habitGrid({ ...h }, "small")}</div>` : ""}
          </div>` : ""}
        </li>`);
    }
    $(".days").innerHTML = rows.join("");
    if (editKey) {
      const li = root.querySelector(`.day[data-key="${editKey}"]`);
      if (li) {
        const h = { ...(byId.get(editKey)?.h || {}) };
        const k = editKey;
        bindHabitGrid(li.querySelector(".habits"), k, h, (nh) => {
          byId.set(k, { ...byId.get(k), id: k, h: { ...nh } });
          li.querySelector(".mini").outerHTML = mini(nh);
          li.querySelector(".day-count").textContent = `${countDone(nh)}/${HABITS.length}`;
          paintHud();
        });
      }
    }
  }

  $(".days").addEventListener("click", (e) => {
    const editButton = e.target.closest("[data-edit-day]");
    if (editButton) {
      const key = editButton.dataset.editDay;
      editKey = editKey === key ? null : key;
      paintMonth();
      return;
    }
    const row = e.target.closest(".day-row");
    if (!row) return;
    const key = row.parentElement.dataset.key;
    openKey = openKey === key ? null : key;
    if (openKey !== editKey) editKey = null;
    paintMonth();
  });
  $(".mn-prev").addEventListener("click", () => {
    ym = ym.m === 0 ? { y: ym.y - 1, m: 11 } : { y: ym.y, m: ym.m - 1 };
    openKey = null;
    editKey = null;
    paintMonth();
  });
  $(".mn-next").addEventListener("click", () => {
    ym = ym.m === 11 ? { y: ym.y + 1, m: 0 } : { y: ym.y, m: ym.m + 1 };
    openKey = null;
    editKey = null;
    paintMonth();
  });

  paintHud();
  paintMonth();
}

// Cuadro de Progreso (en Inicio, al lado de "Hoy"): la actividad por intensidad (cuanto más intenso, más hábitos ese
// día) en tres vistas, con flechas para ir hacia atrás:
//   Semana: 7 días grandes con los emojis de lo que hiciste.
//   Mes: calendario con el número de cada día.
//   Año: de enero a diciembre, un cuadradito por día agrupado por mes
//        (columnas = semanas, filas = lunes a domingo).
// Al pasar el cursor se ve lo registrado; al tocar un día se abre para corregirlo.

import { HABITS, countDone, computeStreak } from "../habits.js";
import { dayKey, fmtLong, MONTHS, WEEKDAYS } from "./dates.js";
import { esc, plural, openSheet, toast } from "./ui.js";
import { habitButtons, bindHabitButtons, sameHabits, saveDay } from "./habitPicker.js";

// 0 sin registro · 1: 1–2 hábitos · 2: 3–4 · 3: 5–6 · 4: 7 o más
const level = (n) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4);
const doneList = (h = {}) => HABITS.filter((x) => h[x.key]);
const dateOf = (key) => new Date(`${key}T12:00:00`);
const VIEWS = [["week", "Semana"], ["month", "Mes"], ["year", "Año"]];
const DOW = ["L", "M", "X", "J", "V", "S", "D"]; // lunes primero
const VIEW_KEY = "mj:progreso:vista";

// Lunes de la semana de `d`.
const mondayOf = (d) => {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};

// root: dónde se dibuja. days: los documentos de days. onSaved(): avisa
// cuando se corrigió un día desde el cuadro (Inicio refresca lo de hoy).
// Devuelve { update(days), destroy() }.
export function mountProgress(root, days, { onSaved } = {}) {
  let byId = new Map(days.map((d) => [d.id, d.h || {}]));
  const today = dayKey();
  let view = "year";
  try { view = VIEWS.some(([k]) => k === localStorage.getItem(VIEW_KEY)) ? localStorage.getItem(VIEW_KEY) : "year"; } catch {}
  let back = 0; // cuántos períodos hacia atrás (0 = el actual)

  root.innerHTML = `
    <section class="stats progress-box" aria-labelledby="prog-h">
      <div class="hud widget">
        <header class="hud-head widget-head">
          <h2 id="prog-h">Progreso</h2>
          <span class="streak mono"></span>
        </header>
        <div class="prog-bar">
          <div class="prog-views" role="tablist" aria-label="Vista">
            ${VIEWS.map(([k, l]) => `<button role="tab" data-view="${k}" aria-selected="false">${l}</button>`).join("")}
          </div>
          <div class="prog-nav">
            <button class="prog-prev" aria-label="Anterior">‹</button>
            <span class="prog-label mono" aria-live="polite"></span>
            <button class="prog-next" aria-label="Siguiente">›</button>
          </div>
        </div>
        <div class="heat"></div>
        <div class="heat-legend mono" aria-hidden="true">
          <span>menos</span>${[0, 1, 2, 3, 4].map((l) => `<i class="heat-day l${l}"></i>`).join("")}<span>más</span>
        </div>
      </div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  // El tooltip va en <body>: dentro de la sección (que se anima con transform)
  // position: fixed no se ubicaría bien.
  const tip = document.createElement("div");
  tip.className = "heat-tip mono";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);

  // Datos de un día para cualquier vista; null si es futuro.
  function dayInfo(key) {
    if (key > today) return null;
    const h = byId.get(key) || {};
    const n = countDone(h);
    const what = n ? doneList(h).map((x) => x.label).join(", ") : "sin registro";
    return { h, n, lv: level(n), label: `${fmtLong(dateOf(key))}: ${what}`, today: key === today };
  }

  // ---------- año: cuadraditos agrupados por mes ----------
  function monthBlock(y, m) {
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const total = new Date(y, m + 1, 0).getDate();
    const cells = Array.from({ length: offset }, () => `<i class="heat-pad"></i>`);
    for (let d = 1; d <= total; d++) {
      const key = dayKey(new Date(y, m, d));
      const info = dayInfo(key);
      cells.push(info
        ? `<button class="heat-day l${info.lv}${info.today ? " today" : ""}" data-key="${key}" aria-label="${esc(info.label)}"></button>`
        : `<i class="heat-day future"></i>`);
    }
    return `<div class="heat-month"><span class="heat-name">${MONTHS[m].slice(0, 3)}</span><div class="heat-grid">${cells.join("")}</div></div>`;
  }
  function yearView() {
    const y = new Date().getFullYear() - back;
    return { label: String(y), html: `<div class="heat-year">${Array.from({ length: 12 }, (_, m) => monthBlock(y, m)).join("")}</div>` };
  }

  // ---------- mes: calendario ----------
  function monthView() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const y = first.getFullYear(), m = first.getMonth();
    const offset = (first.getDay() + 6) % 7;
    const total = new Date(y, m + 1, 0).getDate();
    const cells = Array.from({ length: offset }, () => `<i class="cal-pad"></i>`);
    for (let d = 1; d <= total; d++) {
      const key = dayKey(new Date(y, m, d));
      const info = dayInfo(key);
      cells.push(info
        ? `<button class="heat-day cal-day l${info.lv}${info.today ? " today" : ""}" data-key="${key}" aria-label="${esc(info.label)}">
            <span class="cal-num">${d}</span>${info.n ? `<span class="cal-n">${info.n}</span>` : ""}</button>`
        : `<i class="heat-day cal-day future"><span class="cal-num">${d}</span></i>`);
    }
    return {
      label: `${MONTHS[m]} ${y}`,
      html: `<div class="cal">${DOW.map((x) => `<span class="cal-dow">${x}</span>`).join("")}${cells.join("")}</div>`,
    };
  }

  // ---------- semana: 7 días grandes ----------
  function weekView() {
    const mon = mondayOf(new Date());
    mon.setDate(mon.getDate() - 7 * back);
    const cols = [];
    let last;
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      last = d;
      const key = dayKey(d);
      const info = dayInfo(key);
      const head = `<span class="wk-dow">${WEEKDAYS[d.getDay()].slice(0, 3)}</span><span class="wk-num">${d.getDate()}</span>`;
      cols.push(info
        ? `<button class="heat-day wk-day l${info.lv}${info.today ? " today" : ""}" data-key="${key}" aria-label="${esc(info.label)}">
            ${head}<span class="wk-emo" aria-hidden="true">${doneList(info.h).map((x) => x.emoji).join("")}</span></button>`
        : `<i class="heat-day wk-day future">${head}</i>`);
    }
    const sameMonth = mon.getMonth() === last.getMonth();
    const label = `${mon.getDate()}${sameMonth ? "" : ` ${MONTHS[mon.getMonth()].slice(0, 3)}`} – ${last.getDate()} ${MONTHS[last.getMonth()].slice(0, 3)} ${last.getFullYear()}`;
    return { label, html: `<div class="wk">${cols.join("")}</div>` };
  }

  function paint() {
    $(".streak").textContent = `🔥 ${plural(computeStreak([...byId].map(([id, h]) => ({ id, h })), today, dayKey), "día", "días")}`;
    root.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
    const v = { week: weekView, month: monthView, year: yearView }[view]();
    $(".heat").innerHTML = v.html;
    $(".heat").dataset.view = view;
    $(".prog-label").textContent = v.label;
    $(".prog-next").disabled = back === 0;
  }

  $(".prog-views").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b || b.dataset.view === view) return;
    view = b.dataset.view;
    back = 0;
    try { localStorage.setItem(VIEW_KEY, view); } catch {}
    paint();
  });
  $(".prog-prev").addEventListener("click", () => { back++; paint(); });
  $(".prog-next").addEventListener("click", () => { if (back > 0) { back--; paint(); } });

  // ---------- lo registrado, al pasar el cursor (o con el foco) ----------
  function showTip(cell) {
    const key = cell.dataset.key;
    const h = byId.get(key) || {};
    const n = countDone(h);
    tip.innerHTML = `
      <b>${esc(fmtLong(dateOf(key)))}</b>
      <span>${n ? doneList(h).map((x) => `${x.emoji} ${esc(x.label)}`).join("<br />") : "Sin registro"}</span>`;
    tip.hidden = false;
    const r = cell.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const x = Math.min(innerWidth - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
    const above = r.top - t.height - 8;
    tip.style.left = `${x}px`;
    tip.style.top = `${above > 8 ? above : r.bottom + 8}px`;
  }
  const hideTip = () => (tip.hidden = true);
  const heat = $(".heat");
  heat.addEventListener("pointerover", (e) => {
    const c = e.target.closest("button.heat-day");
    if (c && e.pointerType === "mouse") showTip(c);
  });
  heat.addEventListener("pointerout", (e) => {
    const c = e.target.closest("button.heat-day");
    if (c && !c.contains(e.relatedTarget)) hideTip();
  });
  heat.addEventListener("focusin", (e) => { const c = e.target.closest("button.heat-day"); if (c) showTip(c); });
  heat.addEventListener("focusout", hideTip);
  addEventListener("scroll", hideTip, { passive: true });

  // ---------- tocar un día: ver y corregir ----------
  heat.addEventListener("click", (e) => {
    const c = e.target.closest("button.heat-day");
    if (!c) return;
    hideTip();
    openDay(c.dataset.key);
  });

  function openDay(key) {
    const saved = { ...(byId.get(key) || {}) };
    const draft = { ...saved };
    const sh = openSheet(`
      <div class="day-sheet">
        <h2>${esc(fmtLong(dateOf(key)))}</h2>
        <p class="mono muted day-sheet-count"></p>
        ${habitButtons(draft, "small")}
        <div class="detail-actions"><button class="btn" data-act="save" disabled>Guardar</button></div>
      </div>`);
    const save = sh.el.querySelector('[data-act="save"]');
    const paintSheet = () => {
      sh.el.querySelector(".day-sheet-count").textContent = `${countDone(draft)} de ${HABITS.length} hábitos`;
      save.disabled = sameHabits(saved, draft);
    };
    paintSheet();
    bindHabitButtons(sh.el.querySelector(".habits"), draft, paintSheet);
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        byId.set(key, await saveDay(key, saved, draft));
        paint();
        sh.close();
        toast("Guardado");
        onSaved?.(key);
      } catch (err) {
        save.disabled = false;
        toast("No se pudo guardar");
        console.error(err);
      }
    });
  }

  paint();
  return {
    update(next) { byId = new Map(next.map((d) => [d.id, d.h || {}])); paint(); },
    destroy() { removeEventListener("scroll", hideTip); tip.remove(); },
  };
}

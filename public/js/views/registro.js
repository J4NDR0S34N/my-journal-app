import { HABITS, countDone } from "../habits.js";
import { dayKey, fmtLong } from "../lib/dates.js";
import { get, set } from "../store.js";
import { esc, toast } from "../lib/ui.js";
import { logHabit } from "../lib/activity.js";

export function habitGrid(h, cls = "") {
  return `<div class="habits ${cls}">${HABITS.map((x) => `
    <button class="habit" data-k="${x.key}" aria-pressed="${!!h[x.key]}">
      <span class="habit-emo" aria-hidden="true">${x.emoji}</span>
      <span class="habit-lbl">${esc(x.label)}</span>
      <span class="habit-switch" aria-hidden="true"></span>
    </button>`).join("")}</div>`;
}

// Conecta los toggles de un grid a un día. onChange recibe el h actualizado.
export function bindHabitGrid(el, key, h, onChange) {
  el.addEventListener("click", async (e) => {
    const b = e.target.closest(".habit");
    if (!b) return;
    const k = b.dataset.k;
    const next = Object.fromEntries(HABITS.map((x) => [x.key, !!h[x.key]]));
    next[k] = !next[k];
    b.setAttribute("aria-pressed", next[k]);
    Object.assign(h, next);
    onChange?.(h);
    try {
      await set("days", key, { h: next });
      logHabit(key, k, next[k]);
    } catch (err) {
      h[k] = !next[k];
      b.setAttribute("aria-pressed", h[k]);
      onChange?.(h);
      toast("No se pudo guardar");
      console.error(err);
    }
  });
}

export async function render(root) {
  const key = dayKey();
  const doc = await get("days", key);
  const h = { ...(doc?.h || {}) };

  root.innerHTML = `
    <section class="page registro">
      <header class="page-head">
        <h1>Registro</h1>
        <p class="mono label"><span>${fmtLong()}</span></p>
      </header>
      <div class="reg-progress" aria-hidden="true"><span class="count mono"></span><i><b></b></i></div>
      ${habitGrid(h, "list")}
    </section>`;

  const count = root.querySelector(".count");
  const bar = root.querySelector(".reg-progress b");
  const paint = () => {
    const n = countDone(h);
    count.textContent = `${n} de ${HABITS.length}`;
    bar.style.width = `${(n / HABITS.length) * 100}%`;
  };
  paint();
  bindHabitGrid(root.querySelector(".habits"), key, h, paint);
}

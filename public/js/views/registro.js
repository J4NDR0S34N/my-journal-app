import { HABITS, countDone } from "../habits.js";
import { dayKey, fmtLong } from "../lib/dates.js";
import { get, set } from "../store.js";
import { esc, toast } from "../lib/ui.js";
import { logHabit } from "../lib/activity.js";
import { hapticsOn, haptic } from "../lib/prefs.js";

// Cada hábito es un checkbox real (transparente, cubre toda la fila) con el
// atributo `switch`: en Safari iOS 18+ el toque vibra. El diseño no cambia.
export function habitGrid(h, cls = "") {
  const sw = hapticsOn() ? " switch" : "";
  return `<div class="habits ${cls}">${HABITS.map((x) => `
    <label class="habit${h[x.key] ? " on" : ""}" data-k="${x.key}">
      <input type="checkbox" class="habit-input"${sw}${h[x.key] ? " checked" : ""} />
      <span class="habit-emo" aria-hidden="true">${x.emoji}</span>
      <span class="habit-lbl">${esc(x.label)}</span>
      <span class="habit-switch" aria-hidden="true"></span>
    </label>`).join("")}</div>`;
}

// Conecta los toggles de un grid a un día. onChange recibe el h actualizado.
export function bindHabitGrid(el, key, h, onChange) {
  el.addEventListener("change", async (e) => {
    const input = e.target.closest(".habit-input");
    if (!input) return;
    haptic();
    const b = input.closest(".habit");
    const k = b.dataset.k;
    const next = Object.fromEntries(HABITS.map((x) => [x.key, !!h[x.key]]));
    next[k] = input.checked;
    b.classList.toggle("on", next[k]);
    Object.assign(h, next);
    onChange?.(h);
    try {
      await set("days", key, { h: next });
      logHabit(key, k, next[k]);
    } catch (err) {
      h[k] = !next[k];
      input.checked = h[k];
      b.classList.toggle("on", h[k]);
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
        <h1>Hoy</h1>
        <p class="mono label"><span>${fmtLong()}</span> · Marcá lo que hiciste hoy</p>
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

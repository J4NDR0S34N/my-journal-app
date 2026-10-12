// Página de un módulo propio (#/m/{id}). Plantilla "En blanco": un espacio
// de texto libre que se guarda solo mientras escribís.

import { list } from "../store.js";
import { esc, debounce, toast } from "../lib/ui.js";
import { updateModule, onModules, moduleById } from "../lib/modules.js";
import { openModuleSheet } from "../lib/moduleSheet.js";

export async function render(root, id) {
  // leída con seguimiento: si cambia en otro dispositivo, la página se redibuja
  const mod = (await list("modules")).find((m) => m.id === id);
  if (!mod) {
    root.innerHTML = `
      <section class="page module">
        <header class="page-head"><h1>Módulo</h1></header>
        <p class="muted">Este módulo no existe o fue borrado. <a href="#/inicio">Volver a Inicio</a></p>
      </section>`;
    return;
  }

  root.innerHTML = `
    <section class="page module">
      <header class="page-head module-head">
        <h1>${esc(mod.name)}</h1>
        <button class="btn btn-ghost btn-sm" data-act="edit">Editar</button>
      </header>
      <textarea class="module-text" placeholder="Escribí lo que quieras…" aria-label="Contenido de ${esc(mod.name)}">${esc(mod.text || "")}</textarea>
      <p class="mono muted module-state" aria-live="polite"></p>
    </section>`;

  const ta = root.querySelector(".module-text");
  const state = root.querySelector(".module-state");
  const grow = () => { ta.style.height = "auto"; ta.style.height = `${Math.max(ta.scrollHeight, innerHeight * 0.4)}px`; };
  grow();

  // Guardado automático: mientras haya cambios pendientes la página queda
  // marcada (data-dirty) para que un cambio remoto no la redibuje encima.
  const save = debounce(async () => {
    try {
      await updateModule(id, { text: ta.value }, { quiet: true });
      delete ta.dataset.dirty;
      state.textContent = "guardado";
    } catch (e) {
      state.textContent = "";
      toast("No se pudo guardar");
      console.error(e);
    }
  }, 700);
  ta.addEventListener("input", () => {
    ta.dataset.dirty = "1";
    state.textContent = "guardando…";
    grow();
    save();
  });

  root.querySelector('[data-act="edit"]').addEventListener("click", () => openModuleSheet(moduleById(id) || mod));
  // nombre cambiado desde Editar
  const off = onModules(() => {
    const m = moduleById(id);
    if (m) root.querySelector(".module-head h1").textContent = m.name;
  });
  return off;
}

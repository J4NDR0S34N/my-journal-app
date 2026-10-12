// Hoja para crear un módulo (burbuja +) o editarlo (desde su página):
// nombre, ícono y plantilla. Al editar, también se puede borrar.

import { esc, openSheet, toast, confirmTap } from "./ui.js";
import { ICONS, iconSvg, TEMPLATES, createModule, updateModule, removeModule } from "./modules.js";

// mod: el módulo a editar (o nada para crear uno nuevo).
export function openModuleSheet(mod = null) {
  const icon0 = mod?.icon || "libro";
  const tpl0 = mod?.template || "blank";
  const sh = openSheet(`
    <form class="form module-form">
      <h2>${mod ? "Editar módulo" : "Nuevo módulo"}</h2>
      <label class="mono label">Nombre
        <input name="name" type="text" required maxlength="40" autocomplete="off" value="${esc(mod?.name || "")}" />
      </label>
      <div class="pick-group">
        <p class="mono label">Ícono</p>
        <div class="icon-pick" role="radiogroup" aria-label="Ícono">
          ${Object.entries(ICONS).map(([k, [l]]) => `
            <button type="button" class="icon-opt" role="radio" data-icon="${k}" aria-checked="${k === icon0}" aria-label="${l}" title="${l}">${iconSvg(k)}</button>`).join("")}
        </div>
      </div>
      <div class="pick-group">
        <p class="mono label">Plantilla</p>
        <div class="tpl-pick" role="radiogroup" aria-label="Plantilla">
          ${TEMPLATES.map(([k, l, d, ready]) => `
            <button type="button" class="tpl-opt" role="radio" data-tpl="${k}" aria-checked="${k === tpl0}" ${ready ? "" : "disabled"}>
              <span class="tpl-name">${l}</span>
              <span class="tpl-desc mono">${ready ? d : "próximamente"}</span>
            </button>`).join("")}
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn" type="submit">${mod ? "Guardar" : "Crear"}</button>
        <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
      </div>
      ${mod ? `<div class="detail-actions"><button class="btn btn-ghost" type="button" data-act="del">Borrar módulo</button></div>` : ""}
    </form>`);
  const f = sh.el.querySelector("form");
  if (!mod) f.name.focus();
  const picked = (attr) => sh.el.querySelector(`[data-${attr}][aria-checked="true"]`)?.dataset[attr];

  sh.el.addEventListener("click", (e) => {
    const opt = e.target.closest("[data-icon], [data-tpl]");
    if (opt && !opt.disabled) {
      const attr = opt.dataset.icon ? "icon" : "tpl";
      sh.el.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute("aria-checked", b === opt));
      return;
    }
    const del = e.target.closest('[data-act="del"]');
    if (del) {
      confirmTap(del, async () => {
        try {
          await removeModule(mod.id);
          sh.close();
          if (location.hash.startsWith(`#/m/${mod.id}`)) location.hash = "#/inicio";
        } catch (err) {
          toast("No se pudo borrar");
          console.error(err);
        }
      }, "¿borrar? se pierde su contenido");
    }
  });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    if (!name) return;
    const data = { name, icon: picked("icon") || "libro", template: picked("tpl") || "blank" };
    try {
      if (mod) await updateModule(mod.id, data);
      else location.hash = `#/m/${await createModule(data)}`;
      sh.close();
    } catch (err) {
      toast(mod ? "No se pudo guardar" : "No se pudo crear");
      console.error(err);
    }
  });
}

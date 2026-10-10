// Hoja "Portada": cambiar la imagen de un juego o disco pegando un link o
// subiendo una imagen. La usan Colección (página del juego) y Música.

import { compressCover } from "./image.js";
import { imageLoads } from "./apis.js";
import { esc, openSheet } from "./ui.js";

/**
 * @param {object} o
 * @param {string} o.current  imagen actual (para la vista previa)
 * @param {string} [o.ratio]  proporción de la vista previa ("2 / 3", "1 / 1"…)
 * @param {(url: string) => Promise<void>} o.save  guarda la nueva portada ("" = volver a la original)
 * @param {{label: string, busy: string, find: () => Promise<string>, none: string}} [o.extra]
 *        botón extra que busca una portada automáticamente (ej. Steam)
 * @param {boolean} [o.canReset]  muestra "Volver a la original"
 */
export function openCoverSheet({ current, ratio = "2 / 3", save, extra, canReset = false }) {
  const sh = openSheet(`
    <div class="cover-sheet">
      <h2>Portada</h2>
      <div class="cover-preview" style="aspect-ratio:${ratio}"><img src="${esc(current)}" alt="" /></div>
      <form class="form cover-url">
        <label class="mono label">Link de una imagen
          <input name="url" type="text" inputmode="url" autocomplete="off" placeholder="https://…" />
        </label>
        <button class="btn" type="submit">Usar este link</button>
      </form>
      <div class="detail-actions">
        <label class="btn btn-ghost">Subir imagen<input type="file" accept="image/*" hidden class="cover-file" /></label>
        ${extra ? `<button class="btn btn-ghost" data-act="extra">${esc(extra.label)}</button>` : ""}
        ${canReset ? `<button class="btn btn-ghost" data-act="reset">Volver a la original</button>` : ""}
        <button class="btn btn-ghost" data-close>Cancelar</button>
      </div>
      <p class="mono muted cover-msg"></p>
    </div>`);
  const msg = (t) => (sh.el.querySelector(".cover-msg").textContent = t);

  async function apply(url, fail = "No se pudo guardar la portada.") {
    try {
      await save(url);
      sh.close();
    } catch (err) {
      msg(fail);
      console.error(err);
    }
  }

  sh.el.querySelector(".cover-url").addEventListener("submit", async (e) => {
    e.preventDefault();
    let url = e.target.url.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    msg("comprobando la imagen…");
    if (await imageLoads(url)) apply(url);
    else msg("No se pudo cargar esa imagen. Probá con el link directo a la imagen (clic derecho → copiar dirección de imagen).");
  });
  sh.el.querySelector(".cover-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    msg("comprimiendo…");
    try { apply(await compressCover(f), "No se pudo guardar la imagen."); }
    catch (err) { msg("No se pudo leer la imagen."); console.error(err); }
  });
  sh.el.querySelector('[data-act="extra"]')?.addEventListener("click", async () => {
    msg(extra.busy);
    const url = await extra.find();
    if (url) apply(url);
    else msg(extra.none);
  });
  sh.el.querySelector('[data-act="reset"]')?.addEventListener("click", () => apply(""));
}

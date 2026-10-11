import { list, add, update, remove } from "../store.js";
import { esc, toast, confirmTap } from "../lib/ui.js";
import { fmtStamp } from "../lib/dates.js";
import { logActivity } from "../lib/activity.js";
import { shortcut } from "../lib/device.js";

// Título derivado: primeras palabras de la primera línea.
export function noteTitle(text, words = 7) {
  const line = text.trim().split("\n").find((l) => l.trim()) || "";
  const w = line.trim().split(/\s+/);
  const t = w.slice(0, words).join(" ");
  return w.length > words || text.trim().includes("\n") ? `${t.replace(/[.,;:]$/, "")}…` : t;
}

const autoGrow = (ta) => {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, innerHeight * 0.45) + "px";
};

export async function render(root) {
  let notes = [];
  const open = new Set();
  let editing = null;

  root.innerHTML = `
    <section class="page notes">
      <ol class="note-list"></ol>
      <form class="composer">
        <textarea rows="1" placeholder="Escribí una nota…" aria-label="Nueva nota"></textarea>
        <div class="composer-bar">
          <span class="mono muted hint">${shortcut("Enter") ? `${shortcut("Enter")} para guardar` : ""}</span>
          <button class="btn btn-sm" type="submit" disabled>Guardar</button>
        </div>
      </form>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const listEl = $(".note-list"), form = $(".composer"), ta = form.querySelector("textarea");
  const saveBtn = form.querySelector("button");

  function paint() {
    const arr = [...notes].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    root.querySelector(".notes").classList.toggle("is-empty", !arr.length);
    listEl.innerHTML = arr.map((n) => {
      const isOpen = open.has(n.id);
      const isEdit = editing === n.id;
      return `
        <li class="note${isOpen ? " open" : ""}" data-id="${n.id}">
          <button class="note-head" aria-expanded="${isOpen}">
            <span class="note-title">${esc(noteTitle(n.text))}</span>
            <span class="note-date mono">${fmtStamp(n.createdAt).split(" · ")[0]}</span>
          </button>
          ${isOpen ? `
          <div class="note-body">
            ${isEdit
              ? `<textarea class="note-edit">${esc(n.text)}</textarea>`
              : `<p class="note-text">${esc(n.text)}</p>`}
            <div class="note-actions mono">
              <span class="muted">${fmtStamp(n.createdAt)}</span>
              ${isEdit
                ? `<button data-act="save">guardar</button><button data-act="cancel">cancelar</button>`
                : `<button data-act="edit">editar</button><button data-act="del">borrar</button>`}
            </div>
          </div>` : ""}
        </li>`;
    }).join("");
    const ed = listEl.querySelector(".note-edit");
    if (ed) { autoGrow(ed); ed.addEventListener("input", () => autoGrow(ed)); ed.focus(); }
  }

  async function save() {
    const text = ta.value.trim();
    if (!text) return;
    saveBtn.disabled = true;
    try {
      const doc = { text, createdAt: new Date().toISOString() };
      const id = await add("notes", doc);
      notes.push({ id, ...doc });
      logActivity("notes", `Escribiste una nota: “${noteTitle(text)}”`);
      ta.value = "";
      autoGrow(ta);
      paint();
      listEl.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (err) {
      toast("No se pudo guardar");
      console.error(err);
    } finally {
      saveBtn.disabled = !ta.value.trim();
    }
  }

  ta.addEventListener("input", () => { autoGrow(ta); saveBtn.disabled = !ta.value.trim(); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });

  listEl.addEventListener("click", async (e) => {
    const li = e.target.closest(".note");
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest(".note-head")) {
      if (open.has(id)) { open.delete(id); if (editing === id) editing = null; }
      else open.add(id);
      paint();
      return;
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "edit") { editing = id; paint(); }
    else if (act === "cancel") { editing = null; paint(); }
    else if (act === "save") {
      const text = li.querySelector(".note-edit").value.trim();
      if (!text) return;
      try {
        await update("notes", id, { text });
        notes.find((n) => n.id === id).text = text;
        logActivity("notes", `Editaste la nota “${noteTitle(text)}”`);
        editing = null;
        paint();
      } catch (err) {
        toast("No se pudo guardar");
        console.error(err);
      }
    } else if (act === "del") {
      confirmTap(e.target.closest("button"), async () => {
        try {
          await remove("notes", id);
          const gone = notes.find((n) => n.id === id);
          if (gone) logActivity("notes", `Borraste la nota “${noteTitle(gone.text)}”`);
          notes = notes.filter((n) => n.id !== id);
          open.delete(id);
          paint();
        } catch (err) {
          toast("No se pudo borrar");
          console.error(err);
        }
      });
    }
  });

  notes = await list("notes");
  paint();
}

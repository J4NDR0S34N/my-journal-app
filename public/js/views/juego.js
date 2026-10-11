// Página de un juego: portada, datos, acciones y galería de capturas.
// Capturas: la miniatura vive en games/{id}/shots/{shotId}.imageUrl y la
// versión completa en games/{id}/shotsFull/{shotId}.data (igual que Miscelánea).

import { get, list, add, set, update, remove } from "../store.js";
import { compressImage } from "../lib/image.js";
import { rawgImg, steamBox, findSlug } from "../lib/apis.js";
import { openCoverSheet } from "../lib/coverSheet.js";
import { esc, toast, confirmTap, plural, CLOSE_ICON } from "../lib/ui.js";
import { fmtShort, fmtStamp } from "../lib/dates.js";
import { logActivity } from "../lib/activity.js";
import { shortcut } from "../lib/device.js";

const TABS = { owned: "Colección", wishlist: "Wishlist" };
const LIST = "#/coleccion/videojuegos";
const shotsCol = (id) => `games/${id}/shots`;
const fullCol = (id) => `games/${id}/shotsFull`;

// Vuelve al listado: si venimos de ahí usamos el historial (así el gesto
// "atrás" del teléfono queda coherente), si no, navegamos directo.
let fromList = false;
function backToList() {
  if (fromList) history.back();
  else location.hash = LIST;
}

// Borra un juego junto con todas sus capturas.
export async function deleteGame(id) {
  const shots = await list(shotsCol(id));
  await Promise.all(shots.flatMap((s) => [remove(shotsCol(id), s.id), remove(fullCol(id), s.id)]));
  await remove("games", id);
}

// colName: nombre actual de la colección de juegos (para el enlace de vuelta).
export async function render(root, id, colName = "Videojuegos") {
  fromList = sessionStorage.getItem("mj:fromList") === "1";
  sessionStorage.removeItem("mj:fromList");
  const game = (await list("games")).find((g) => g.id === id);
  if (!game) {
    root.innerHTML = `
      <section class="page game">
        <a class="back mono" href="${LIST}">‹ ${esc(colName)}</a>
        <p class="empty mono muted">Este juego ya no está en tu colección.</p>
      </section>`;
    return;
  }
  document.title = `${game.title} — My Journal`;
  let shots = [];

  const meta = () => [game.releaseDate ? fmtShort(game.releaseDate) : "", game.platform, game.genre].filter(Boolean).join(" · ");
  const other = () => (game.status === "owned" ? "wishlist" : "owned");

  root.innerHTML = `
    <section class="page game">
      <button class="back mono">‹ ${esc(colName)}</button>
      <header class="game-hero">
        <div class="game-cover">
          <img src="${esc(rawgImg(game.coverUrl, 1280))}" alt="" />
          <span class="tile-fallback">${esc(game.title)}</span>
        </div>
        <div class="game-info">
          <p class="label game-status"></p>
          <h1>${esc(game.title)}</h1>
          <p class="mono game-meta">${esc(meta())}</p>
          <div class="game-actions">
            <label class="btn">+ Capturas<input type="file" accept="image/*" multiple hidden class="file-in" /></label>
            <button class="btn btn-ghost" data-act="move"></button>
            <button class="btn btn-ghost" data-act="cover">Cambiar portada</button>
            <button class="btn btn-ghost" data-act="del">Borrar juego</button>
          </div>
        </div>
      </header>
      <section class="shots">
        <h2 class="shots-head">Capturas <span class="mono muted shots-count"></span></h2>
        ${shortcut("V") ? `<p class="mono muted hint-paste">también podés pegar una imagen con ${shortcut("V")}</p>` : ""}
        <div class="shots-grid"></div>
      </section>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const grid = $(".shots-grid");
  $(".game-cover img").addEventListener("error", () => $(".game-cover").classList.add("noimg"), { once: true });

  function paintHeader() {
    $(".game-status").textContent = TABS[game.status] || "";
    $('[data-act="move"]').textContent = `Mover a ${TABS[other()]}`;
  }

  function paintShots() {
    $(".shots-count").textContent = shots.length ? plural(shots.length, "captura", "capturas") : "";
    if (!shots.length) {
      grid.innerHTML = `<p class="empty mono muted">Todavía no hay capturas de este juego. Subí la primera con “+ Capturas”.</p>`;
      return;
    }
    grid.innerHTML = shots.map((s, i) => `
      <button class="shot" data-i="${i}" aria-label="Ver captura ${i + 1}">
        <img src="${esc(s.imageUrl)}" alt="" loading="lazy" style="aspect-ratio:${s.ratio || "auto"}" />
      </button>`).join("");
  }

  const sortShots = (arr = shots) => arr.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  // ---------- subir capturas ----------
  let uploading = false;
  async function addShots(files) {
    files = files.filter((f) => f.type.startsWith("image/"));
    if (!files.length || uploading) return;
    uploading = true;
    let ok = 0;
    for (const [i, f] of files.entries()) {
      toast(files.length > 1 ? `Subiendo ${i + 1} de ${files.length}…` : "Subiendo captura…");
      try {
        const { full, thumb, ratio } = await compressImage(f);
        const doc = { imageUrl: thumb, ratio: +ratio.toFixed(4), createdAt: new Date().toISOString() };
        const sid = await add(shotsCol(id), doc);
        await set(fullCol(id), sid, { data: full }, { merge: false });
        shots.push({ id: sid, ...doc });
        sortShots();
        paintShots();
        ok++;
      } catch (err) {
        toast(err.message || "No se pudo subir la captura");
        console.error(err);
      }
    }
    uploading = false;
    if (ok) {
      toast(ok === 1 ? "Captura guardada" : `${ok} capturas guardadas`);
      logActivity("games", `Agregaste ${plural(ok, "captura", "capturas")} a ${game.title}`, { img: rawgImg(game.coverUrl, 200) });
    }
  }

  $(".file-in").addEventListener("change", (e) => { addShots([...e.target.files]); e.target.value = ""; });
  const onPaste = (e) => {
    if (e.target.closest("input, textarea")) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); addShots(files); }
  };
  document.addEventListener("paste", onPaste);

  // ---------- acciones del juego ----------
  $(".back").addEventListener("click", backToList);
  root.querySelector(".game-actions").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "move") {
      const to = other();
      try {
        await update("games", id, { status: to });
        game.status = to;
        paintHeader();
        toast(`Movido a ${TABS[to]}`);
        logActivity("games", `Moviste ${game.title} a ${TABS[to]}`, { img: rawgImg(game.coverUrl, 200) });
      } catch (err) {
        toast("No se pudo mover");
        console.error(err);
      }
    } else if (btn.dataset.act === "cover") {
      changeCover();
    } else if (btn.dataset.act === "del") {
      const n = shots.length;
      confirmTap(btn, async () => {
        try {
          await deleteGame(id);
          logActivity("games", `Borraste ${game.title} de ${TABS[game.status]}`);
          toast(n ? `Juego y ${plural(n, "captura", "capturas")} borrados` : "Juego borrado");
          location.replace(LIST);
        } catch (err) {
          toast("No se pudo borrar");
          console.error(err);
        }
      }, n ? `¿borrar con ${n} ${n === 1 ? "captura" : "capturas"}?` : "¿seguro?");
    }
  });

  // ---------- cambiar portada (la carátula vertical de la tarjeta) ----------
  function changeCover() {
    openCoverSheet({
      current: game.boxUrl || rawgImg(game.coverUrl, 640),
      ratio: "2 / 3",
      save: async (url) => {
        await update("games", id, { boxUrl: url, boxChecked: true });
        game.boxUrl = url;
        toast("Portada actualizada");
        logActivity("games", `Cambiaste la portada de ${game.title}`, { img: url.startsWith("data:") ? "" : url });
      },
      extra: {
        label: "Buscar en Steam",
        busy: "buscando en Steam…",
        find: async () => steamBox(game.slug || (await findSlug(game.title))),
        none: "Este juego no tiene carátula en Steam. Pegá un link o subí una imagen.",
      },
    });
  }

  // ---------- visor de capturas ----------
  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".shot");
    if (b) openViewer(+b.dataset.i);
  });

  function openViewer(start) {
    let i = start;
    const lb = document.createElement("div");
    lb.className = "lightbox viewer";
    lb.innerHTML = `
      <button class="lb-close" aria-label="Cerrar">${CLOSE_ICON}</button>
      <div class="lb-stage"><img alt="" /></div>
      <div class="lb-bar mono">
        <button class="lb-prev" aria-label="Anterior">‹</button>
        <span class="lb-info"></span>
        <button class="lb-next" aria-label="Siguiente">›</button>
        <button class="lb-del">borrar</button>
      </div>`;
    document.body.append(lb);
    const img = lb.querySelector("img");
    let loadSeq = 0;

    async function show() {
      const s = shots[i];
      const my = ++loadSeq;
      img.src = s.imageUrl; // miniatura al instante, la completa después
      lb.querySelector(".lb-info").textContent = `${i + 1} / ${shots.length} · ${fmtStamp(s.createdAt)}`;
      lb.querySelector(".lb-prev").disabled = i === 0;
      lb.querySelector(".lb-next").disabled = i === shots.length - 1;
      const full = await get(fullCol(id), s.id).catch(() => null);
      if (full?.data && my === loadSeq && lb.isConnected) img.src = full.data;
    }
    const go = (d) => { const n = i + d; if (n >= 0 && n < shots.length) { i = n; show(); } };
    const close = () => { lb.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };

    lb.addEventListener("click", (e) => {
      if (e.target === lb || e.target.classList.contains("lb-stage") || e.target.closest(".lb-close")) return close();
      if (e.target.closest(".lb-prev")) return go(-1);
      if (e.target.closest(".lb-next")) return go(1);
      const del = e.target.closest(".lb-del");
      if (del) {
        confirmTap(del, async () => {
          const s = shots[i];
          try {
            await remove(shotsCol(id), s.id);
            await remove(fullCol(id), s.id);
            shots.splice(i, 1);
            paintShots();
            logActivity("games", `Borraste una captura de ${game.title}`);
            if (!shots.length) return close();
            i = Math.min(i, shots.length - 1);
            show();
          } catch (err) {
            toast("No se pudo borrar");
            console.error(err);
          }
        });
      }
    });

    // deslizar para cambiar de captura en el teléfono
    let x0 = null;
    lb.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });
    document.addEventListener("keydown", onKey);
    show();
  }

  paintHeader();
  shots = sortShots([...(await list(shotsCol(id)))]);
  paintShots();

  return () => document.removeEventListener("paste", onPaste);
}

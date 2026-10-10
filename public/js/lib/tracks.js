// Canciones de un disco (Música): lista con fragmentos de 15 s y ♥ favoritas.
// Fuente: Deezer (ver deezer.js). Si el disco no está en Deezer, se muestra la
// lista de MusicBrainz sin audio.
// Datos en music/{id}: deezerId (álbum encontrado) y liked: [ids de canciones].

import { update } from "../store.js";
import { mbTracks } from "./apis.js";
import { deezer, findAlbum } from "./deezer.js";
import { esc, toast } from "./ui.js";

const PREVIEW_SECONDS = 15;

async function deezerTracks(albumId) {
  const r = await deezer(`/album/${albumId}/tracks`, { limit: 100 });
  return (r.data || []).map((t) => ({ id: String(t.id), title: t.title, duration: t.duration, preview: t.preview || "" }));
}

// Carga las canciones del disco `x` (cachea el álbum de Deezer en el documento).
async function loadTracks(x, col) {
  try {
    let id = x.deezerId;
    if (!id) {
      id = (await findAlbum(x.artist, x.title))?.id;
      if (id) { x.deezerId = id; update(col, x.id, { deezerId: id }).catch(() => {}); }
    }
    if (id) {
      const tracks = await deezerTracks(id);
      if (tracks.length) return { tracks, source: "deezer" };
    }
  } catch (err) {
    console.warn("Deezer", err);
  }
  const rg = (x.coverUrl || "").match(/release-group\/([0-9a-f-]{36})/)?.[1];
  if (rg) {
    try { return { tracks: await mbTracks(rg), source: "musicbrainz" }; } catch (err) { console.warn("MusicBrainz", err); }
  }
  return { tracks: [], source: "none" };
}

const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");
const ICON_PLAY = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z" fill="currentColor"/></svg>`;
const ICON_HEART = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.2 6.9 13.2C3 9.7.5 7.4.5 4.6.5 2.3 2.3.6 4.5.6c1.3 0 2.5.6 3.5 1.6C9 1.2 10.2.6 11.5.6c2.2 0 4 1.7 4 4 0 2.8-2.5 5.1-6.4 8.6z"/></svg>`;

/**
 * Agrega la lista de canciones a la ficha de un disco.
 * @param {object} x      documento del disco (se modifica: liked, deezerId)
 * @param {object} sheet  { el, onClose } de openSheet
 * @param {string} col    colección ("music")
 * @param {() => void} onLikesChange  repinta el grid (contador de ♥)
 */
export function mountTracks(x, sheet, col, onLikesChange) {
  const host = document.createElement("section");
  host.className = "tracks";
  host.innerHTML = `<h3 class="tracks-head">Canciones <span class="mono muted tracks-meta"></span></h3>
    <ol class="track-list"><li class="tracks-msg mono muted">cargando canciones…</li></ol>`;
  sheet.el.querySelector(".detail-body").append(host);
  const listEl = host.querySelector(".track-list");
  const liked = new Set(x.liked || []);

  const audio = new Audio();
  audio.preload = "none";
  let playing = null; // id de la canción que suena
  const rowOf = (id) => listEl.querySelector(`.track[data-id="${CSS.escape(id)}"]`);

  function stop() {
    audio.pause();
    if (playing) {
      const row = rowOf(playing);
      if (row) {
        row.classList.remove("playing");
        row.querySelector(".t-play").innerHTML = ICON_PLAY;
        row.style.setProperty("--p", 0);
      }
    }
    playing = null;
  }
  audio.addEventListener("timeupdate", () => {
    if (!playing) return;
    const p = Math.min(1, audio.currentTime / PREVIEW_SECONDS);
    rowOf(playing)?.style.setProperty("--p", p);
    if (audio.currentTime >= PREVIEW_SECONDS) stop(); // solo 15 segundos
  });
  audio.addEventListener("ended", stop);
  sheet.onClose(stop);

  loadTracks(x, col).then(({ tracks, source }) => {
    if (!listEl.isConnected) return;
    if (!tracks.length) {
      listEl.innerHTML = `<li class="tracks-msg mono muted">No se encontraron las canciones de este disco.</li>`;
      return;
    }
    host.querySelector(".tracks-meta").textContent =
      source === "deezer" ? `${tracks.length} · fragmentos de ${PREVIEW_SECONDS} s` : `${tracks.length} · sin audio disponible`;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    listEl.innerHTML = tracks.map((t, i) => `
      <li class="track" data-id="${esc(t.id)}">
        <button class="t-play" aria-label="Escuchar ${esc(t.title)}"${t.preview ? "" : " disabled"}>${ICON_PLAY}</button>
        <span class="t-num mono">${i + 1}</span>
        <span class="t-title">${esc(t.title)}</span>
        <span class="t-dur mono">${fmtDur(t.duration)}</span>
        <button class="t-like" aria-label="Me gusta" aria-pressed="${liked.has(t.id)}">${ICON_HEART}</button>
        <i class="t-progress" aria-hidden="true"></i>
      </li>`).join("");

    listEl.addEventListener("click", async (e) => {
      const row = e.target.closest(".track");
      if (!row) return;
      const id = row.dataset.id;

      if (e.target.closest(".t-play")) {
        if (playing === id) return stop();
        stop();
        const t = byId.get(id);
        audio.src = t.preview;
        playing = id;
        row.classList.add("playing");
        row.querySelector(".t-play").innerHTML = ICON_PAUSE;
        audio.play().catch(() => { stop(); toast("No se pudo reproducir el fragmento"); });
      } else if (e.target.closest(".t-like")) {
        const btn = row.querySelector(".t-like");
        const on = !liked.has(id);
        on ? liked.add(id) : liked.delete(id);
        btn.setAttribute("aria-pressed", on);
        const arr = [...liked];
        try {
          await update(col, x.id, { liked: arr });
          x.liked = arr;
          onLikesChange();
        } catch (err) {
          on ? liked.delete(id) : liked.add(id);
          btn.setAttribute("aria-pressed", !on);
          toast("No se pudo guardar");
          console.error(err);
        }
      }
    });
  });
}

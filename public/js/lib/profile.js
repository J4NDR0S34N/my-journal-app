// Burbuja del perfil (arriba a la derecha) y su panel: nombre, correo y foto
// de la cuenta de Google, ajustes del dispositivo, cambiar de cuenta y
// cerrar sesión. Nombre, correo y foto se recuerdan en este dispositivo para que el saludo
// salga con nombre desde el primer cuadro; se borran al cerrar sesión.

import { esc, openSheet } from "./ui.js";
import { hapticsOn, setHaptics, MOTIONS, motion, setMotion, THEMES, themePref, setThemePref } from "./prefs.js";

const KEY = "mj:profile";
let profile = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } })();
const listeners = new Set();
let bubble = null, opts = {};

export const fullName = () => (profile?.name || "").trim();
export const firstName = () => fullName().split(/\s+/)[0] || "";
const email = () => profile?.email || "";

// Avisa cuando llega o cambia el perfil (ej. el saludo de Inicio). Devuelve la baja.
export function onProfile(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// user: el usuario de Firebase (o null al salir).
export function setProfile(user) {
  profile = user ? { name: user.displayName || "", email: user.email || "", photo: user.photoURL || "" } : null;
  try { profile?.name ? localStorage.setItem(KEY, JSON.stringify(profile)) : localStorage.removeItem(KEY); } catch {}
  paintBubble();
  listeners.forEach((fn) => fn(profile));
}

const PERSON = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="9" r="3.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 19.5c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

// Foto de Google (sin referrer: si no, a veces responde 403) o la inicial.
function avatarHtml() {
  const initial = firstName().charAt(0).toUpperCase();
  const fallback = initial ? `<span class="avatar-initial">${esc(initial)}</span>` : PERSON;
  return profile?.photo
    ? `<img src="${esc(profile.photo)}" alt="" referrerpolicy="no-referrer" />`
    : fallback;
}
function bindAvatarFallback(el) {
  el.querySelector("img")?.addEventListener("error", (e) => {
    const initial = firstName().charAt(0).toUpperCase();
    e.target.outerHTML = initial ? `<span class="avatar-initial">${esc(initial)}</span>` : PERSON;
  }, { once: true });
}

function paintBubble() {
  if (!bubble) return;
  bubble.innerHTML = avatarHtml();
  bubble.setAttribute("aria-label", fullName() ? `Perfil y ajustes de ${fullName()}` : "Perfil y ajustes");
  bindAvatarFallback(bubble);
}

// opts: { isLocal, signOut, switchAccount, parent }
export function mountProfile(o) {
  opts = o;
  bubble = document.createElement("button");
  bubble.className = "profile-bubble avatar";
  bubble.addEventListener("click", openPanel);
  (o.parent || document.body).append(bubble);
  paintBubble();
}

const chips = (name, items, cur) => `
  <div class="chips" role="radiogroup" aria-label="${name}">
    ${items.map(([k, l]) => `<button class="chip mono" role="radio" data-${name === "Tema" ? "theme" : "motion"}="${k}" aria-checked="${k === cur}">${l}</button>`).join("")}
  </div>`;

function openPanel() {
  const name = opts.isLocal ? "Modo local" : fullName() || "Tu cuenta";
  const sh = openSheet(`
    <div class="profile">
      <header class="profile-head">
        <span class="avatar avatar-lg">${avatarHtml()}</span>
        <div class="profile-id">
          <h2 class="profile-name">${esc(name)}</h2>
          ${email() && !opts.isLocal ? `<p class="mono muted profile-email">${esc(email())}</p>` : ""}
          ${opts.isLocal ? "" : `<button class="profile-switch mono" data-act="switch">Cambiar de cuenta</button>`}
        </div>
      </header>
      <h3 class="label profile-section">Ajustes</h3>
      <div class="setting">
        <div>
          <p class="setting-name">Vibración háptica</p>
          <p class="mono muted setting-hint">Vibración breve al marcar un hábito.</p>
        </div>
        <button class="toggle" role="switch" data-set="haptics" aria-checked="${hapticsOn()}" aria-label="Vibración háptica"></button>
      </div>
      <div class="setting setting-col">
        <div>
          <p class="setting-name">Movimiento</p>
          <p class="mono muted setting-hint">Quieto deja todo estático, también la ilustración de puntos.</p>
        </div>
        ${chips("Movimiento", MOTIONS, motion())}
      </div>
      <div class="setting setting-col">
        <div>
          <p class="setting-name">Tema</p>
          <p class="mono muted setting-hint">Automático: claro de día (8 a 20) y oscuro de noche.</p>
        </div>
        ${chips("Tema", THEMES, themePref())}
      </div>
      ${opts.isLocal ? "" : `<div class="detail-actions"><button class="btn btn-ghost" data-act="out">Cerrar sesión</button></div>`}
    </div>`);
  bindAvatarFallback(sh.el.querySelector(".avatar-lg"));
  sh.el.addEventListener("click", async (e) => {
    const pick = (attr, set) => {
      const b = e.target.closest(`[data-${attr}]`);
      if (!b || !sh.el.contains(b)) return false;
      set(b.dataset[attr]);
      sh.el.querySelectorAll(`[data-${attr}]`).forEach((x) => x.setAttribute("aria-checked", x === b));
      return true;
    };
    if (pick("theme", setThemePref) || pick("motion", setMotion)) return;
    const t = e.target.closest('[data-set="haptics"]');
    if (t) {
      const on = t.getAttribute("aria-checked") !== "true";
      setHaptics(on);
      t.setAttribute("aria-checked", on);
      return;
    }
    if (e.target.closest('[data-act="out"]')) {
      sh.close();
      await opts.signOut();
    } else if (e.target.closest('[data-act="switch"]')) {
      sh.close();
      await opts.switchAccount();
    }
  });
}

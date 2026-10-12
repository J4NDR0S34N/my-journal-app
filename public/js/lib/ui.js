const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let toastEl, toastT;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast mono";
    toastEl.setAttribute("role", "status");
    document.body.append(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

// Primer toque arma el botón ("¿seguro?"), el segundo confirma.
export function confirmTap(btn, onConfirm, armedText = "¿seguro?") {
  if (btn.dataset.armed) {
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.label;
    onConfirm();
    return;
  }
  btn.dataset.label = btn.textContent;
  btn.dataset.armed = "1";
  btn.textContent = armedText;
  setTimeout(() => {
    if (btn.dataset.armed) {
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.label;
    }
  }, 3000);
}

// Mientras haya una hoja abierta, la página de atrás queda fija (en iPhone
// overflow:hidden no alcanza, por eso se fija el body en su posición actual).
let locks = 0, lockedY = 0;
function lockScroll() {
  if (locks++) return;
  lockedY = scrollY;
  Object.assign(document.body.style, { position: "fixed", top: `-${lockedY}px`, left: "0", right: "0" });
}
function unlockScroll() {
  if (--locks) return;
  Object.assign(document.body.style, { position: "", top: "", left: "", right: "" });
  scrollTo(0, lockedY);
}

// Ícono ✕ de cerrar (hojas y visor de capturas).
export const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

// Hoja inferior (móvil) / modal centrado (escritorio), de vidrio esmerilado.
// El ✕ queda fijo arriba a la derecha aunque el contenido se desplace.
export function openSheet(html) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <button class="sheet-x" data-close aria-label="Cerrar">${CLOSE_ICON}</button>
      <div class="sheet-body">${html}</div>
    </div>`;
  document.body.append(wrap);
  lockScroll();
  requestAnimationFrame(() => wrap.classList.add("in"));
  const onKey = (e) => e.key === "Escape" && close();
  const closers = [];
  function close() {
    if (!wrap.isConnected || wrap.dataset.closing) return;
    wrap.dataset.closing = "1";
    closers.forEach((fn) => fn());
    document.removeEventListener("keydown", onKey);
    wrap.classList.remove("in");
    unlockScroll();
    setTimeout(() => wrap.remove(), 220);
  }
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  // onClose(fn): se ejecuta al cerrar la hoja (por botón, fondo o Escape).
  return { el: wrap.querySelector(".sheet"), close, onClose: (fn) => closers.push(fn) };
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

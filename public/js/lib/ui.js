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

// Hoja inferior (móvil) / modal centrado (escritorio).
export function openSheet(html) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add("in"));
  const onKey = (e) => e.key === "Escape" && close();
  function close() {
    document.removeEventListener("keydown", onKey);
    wrap.classList.remove("in");
    setTimeout(() => wrap.remove(), 220);
  }
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  return { el: wrap.querySelector(".sheet"), close };
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

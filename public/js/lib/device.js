// Qué dispositivo es, para mostrar los atajos de teclado correctos:
// ⌘ en Mac, Ctrl en Windows/Linux y ninguno en celulares y tablets.

const ua = navigator.userAgent;
const platform = navigator.userAgentData?.platform || navigator.platform || "";

// iPadOS se presenta como Mac, pero tiene pantalla táctil.
export const isTouchDevice =
  /Android|iPhone|iPad|iPod|Mobi/i.test(ua) || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1);
export const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1);
export const isMac = !isTouchDevice && /Mac/i.test(platform);

// shortcut("V") -> "⌘V" en Mac, "Ctrl+V" en Windows; "" en el celular.
export function shortcut(key) {
  if (isTouchDevice) return "";
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

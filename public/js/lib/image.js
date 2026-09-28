// Comprime una imagen en el navegador a un data URL que entre en un
// documento de Firestore (límite 1 MiB por documento).

const MAX_CHARS = 900_000;

async function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file); } catch { /* sigue abajo */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render(src, maxDim, type, q) {
  const w0 = src.width, h0 = src.height;
  const s = Math.min(1, maxDim / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * s);
  c.height = Math.round(h0 * s);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0c0b0a";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  let out = c.toDataURL(type, q);
  // Safari viejo no codifica WebP: cae a PNG. En ese caso usamos JPEG.
  if (type === "image/webp" && !out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", q);
  return out;
}

export async function compressImage(file) {
  const src = await loadBitmap(file);
  let dim = 1800, q = 0.85, full;
  for (let i = 0; i < 12; i++) {
    full = render(src, dim, "image/webp", q);
    if (full.length <= MAX_CHARS) break;
    if (q > 0.5) q -= 0.1;
    else dim = Math.round(dim * 0.8);
  }
  if (full.length > MAX_CHARS) throw new Error("La imagen es demasiado grande incluso comprimida.");
  const thumb = render(src, 520, "image/webp", 0.72);
  const ratio = src.width / src.height;
  src.close?.();
  return { full, thumb, ratio };
}

// Cielo dithered: sol (día) o luna (noche) con nubes/estrellas en puntos.
// Se calcula una intensidad por celda, se aplica dithering Bayer 8x8 y se
// enmascara con un patrón de puntos para lograr el look halftone.

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
].map((row) => row.map((v) => (v + 0.5) / 64));

// value noise
const P = new Uint8Array(512);
{
  const p = [...Array(256).keys()];
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
}
const fade = (t) => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const h = (i, j) => P[(P[(xi + i) & 255] + yi + j) & 255] / 255;
  const u = fade(xf), v = fade(yf);
  const a = h(0, 0) + (h(1, 0) - h(0, 0)) * u;
  const b = h(0, 1) + (h(1, 1) - h(0, 1)) * u;
  return a + (b - a) * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;

function hash(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// Cuadros por segundo según el ajuste de movimiento (tope: 30 fps). En
// "suave" además el tiempo corre a la mitad; en "quieto" se dibuja un cuadro.
const FRAME_MS = { full: 60, soft: 120 };
const SPEED = { full: 1, soft: 0.5 };

export function createSky(canvas, { day, motion = "full" }) {
  const ctx = canvas.getContext("2d");
  const low = document.createElement("canvas");
  const lctx = low.getContext("2d");
  let cols, rows, cell, dpr, img, pattern, stars, raf = 0, last = 0, running = true;
  // reloj propio: avanza solo mientras se anima (sin saltos al reanudar)
  let clock = 0, prev = null, visible = !document.hidden, onScreen = true;
  // color de los puntos: sale del CSS (.sky { color }) para seguir el tema
  let ink = [236, 230, 220];
  const readInk = () => {
    const m = getComputedStyle(canvas).color.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) ink = m.slice(0, 3).map(Number);
  };

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    readInk();
    dpr = Math.min(devicePixelRatio || 1, 2);
    cell = r.width < 700 ? 4 : 5;
    cols = Math.ceil(r.width / cell);
    rows = Math.ceil(r.height / cell);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    low.width = cols;
    low.height = rows;
    img = lctx.createImageData(cols, rows);

    const pc = document.createElement("canvas");
    const ps = cell * dpr;
    pc.width = pc.height = Math.round(ps);
    const pctx = pc.getContext("2d");
    pctx.fillStyle = "#fff";
    pctx.beginPath();
    pctx.arc(ps / 2, ps / 2, ps * 0.34, 0, Math.PI * 2);
    pctx.fill();
    pattern = ctx.createPattern(pc, "repeat");

    stars = [];
    for (let i = 0; i < cols * rows * 0.0035; i++) {
      stars.push({
        x: Math.floor(hash(i * 3 + 1) * cols),
        y: Math.floor(hash(i * 3 + 2) * rows * 0.62),
        p: hash(i * 3 + 3) * 6.28,
        b: 0.35 + hash(i * 7) * 0.65,
        sp: 0.8 + hash(i * 11) * 2.2,
      });
    }
    draw(clock);
  }

  function intensity(t) {
    const aspect = cols / rows;
    const minDim = Math.min(cols, rows);
    const cx = cols * (aspect > 1 ? 0.68 : 0.62);
    const cy = rows * (aspect > 1 ? 0.36 : 0.28);
    const R = minDim * (aspect > 1 ? 0.2 : 0.23);
    const buf = new Float32Array(cols * rows);
    const s = t / 1000; // segundos
    // "respiración" lenta del halo y giro suave de los rayos
    const breathe = 1 + 0.06 * Math.sin((s * Math.PI * 2) / 7);
    const rayPhase = s * 0.6;
    const rayLen = 0.85 + 0.2 * Math.sin(s * 0.9);
    const cloudShift = s * (day ? 3.2 : 1.8); // celdas por segundo

    for (let y = 0; y < rows; y++) {
      const ny = y / rows;
      // el cielo se funde a negro hacia abajo para dejar lugar al texto
      const vf = Math.min(1, Math.max(0, (0.72 - ny) / 0.22));
      for (let x = 0; x < cols; x++) {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy);
        let v = 0;
        if (day) {
          const ring = R * 1.12;
          if (d < R) {
            v = 1.02 - 0.22 * (d / R) ** 3;
          } else if (d < ring) {
            v = 0.04; // anillo oscuro que recorta el disco
          } else {
            const ang = Math.atan2(dy, dx);
            const rays = Math.max(0, Math.cos(ang * 12 + rayPhase)) ** 3;
            const e = Math.exp(-(d - ring) / (R * 0.5 * breathe));
            v = 0.34 * e + 0.5 * rays * Math.exp(-(d - ring) / (R * 0.9 * rayLen));
          }
          // nubes: bandas que se desplazan por delante del sol
          const band = Math.max(0, 1 - Math.abs(ny - 0.5) / 0.2);
          const c = fbm((x - cloudShift) / 38, y / 14) * band;
          const cloud = Math.max(0, c - 0.36) * 1.8;
          if (cloud > 0) v = d < ring ? v * (1 - Math.min(1, cloud * 1.4)) + cloud * 0.25 : Math.max(v, cloud * 0.5);
        } else {
          if (d < R) {
            const nx = dx / R, nyy = dy / R;
            const nz = Math.sqrt(Math.max(0, 1 - nx * nx - nyy * nyy));
            let lit = Math.max(0, nx * -0.62 + nyy * -0.28 + nz * 0.73);
            // cráteres
            const cr = fbm(x / 7 + 3, y / 7 + 9);
            lit *= cr > 0.58 ? 0.72 : 1;
            v = 0.08 + lit * 0.95;
          } else {
            v = 0.24 * breathe * Math.exp(-(d - R) / (R * 0.4 * breathe));
          }
          const band = Math.max(0, 1 - Math.abs(ny - 0.56) / 0.16);
          const c = fbm((x - cloudShift) / 44, y / 12 + 5) * band;
          const cloud = Math.max(0, c - 0.42) * 1.2;
          if (cloud > 0 && d > R) v = Math.max(v, cloud * 0.4);
        }
        const hf = aspect > 1 ? Math.min(1, x / (cols * 0.18)) : 1;
        buf[y * cols + x] = v * vf * hf;
      }
    }
    if (!day) {
      for (const st of stars) {
        if (Math.hypot(st.x - cx, st.y - cy) < R * 1.6) continue;
        const tw = 0.5 + 0.5 * Math.sin(s * st.sp + st.p);
        buf[st.y * cols + st.x] = Math.max(buf[st.y * cols + st.x], st.b * tw + 0.05);
      }
    } else {
      // algunas "motas" sueltas de día que titilan muy tenues
      for (let i = 0; i < stars.length / 3; i++) {
        const st = stars[i];
        const tw = 0.5 + 0.5 * Math.sin(s * st.sp * 0.5 + st.p);
        buf[st.y * cols + st.x] = Math.max(buf[st.y * cols + st.x], 0.08 + 0.18 * tw);
      }
    }
    return buf;
  }

  function draw(t) {
    if (!img) return;
    readInk(); // sigue el color en vivo, incluso durante el fundido de tema
    const buf = intensity(t);
    const d = img.data;
    for (let y = 0; y < rows; y++) {
      const brow = BAYER[y & 7];
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const on = buf[i] > brow[x & 7];
        const o = i * 4;
        d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2];
        d[o + 3] = on ? 255 : 0;
      }
    }
    lctx.putImageData(img, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(low, 0, 0, cols * cell * dpr, rows * cell * dpr);
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Solo se anima si la página está visible, el canvas está en pantalla y
  // el movimiento no es "quieto".
  const animating = () => running && motion !== "still" && visible && onScreen;
  function loop(t) {
    raf = 0;
    if (!animating()) { prev = null; return; }
    if (prev !== null) clock += Math.min(t - prev, 100) * SPEED[motion];
    prev = t;
    if (t - last >= FRAME_MS[motion]) { draw(clock); last = t; }
    raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (animating() && !raf) raf = requestAnimationFrame(loop); };

  const onVisibility = () => { visible = !document.hidden; kick(); };
  document.addEventListener("visibilitychange", onVisibility);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; kick(); });
  io.observe(canvas);
  // Quieto: sin bucle, así que el color se vuelve a tomar al cambiar el tema.
  const mo = new MutationObserver(() => { if (!animating()) setTimeout(() => draw(clock), 500); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-luz"] });
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  kick();

  return {
    setDay(v) { if (v !== day) { day = v; draw(clock); } },
    setMotion(m) { motion = m; kick(); },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

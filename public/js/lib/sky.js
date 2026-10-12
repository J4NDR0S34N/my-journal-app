// Cielo de Inicio, en el estilo "preserving renders": el lienzo nunca se borra
// del todo. Cada cuadro se dibuja encima del anterior (que se va apagando de a
// poco), así lo que se mueve deja estelas con bandas. Después se pasa a
// píxeles cuadrados con dithering Bayer 8×8, en un solo color (la tinta del tema).
//   Día: sol que deriva lento y rayos que giran; con o sin nubes a la deriva.
//   Noche: estrellas que titilan y, según la ilustración elegida (scenes.js):
//   luna con cráteres y cometas (su cola es la propia estela del lienzo), la
//   luna sola, Júpiter con sus bandas y las cuatro lunas galileanas, o Marte
//   con su casquete polar, Fobos y Deimos. Los planetas giran despacio.

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

// ruido de valor (cráteres de la luna)
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

// azar determinista (las mismas estrellas y nubes en cada carga)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0) / 4294967296);
}

// Tope de 30 fps (hoy ≈16). En movimiento "quieto" se dibuja un solo cuadro.
const FRAME_MS = 60;
// Cuánto queda de la estela en cada cuadro de 60 ms: la mitad se va en ≈3 s.
const KEEP = 0.986;

// Lunas de cada planeta: t ubica la órbita entre la más cercana y la más
// lejana (0..1), w es la velocidad angular (rad/s), ph la fase y size el radio.
const MOONS = {
  jupiter: [
    { t: 0, w: 0.8, ph: 0, size: 1.7 }, // Ío
    { t: 0.3, w: 0.45, ph: 2.1, size: 1.5 }, // Europa
    { t: 0.62, w: 0.26, ph: 4, size: 2.1 }, // Ganimedes
    { t: 1, w: 0.13, ph: 5.3, size: 1.9 }, // Calisto
  ],
  mars: [
    { t: 0, w: 0.9, ph: 1, size: 1.5 }, // Fobos
    { t: 1, w: 0.28, ph: 4.2, size: 1.2 }, // Deimos
  ],
};
const PLANET = {
  jupiter: { size: 0.82, spin: 0.08, far: 2.9 },
  mars: { size: 0.78, spin: 0.035, far: 2.6 },
};
const TAU = Math.PI * 2;

// scene: { day: "clouds" | "clear", night: "comets" | "clear" | "jupiter" | "mars" }
// preview: miniatura del panel del perfil (centrada, sin fundido, más fina).
export function createSky(canvas, { day, motion = "full", scene = { day: "clouds", night: "comets" }, preview = false }) {
  const ctx = canvas.getContext("2d");
  const low = document.createElement("canvas");
  const lctx = low.getContext("2d");
  let cols, rows, cell, dpr, img, pattern, acc, mask, raf = 0, last = 0, running = true;
  // reloj propio: avanza solo mientras se anima (sin saltos al reanudar)
  let clock = 0, prev = null, visible = !document.hidden, onScreen = true;
  let stars = [], clouds = [], comets = [], nextComet = preview ? 900 : 2500;
  let ink = [236, 230, 220];
  const readInk = () => {
    const m = getComputedStyle(canvas).color.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) ink = m.slice(0, 3).map(Number);
  };

  // ---------- escena ----------
  // Proporciones según la forma del héroe (vertical en el celular).
  const layout = () => {
    if (preview) return { cx: cols * 0.5, cy: rows * 0.5, R: Math.min(cols, rows) * 0.26 };
    const wide = cols / rows > 1;
    const minDim = Math.min(cols, rows);
    return {
      cx: cols * (wide ? 0.7 : 0.62),
      cy: rows * (wide ? 0.34 : 0.27),
      R: minDim * (wide ? 0.19 : 0.22),
    };
  };

  function build() {
    const r = rng(7);
    stars = Array.from({ length: Math.round(cols * rows * 0.004) }, () => ({
      x: Math.floor(r() * cols),
      y: Math.floor(r() * rows * (preview ? 1 : 0.66)),
      b: 0.45 + r() * 0.55,
      sp: 0.6 + r() * 2.2,
      ph: r() * 6.28,
      big: r() < 0.12,
    }));
    // nubes: grupos de círculos en distintas alturas y velocidades
    clouds = Array.from({ length: cols > rows ? 5 : 4 }, (_, k) => {
      const size = Math.min(cols, rows) * (0.055 + r() * 0.035);
      return {
        x: r() * cols * 1.4,
        y: rows * (cols > rows ? 0.2 + 0.11 * k : 0.12 + 0.12 * k) + r() * rows * 0.04,
        v: (0.9 + r() * 1.6) * (cols / 120), // celdas por segundo
        parts: Array.from({ length: 4 + Math.floor(r() * 3) }, (_, i) => ({
          dx: (i - 2) * size * (0.75 + r() * 0.3),
          dy: -r() * size * 0.55,
          r: size * (0.65 + r() * 0.5),
        })),
      };
    });
  }

  // Pinta un disco: cada celda adentro toma el valor de shade(nx, ny, d)
  // (nx, ny en -1..1; d = distancia al centro 0..1). blend "max" suma luz
  // sin tapar lo que hay; si no, reemplaza (y así quedan las bandas).
  function disc(cx, cy, r, shade, blend) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(cols - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(rows - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const ny = (y - cy) / r;
      for (let x = x0; x <= x1; x++) {
        const nx = (x - cx) / r;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const v = shade(nx, ny, Math.sqrt(d2));
        const i = y * cols + x;
        acc[i] = blend ? Math.max(acc[i], v) : v;
      }
    }
  }

  function step(t, dt) {
    const keep = Math.pow(KEEP, dt / FRAME_MS);
    for (let i = 0; i < acc.length; i++) acc[i] *= keep;
    const s = t / 1000;
    const { cx: bx, cy: by, R } = layout();
    // deriva lenta: el disco nuevo tapa al anterior y deja medialunas de estela
    const cx = bx + Math.sin(s * 0.3) * R * 0.3;
    const cy = by + Math.cos(s * 0.23) * R * 0.18;
    const r = R * (1 + 0.04 * Math.sin(s * 0.9));
    if (day) {
      // halo y rayos que giran (suman luz, no tapan)
      disc(cx, cy, R * 2.3, (nx, ny, d) => {
        if (d < 0.46) return 0;
        const ang = Math.atan2(ny, nx);
        const ray = Math.max(0, Math.cos(ang * 12 + s * 0.5)) ** 6;
        const fall = 1 - (d - 0.46) / 0.54;
        return (0.16 + 0.42 * ray) * fall * fall;
      }, true);
      // sol: brillante en el centro, borde oscuro (la banda negra del estilo)
      disc(cx, cy, r, (nx, ny, d) => (d > 0.9 ? 0.06 : 1.02 - 0.3 * d * d - 0.12 * ny), false);
      // nubes: claras arriba, más oscuras abajo, con contorno oscuro
      if (scene.day === "clouds") for (const c of clouds) {
        const span = cols * 1.6;
        const x = ((c.x + c.v * s) % span + span) % span - cols * 0.3;
        for (const p of c.parts) {
          disc(x + p.dx, c.y + p.dy, p.r, (nx, ny, d) => (d > 0.88 ? 0.04 : 0.86 - 0.4 * (ny + 1) / 2), false);
        }
      }
    } else {
      const planet = PLANET[scene.night];
      const pr = planet ? r * planet.size : r;
      // halo (más corto y tenue en los planetas, para que se lean sus bandas)
      if (planet) disc(cx, cy, pr * 1.45, (nx, ny, d) => (d < 0.7 ? 0 : 0.16 * (1 - (d - 0.7) / 0.3) ** 2), true);
      else disc(cx, cy, r * 1.9, (nx, ny, d) => (d < 0.53 ? 0 : 0.26 * (1 - (d - 0.53) / 0.47) ** 2), true);
      if (scene.night === "jupiter") disc(cx, cy, pr, jupiter(s * planet.spin), false);
      else if (scene.night === "mars") disc(cx, cy, pr, mars(s * planet.spin), false);
      else {
        // luna: esfera iluminada desde arriba a la izquierda, con cráteres
        disc(cx, cy, r, (nx, ny, d) => {
          if (d > 0.92) return 0.05;
          const nz = Math.sqrt(Math.max(0, 1 - d * d));
          let lit = Math.max(0, nx * -0.6 + ny * -0.32 + nz * 0.74);
          const cr = vnoise((cx + nx * r) / 6 + 3, (cy + ny * r) / 6 + 9);
          if (cr > 0.6) lit *= 0.68;
          return 0.06 + lit * 0.98;
        }, false);
      }
      // estrellas que titilan (las grandes, en cruz)
      for (const st of stars) {
        if (Math.hypot(st.x - cx, st.y - cy) < pr * 1.5) continue;
        const v = st.b * (0.45 + 0.55 * Math.sin(s * st.sp + st.ph) ** 2);
        const put = (x, y, k) => {
          if (x < 0 || y < 0 || x >= cols || y >= rows) return;
          const i = y * cols + x;
          acc[i] = Math.max(acc[i], v * k);
        };
        put(st.x, st.y, 1);
        if (st.big) { put(st.x - 1, st.y, 0.55); put(st.x + 1, st.y, 0.55); put(st.x, st.y - 1, 0.55); put(st.x, st.y + 1, 0.55); }
      }
      if (planet) moons(MOONS[scene.night], cx, cy, pr, planet.far, s);
      if (scene.night === "comets") cometsStep(dt);
    }
  }

  // ---------- planetas ----------
  // Coordenadas sobre la esfera: lat (−1 arriba … 1 abajo) y longitud que
  // avanza con el giro (sin costura: solo se ve la cara de adelante).
  const sphere = (nx, ny, d, spin) => {
    const nz = Math.sqrt(Math.max(0, 1 - d * d));
    return { nz, lon: Math.atan2(nx, nz) + spin, light: 0.42 + 0.62 * Math.max(0, nx * -0.55 + ny * -0.3 + nz * 0.78) };
  };

  // Júpiter: zonas claras y cinturones oscuros con turbulencia, y la Gran
  // Mancha Roja (óvalo oscuro con borde claro) que pasa con el giro.
  const jupiter = (spin) => (nx, ny, d) => {
    if (d > 0.94) return 0.05;
    const { nz, lon, light } = sphere(nx, ny, d, spin);
    const turb = vnoise(lon * 3 + 40, ny * 9 + 7);
    const band = Math.sin(ny * 10 + 0.6 + turb * 1.4);
    let alb = band > 0.15 ? 0.98 : band > -0.35 ? 0.62 : 0.3;
    alb += (vnoise(lon * 6 + 90, ny * 22) - 0.5) * 0.18;
    const dl = (((lon - 1.2) % TAU) + TAU * 1.5) % TAU - Math.PI;
    const e = (dl / 0.42) ** 2 + ((ny - 0.38) / 0.12) ** 2;
    if (e < 0.5) alb = 0.25;
    else if (e < 1) alb = 1;
    return 0.04 + alb * light * (0.7 + 0.3 * nz);
  };

  // Marte: llanuras claras con mares oscuros y casquetes polares.
  const mars = (spin) => (nx, ny, d) => {
    if (d > 0.94) return 0.05;
    const { nz, lon, light } = sphere(nx, ny, d, spin);
    const n = vnoise(lon * 2.2 + 20, ny * 3 + 5) * 0.65 + vnoise(lon * 5.5 + 3, ny * 8 + 60) * 0.35;
    let alb = 0.85 - 0.58 * Math.min(1, Math.max(0, (n - 0.45) / 0.12));
    if (ny < -0.66 + 0.07 * Math.sin(lon * 3)) alb = 1.15; // casquete norte
    else if (ny > 0.84) alb = 1;
    return 0.04 + alb * light * (0.7 + 0.3 * nz);
  };

  // Lunas en órbitas casi de canto: pasan por delante y por detrás del
  // planeta (detrás, quedan tapadas) y dejan estela.
  function moons(list, cx, cy, pr, far, s) {
    const near = pr * 1.35;
    const room = Math.min(cx, cols - cx) - 3;
    const max = Math.max(near + pr * 0.6, Math.min(pr * far, room));
    const tilt = -0.15;
    for (const m of list) {
      const a = near + (max - near) * m.t;
      const th = m.ph + s * m.w;
      const px = a * Math.cos(th), py = a * Math.sin(th) * 0.16;
      const x = cx + px * Math.cos(tilt) - py * Math.sin(tilt);
      const y = cy + px * Math.sin(tilt) + py * Math.cos(tilt);
      if (Math.sin(th) < 0 && Math.hypot(x - cx, y - cy) < pr + m.size) continue;
      disc(x, y, m.size, (nx, ny, d) => 1.05 - d * 0.4, true);
    }
  }

  // cometas: cabeza brillante; la cola es la estela que deja el lienzo
  function cometsStep(dt) {
    nextComet -= dt;
    if (nextComet <= 0 && comets.length < 2) {
      const ang = Math.PI * (0.78 + Math.random() * 0.12); // hacia abajo a la izquierda
      const sp = (cols / 12) * (0.8 + Math.random() * 0.6); // celdas por segundo
      comets.push({ x: cols * (0.35 + Math.random() * 0.75), y: rows * Math.random() * 0.22, vx: Math.cos(ang) * sp, vy: Math.abs(Math.sin(ang)) * sp * 0.55, life: 2.6 + Math.random() * 1.6 });
      nextComet = preview ? 1500 + Math.random() * 2500 : 5000 + Math.random() * 7000;
    }
    for (const c of comets) {
      const sec = dt / 1000, steps = 4;
      for (let k = 0; k < steps; k++) {
        c.x += (c.vx * sec) / steps;
        c.y += (c.vy * sec) / steps;
        disc(c.x, c.y, 2.6, (nx, ny, d) => 1.1 - d * 0.5, true);
      }
      c.life -= sec;
    }
    comets = comets.filter((c) => c.life > 0 && c.x > -10 && c.y < rows * 0.7);
  }

  // ---------- pantalla ----------
  function resize() {
    // tamaño de diseño (sin transformaciones: la hoja entra con escala)
    const rc = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (rc.width < 2 || rc.height < 2) return;
    readInk();
    dpr = Math.min(devicePixelRatio || 1, 2);
    cell = preview ? 2 : rc.width < 700 ? 3 : 4; // más detalle que antes (4–5)
    cols = Math.ceil(rc.width / cell);
    rows = Math.ceil(rc.height / cell);
    canvas.width = Math.round(rc.width * dpr);
    canvas.height = Math.round(rc.height * dpr);
    low.width = cols;
    low.height = rows;
    img = lctx.createImageData(cols, rows);
    acc = new Float32Array(cols * rows);
    // máscara fija: el cielo se funde hacia abajo (lugar para el saludo) y,
    // en pantallas anchas, también hacia la izquierda
    mask = new Float32Array(cols * rows);
    const wide = cols / rows > 1;
    for (let y = 0; y < rows; y++) {
      const vf = Math.min(1, Math.max(0, (0.72 - y / rows) / 0.22));
      for (let x = 0; x < cols; x++) mask[y * cols + x] = preview ? 1 : vf * (wide ? Math.min(1, x / (cols * 0.18)) : 1);
    }
    // píxeles cuadrados con una separación mínima entre sí
    const pc = document.createElement("canvas");
    const ps = Math.max(1, Math.round(cell * dpr));
    pc.width = pc.height = ps;
    const pctx = pc.getContext("2d");
    pctx.fillStyle = "#fff";
    const q = Math.max(1, Math.round(ps * 0.82));
    pctx.fillRect(0, 0, q, q);
    pattern = ctx.createPattern(pc, "repeat");
    build();
    // unos cuadros de arranque para que ya se vean las estelas
    for (let k = 0; k < 40; k++) step(clock - (40 - k) * FRAME_MS, FRAME_MS);
    draw();
  }

  function draw() {
    if (!img) return;
    readInk(); // sigue el color en vivo, incluso durante el fundido de tema
    const d = img.data;
    for (let y = 0; y < rows; y++) {
      const brow = BAYER[y & 7];
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const o = i * 4;
        d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2];
        d[o + 3] = acc[i] * mask[i] > brow[x & 7] ? 255 : 0;
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
    if (prev !== null) clock += Math.min(t - prev, 100);
    prev = t;
    if (t - last >= FRAME_MS) {
      if (acc) { step(clock, Math.min(t - last, 200)); draw(); }
      last = t;
    }
    raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (animating() && !raf) raf = requestAnimationFrame(loop); };

  const onVisibility = () => { visible = !document.hidden; kick(); };
  document.addEventListener("visibilitychange", onVisibility);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; kick(); });
  io.observe(canvas);
  // Quieto: sin bucle, así que el color se vuelve a tomar al cambiar el tema.
  const mo = new MutationObserver(() => { if (!animating()) setTimeout(draw, 500); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-luz"] });
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  kick();

  // Cambio de escena: lo anterior se apaga y la nueva ya aparece con estela.
  function redo() {
    comets = [];
    if (acc) { for (let k = 0; k < 40; k++) step(clock, FRAME_MS); draw(); }
  }

  return {
    setDay(v) {
      if (v === day) return;
      day = v;
      redo();
    },
    setScene(v) {
      if (v.day === scene.day && v.night === scene.night) return;
      scene = { ...v };
      redo();
    },
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

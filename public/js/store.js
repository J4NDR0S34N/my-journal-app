// Capa de datos: Firestore (si hay config) o localStorage (modo local).
// Mantiene una caché en memoria por colección para navegar sin recargar.
// En tiempo real: cada colección que se lee queda escuchando Firestore
// (onSnapshot), así lo que cambiás en otro dispositivo llega solo; la app
// se entera con onRemoteChange() y redibuja la sección si la usa.

import { firebaseConfig, OWNER_UID } from "./config.js";

const SDK = "https://www.gstatic.com/firebasejs/12.3.0";
// Modo local: sin config de Firebase, o en desarrollo con ?local en la URL
// (solo en localhost, para probar diseño sin tocar los datos reales).
const devLocal =
  ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("local");
export const isLocal = !firebaseConfig.apiKey || devLocal;

let fb = null; // { auth, db, fs, au }
const cache = new Map(); // col -> Map(id -> data)
const inflight = new Map(); // col -> Promise de list() en curso
const live = new Map(); // col -> cancelar la escucha en vivo de la colección
const liveSince = new Map(); // col -> { from, docs, ready, unsub } de since()

// ---------- tiempo real ----------
// Cambios propios recientes (col/id -> hora): su eco no cuenta como remoto.
const mine = new Map();
const markMine = (col, id) => mine.set(`${col}/${id}`, Date.now());
const isMine = (col, id) => Date.now() - (mine.get(`${col}/${id}`) || 0) < 5000;
const remoteListeners = new Set();
const emitRemote = (col) => remoteListeners.forEach((fn) => fn(col));
const hasRemote = (col, snap) => snap.docChanges().some((c) => !isMine(col, c.doc.id));

// fn(col): una colección cambió desde otro dispositivo. Devuelve la baja.
export function onRemoteChange(fn) {
  remoteListeners.add(fn);
  return () => remoteListeners.delete(fn);
}

// Colecciones leídas por la sección actual (la app las reinicia al navegar).
const deps = new Set();
export const usedCollections = () => deps;
export const resetUsed = () => deps.clear();

function stopLive() {
  live.forEach((unsub) => unsub());
  live.clear();
  liveSince.forEach((q) => q.unsub());
  liveSince.clear();
}

// Cada usuario tiene su propio diario: el dueño en la raíz, el resto en
// users/{uid}/… (ver firestore.rules). `col` puede ser una ruta, ej. games/x/shots.
let base = "";
const path = (col) => base + col;

// Las vistas pueden empezar a dibujarse antes de que Firebase y la sesión estén
// listos: cada lectura/escritura espera a `authed` (resuelta al haber usuario).
let authed, resolveAuthed, authedDone = false;
function resetAuthed() {
  authedDone = false;
  authed = new Promise((r) => (resolveAuthed = () => { authedDone = true; r(); }));
}
resetAuthed();
if (isLocal) resolveAuthed();

// ---------- local backend ----------
const lsKey = (col) => `mj:${col}`;
function lsRead(col) {
  try { return JSON.parse(localStorage.getItem(lsKey(col))) || {}; } catch { return {}; }
}
function lsWrite(col, obj) {
  try { localStorage.setItem(lsKey(col), JSON.stringify(obj)); }
  catch (e) { throw new Error("No hay espacio en el almacenamiento local."); }
}

// ---------- init / auth ----------
export async function initStore() {
  if (isLocal) return;
  const [app, fs, au] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  const a = app.initializeApp(firebaseConfig);
  // Caché persistente (IndexedDB, compartida entre pestañas): los datos ya
  // vistos se leen y se editan sin conexión y se sincronizan al volver.
  // Si el navegador no tiene IndexedDB (p. ej. algunos modos privados), el
  // SDK sigue solo con caché en memoria; si la configuración falla, se usa
  // la instancia por defecto. En ningún caso la app deja de abrir.
  let db;
  try {
    db = fs.initializeFirestore(a, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("Firestore sin caché persistente:", e);
    db = fs.getFirestore(a);
  }
  fb = { auth: au.getAuth(a), db, fs, au };
}

export function onUser(cb) {
  if (isLocal) { cb({ uid: "local" }); return; }
  fb.au.onAuthStateChanged(fb.auth, (user) => {
    const nextBase = user && user.uid !== OWNER_UID ? `users/${user.uid}/` : "";
    if (nextBase !== base) { base = nextBase; stopLive(); cache.clear(); }
    if (user) resolveAuthed();
    else if (authedDone) resetAuthed();
    cb(user);
  });
}

// pickAccount: Google muestra siempre la lista de cuentas ("Cambiar de cuenta").
export async function signIn({ pickAccount = false } = {}) {
  const provider = new fb.au.GoogleAuthProvider();
  if (pickAccount) provider.setCustomParameters({ prompt: "select_account" });
  try {
    await fb.au.signInWithPopup(fb.auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await fb.au.signInWithRedirect(fb.auth, provider);
    } else throw e;
  }
}

export const signOut = () => (isLocal ? null : fb.au.signOut(fb.auth));
export const clearCache = () => { stopLive(); cache.clear(); };

// ---------- CRUD ----------
// track: false para lecturas que no son de la sección (no la redibujan).
export async function list(col, { track = true } = {}) {
  if (track) deps.add(col);
  if (cache.has(col)) return toArr(col);
  // Si dos partes piden la misma colección a la vez, se hace una sola lectura.
  if (!inflight.has(col)) {
    inflight.set(col, (async () => {
      await authed;
      if (isLocal) cache.set(col, new Map(Object.entries(lsRead(col))));
      else await listen(col);
    })().finally(() => inflight.delete(col)));
  }
  await inflight.get(col);
  return toArr(col);
}

// Escucha la colección: la primera respuesta llena la caché (sale de la
// caché local si hay, al instante); las siguientes la actualizan y, si el
// cambio vino de otro dispositivo, avisan.
function listen(col) {
  return new Promise((resolve, reject) => {
    let first = true;
    const unsub = fb.fs.onSnapshot(fb.fs.collection(fb.db, path(col)), (snap) => {
      cache.set(col, new Map(snap.docs.map((d) => [d.id, d.data()])));
      if (first) { first = false; resolve(); }
      else if (hasRemote(col, snap)) emitRemote(col);
    }, (err) => {
      live.delete(col);
      cache.delete(col);
      if (first) reject(err);
      else console.warn("tiempo real", col, err);
    });
    live.set(col, unsub);
  });
}

// Últimos n documentos ordenados por `field` (desc). Sin caché.
export async function recent(col, field, n) {
  await authed;
  if (isLocal) {
    return Object.entries(lsRead(col))
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")))
      .slice(0, n);
  }
  const q = fb.fs.query(fb.fs.collection(fb.db, path(col)), fb.fs.orderBy(field, "desc"), fb.fs.limit(n));
  const snap = await fb.fs.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Documentos con `field` >= `from`, ordenados por `field` (desc). También en
// vivo (una consulta por colección; si cambia `from`, se reemplaza).
export async function since(col, field, from) {
  deps.add(col);
  await authed;
  if (isLocal) {
    return Object.entries(lsRead(col))
      .map(([id, d]) => ({ id, ...d }))
      .filter((d) => String(d[field] ?? "") >= from)
      .sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")));
  }
  let q = liveSince.get(col);
  if (!q || q.from !== from) {
    q?.unsub();
    q = { from, docs: [], unsub: () => {} };
    q.ready = new Promise((resolve, reject) => {
      let first = true;
      const query = fb.fs.query(fb.fs.collection(fb.db, path(col)), fb.fs.where(field, ">=", from), fb.fs.orderBy(field, "desc"));
      q.unsub = fb.fs.onSnapshot(query, (snap) => {
        q.docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (first) { first = false; resolve(); }
        else if (hasRemote(col, snap)) emitRemote(col);
      }, (err) => {
        if (liveSince.get(col) === q) liveSince.delete(col);
        if (first) reject(err);
        else console.warn("tiempo real", col, err);
      });
    });
    liveSince.set(col, q);
  }
  await q.ready;
  return q.docs.map((d) => ({ ...d }));
}

function toArr(col) {
  return [...cache.get(col)].map(([id, data]) => ({ id, ...data }));
}

export async function get(col, id) {
  const c = cache.get(col);
  if (c?.has(id)) return { id, ...c.get(id) };
  await authed;
  let data;
  if (isLocal) data = lsRead(col)[id];
  else {
    const s = await fb.fs.getDoc(fb.fs.doc(fb.db, path(col), id));
    data = s.exists() ? s.data() : undefined;
  }
  return data ? { id, ...data } : null;
}

export async function set(col, id, data, { merge = true } = {}) {
  await authed;
  if (isLocal) {
    const all = lsRead(col);
    all[id] = merge ? deepMerge(all[id] || {}, data) : data;
    lsWrite(col, all);
  } else {
    markMine(col, id);
    await fb.fs.setDoc(fb.fs.doc(fb.db, path(col), id), data, { merge });
  }
  const c = cache.get(col);
  if (c) c.set(id, merge ? deepMerge(c.get(id) || {}, data) : data);
}

export async function add(col, data) {
  await authed;
  let id;
  if (isLocal) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const all = lsRead(col);
    all[id] = data;
    lsWrite(col, all);
  } else {
    id = fb.fs.doc(fb.fs.collection(fb.db, path(col))).id;
    markMine(col, id);
    await fb.fs.setDoc(fb.fs.doc(fb.db, path(col), id), data);
  }
  cache.get(col)?.set(id, data);
  return id;
}

// Crea el documento solo si todavía no existe en el servidor y devuelve el que
// quedó guardado. Sin conexión falla sin escribir nada: así nunca pisa datos
// que existan en otro dispositivo pero todavía no estén en esta caché.
export async function createIfMissing(col, id, data) {
  await authed;
  let saved;
  if (isLocal) {
    const all = lsRead(col);
    if (!all[id]) { all[id] = data; lsWrite(col, all); }
    saved = all[id];
  } else {
    const ref = fb.fs.doc(fb.db, path(col), id);
    markMine(col, id);
    saved = await fb.fs.runTransaction(fb.db, async (tx) => {
      const s = await tx.get(ref);
      if (s.exists()) return s.data();
      tx.set(ref, data);
      return data;
    });
  }
  cache.get(col)?.set(id, saved);
  return { id, ...saved };
}

export async function update(col, id, patch) {
  return set(col, id, patch, { merge: true });
}

export async function remove(col, id) {
  await authed;
  if (isLocal) {
    const all = lsRead(col);
    delete all[id];
    lsWrite(col, all);
  } else {
    markMine(col, id);
    await fb.fs.deleteDoc(fb.fs.doc(fb.db, path(col), id));
  }
  cache.get(col)?.delete(id);
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object"
      ? deepMerge(a[k], v) : v;
  }
  return out;
}

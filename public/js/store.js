// Capa de datos: Firestore (si hay config) o localStorage (modo local).
// Mantiene una caché en memoria por colección para navegar sin recargar.

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
    if (nextBase !== base) { base = nextBase; cache.clear(); }
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
export const clearCache = () => cache.clear();

// ---------- CRUD ----------
export async function list(col) {
  if (cache.has(col)) return toArr(col);
  // Si dos partes piden la misma colección a la vez, se hace una sola lectura.
  if (!inflight.has(col)) {
    inflight.set(col, (async () => {
      await authed;
      let obj;
      if (isLocal) obj = lsRead(col);
      else {
        const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, path(col)));
        obj = {};
        snap.forEach((d) => (obj[d.id] = d.data()));
      }
      cache.set(col, new Map(Object.entries(obj)));
    })().finally(() => inflight.delete(col)));
  }
  await inflight.get(col);
  return toArr(col);
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

// Documentos con `field` >= `from`, ordenados por `field` (desc). Sin caché.
export async function since(col, field, from) {
  await authed;
  if (isLocal) {
    return Object.entries(lsRead(col))
      .map(([id, d]) => ({ id, ...d }))
      .filter((d) => String(d[field] ?? "") >= from)
      .sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")));
  }
  const q = fb.fs.query(fb.fs.collection(fb.db, path(col)), fb.fs.where(field, ">=", from), fb.fs.orderBy(field, "desc"));
  const snap = await fb.fs.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

// Capa de datos: Firestore (si hay config) o localStorage (modo local).
// Mantiene una caché en memoria por colección para navegar sin recargar.

import { firebaseConfig } from "./config.js";

const SDK = "https://www.gstatic.com/firebasejs/12.3.0";
// Modo local: sin config de Firebase, o en desarrollo con ?local en la URL
// (solo en localhost, para probar diseño sin tocar los datos reales).
const devLocal =
  ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("local");
export const isLocal = !firebaseConfig.apiKey || devLocal;

let fb = null; // { auth, db, fs, au }
const cache = new Map(); // col -> Map(id -> data)

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
  let db;
  try {
    db = fs.initializeFirestore(a, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(a);
  }
  fb = { auth: au.getAuth(a), db, fs, au };
}

export function onUser(cb) {
  if (isLocal) { cb({ uid: "local" }); return; }
  fb.au.onAuthStateChanged(fb.auth, cb);
}

export async function signIn() {
  const provider = new fb.au.GoogleAuthProvider();
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
  let obj;
  if (isLocal) obj = lsRead(col);
  else {
    const snap = await fb.fs.getDocs(fb.fs.collection(fb.db, col));
    obj = {};
    snap.forEach((d) => (obj[d.id] = d.data()));
  }
  cache.set(col, new Map(Object.entries(obj)));
  return toArr(col);
}

// Últimos n documentos ordenados por `field` (desc). Sin caché.
export async function recent(col, field, n) {
  if (isLocal) {
    return Object.entries(lsRead(col))
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")))
      .slice(0, n);
  }
  const q = fb.fs.query(fb.fs.collection(fb.db, col), fb.fs.orderBy(field, "desc"), fb.fs.limit(n));
  const snap = await fb.fs.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function toArr(col) {
  return [...cache.get(col)].map(([id, data]) => ({ id, ...data }));
}

export async function get(col, id) {
  const c = cache.get(col);
  if (c?.has(id)) return { id, ...c.get(id) };
  let data;
  if (isLocal) data = lsRead(col)[id];
  else {
    const s = await fb.fs.getDoc(fb.fs.doc(fb.db, col, id));
    data = s.exists() ? s.data() : undefined;
  }
  return data ? { id, ...data } : null;
}

export async function set(col, id, data, { merge = true } = {}) {
  if (isLocal) {
    const all = lsRead(col);
    all[id] = merge ? deepMerge(all[id] || {}, data) : data;
    lsWrite(col, all);
  } else {
    await fb.fs.setDoc(fb.fs.doc(fb.db, col, id), data, { merge });
  }
  const c = cache.get(col);
  if (c) c.set(id, merge ? deepMerge(c.get(id) || {}, data) : data);
}

export async function add(col, data) {
  let id;
  if (isLocal) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const all = lsRead(col);
    all[id] = data;
    lsWrite(col, all);
  } else {
    id = fb.fs.doc(fb.fs.collection(fb.db, col)).id;
    await fb.fs.setDoc(fb.fs.doc(fb.db, col, id), data);
  }
  cache.get(col)?.set(id, data);
  return id;
}

export async function update(col, id, patch) {
  return set(col, id, patch, { merge: true });
}

export async function remove(col, id) {
  if (isLocal) {
    const all = lsRead(col);
    delete all[id];
    lsWrite(col, all);
  } else {
    await fb.fs.deleteDoc(fb.fs.doc(fb.db, col, id));
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

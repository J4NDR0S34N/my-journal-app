// Colecciones del portal de Colección (colección `collections`).
// Cada registro: { name, kind: "games" | "music" | "custom", order, createdAt }.
// Las dos de fábrica tienen id fijo y solo apuntan a los datos de siempre
// (`games` y `music`, que no se mueven). Renombrar cambia solo `name`.

import { list, set, remove, createIfMissing } from "../store.js";

export const FACTORY = [
  { id: "videojuegos", name: "Videojuegos", kind: "games", order: 0 },
  { id: "musica", name: "Música", kind: "music", order: 1 },
];
const FACTORY_IDS = new Set(FACTORY.map((f) => f.id));

// Rutas: #/coleccion/videojuegos, #/coleccion/musica, #/coleccion/c-xxxx.
// Los ids automáticos de Firestore nunca llevan "-", así que un id de juego
// viejo (#/coleccion/{idJuego}) no puede confundirse con una colección.
export const isCustomId = (id = "") => id.startsWith("c-");
export const isCollectionId = (id = "") => FACTORY_IDS.has(id) || isCustomId(id);

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || "").localeCompare(b.createdAt || "");

// Lista ordenada. Si falta un registro de fábrica (primera vez de esta
// persona), se crea; mientras tanto, o sin conexión, se usan los valores de fábrica.
export async function listCollections() {
  const docs = await list("collections");
  const have = new Map(docs.map((d) => [d.id, d]));
  const factory = await Promise.all(FACTORY.map(async ({ id, ...f }) => {
    if (have.has(id)) return { ...f, ...have.get(id) };
    try {
      return await createIfMissing("collections", id, { ...f, createdAt: new Date().toISOString() });
    } catch (e) {
      console.warn("colecciones", e);
      return { id, ...f };
    }
  }));
  return [...factory, ...docs.filter((d) => !FACTORY_IDS.has(d.id))].sort(byOrder);
}

export async function getCollection(id) {
  return (await listCollections()).find((c) => c.id === id) || null;
}

// ---------- edición (portal) ----------
const now = () => new Date().toISOString();
const newId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function createCollection(name) {
  const cols = await listCollections();
  const order = Math.max(-1, ...cols.map((c) => c.order ?? 0)) + 1;
  const id = newId();
  await set("collections", id, { name, kind: "custom", order, createdAt: now() }, { merge: false });
  return id;
}

// `kind` va en cada escritura: si el registro de fábrica todavía no llegó a
// crearse (sin conexión), la escritura igual queda completa.
export const renameCollection = (c, name) => set("collections", c.id, { name, kind: c.kind });

// Cambia de lugar con la vecina (dir = -1 antes, +1 después) y renumera.
export async function moveCollection(id, dir) {
  const cols = await listCollections();
  const i = cols.findIndex((c) => c.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= cols.length) return cols;
  [cols[i], cols[j]] = [cols[j], cols[i]];
  await Promise.all(cols.map((c, k) => (c.order === k ? null
    : set("collections", c.id, { order: k, kind: c.kind, ...(c.name ? { name: c.name } : {}) }))));
  return listCollections();
}

// Solo las creadas por vos: se borran también sus ítems.
export async function deleteCollection(id) {
  if (!isCustomId(id)) throw new Error("Las colecciones de fábrica no se borran.");
  const items = await listItems(id);
  await Promise.all(items.map((x) => remove("collectionItems", x.id)));
  await remove("collections", id);
}

// Ítems de las colecciones genéricas (colección `collectionItems`):
// { collectionId, title, coverUrl?, note?, status: "owned" | "wishlist", addedAt }.
export const listItems = async (collectionId) =>
  (await list("collectionItems")).filter((x) => x.collectionId === collectionId);

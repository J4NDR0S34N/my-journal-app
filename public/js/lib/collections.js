// Colecciones del portal de Colección (colección `collections`).
// Cada registro: { name, kind: "games" | "music" | "custom", order, createdAt }.
// Las dos de fábrica tienen id fijo y solo apuntan a los datos de siempre
// (`games` y `music`, que no se mueven). Renombrar cambia solo `name`.

import { list, createIfMissing } from "../store.js";

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

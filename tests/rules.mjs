// Pruebas de firestore.rules en el emulador (no tocan datos reales).
// Uso: cd tests && npm install && npm run test:rules

import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, orderBy, runTransaction } from "firebase/firestore";

const OWNER = "8k9Kpn8jhaTJgNSVsgc6LFXu0l53";
const env = await initializeTestEnvironment({
  projectId: "demo-mj",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8085 },
});
const owner = env.authenticatedContext(OWNER).firestore();
const ana = env.authenticatedContext("ana").firestore();
const beto = env.authenticatedContext("beto").firestore();
const anon = env.unauthenticatedContext().firestore();

const results = [];
const t = async (name, p, ok) => {
  try { await (ok ? assertSucceeds(p) : assertFails(p)); results.push(["OK  ", name]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
};
const now = new Date().toISOString();
const games = { name: "Videojuegos", kind: "games", order: 0, createdAt: now };
const item = { collectionId: "c-libros", title: "Rayuela", status: "owned", coverUrl: "", note: "", addedAt: now };

// ---------- diario (como siempre) ----------
await t("dueño escribe su raíz", setDoc(doc(owner, "days/2026-10-10"), { h: { gym: true } }), true);
await t("dueño lee su raíz", getDocs(collection(owner, "music")), true);
await t("dueño subcolección (capturas)", setDoc(doc(owner, "games/g1/shots/s1"), { d: 1 }), true);
await t("ana escribe su diario", setDoc(doc(ana, "users/ana/days/2026-10-10"), { h: { gym: true }, respuesta: "hola" }), true);
await t("ana lee su diario", getDocs(collection(ana, "users/ana/music")), true);
await t("ana subcolección propia", setDoc(doc(ana, "users/ana/games/g1/shots/s1"), { d: 1 }), true);
await t("ana consulta actividad (where+orderBy)", getDocs(query(collection(ana, "users/ana/activity"), where("at", ">=", "2026-10-08"), orderBy("at", "desc"))), true);
await t("ana NO lee datos del dueño", getDocs(collection(ana, "music")), false);
await t("ana NO escribe en la raíz", setDoc(doc(ana, "days/x"), { h: {} }), false);
await t("ana NO lee el diario de beto", getDoc(doc(beto, "users/ana/days/2026-10-10")), false);
await t("beto NO escribe en el de ana", setDoc(doc(beto, "users/ana/notes/n"), { text: "hola" }), false);
await t("dueño NO lee diarios ajenos", getDocs(collection(owner, "users/ana/days")), false);
await t("dueño NO escribe en users/", setDoc(doc(owner, "users/ana/days/x"), {}), false);
await t("sin sesión NO lee nada", getDocs(collection(anon, "music")), false);
await t("sin sesión NO lee diarios", getDocs(collection(anon, "users/ana/days")), false);

// ---------- colecciones del portal ----------
await t("dueño crea registro de fábrica (transacción)", runTransaction(owner, async (tx) => {
  const ref = doc(owner, "collections/videojuegos");
  if (!(await tx.get(ref)).exists()) tx.set(ref, games);
}), true);
await t("dueño renombra (solo name + kind)", setDoc(doc(owner, "collections/videojuegos"), { name: "Juegos", kind: "games" }, { merge: true }), true);
await t("dueño reordena", updateDoc(doc(owner, "collections/videojuegos"), { order: 3 }), true);
await t("dueño NO cambia el tipo", updateDoc(doc(owner, "collections/videojuegos"), { kind: "custom" }), false);
await t("dueño NO borra una de fábrica", deleteDoc(doc(owner, "collections/videojuegos")), false);
await t("dueño NO deja el nombre vacío", updateDoc(doc(owner, "collections/videojuegos"), { name: "" }), false);
await t("dueño NO usa un tipo inventado", setDoc(doc(owner, "collections/c-x"), { name: "X", kind: "otro", order: 1 }), false);
await t("dueño NO pone un nombre de más de 60", setDoc(doc(owner, "collections/c-x"), { name: "x".repeat(61), kind: "custom", order: 1 }), false);
await t("dueño crea una genérica", setDoc(doc(owner, "collections/c-libros"), { name: "Libros", kind: "custom", order: 2, createdAt: now }), true);
await t("dueño agrega un ítem", setDoc(doc(owner, "collectionItems/i1"), item), true);
await t("dueño edita un ítem", updateDoc(doc(owner, "collectionItems/i1"), { status: "wishlist", note: "prestado" }), true);
await t("dueño NO usa un estado inventado", updateDoc(doc(owner, "collectionItems/i1"), { status: "vendido" }), false);
await t("dueño NO deja un ítem sin título", setDoc(doc(owner, "collectionItems/i2"), { ...item, title: "" }), false);
await t("dueño NO pone ítems en una de fábrica", setDoc(doc(owner, "collectionItems/i3"), { ...item, collectionId: "videojuegos" }), false);
await t("dueño lista sus colecciones", getDocs(collection(owner, "collections")), true);
await t("dueño borra un ítem", deleteDoc(doc(owner, "collectionItems/i1")), true);
await t("dueño borra su genérica", deleteDoc(doc(owner, "collections/c-libros")), true);
await t("ana crea su registro de fábrica", setDoc(doc(ana, "users/ana/collections/musica"), { name: "Música", kind: "music", order: 1, createdAt: now }), true);
await t("ana crea una genérica", setDoc(doc(ana, "users/ana/collections/c-vinilos"), { name: "Vinilos", kind: "custom", order: 2, createdAt: now }), true);
await t("ana agrega un ítem", setDoc(doc(ana, "users/ana/collectionItems/i1"), { ...item, collectionId: "c-vinilos" }), true);
await t("ana NO borra su Música de fábrica", deleteDoc(doc(ana, "users/ana/collections/musica")), false);
await t("ana NO lee colecciones del dueño", getDocs(collection(ana, "collections")), false);
await t("ana NO escribe colecciones del dueño", setDoc(doc(ana, "collections/c-y"), { name: "Y", kind: "custom", order: 1 }), false);
await t("beto NO lee los ítems de ana", getDocs(collection(beto, "users/ana/collectionItems")), false);
await t("dueño NO lee las colecciones de ana", getDocs(collection(owner, "users/ana/collections")), false);
await t("sin sesión NO lee colecciones", getDocs(collection(anon, "collections")), false);

console.log(results.map((r) => r.join(" ")).join("\n"));
console.log(`\n${results.filter((r) => r[0] === "OK  ").length}/${results.length} correctas`);
await env.cleanup();
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);

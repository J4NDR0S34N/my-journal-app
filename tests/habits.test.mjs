// Pruebas de la racha y de "Bienvenido de vuelta" (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStreak, welcomeBack } from "../public/js/habits.js";
import { dayKey } from "../public/js/lib/dates.js";

const day = (id, on = true) => ({ id, h: { run: on } });

test("la racha cuenta días seguidos con al menos un hábito", () => {
  const days = [day("2026-10-08"), day("2026-10-09"), day("2026-10-10")];
  assert.equal(computeStreak(days, "2026-10-10", dayKey), 3);
});

test("hoy vacío no corta la racha: se cuenta desde ayer", () => {
  assert.equal(computeStreak([day("2026-10-08"), day("2026-10-09")], "2026-10-10", dayKey), 2);
});

test("un día sin hábitos corta la racha", () => {
  const days = [day("2026-10-06"), day("2026-10-07", false), day("2026-10-08"), day("2026-10-09")];
  assert.equal(computeStreak(days, "2026-10-09", dayKey), 2);
});

test("la racha cruza el cambio de mes", () => {
  assert.equal(computeStreak([day("2026-09-30"), day("2026-10-01")], "2026-10-01", dayKey), 2);
});

test("bienvenido de vuelta: ayer sin registro pero hubo antes", () => {
  assert.equal(welcomeBack([day("2026-10-07")], "2026-10-10", dayKey), true);
  assert.equal(welcomeBack([day("2026-10-09")], "2026-10-10", dayKey), false);
  assert.equal(welcomeBack([], "2026-10-10", dayKey), false);
  assert.equal(welcomeBack([day("2026-10-10")], "2026-10-10", dayKey), false);
});

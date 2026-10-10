// Pruebas de presenceStats (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { presenceStats, isPresent } from "../public/js/lib/presence.js";

const day = (id, extra = { h: { run: true } }) => ({ id, ...extra });

test("un día cuenta con un hábito o con la respuesta del día", () => {
  assert.equal(isPresent(day("2026-10-01")), true);
  assert.equal(isPresent(day("2026-10-01", { respuesta: "hola" })), true);
  assert.equal(isPresent(day("2026-10-01", { h: { run: false }, respuesta: "  " })), false);
  assert.equal(isPresent(undefined), false);
});

test("presente X/N: solo días de este mes, hasta hoy", () => {
  const days = [day("2026-09-30"), day("2026-10-01"), day("2026-10-04"), day("2026-10-10"), day("2026-10-11")];
  const s = presenceStats(days, "2026-10-10");
  assert.equal(s.present, 3);
  assert.equal(s.total, 10);
});

test("la semana son los últimos 7 días, de más viejo a hoy", () => {
  const s = presenceStats([day("2026-10-04"), day("2026-10-08"), day("2026-10-10")], "2026-10-10");
  assert.deepEqual(s.week.map((d) => d.key), ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
  assert.deepEqual(s.week.map((d) => d.present), [true, false, false, false, true, false, true]);
});

test("la semana cruza el cambio de mes", () => {
  const s = presenceStats([day("2026-09-28")], "2026-10-02");
  assert.equal(s.week[0].key, "2026-09-26");
  assert.equal(s.week[2].present, true);
  assert.equal(s.present, 0);
  assert.equal(s.total, 2);
});

test("bienvenido de vuelta: ayer sin registro pero hubo antes", () => {
  assert.equal(presenceStats([day("2026-10-07")], "2026-10-10").welcomeBack, true);
  assert.equal(presenceStats([day("2026-10-09")], "2026-10-10").welcomeBack, false);
  assert.equal(presenceStats([], "2026-10-10").welcomeBack, false); // primera vez: nada que dar la bienvenida
  assert.equal(presenceStats([day("2026-10-10")], "2026-10-10").welcomeBack, false);
});

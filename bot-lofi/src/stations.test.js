import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStation, allStations, lofiChoices } from "./stations.js";

test("resolveStation devolve url completa do mount", () => {
  const s = resolveStation("tokyo");
  assert.equal(s.value, "tokyo");
  assert.equal(s.label, "Lofi Tokyo");
  assert.ok(s.url.endsWith("/tokyo.opus"));
});

test("resolveStation com value inválido devolve null", () => {
  assert.equal(resolveStation("nope"), null);
});

test("allStations lista as 5 estações na ordem", () => {
  assert.deepEqual(
    allStations().map((s) => s.value),
    ["tokyo", "focus", "anime", "anime2", "akita"],
  );
});

test("lofiChoices tem name/value por estação", () => {
  const c = lofiChoices();
  assert.equal(c.length, 5);
  assert.deepEqual(c[0], { name: "Lofi Tokyo", value: "tokyo" });
});

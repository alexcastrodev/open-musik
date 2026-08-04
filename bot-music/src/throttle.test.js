import { test } from "node:test";
import assert from "node:assert/strict";
import { minInterval } from "./throttle.js";

test("minInterval: 1ª ação passa; repetição dentro da janela bloqueia", () => {
  const key = "k-basic";
  assert.equal(minInterval(key, 2000, 1000).allowed, true, "1ª passa");
  const blocked = minInterval(key, 2000, 1500);
  assert.equal(blocked.allowed, false, "500ms depois: bloqueado");
  assert.equal(blocked.retryInMs, 1500, "faltam 1500ms");
});

test("minInterval: passada a janela, libera de novo", () => {
  const key = "k-window";
  assert.equal(minInterval(key, 2000, 1000).allowed, true);
  assert.equal(minInterval(key, 2000, 3000).allowed, true, "2000ms depois: libera");
});

test("minInterval: tentativa bloqueada NÃO empurra a janela (anti-martelo)", () => {
  const key = "k-hammer";
  assert.equal(minInterval(key, 2000, 0).allowed, true, "ação aceita em t=0");
  assert.equal(minInterval(key, 2000, 500).allowed, false);
  assert.equal(minInterval(key, 2000, 1000).allowed, false);
  assert.equal(minInterval(key, 2000, 1500).allowed, false);
  assert.equal(minInterval(key, 2000, 2000).allowed, true, "libera 2s após a aceita");
});

test("minInterval: chaves diferentes são independentes", () => {
  assert.equal(minInterval("a", 2000, 0).allowed, true);
  assert.equal(minInterval("b", 2000, 0).allowed, true, "outra chave não é afetada");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { commandData } from "./commands.js";

test("registra só o /lofi-setup", () => {
  assert.equal(commandData.length, 1);
  assert.equal(commandData[0].name, "lofi-setup");
});

test("/lofi-setup tem sala (obrigatória) e estacao (choices), sem canal", () => {
  const opts = commandData[0].options;
  const byName = Object.fromEntries(opts.map((o) => [o.name, o]));
  assert.equal(byName.sala.required, true);
  assert.equal(byName.canal, undefined);
  assert.equal(byName.estacao.choices.length, 5);
});

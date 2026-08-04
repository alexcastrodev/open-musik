import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPanel, BTN_DISCOVER, PANEL_BUTTON_IDS } from "./panel.js";

function findButton(panel, customId) {
  for (const row of panel.components) {
    for (const c of row.components) {
      if (c.data.custom_id === customId) return c.data;
    }
  }
  return null;
}

const playing = { current: { id: "i1", title: "F1" }, upcoming: [] };

test("BTN_DISCOVER está no conjunto de botões do painel", () => {
  assert.ok(PANEL_BUTTON_IDS.has(BTN_DISCOVER));
});

test("OFF: botão secundário (cinza), label 'Sugestões automáticas'", () => {
  const panel = buildPanel({ ...playing, discoverEnabled: false });
  const b = findButton(panel, BTN_DISCOVER);
  assert.ok(b, "botão existe");
  assert.equal(b.label, "Sugestões automáticas");
  assert.equal(b.style, 2 /* Secondary */);
});

test("ON: botão verde (Success), label 'Sugestões ON'", () => {
  const panel = buildPanel({ ...playing, discoverEnabled: true });
  const b = findButton(panel, BTN_DISCOVER);
  assert.equal(b.label, "Sugestões ON");
  assert.equal(b.style, 3 /* Success */);
});

test("sem nada tocando: Discover desabilitado (sugestão deriva da faixa atual)", () => {
  const panel = buildPanel({ current: null, upcoming: [], discoverEnabled: false });
  const b = findButton(panel, BTN_DISCOVER);
  assert.equal(b.disabled, true);
});

test("gestão agrupa ações seguras antes das destrutivas (UX Épico 3)", () => {
  const panel = buildPanel({ current: { id: "i1", title: "F1" }, upcoming: [] });
  const ids = panel.components[1].components.map((c) => c.data.custom_id);
  assert.deepEqual(ids, ["player:lofi", "player:clear", "player:grab", "player:stop", "player:leave"]);
  assert.deepEqual(ids.slice(-2), ["player:stop", "player:leave"]);
});

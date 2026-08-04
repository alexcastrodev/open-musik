import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPanel, BTN_PLAYPAUSE, PANEL_BUTTON_IDS } from "./panel.js";

function findButton(panel, customId) {
  for (const row of panel.components) {
    for (const c of row.components) {
      if (c.data.custom_id === customId) return c.data;
    }
  }
  return null;
}

const playing = { current: { id: "i1", title: "F1" }, upcoming: [] };

test("BTN_PLAYPAUSE está no conjunto de botões do painel", () => {
  assert.ok(PANEL_BUTTON_IDS.has(BTN_PLAYPAUSE));
});

test("tocando: botão secundário (cinza), label 'Pausar'", () => {
  const panel = buildPanel({ ...playing, paused: false });
  const b = findButton(panel, BTN_PLAYPAUSE);
  assert.ok(b, "botão existe");
  assert.equal(b.label, "Pausar");
  assert.equal(b.style, 2 /* Secondary */);
  assert.equal(b.disabled, false);
});

test("pausado: botão verde (Success), label 'Continuar'", () => {
  const panel = buildPanel({ ...playing, paused: true });
  const b = findButton(panel, BTN_PLAYPAUSE);
  assert.equal(b.label, "Continuar");
  assert.equal(b.style, 3 /* Success */);
});

test("sem nada tocando: Pausar desabilitado", () => {
  const panel = buildPanel({ current: null, upcoming: [], paused: false });
  const b = findButton(panel, BTN_PLAYPAUSE);
  assert.equal(b.disabled, true);
});

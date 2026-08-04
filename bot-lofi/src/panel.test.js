import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLofiPanel,
  isLofiButton,
  parseLofiStationValue,
  LOFI_BTN_PREFIX,
  LOFI_BTN_LEAVE,
} from "./panel.js";
import { allStations, resolveStation } from "./stations.js";

test("isLofiButton reconhece só os customIds do painel", () => {
  assert.equal(isLofiButton("lofi:tokyo"), true);
  assert.equal(isLofiButton(LOFI_BTN_LEAVE), true);
  assert.equal(isLofiButton("player:next"), false);
  assert.equal(isLofiButton(undefined), false);
});

test("parseLofiStationValue extrai o value; leave/invalid viram null", () => {
  assert.equal(parseLofiStationValue("lofi:focus"), "focus");
  assert.equal(parseLofiStationValue(LOFI_BTN_LEAVE), null);
  assert.equal(parseLofiStationValue("outro:x"), null);
});

test("buildLofiPanel mostra a estação atual no embed", () => {
  const current = resolveStation("tokyo");
  const { embeds } = buildLofiPanel(current, allStations());
  const embed = embeds[0].toJSON();
  assert.match(embed.description, /Lofi Tokyo/);
  assert.equal(embed.image.url, "attachment://lofi.png");
});

test("buildLofiPanel gera botões de troca (todas menos a atual) + sair", () => {
  const current = resolveStation("tokyo");
  const { components } = buildLofiPanel(current, allStations());
  const row = components[0].toJSON();
  const ids = row.components.map((c) => c.custom_id);
  assert.equal(ids.length, 5);
  assert.ok(!ids.includes(`${LOFI_BTN_PREFIX}tokyo`));
  assert.ok(ids.includes(`${LOFI_BTN_PREFIX}focus`));
  assert.ok(ids.includes(LOFI_BTN_LEAVE));
});

test("buildLofiPanel anexa a capa lofi.png", () => {
  const { files } = buildLofiPanel(resolveStation("akita"), allStations());
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "lofi.png");
});

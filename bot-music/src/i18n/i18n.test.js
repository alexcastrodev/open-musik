import { test } from "node:test";
import assert from "node:assert/strict";
import { t, resolveLocale, DEFAULT_LOCALE } from "./index.js";

test("resolveLocale mapeia o locale do Discord pra nossa base", () => {
  assert.equal(resolveLocale("pt-BR"), "pt");
  assert.equal(resolveLocale("en-US"), "en");
  assert.equal(resolveLocale("en-GB"), "en");
  assert.equal(resolveLocale("fr"), DEFAULT_LOCALE, "não suportado cai no padrão");
  assert.equal(resolveLocale(null), DEFAULT_LOCALE);
  assert.equal(resolveLocale(""), DEFAULT_LOCALE);
});

test("t interpola {placeholders}", () => {
  assert.equal(t("pt", "play.queued", { pos: 3, track: "X" }), "➕ Adicionado à fila (posição 3): X");
  assert.equal(t("en", "play.queued", { pos: 3, track: "X" }), "➕ Added to the queue (position 3): X");
});

test("t traduz por língua", () => {
  assert.equal(t("pt", "play.needVoice"), "🔇 Entra num canal de voz primeiro.");
  assert.equal(t("en", "play.needVoice"), "🔇 Join a voice channel first.");
  assert.notEqual(t("pt", "dj.onlyDjs"), t("en", "dj.onlyDjs"));
});

test("t cai pro pt quando a língua não é suportada", () => {
  assert.equal(t("fr", "queue.empty"), t("pt", "queue.empty"));
});

test("t devolve a própria chave quando ela não existe", () => {
  assert.equal(t("pt", "nao.existe"), "nao.existe");
});

test("placeholder sem valor fica literal (não quebra)", () => {
  assert.equal(t("pt", "play.nowMine", {}), "▶️ Tocando agora: {track}");
});

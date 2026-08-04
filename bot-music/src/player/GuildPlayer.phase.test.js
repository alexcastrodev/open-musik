import { test } from "node:test";
import assert from "node:assert/strict";

const { GuildPlayer } = await import("./GuildPlayer.js");

function makeGp() {
  const api = {
    advanceGuild: async () => ({ playable: null, item: null }),
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
    getItemStatus: async () => ({ cached_url: null }),
    stopGuild: async () => {},
  };
  const gp = new GuildPlayer("g1", { api });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.refreshPanel = () => {};
  gp.player = { play() {}, stop() {}, state: { status: "idle" } };
  return gp;
}

test("fases são exclusivas: entrar numa derruba a anterior", () => {
  const gp = makeGp();
  assert.equal(gp.phase, "none");

  gp.transitioning = true;
  assert.equal(gp.phase, "transitioning");

  gp.awaitingCache = true;
  assert.equal(gp.phase, "awaiting_cache");
  assert.equal(gp.transitioning, false, "sair de transitioning foi implícito");

  gp.keptIdle = true;
  assert.equal(gp.phase, "kept_idle");
  assert.equal(gp.awaitingCache, false);

  gp.idleEmpty = true;
  assert.equal(gp.phase, "idle_empty");
  assert.equal(gp.keptIdle, false);
  gp.stopAndDisconnect();
});

test("setar false só sai da PRÓPRIA fase (não pisa numa fase diferente)", () => {
  const gp = makeGp();
  gp.transitioning = true;

  gp.awaitingCache = false;
  gp.keptIdle = false;
  gp.idleEmpty = false;
  assert.equal(gp.phase, "transitioning", "fase atual intacta");

  gp.transitioning = false;
  assert.equal(gp.phase, "none", "sair da própria fase volta pro neutro");
  gp.stopAndDisconnect();
});

test("REGRESSÃO: stopKeep durante a espera de cache não deixa awaitingCache obsoleto", () => {
  const gp = makeGp();
  gp.awaitingCache = true;

  gp.stopKeep();

  assert.equal(gp.keptIdle, true, "entrou na permanência do Parar");
  assert.equal(gp.awaitingCache, false, "a espera de cache MORREU junto (exclusividade)");
  gp.stopAndDisconnect();
});

test("stopAndDisconnect zera a máquina de qualquer fase", () => {
  for (const enter of ["transitioning", "awaitingCache", "keptIdle", "idleEmpty"]) {
    const gp = makeGp();
    gp[enter] = true;
    gp.stopAndDisconnect();
    assert.equal(gp.phase, "none", `saiu limpo a partir de ${enter}`);
  }
});

test("fluxo real: advance com fila vazia termina em idle_empty (não em transitioning)", async () => {
  const gp = makeGp();
  gp.handleIdle();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(gp.phase, "idle_empty");
  assert.equal(gp.transitioning, false);
  gp.stopAndDisconnect();
});

import { test } from "node:test";
import assert from "node:assert/strict";

const { GuildPlayer } = await import("./GuildPlayer.js");

test("push (advance/skip) pra a faixa já em resolução não dispara 2º #playUrl", async () => {
  let itemStatusCalls = 0;
  const api = {
    getItemStatus: async () => { itemStatusCalls++; return {}; },
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.pendingItemId = "X";
  gp.current = null;
  const genBefore = gp.playGen;

  await gp.handleQueueEvent({ origin: "other", type: "advance", current_id: "X" });

  assert.equal(itemStatusCalls, 0, "não buscou o item (guard de pendingItemId barrou antes)");
  assert.equal(gp.playGen, genBefore, "não bumpou o playGen (nenhum #playUrl novo)");
});

test("poll (skip externo) pra a faixa já em resolução não dispara 2º #playUrl", async () => {
  let itemStatusCalls = 0;
  const api = {
    getGuildQueue: async () => ({ current: { id: "B" }, upcoming: [{ id: "B" }] }),
    getItemStatus: async () => { itemStatusCalls++; return {}; },
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = { item: { id: "A" } };
  gp.pendingItemId = "B";
  const genBefore = gp.playGen;

  await gp.syncNow();

  assert.equal(itemStatusCalls, 0, "não buscou o item (guard de pendingItemId barrou o skip externo)");
  assert.equal(gp.playGen, genBefore, "não bumpou o playGen");
});

test("faixa DIFERENTE da que está em resolução não é barrada pelo guard", async () => {
  let itemStatusCalls = 0;
  const api = {
    getGuildQueue: async () => ({ current: { id: "C" }, upcoming: [{ id: "C" }] }),
    getItemStatus: async () => { itemStatusCalls++; throw new Error("para o teste aqui"); },
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = { item: { id: "A" } };
  gp.pendingItemId = "B";

  await gp.syncNow();

  assert.equal(itemStatusCalls, 1, "faixa diferente passou pelo guard e foi buscada");
});

test("REPRO DO BUG: fila vazia por race (item ainda não visível no Rails) não desconecta enquanto resolve", async () => {
  const stopCalls = [];
  const api = {
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = null;
  gp.pendingItemId = "novo-item-ainda-nao-commitado";
  gp.stopAndDisconnect = () => { stopCalls.push(true); };

  await gp.syncNow();

  assert.equal(stopCalls.length, 0, "não desconecta: há um play em resolução (pendingItemId setado)");
});


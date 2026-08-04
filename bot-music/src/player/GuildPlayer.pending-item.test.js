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


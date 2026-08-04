import { test } from "node:test";
import assert from "node:assert/strict";

const { GuildPlayer } = await import("./GuildPlayer.js");

function makeGp(over = {}) {
  let queueCalls = 0;
  const api = {
    getGuildQueue: async () => {
      queueCalls++;
      return { current: { id: "i-1", title: "Atual" }, upcoming: [] };
    },
    getItemStatus: async () => ({ cached_url: null }),
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.player = { play() {}, stop() {}, state: { status: "idle" } };
  gp.current = { item: { id: "i-1" }, ffmpeg: { kill: () => {} } };
  return { gp, getQueueCalls: () => queueCalls };
}

test("um tick de sync faz só 1 GET de fila e repassa pro refreshPanel (sem 2º GET)", async () => {
  const refreshCalls = [];
  const { gp, getQueueCalls } = makeGp();
  gp.refreshPanel = (guildId, channelId, queue) => {
    refreshCalls.push({ guildId, channelId, queue });
  };

  await gp.syncNow();

  assert.equal(getQueueCalls(), 1, "só 1 GET /queue no tick inteiro (sync + painel)");
  assert.equal(refreshCalls.length, 1, "refreshPanel chamado 1x");
  assert.ok(refreshCalls[0].queue, "refreshPanel recebeu a fila já buscada (não null)");
  assert.equal(refreshCalls[0].queue.current.id, "i-1");
});

test("sem nada a redesenhar (transitioning), refreshPanel nem é chamado", async () => {
  const refreshCalls = [];
  const { gp, getQueueCalls } = makeGp();
  gp.refreshPanel = (...args) => refreshCalls.push(args);
  gp.transitioning = true;

  await gp.syncNow();

  assert.equal(getQueueCalls(), 0, "nem chega a buscar a fila (curto-circuita antes)");
  assert.equal(refreshCalls.length, 0, "não repinta durante uma troca local em curso");
});

import { test } from "node:test";
import assert from "node:assert/strict";

const { GuildPlayer } = await import("./GuildPlayer.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGp(over = {}) {
  const api = {
    advanceGuild: async () => ({ playable: null, item: null }),
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
    getItemStatus: async () => ({ cached_url: null }),
    stopGuild: async () => {},
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.refreshPanel = () => {};
  gp.player = { play() {}, stop() {}, state: { status: "idle" } };
  return { gp };
}

test("música acaba e fila fica vazia: NÃO sai imediatamente (sync respeita permanência)", async () => {
  let disconnected = 0;
  const { gp } = makeGp();
  gp.stopAndDisconnect = () => { disconnected++; return true; };

  gp.handleIdle();
  await sleep(20);
  assert.equal(gp.idleEmpty, true, "marcou permanência por fila vazia");

  await gp.syncNow();
  assert.equal(disconnected, 0, "não saiu do canal ao esvaziar a fila naturalmente");

  GuildPlayer.prototype.stopAndDisconnect.call(gp);
});

test("tocar algo novo zera idleEmpty", async () => {
  const { gp } = makeGp();
  gp.handleIdle();
  await sleep(20);
  assert.equal(gp.idleEmpty, true);

  gp.applySkip(
    { item_id: "m-1", cached_url: "http://127.0.0.1:1/m1.opus", audio_format: "opus" },
    { id: "m-1", title: "Nova" },
  );
  await sleep(20);
  assert.equal(gp.idleEmpty, false, "saiu do estado de inatividade");

  gp.stopAndDisconnect();
});

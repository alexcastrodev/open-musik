import { test } from "node:test";
import assert from "node:assert/strict";

const { GuildPlayer } = await import("./GuildPlayer.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGp(over = {}) {
  const api = {
    advanceGuild: async () => { throw new Error("Rails indisponível"); },
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.refreshPanel = () => {};
  gp.player = { play() {}, stop() {}, state: { status: "idle" } };
  return { gp };
}

test("advanceGuild falhando não deixa transitioning preso em true", async () => {
  const { gp } = makeGp();

  gp.handleIdle();
  await sleep(20);

  assert.equal(gp.transitioning, false, "transitioning voltou a false mesmo com o advance falhando");
});

test("depois de um advance falho, o sync volta a reagir normalmente (não fica surdo/mudo)", async () => {
  let disconnected = 0;
  const { gp } = makeGp();
  gp.stopAndDisconnect = () => { disconnected++; return true; };

  gp.handleIdle();
  await sleep(20);
  assert.equal(gp.transitioning, false);

  gp.current = { item: { id: "i-1" }, ffmpeg: { kill: () => {} } };
  await gp.syncNow();
  assert.equal(disconnected, 1, "sync voltou a reagir à fila vazia (stop externo)");
});

import { test } from "node:test";
import assert from "node:assert/strict";

const { PlayerManager } = await import("./PlayerManager.js");

function makePool() {
  const released = [];
  return {
    released,
    releaseMe(guildId, channelId) { released.push([guildId, channelId]); },
    registerPresence() {},
  };
}

function playing(pm, guildId) {
  const p = pm.get(guildId);
  const killed = { n: 0 };
  p.connection = { joinConfig: { channelId: `c-${guildId}` }, destroy() {} };
  p.current = { item: { id: `i-${guildId}` }, ffmpeg: { kill: () => { killed.n++; } } };
  p.player = { stop() {}, state: { status: "playing" } };
  return killed;
}

test("stopAll encerra todos os players (mata ffmpeg + libera slot) e esvazia o Map", () => {
  const pool = makePool();
  const pm = new PlayerManager({ api: {}, botPool: pool, ownClientId: "me" });

  const k1 = playing(pm, "g1");
  const k2 = playing(pm, "g2");
  assert.equal(pm.players.size, 2);

  pm.stopAll();

  assert.equal(k1.n, 1, "ffmpeg/yt-dlp do g1 morto");
  assert.equal(k2.n, 1, "ffmpeg/yt-dlp do g2 morto");
  assert.equal(pool.released.length, 2, "slot liberado (releaseMe) pros dois guilds");
  assert.equal(pm.players.size, 0, "onLeave removeu todos os players do Map");
});

test("stopAll é seguro sem players", () => {
  const pm = new PlayerManager({ api: {}, botPool: makePool(), ownClientId: "me" });
  pm.stopAll();
  assert.equal(pm.players.size, 0);
});

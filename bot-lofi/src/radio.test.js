import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { VoiceConnectionStatus } from "@discordjs/voice";
import { RadioSession, RadioManager } from "./radio.js";

function makeFakes() {
  const killed = [];
  const players = [];

  const fakeConnection = Object.assign(new EventEmitter(), {
    joinConfig: {},
    state: { status: VoiceConnectionStatus.Ready },
    subscribe() {},
    destroy() { this.destroyed = true; },
  });

  const opts = {
    join(config) {
      fakeConnection.joinConfig = config;
      return fakeConnection;
    },
    openStream(url) {
      const rec = { url, killed: false };
      killed.push(rec);
      return { stream: { url }, kill: () => { rec.killed = true; } };
    },
    createPlayer() {
      const p = Object.assign(new EventEmitter(), {
        played: [],
        play(r) { this.played.push(r); },
        stop() { this.stopped = true; },
      });
      players.push(p);
      return p;
    },
    createResource(stream) {
      return { stream };
    },
  };

  return { opts, killed, players, fakeConnection };
}

function fakeVoiceChannel(guildId = "g1", channelId = "v1") {
  return { id: channelId, guild: { id: guildId, voiceAdapterCreator: () => {} } };
}

test("start resolve a estação, conecta e toca", async () => {
  const { opts, killed, players, fakeConnection } = makeFakes();
  const session = new RadioSession("g1", opts);
  const station = await session.start(fakeVoiceChannel(), "tokyo");

  assert.equal(station.value, "tokyo");
  assert.equal(session.channelId, "v1");
  assert.equal(fakeConnection.joinConfig.selfDeaf, true);
  assert.equal(killed.length, 1);
  assert.match(killed[0].url, /tokyo\.opus$/);
  assert.equal(players[0].played.length, 1);
});

test("start com estação inválida lança", async () => {
  const { opts } = makeFakes();
  const session = new RadioSession("g1", opts);
  await assert.rejects(() => session.start(fakeVoiceChannel(), "nope"), /inválida/);
});

test("switchStation mata o stream anterior e toca o novo", async () => {
  const { opts, killed, players } = makeFakes();
  const session = new RadioSession("g1", opts);
  await session.start(fakeVoiceChannel(), "tokyo");
  const s = session.switchStation("focus");

  assert.equal(s.value, "focus");
  assert.equal(killed[0].killed, true);
  assert.equal(killed.length, 2);
  assert.match(killed[1].url, /focus\.opus$/);
  assert.equal(players[0].played.length, 2);
});

test("player Idle reabre a mesma estação (rádio contínua)", async () => {
  const { opts, killed, players } = makeFakes();
  const session = new RadioSession("g1", opts);
  await session.start(fakeVoiceChannel(), "tokyo");
  players[0].emit(VoiceConnectionStatus.Ready);
  players[0].emit("idle");

  assert.equal(killed.length, 2);
  assert.match(killed[1].url, /tokyo\.opus$/);
});

test("destroy mata stream, para player e desconecta", async () => {
  const { opts, killed, players, fakeConnection } = makeFakes();
  const session = new RadioSession("g1", opts);
  await session.start(fakeVoiceChannel(), "tokyo");
  session.destroy();

  assert.equal(killed[0].killed, true);
  assert.equal(players[0].stopped, true);
  assert.equal(fakeConnection.destroyed, true);
  assert.equal(session.destroyed, true);
});

test("Idle após destroy é no-op (não reabre)", async () => {
  const { opts, killed, players } = makeFakes();
  const session = new RadioSession("g1", opts);
  await session.start(fakeVoiceChannel(), "tokyo");
  session.destroy();
  players[0].emit("idle");
  assert.equal(killed.length, 1);
});

test("RadioManager roteia start/switch/stop por guild", async () => {
  const { opts } = makeFakes();
  const mgr = new RadioManager(opts);
  await mgr.start(fakeVoiceChannel("g1", "v1"), "tokyo");

  assert.ok(mgr.get("g1"));
  assert.equal(mgr.switchStation("g1", "anime").value, "anime");
  assert.equal(mgr.switchStation("gX", "anime"), null);
  assert.equal(mgr.stop("g1"), true);
  assert.equal(mgr.get("g1"), null);
  assert.equal(mgr.stop("g1"), false);
});

test("RadioManager.start com falha não deixa sessão órfã", async () => {
  const { opts } = makeFakes();
  opts.join = () => { throw new Error("boom"); };
  const mgr = new RadioManager(opts);
  await assert.rejects(() => mgr.start(fakeVoiceChannel(), "tokyo"), /boom/);
  assert.equal(mgr.get("g1"), null);
});

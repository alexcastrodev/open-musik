import { test } from "node:test";
import assert from "node:assert/strict";

const { GuildPlayer } = await import("./GuildPlayer.js");

function makeFakeConnection() {
  const listeners = {};
  return {
    joinConfig: { channelId: null },
    state: { status: "ready" },
    on(event, fn) {
      (listeners[event] ??= []).push(fn);
    },
    removeListener(event, fn) {
      const arr = listeners[event];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    subscribe() {},
    destroy() {},
    _count(event) {
      return listeners[event]?.length ?? 0;
    },
  };
}

function voiceChannel(id) {
  return { id, guild: { id: "g1", voiceAdapterCreator() {} } };
}

test("trocar de canal não acumula listeners na VoiceConnection reusada", async () => {
  const conn = makeFakeConnection();
  const join = ({ channelId }) => {
    conn.joinConfig.channelId = channelId;
    return conn;
  };

  const api = { getGuildQueue: async () => ({ current: { id: "pre" }, upcoming: [] }) };
  const gp = new GuildPlayer("g1", { api, join });
  gp.current = { item: { id: "pre" } };

  await gp.ensureConnectedAndPlay(voiceChannel("c1"), null, { id: "pre" });
  assert.equal(conn._count("stateChange"), 1, "1 listener após o 1º join");
  assert.equal(conn._count("error"), 1);
  assert.equal(conn._count("disconnected"), 1);

  await gp.ensureConnectedAndPlay(voiceChannel("c2"), null, { id: "pre" });
  assert.equal(conn._count("stateChange"), 1, "ainda 1 listener após trocar de canal (não acumulou)");
  assert.equal(conn._count("error"), 1);
  assert.equal(conn._count("disconnected"), 1);

  await gp.ensureConnectedAndPlay(voiceChannel("c3"), null, { id: "pre" });
  assert.equal(conn._count("stateChange"), 1);

  gp.stopAndDisconnect();
  assert.equal(conn._count("stateChange"), 0, "listeners removidos ao sair do canal");
  assert.equal(conn._count("error"), 0);
  assert.equal(conn._count("disconnected"), 0);
});

test("reconectar no MESMO canal não adiciona listeners (reuso via guard)", async () => {
  const conn = makeFakeConnection();
  const join = ({ channelId }) => {
    conn.joinConfig.channelId = channelId;
    return conn;
  };
  const api = { getGuildQueue: async () => ({ current: { id: "pre" }, upcoming: [] }) };
  const gp = new GuildPlayer("g1", { api, join });
  gp.current = { item: { id: "pre" } };

  await gp.ensureConnectedAndPlay(voiceChannel("c1"), null, { id: "pre" });
  await gp.ensureConnectedAndPlay(voiceChannel("c1"), null, { id: "pre" });
  assert.equal(conn._count("stateChange"), 1, "mesmo canal reusa a conexão sem reanexar");

  gp.stopAndDisconnect();
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioPlayerStatus } from "@discordjs/voice";

const { GuildPlayer } = await import("./GuildPlayer.js");

test("REPRO DO BUG: fila vazia (Rails assíncrono/atrasado) não desconecta enquanto o player está tocando localmente", async () => {
  const stopCalls = [];
  const api = {
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = { item: { id: "A" } };
  gp.player = { state: { status: AudioPlayerStatus.Playing } };
  gp.pendingItemId = null;
  gp.stopAndDisconnect = () => { stopCalls.push(true); };

  await gp.syncNow();
  await gp.syncNow();
  await gp.syncNow();
  await gp.syncNow();

  assert.equal(stopCalls.length, 0, "player tocando localmente é a fonte de verdade: fila vazia da API é ignorada, mesmo repetida");
});

test("fila vazia SEM player tocando localmente desconecta (não é mais lag, é parada real)", async () => {
  const stopCalls = [];
  const api = {
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = { item: { id: "A" } };
  gp.player = { state: { status: AudioPlayerStatus.Idle } };
  gp.pendingItemId = null;
  gp.stopAndDisconnect = () => { stopCalls.push(true); };

  await gp.syncNow();

  assert.equal(stopCalls.length, 1, "sem áudio tocando localmente, fila vazia externamente ainda desconecta na hora");
});

test("fila vazia sem `current` local nem player tocando desconecta normalmente", async () => {
  const stopCalls = [];
  const api = {
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = null;
  gp.player = null;
  gp.pendingItemId = null;
  gp.stopAndDisconnect = () => { stopCalls.push(true); };

  await gp.syncNow();

  assert.equal(stopCalls.length, 1, "sem current e sem player, conexão órfã é encerrada");
});


import { test, before } from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { BotCore } from "./BotCore.js";
import { ValkeyBus } from "../valkey/ValkeyBus.js";
import { GuildPlayer } from "../player/GuildPlayer.js";

const URL = process.env.BOT_VALKEY_TEST_URL ?? process.env.BOT_VALKEY_URL ?? "redis://localhost:16379/0";

let available = false;
before(async () => {
  const probe = new Redis(URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try { await probe.connect(); await probe.ping(); available = true; }
  catch { available = false; }
  finally { probe.disconnect(); }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (fn()) return true; await sleep(20); }
  return false;
}

function frontApi() {
  return {
    clientId: "front",
    stopGuild: async () => ({ stopped: true }),
    clearAllGuild: async () => ({}),
    skipGuild: async () => ({ skipped: true, has_current: true, playable: { item_id: "i-2" }, item: { id: "i-2", title: "F2" } }),
    getGuildQueue: async () => ({ current: { id: "i-2", title: "F2" }, upcoming: [] }),
  };
}

const okAcker = { ack: async () => true };
const noThrottle = { isDuplicate: () => false, checkRate: () => ({ allowed: true }) };

const btn = (over = {}) => ({
  guildId: "gpub", customId: "player:leave", userId: "u1", userTag: "a#1",
  voiceChannelId: "c1", voiceChannelName: "Geral", panelRef: "p", replyToken: "t", ...over,
});

test("front clica Sair → publica stop no Valkey → bot dono desconecta", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);

  const busOwner = new ValkeyBus({ url: URL, enabled: true });
  busOwner.connect();
  await sleep(250);
  const owner = new GuildPlayer("gpub", { api: {}, bus: busOwner, ownClientId: "owner" });
  owner.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  owner.current = { item: { id: "i-1" } };
  let disconnected = false;
  owner.stopAndDisconnect = () => { disconnected = true; owner.connection = null; return true; };
  owner.queueEventHandler = (msg) => owner.handleQueueEvent(msg);
  busOwner.subscribe("gpub", "c1", owner.queueEventHandler);
  await sleep(100);

  const busFront = new ValkeyBus({ url: URL, enabled: true });
  busFront.connect();
  await sleep(150);
  const playerPortFake = { playingInChannel: () => false, stopAndDisconnect: () => false };
  const core = new BotCore({
    api: frontApi(), player: playerPortFake, acker: okAcker,
    bus: busFront, ownClientId: "front", throttle: noThrottle,
  });

  await core.dispatchButton(btn({ customId: "player:leave" }));

  await waitFor(() => disconnected);
  assert.ok(disconnected, "bot dono desconectou via pub/sub do Valkey");

  busFront.close(); busOwner.close();
});

test("front clica Próxima → publica skip → bot dono troca de faixa", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);

  const busOwner = new ValkeyBus({ url: URL, enabled: true });
  busOwner.connect();
  await sleep(250);
  let statusCalls = 0;
  const owner = new GuildPlayer("gpub2", {
    api: { getItemStatus: async () => { statusCalls++; return {}; } },
    bus: busOwner, ownClientId: "owner",
  });
  owner.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  owner.current = { item: { id: "i-1" } };
  const genBefore = owner.playGen;
  owner.queueEventHandler = (msg) => owner.handleQueueEvent(msg);
  busOwner.subscribe("gpub2", "c1", owner.queueEventHandler);
  await sleep(100);

  const busFront = new ValkeyBus({ url: URL, enabled: true });
  busFront.connect();
  await sleep(150);
  const api = {
    clientId: "front",
    skipGuild: async () => ({ skipped: true, has_current: true, playable: { item_id: "i-2", cached_url: "http://127.0.0.1:1/i2.opus", audio_format: "opus" }, item: { id: "i-2", title: "F2" } }),
    getGuildQueue: async () => ({ current: { id: "i-2", title: "F2" }, upcoming: [] }),
  };
  const core = new BotCore({
    api, player: { playingInChannel: () => false }, acker: okAcker,
    bus: busFront, ownClientId: "front", throttle: noThrottle,
  });

  await core.dispatchButton({ guildId: "gpub2", customId: "player:next", userId: "u1", userTag: "a#1", voiceChannelId: "c1", voiceChannelName: "G", panelRef: "p", replyToken: "t" });

  await waitFor(() => owner.playGen > genBefore);
  assert.ok(owner.playGen > genBefore, "dono trocou de faixa via skip do Valkey");
  assert.equal(statusCalls, 0, "playable embutido → dono não bateu no Rails");

  busFront.close(); busOwner.close();
});

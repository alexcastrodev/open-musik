
import { test, before } from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { BotPool } from "../pool/BotPool.js";
import { GuildPlayer } from "./GuildPlayer.js";

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
  while (Date.now() < deadline) { if (await fn()) return true; await sleep(20); }
  return false;
}

async function makePlaying(guildId, { ownClientId = "botA", onLeave = null } = {}) {
  const pool = new BotPool({ url: URL, ownClientId, enabled: true });
  pool.connect();
  await sleep(120);
  await pool.registerPresence(guildId, { voiceChannelId: "c1", available: false });
  await pool.tryClaim(guildId, "c1");

  const gp = new GuildPlayer(guildId, { api: {}, botPool: pool, ownClientId, onLeave });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = { item: { id: "i-1" } };

  const freed = async () =>
    (await pool.freeBots(guildId)).includes(ownClientId) &&
    (await pool.botOnChannel(guildId, "c1")) === null;

  return { gp, pool, freed };
}

test("1) botão Sair (stopAndDisconnect) libera o slot na hora", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "lv-leave";
  const { gp, pool, freed } = await makePlaying(g);

  gp.stopAndDisconnect();
  assert.ok(await waitFor(freed), "slot liberado (free + canal zerado + claim solto)");
  assert.equal(await pool.tryClaim(g, "c1"), true, "canal disputável de novo");
  pool.close();
});

test("2) stop de outro bot (pub/sub → handleQueueEvent) libera o slot", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "lv-stop";
  const { gp, pool, freed } = await makePlaying(g);

  await gp.handleQueueEvent({ origin: "outroBot", type: "stop" });
  assert.ok(await waitFor(freed), "slot liberado após stop externo");
  pool.close();
});

test("3) sai sozinho quando o canal fica vazio (requestLeaveGrace) libera o slot", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const prev = process.env.EMPTY_CHANNEL_GRACE_MS;
  process.env.EMPTY_CHANNEL_GRACE_MS = "50";
  const { GuildPlayer: GP } = await import(`./GuildPlayer.js?grace=${Date.now()}`);
  const g = "lv-alone";
  const pool = new BotPool({ url: URL, ownClientId: "botA", enabled: true });
  pool.connect();
  await sleep(120);
  await pool.registerPresence(g, { voiceChannelId: "c1", available: false });
  await pool.tryClaim(g, "c1");
  const gp = new GP(g, { api: { stopGuild: async () => ({}) }, botPool: pool, ownClientId: "botA" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = { item: { id: "i-1" } };

  gp.requestLeaveGrace();
  const freed = async () =>
    (await pool.freeBots(g)).includes("botA") && (await pool.botOnChannel(g, "c1")) === null;
  assert.ok(await waitFor(freed), "slot liberado após sair por canal vazio");

  if (prev === undefined) delete process.env.EMPTY_CHANNEL_GRACE_MS;
  else process.env.EMPTY_CHANNEL_GRACE_MS = prev;
  pool.close();
});

test("4) moderador remove do canal (handleHardDisconnect) libera o slot — o bug original", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "lv-kick";
  let onLeaveFired = false;
  const { gp, pool, freed } = await makePlaying(g, { onLeave: () => { onLeaveFired = true; } });

  gp.handleHardDisconnect(gp.connection);

  assert.ok(await waitFor(freed), "slot liberado após kick por moderador");
  assert.ok(onLeaveFired, "onLeave disparou (religa o pool) — não vira mais zumbi");
  assert.equal(await pool.tryClaim(g, "c1"), true, "canal disputável de novo");
  pool.close();
});

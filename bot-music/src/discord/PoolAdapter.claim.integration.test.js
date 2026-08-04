
import { test, before } from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { BotPool } from "../pool/BotPool.js";
import { PoolAdapter } from "./PoolAdapter.js";

const URL = process.env.BOT_VALKEY_TEST_URL ?? process.env.BOT_VALKEY_URL ?? "redis://localhost:16379/0";

let available = false;
before(async () => {
  const probe = new Redis(URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try { await probe.connect(); await probe.ping(); available = true; }
  catch { available = false; }
  finally { probe.disconnect(); }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeClient(guildId) {
  const channel = { id: "c1", name: "Geral", isVoiceBased: () => true };
  const guild = { id: guildId, channels: { cache: new Map([["c1", channel]]) } };
  return { guilds: { cache: new Map([[guildId, guild]]) } };
}
function fakeApi() {
  return { getItemStatus: async () => ({ item: { id: "i-1", title: "F1", candidates: [] }, cached_url: null, audio_format: null }) };
}
const fakeRefs = { put: () => "vc-ref" };

test("dois PoolAdapters disputam um trabalho → exatamente um assume", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "pa-race";

  const publisher = new BotPool({ url: URL, ownClientId: "publisher", enabled: true });
  publisher.connect();
  await sleep(120);
  await publisher.releaseChannel(g, "c1");
  await publisher.publishWork(g, "c1", "i-1");

  let assumed = 0;
  const core = { dispatchAssignmentWon: async () => { assumed++; throw new Error("sem canal de voz no teste"); } };

  const pools = [];
  const mkAdapter = (clientId) => {
    const pool = new BotPool({ url: URL, ownClientId: clientId, enabled: true });
    pool.connect();
    pools.push(pool);
    return new PoolAdapter({
      client: fakeClient(g), api: fakeApi(), core, botPool: pool, refRegistry: fakeRefs,
      isBusy: () => false, logger: { error() {}, warn() {} },
    });
  };

  const a = mkAdapter("botA");
  const b = mkAdapter("botB");
  await sleep(120);

  a.start();
  b.start();
  await sleep(800);
  a.stop(); b.stop();

  assert.equal(assumed, 1, "exatamente um bot venceu o claim e assumiu (sem double-play)");

  assert.equal(await publisher.tryClaim(g, "c1"), true, "canal liberado após o reject do vencedor");

  publisher.close();
  pools.forEach((p) => p.close());
});

test("trabalho de LO-FI: dois adapters disputam → exatamente um assume (lofi)", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "pa-race-lofi";

  const publisher = new BotPool({ url: URL, ownClientId: "publisher", enabled: true });
  publisher.connect();
  await sleep(120);
  await publisher.releaseChannel(g, "c1");
  await publisher.publishWork(g, "c1", null, "tc-1", { kind: "lofi", station: { value: "tokyo" } });

  let assumedLofi = 0;
  const core = { dispatchLofiAssignmentWon: async () => { assumedLofi++; throw new Error("sem canal de voz no teste"); } };

  const pools = [];
  const mkAdapter = (clientId) => {
    const pool = new BotPool({ url: URL, ownClientId: clientId, enabled: true });
    pool.connect();
    pools.push(pool);
    return new PoolAdapter({
      client: fakeClient(g), api: fakeApi(), core, botPool: pool, refRegistry: fakeRefs,
      isBusy: () => false, logger: { error() {}, warn() {} },
    });
  };

  const a = mkAdapter("botA");
  const b = mkAdapter("botB");
  await sleep(120);
  a.start();
  b.start();
  await sleep(800);
  a.stop(); b.stop();

  assert.equal(assumedLofi, 1, "exatamente um bot assumiu o lo-fi (sem double-play)");
  assert.equal(await publisher.tryClaim(g, "c1"), true, "canal liberado após o reject do vencedor");

  publisher.close();
  pools.forEach((p) => p.close());
});

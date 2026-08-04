
import { test, before } from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { BotPool, WORK_PUBLISHED_CHANNEL } from "./BotPool.js";

const URL = process.env.BOT_VALKEY_TEST_URL ?? process.env.BOT_VALKEY_URL ?? "redis://localhost:16379/0";

let available = false;
before(async () => {
  const probe = new Redis(URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try { await probe.connect(); await probe.ping(); available = true; }
  catch { available = false; }
  finally { probe.disconnect(); }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function mkPool(clientId) {
  const p = new BotPool({ url: URL, ownClientId: clientId, enabled: true });
  p.connect();
  return p;
}

test("registerPresence(available) → freeBots inclui o bot; botOnChannel reflete o canal", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "bp-pres";
  const pool = mkPool("botA");
  await sleep(150);

  await pool.registerPresence(g, { available: true });
  assert.deepEqual(await pool.freeBots(g), ["botA"], "livre aparece em freeBots");

  await pool.registerPresence(g, { voiceChannelId: "c1", available: false });
  assert.equal(await pool.botOnChannel(g, "c1"), "botA", "botOnChannel acha o bot no canal");
  assert.deepEqual(await pool.freeBots(g), [], "ocupado sai de freeBots");

  pool.close();
});

test("tryClaim é o árbitro único: primeiro true, segundo false (corrida de 2 bots)", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "bp-claim";
  const a = mkPool("botA");
  const b = mkPool("botB");
  await sleep(150);
  await a.releaseChannel(g, "c1");

  const wonA = await a.tryClaim(g, "c1");
  const wonB = await b.tryClaim(g, "c1");
  assert.equal(wonA, true, "primeiro reivindica");
  assert.equal(wonB, false, "segundo perde a disputa do mesmo canal");

  a.close(); b.close();
});

test("publishWork → pendingWork devolve o trabalho; some quando reivindicado", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "bp-work";
  const pool = mkPool("botA");
  await sleep(150);
  await pool.releaseChannel(g, "c1");

  await pool.publishWork(g, "c1", "item-9", "tc-9");
  assert.deepEqual(await pool.pendingWork(g), { channelId: "c1", kind: "track", itemId: "item-9", textChannelId: "tc-9", station: null }, "trabalho de faixa pendente");

  await pool.tryClaim(g, "c1");
  assert.equal(await pool.pendingWork(g), null, "reivindicado → não é mais pendente");

  pool.close();
});

test("publishWork de LO-FI: pendingWork devolve kind=lofi + station (sem item)", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "bp-lofi";
  const pool = mkPool("botA");
  await sleep(150);
  await pool.releaseChannel(g, "c1");

  await pool.publishWork(g, "c1", null, "tc-1", { kind: "lofi", station: { value: "tokyo" } });
  assert.deepEqual(await pool.pendingWork(g), {
    channelId: "c1", kind: "lofi", itemId: null, textChannelId: "tc-1", station: { value: "tokyo" },
  }, "trabalho de lo-fi pendente com a estação");

  pool.close();
});

test("releaseChannel apaga claim + work", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "bp-rel";
  const pool = mkPool("botA");
  await sleep(150);

  await pool.publishWork(g, "c1", "item-1");
  await pool.tryClaim(g, "c1");
  await pool.releaseChannel(g, "c1");

  assert.equal(await pool.pendingWork(g), null, "work apagado");
  assert.equal(await pool.tryClaim(g, "c1"), true, "claim apagado → dá pra reivindicar de novo");

  pool.close();
});

test("releaseMe: volta pra free, zera o canal na presença e solta o claim (libera o slot na hora)", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "bp-me";
  const pool = mkPool("botA");
  await sleep(150);

  await pool.registerPresence(g, { voiceChannelId: "c1", available: false });
  await pool.tryClaim(g, "c1");
  assert.equal(await pool.botOnChannel(g, "c1"), "botA");
  assert.deepEqual(await pool.freeBots(g), []);

  await pool.releaseMe(g, "c1");

  assert.deepEqual(await pool.freeBots(g), ["botA"], "voltou pra freeBots");
  assert.equal(await pool.botOnChannel(g, "c1"), null, "canal zerado na presença");
  assert.equal(await pool.tryClaim(g, "c1"), true, "claim liberado → canal disputável de novo");

  pool.close();
});

test("publishWork ANUNCIA no work:published (acorda bots livres sem esperar o poll)", async (t) => {
  if (!available) return t.skip(`sem bot-cache em ${URL}`);
  const g = "bp-pub";
  const pool = mkPool("botA");

  const sub = new Redis(URL);
  const got = new Promise((resolve) => {
    sub.on("message", (ch, payload) => resolve({ ch, payload }));
  });
  await sub.subscribe(WORK_PUBLISHED_CHANNEL);
  await sleep(150);

  await pool.publishWork(g, "c7", "item-77", "txt-1");

  const { ch, payload } = await got;
  assert.equal(ch, WORK_PUBLISHED_CHANNEL);
  const msg = JSON.parse(payload);
  assert.equal(msg.guild_id, g, "evento carrega o guild do trabalho");
  assert.equal(msg.channel_id, "c7", "e o canal");
  const work = await pool.pendingWork(g);
  assert.equal(work?.channelId, "c7", "quem acorda já acha o trabalho publicado");

  await pool.releaseChannel(g, "c7");
  sub.disconnect();
  pool.close();
});

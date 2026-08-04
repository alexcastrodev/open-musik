
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { ValkeyBus, queueChannel } from "./ValkeyBus.js";

const URL = process.env.BOT_VALKEY_TEST_URL ?? process.env.BOT_VALKEY_URL ?? "redis://localhost:16379/0";

let available = false;
before(async () => {
  const probe = new Redis(URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  try {
    await probe.connect();
    await probe.ping();
    available = true;
  } catch {
    available = false;
  } finally {
    probe.disconnect();
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await sleep(20);
  }
  return false;
}

test("publish de um bus chega no subscribe de outro (roundtrip real)", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const pub = new ValkeyBus({ url: URL, enabled: true });
  const sub = new ValkeyBus({ url: URL, enabled: true });
  pub.connect(); sub.connect();
  await sleep(250);

  const got = [];
  sub.subscribe("gi", "ci", (m) => got.push(m));
  await sleep(100);

  pub.publish("gi", "ci", { origin: "botA", ts: 1, type: "skip", current_id: "x" });
  await waitFor(() => got.length > 0);

  assert.equal(got.length, 1);
  assert.equal(got[0].type, "skip");
  assert.equal(got[0].current_id, "x");
  assert.equal(got[0].origin, "botA");

  pub.close(); sub.close();
});

test("só recebe no canal (guild,channel) certo — isolamento por canal", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const pub = new ValkeyBus({ url: URL, enabled: true });
  const sub = new ValkeyBus({ url: URL, enabled: true });
  pub.connect(); sub.connect();
  await sleep(250);

  const got = [];
  sub.subscribe("g1", "c1", (m) => got.push(m));
  await sleep(100);

  pub.publish("g1", "c2", { origin: "x", type: "stop" });
  pub.publish("g1", "c1", { origin: "x", type: "stop" });
  await waitFor(() => got.length > 0);
  await sleep(100);

  assert.equal(got.length, 1, "só o do canal assinado");
  assert.equal(got[0].type, "stop");

  pub.close(); sub.close();
});

test("unsubscribe (refcount) para de entregar; resubscribe volta a entregar", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const pub = new ValkeyBus({ url: URL, enabled: true });
  const sub = new ValkeyBus({ url: URL, enabled: true });
  pub.connect(); sub.connect();
  await sleep(250);

  const got = [];
  const handler = (m) => got.push(m);
  sub.subscribe("g2", "c2", handler);
  await sleep(100);

  sub.unsubscribe("g2", "c2", handler);
  await sleep(100);

  pub.publish("g2", "c2", { origin: "x", type: "enqueue" });
  await sleep(250);
  assert.equal(got.length, 0, "após unsubscribe não entrega mais");

  sub.subscribe("g2", "c2", handler);
  await sleep(100);
  pub.publish("g2", "c2", { origin: "x", type: "enqueue" });
  await waitFor(() => got.length > 0);
  assert.equal(got.length, 1, "resubscribe volta a entregar");

  pub.close(); sub.close();
});

test("dois handlers no mesmo canal (refcount): ambos recebem; só desinscreve quando esvazia", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const pub = new ValkeyBus({ url: URL, enabled: true });
  const sub = new ValkeyBus({ url: URL, enabled: true });
  pub.connect(); sub.connect();
  await sleep(250);

  const a = [], b = [];
  const ha = (m) => a.push(m), hb = (m) => b.push(m);
  sub.subscribe("g3", "c3", ha);
  sub.subscribe("g3", "c3", hb);
  await sleep(100);

  pub.publish("g3", "c3", { origin: "x", type: "repeat", repeat_mode: "track" });
  await waitFor(() => a.length > 0 && b.length > 0);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);

  sub.unsubscribe("g3", "c3", ha);
  await sleep(100);
  pub.publish("g3", "c3", { origin: "x", type: "repeat", repeat_mode: "none" });
  await waitFor(() => b.length > 1);
  assert.equal(a.length, 1, "handler removido não recebe mais");
  assert.equal(b.length, 2, "handler restante segue recebendo");

  pub.close(); sub.close();
});

test("mensagem malformada (não-JSON) não derruba o subscriber", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const sub = new ValkeyBus({ url: URL, enabled: true });
  sub.connect();
  await sleep(250);

  const got = [];
  sub.subscribe("g4", "c4", (m) => got.push(m));
  await sleep(100);

  const raw = new Redis(URL);
  await raw.publish(queueChannel("g4", "c4"), "isto-nao-e-json{");
  await sleep(150);
  await raw.publish(queueChannel("g4", "c4"), JSON.stringify({ origin: "x", type: "enqueue" }));
  await waitFor(() => got.length > 0);

  assert.equal(got.length, 1, "ignora o lixo e processa o válido");
  raw.disconnect();
  sub.close();
});

test("subscribeRaw: canal avulso (work:published) entrega e o unsubscribeRaw desliga", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const bus = new ValkeyBus({ url: URL, enabled: true });
  bus.connect();
  await sleep(250);

  const got = [];
  const handler = (m) => got.push(m);
  bus.subscribeRaw("work:published", handler);
  await sleep(100);

  const raw = new Redis(URL);
  await raw.publish("work:published", JSON.stringify({ guild_id: "g9", channel_id: "c9" }));
  await waitFor(() => got.length > 0);
  assert.equal(got[0].guild_id, "g9", "mensagem do canal cru chega parseada");

  bus.unsubscribeRaw("work:published", handler);
  await sleep(100);
  await raw.publish("work:published", JSON.stringify({ guild_id: "g10", channel_id: "c1" }));
  await sleep(150);
  assert.equal(got.length, 1, "depois do unsubscribeRaw não chega mais nada");

  raw.disconnect();
  bus.close();
});

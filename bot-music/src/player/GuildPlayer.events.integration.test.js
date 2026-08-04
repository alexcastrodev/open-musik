
import { test, before } from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { ValkeyBus } from "../valkey/ValkeyBus.js";
import { GuildPlayer } from "./GuildPlayer.js";

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

function makePlayerOnBus(bus, { guildId, channelId, ownClientId, api = {} }) {
  const gp = new GuildPlayer(guildId, { api, bus, ownClientId });
  gp.connection = { joinConfig: { channelId }, destroy() {} };
  gp.current = { item: { id: "i-1" } };

  const calls = [];
  gp.stopAndDisconnect = () => { calls.push(["stopAndDisconnect"]); gp.connection = null; return true; };
  gp.stopKeep = () => { calls.push(["stopKeep"]); return true; };
  gp.refreshPanel = () => { calls.push(["refreshPanel"]); };

  gp.queueEventHandler = (msg) => gp.handleQueueEvent(msg);
  bus.subscribe(guildId, channelId, gp.queueEventHandler);
  return { gp, calls };
}

test("stop externo (origin diferente) → desconecta de verdade pelo fio", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const busA = new ValkeyBus({ url: URL, enabled: true });
  const busB = new ValkeyBus({ url: URL, enabled: true });
  busA.connect(); busB.connect();
  await sleep(250);

  const { gp, calls } = makePlayerOnBus(busB, { guildId: "gi-stop", channelId: "c1", ownClientId: "botB" });
  await sleep(100);

  busA.publish("gi-stop", "c1", { origin: "botA", ts: 1, type: "stop" });
  await waitFor(() => calls.some((c) => c[0] === "stopAndDisconnect"));

  assert.ok(calls.some((c) => c[0] === "stopAndDisconnect"), "deve desconectar no stop externo");
  busA.close(); busB.close();
});

test("self-ignore: bot NÃO reage ao próprio evento (origin == ownClientId)", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const bus = new ValkeyBus({ url: URL, enabled: true });
  bus.connect();
  await sleep(250);

  const { calls } = makePlayerOnBus(bus, { guildId: "gi-self", channelId: "c1", ownClientId: "botB" });
  await sleep(100);

  bus.publish("gi-self", "c1", { origin: "botB", ts: 1, type: "stop" });
  await sleep(300);

  assert.equal(calls.length, 0, "não reage ao próprio eco");
  bus.close();
});

test("clear_keep externo → stopKeep (esvazia mas fica na sala)", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const busA = new ValkeyBus({ url: URL, enabled: true });
  const busB = new ValkeyBus({ url: URL, enabled: true });
  busA.connect(); busB.connect();
  await sleep(250);

  const { calls } = makePlayerOnBus(busB, { guildId: "gi-keep", channelId: "c1", ownClientId: "botB" });
  await sleep(100);

  busA.publish("gi-keep", "c1", { origin: "botA", ts: 1, type: "clear_keep" });
  await waitFor(() => calls.some((c) => c[0] === "stopKeep"));

  assert.ok(calls.some((c) => c[0] === "stopKeep"), "deve stopKeep");
  assert.ok(!calls.some((c) => c[0] === "stopAndDisconnect"), "NÃO desconecta no clear_keep");
  busA.close(); busB.close();
});

test("skip externo com playable embutido → troca de faixa (sem round-trip ao Rails)", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const busA = new ValkeyBus({ url: URL, enabled: true });
  const busB = new ValkeyBus({ url: URL, enabled: true });
  busA.connect(); busB.connect();
  await sleep(250);

  let statusCalls = 0;
  const api = { getItemStatus: async () => { statusCalls++; return { cached_url: "http://127.0.0.1:1/x.opus", audio_format: "opus" }; } };
  const { gp } = makePlayerOnBus(busA, { guildId: "gi-skip", channelId: "c1", ownClientId: "botB", api });
  const genBefore = gp.playGen;
  await sleep(100);

  busA.publish("gi-skip", "c1", {
    origin: "botA", ts: 1, type: "skip", current_id: "i-2",
    playable: { item_id: "i-2", cached_url: "http://127.0.0.1:1/i2.opus", audio_format: "opus" },
    item: { id: "i-2", title: "F2" },
  });
  await waitFor(() => gp.playGen > genBefore);

  assert.ok(gp.playGen > genBefore, "troca de faixa disparou (playGen bumpado)");
  assert.equal(statusCalls, 0, "playable embutido → não bate no Rails (getItemStatus)");
  busA.close(); busB.close();
});

test("skip externo SEM playable → busca status no Rails e troca", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const busA = new ValkeyBus({ url: URL, enabled: true });
  const busB = new ValkeyBus({ url: URL, enabled: true });
  busA.connect(); busB.connect();
  await sleep(250);

  let statusCalls = 0;
  const api = { getItemStatus: async () => { statusCalls++; return { cached_url: "http://127.0.0.1:1/i9.opus", audio_format: "opus" }; } };
  const { gp } = makePlayerOnBus(busA, { guildId: "gi-skip2", channelId: "c1", ownClientId: "botB", api });
  const genBefore = gp.playGen;
  await sleep(100);

  busA.publish("gi-skip2", "c1", { origin: "botA", ts: 1, type: "skip", current_id: "i-9" });
  await waitFor(() => gp.playGen > genBefore);

  assert.ok(gp.playGen > genBefore, "trocou de faixa");
  assert.equal(statusCalls, 1, "sem playable → buscou o status no Rails uma vez");
  busA.close(); busB.close();
});

test("clear_upcoming externo → só repinta o painel (não troca nem desconecta)", async (t) => {
  if (!available) return t.skip(`sem Valkey em ${URL}`);
  const busA = new ValkeyBus({ url: URL, enabled: true });
  const busB = new ValkeyBus({ url: URL, enabled: true });
  busA.connect(); busB.connect();
  await sleep(250);

  const { gp, calls } = makePlayerOnBus(busB, { guildId: "gi-clr", channelId: "c1", ownClientId: "botB" });
  const genBefore = gp.playGen;
  await sleep(100);

  busA.publish("gi-clr", "c1", { origin: "botA", ts: 1, type: "clear_upcoming" });
  await waitFor(() => calls.some((c) => c[0] === "refreshPanel"));

  assert.ok(calls.some((c) => c[0] === "refreshPanel"), "repinta o painel");
  assert.ok(!calls.some((c) => c[0] === "stopAndDisconnect" || c[0] === "stopKeep"), "não para nada");
  assert.equal(gp.playGen, genBefore, "não troca de faixa");
  busA.close(); busB.close();
});

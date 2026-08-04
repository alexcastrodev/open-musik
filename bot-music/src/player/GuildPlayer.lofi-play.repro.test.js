import { test } from "node:test";
import assert from "node:assert/strict";
import { GuildPlayer } from "./GuildPlayer.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGp(over = {}) {
  const calls = { advance: [], itemStatus: [] };
  const api = {
    advanceGuild: async (...a) => { calls.advance.push(a); return { playable: null, item: null }; },
    getGuildQueue: async () => over.queue ?? ({ current: null, upcoming: [] }),
    getItemStatus: async (...a) => { calls.itemStatus.push(a); return over.itemStatus ?? ({ cached_url: "http://127.0.0.1:1/m1.opus", audio_format: "opus" }); },
    stopGuild: async () => {},
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.refreshPanel = () => {};
  gp.player = { play() {}, stop() {}, state: { status: "playing" } };
  return { gp, calls };
}

test("LO-FI + /play de OUTRO bot (push 'enqueue'): fila do Rails ganha current → SAI do lo-fi e toca a faixa", async () => {
  const { gp } = makeGp({ queue: { current: { id: "m-1", title: "Minha música" }, upcoming: [] } });
  gp.lofiStation = { value: "tokyo", label: "Lofi Tokyo", url: "http://relay/tokyo.opus" };
  gp.current = { item: { title: "Lofi Tokyo" }, ffmpeg: { kill: () => {} } };

  await gp.handleQueueEvent({ type: "enqueue", origin: "outro" });
  await sleep(30);

  assert.equal(gp.lofiStation, null, "saiu do modo lo-fi ao chegar uma faixa real na fila");
  assert.equal(gp.current?.item?.id, "m-1", "passou a tocar a faixa enfileirada");
});

test("LO-FI + /play (poll de fila via syncNow): fila do Rails ganha current → SAI do lo-fi e toca a faixa", async () => {
  const { gp } = makeGp({ queue: { current: { id: "m-1", title: "Minha música" }, upcoming: [] } });
  gp.lofiStation = { value: "tokyo", label: "Lofi Tokyo", url: "http://relay/tokyo.opus" };
  gp.current = { item: { title: "Lofi Tokyo" }, ffmpeg: { kill: () => {} } };

  await gp.syncNow();
  await sleep(30);

  assert.equal(gp.lofiStation, null, "saiu do modo lo-fi pelo poll");
  assert.equal(gp.current?.item?.id, "m-1", "passou a tocar a faixa enfileirada");
});

test("LO-FI puro (fila do Rails vazia): push 'enqueue' espúrio NÃO tira do lo-fi", async () => {
  const { gp } = makeGp({ queue: { current: null, upcoming: [] } });
  gp.lofiStation = { value: "tokyo", label: "Lofi Tokyo", url: "http://relay/tokyo.opus" };
  gp.current = { item: { title: "Lofi Tokyo" }, ffmpeg: { kill: () => {} } };

  await gp.handleQueueEvent({ type: "enqueue", origin: "outro" });
  await sleep(30);

  assert.ok(gp.lofiStation, "continua em lo-fi: a fila do Rails não tem faixa real");
});

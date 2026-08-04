import { test } from "node:test";
import assert from "node:assert/strict";
import { GuildPlayer } from "./GuildPlayer.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGp(over = {}) {
  const advanceCalls = [];
  const api = {
    advanceGuild: async (...a) => { advanceCalls.push(a); return { playable: null, item: null }; },
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
    getItemStatus: async () => ({ cached_url: null }),
    stopGuild: async () => {},
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.refreshPanel = () => {};
  gp.player = { play() {}, stop() {} };
  return { gp, advanceCalls };
}

test("RACE: stream lo-fi cai DURANTE o /play em voo (faixa ainda resolvendo) → reabre lo-fi, NÃO pede advance", async () => {
  const { gp, advanceCalls } = makeGp();

  gp.lofiStation = { value: "tokyo", label: "Lofi Tokyo", url: "http://relay/tokyo.opus" };
  gp.current = { item: { title: "Lofi Tokyo" }, ffmpeg: { kill: () => {} } };

  gp.handleIdle();
  await sleep(30);

  assert.equal(advanceCalls.length, 0, "NÃO pede advance ao Rails enquanto o /play resolve");
  assert.ok(gp.lofiStation, "continua em modo lo-fi (vai ser substituído quando a faixa resolver)");

  gp.stopAndDisconnect();
});

test("lo-fi → /play cache (swap concluído) → música acaba: pede a próxima ao Rails", async () => {
  const { gp, advanceCalls } = makeGp();

  gp.lofiStation = { value: "tokyo", label: "Lofi Tokyo", url: "http://relay/tokyo.opus" };
  gp.current = { item: { title: "Lofi Tokyo" }, ffmpeg: { kill: () => {} } };

  gp.applySkip(
    { item_id: "m-1", cached_url: "http://127.0.0.1:1/m1.opus", audio_format: "opus" },
    { id: "m-1", title: "Minha música" },
  );
  await sleep(30);
  assert.equal(gp.lofiStation, null, "saiu do modo lo-fi ao tocar a faixa real");

  gp.handleIdle();
  await sleep(30);

  assert.equal(advanceCalls.length, 1, "pediu a próxima faixa ao Rails (advanceGuild)");
  assert.equal(gp.current, null, "current zerado, pronto pra próxima");

  gp.stopAndDisconnect();
});

test("lo-fi puro: stream cai (Idle) sem nenhum /play → reabre a estação, sem tocar no Rails", async () => {
  const { gp, advanceCalls } = makeGp();
  gp.lofiStation = { value: "tokyo", label: "Lofi Tokyo", url: "http://relay/tokyo.opus" };
  gp.current = { item: { title: "Lofi Tokyo" }, ffmpeg: { kill: () => {} } };

  gp.handleIdle();
  await sleep(30);

  assert.equal(advanceCalls.length, 0, "em lo-fi NÃO bate no Rails");
  assert.ok(gp.lofiStation, "continua em modo lo-fi");

  gp.stopAndDisconnect();
});

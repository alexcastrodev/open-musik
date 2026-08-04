import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { StreamType } from "@discordjs/voice";
import { GuildPlayer } from "./GuildPlayer.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeHold() {
  const stream = new PassThrough();
  return { stream, kill: () => stream.destroy(), type: StreamType.OggOpus };
}

function makeGp(over = {}) {
  const advanceCalls = [];
  const statusCalls = [];
  const api = {
    advanceGuild: async (...a) => { advanceCalls.push(a); return { playable: null, item: null }; },
    getItemStatus: async (...a) => { statusCalls.push(a); return { cache_status: "live" }; },
    getGuildQueue: async () => ({ current: { id: "i-1", title: "Atual" }, upcoming: [] }),
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api, ...over.opts });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.refreshPanel = () => {};
  gp.player = { play() {}, stop() {}, state: { status: "playing" } };
  gp._holdStream = fakeHold;
  gp.current = { item: { id: "i-1", title: "Atual" }, ffmpeg: { kill: () => {} } };
  return { gp, advanceCalls, statusCalls };
}

test("REPRO: erro no stream da FONTE não avança a fila (cai no hold + espera cache)", async () => {
  const { gp, advanceCalls, statusCalls } = makeGp();
  gp.currentFromSource = true;

  gp.handleError(new Error("Premature close"));
  assert.equal(gp.awaitingCache, true, "entrou no modo espera-de-cache (hold tocando)");
  assert.equal(gp.currentFromSource, false, "saiu do estado 'tocando da fonte'");
  await sleep(30);

  assert.equal(advanceCalls.length, 0, "NÃO avançou a fila (não pulou a faixa)");
  assert.ok(statusCalls.length >= 1, "pollou o status do MESMO item pra esperar o cache");
  assert.equal(statusCalls[0][2], "i-1", "esperou o cache da faixa que estava tocando");

  gp.stopAndDisconnect();
});

test("erro tocando do CACHE (não-fonte): mantém o comportamento antigo (avança)", async () => {
  const { gp, advanceCalls } = makeGp();
  gp.currentFromSource = false;

  gp.handleError(new Error("boom"));
  await sleep(30);

  assert.equal(advanceCalls.length, 1, "erro fora do caminho-fonte segue avançando");
  assert.equal(gp.awaitingCache, false, "não entrou em espera-de-cache");

  gp.stopAndDisconnect();
});

test("erro em modo lo-fi: reabre o stream, não avança nem espera cache", async () => {
  const { gp, advanceCalls, statusCalls } = makeGp();
  gp.currentFromSource = true;
  gp.lofiStation = { label: "Focus", url: "http://127.0.0.1:1/lofi.opus" };

  gp.handleError(new Error("Premature close"));
  await sleep(30);

  assert.equal(advanceCalls.length, 0, "lo-fi não avança fila");
  assert.equal(statusCalls.length, 0, "lo-fi não espera cache (não há fila)");

  gp.stopAndDisconnect();
});

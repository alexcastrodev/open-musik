import { test } from "node:test";
import assert from "node:assert/strict";

const { PoolAdapter } = await import("./PoolAdapter.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeAdapter({ pendingWork, busy = () => false } = {}) {
  const dispatched = [];
  const channel = { name: "Voz", isVoiceBased: () => true };
  const guild = { channels: { cache: new Map([["c1", channel]]) } };
  const client = { guilds: { cache: new Map([["g1", guild]]) } };
  const botPool = {
    calls: { pendingWork: 0 },
    pendingWork: pendingWork ?? async function () { this.calls.pendingWork++; return null; },
    tryClaim: async () => true,
    releaseChannel: async () => {},
  };
  const api = {
    getItemStatus: async () => ({
      item: { id: "i1", title: "Faixa", candidates: [], source_query: null },
      cached_url: "http://s3/i1.opus",
      audio_format: "opus",
    }),
  };
  const core = { dispatchAssignmentWon: async (a) => { dispatched.push(a); } };
  const refs = { put: () => "ref-1" };
  const adapter = new PoolAdapter({
    client, api, core, botPool, refRegistry: refs,
    isBusy: busy, logger: { error() {}, warn() {} },
    pollMs: 60_000,
  });
  return { adapter, botPool, dispatched };
}

const work = { channelId: "c1", kind: "track", itemId: "i1", textChannelId: "t1", station: null };

test("wake dispara a descoberta NA HORA (sem esperar o intervalo do poll)", async () => {
  const { adapter, botPool, dispatched } = makeAdapter({
    pendingWork: async function () { this.calls.pendingWork++; return work; },
  });

  adapter.start();
  adapter.wake();
  await sleep(50);

  assert.equal(dispatched.length, 1, "trabalho descoberto e despachado pelo wake");
  assert.equal(dispatched[0].guildId, "g1");
  assert.equal(dispatched[0].voiceChannelId, "c1");
  adapter.stop();
});

test("wake é no-op com o bot OCUPADO (ocupado não disputa trabalho)", async () => {
  const { adapter, botPool, dispatched } = makeAdapter({
    pendingWork: async function () { this.calls.pendingWork++; return work; },
    busy: () => true,
  });

  adapter.wake();
  await sleep(50);

  assert.equal(botPool.calls.pendingWork, 0, "nem consultou o pool");
  assert.equal(dispatched.length, 0, "nada despachado");
  adapter.stop();
});

test("wake no MEIO de um tick roda OUTRO tick ao final (não perde o evento)", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let calls = 0;
  const { adapter, dispatched } = makeAdapter({
    pendingWork: async () => {
      calls++;
      if (calls === 1) { await gate; return null; }
      return work;
    },
  });

  adapter.wake();
  await sleep(20);
  adapter.wake();
  release();
  await sleep(50);

  assert.equal(calls >= 2, true, "rodou um 2º tick logo após o 1º");
  assert.equal(dispatched.length, 1, "o 2º tick achou e despachou o trabalho");
  adapter.stop();
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { GuildPlayer } from "./GuildPlayer.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGp(over = {}) {
  const enqueues = [];
  const queueCalls = [];
  const api = {
    getGuildQueue: async () => {
      queueCalls.push(Date.now());
      return {
        current: { id: "i-1", title: "Atual", youtube_id: "dQw4w9WgXcQ" },
        upcoming: [],
      };
    },
    enqueue: async (...a) => { enqueues.push(a); return { playable: null, started_now: false, item: { id: "i-2" } }; },
    getItemStatus: async () => ({ cached_url: null }),
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api, ...over.opts });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = { item: { id: "i-1" }, ffmpeg: { kill: () => {} } };
  gp.refreshPanel = () => {};
  return { gp, enqueues, queueCalls };
}

function cleanup(gp) {
  if (gp.idleTimer) { clearTimeout(gp.idleTimer); gp.idleTimer = null; }
}

test("stopKeep zera discoverPending (pendência não sobrevive ao Parar)", () => {
  const { gp } = makeGp();
  gp.discoverEnabled = true;
  gp.discoverPending = true;

  gp.stopKeep();

  assert.equal(gp.discoverPending, false, "Parar limpa a pendência do discover");
  assert.equal(gp.discoverEnabled, true, "mas o flag do discover continua ligado");
  cleanup(gp);
});

test("discover inerte pós-stop: keptIdle bloqueia nova busca", async () => {
  const { gp, enqueues, queueCalls } = makeGp();
  gp.stopKeep();
  gp.discoverEnabled = false;

  gp.toggleDiscover();
  await sleep(100);

  assert.equal(queueCalls.length, 0, "nem consulta a fila: aborta no guard keptIdle");
  assert.equal(enqueues.length, 0, "nada enfileirado");
  cleanup(gp);
});

test("discover volta a agir quando keptIdle é resetado (novo play)", async () => {
  const { gp, queueCalls } = makeGp({
    opts: { resolveSuggestion: async () => null },
  });
  gp.stopKeep();
  gp.keptIdle = false;
  gp.current = { item: { id: "i-1" }, ffmpeg: { kill: () => {} } };
  gp.discoverEnabled = false;

  gp.toggleDiscover();
  await sleep(100);

  assert.equal(queueCalls.length, 1, "a busca voltou a rodar (consultou a fila)");
  cleanup(gp);
});

test("REPRO DO BUG: Parar durante busca de sugestão em voo NÃO enfileira", async () => {
  let resolveSearch;
  const searchDone = new Promise((r) => { resolveSearch = r; });
  const { gp, enqueues } = makeGp({
    opts: {
      resolveSuggestion: async () => {
        await searchDone;
        return { title: "Sugerida", url: "https://youtu.be/abc123" };
      },
    },
  });

  gp.toggleDiscover();
  await sleep(50);

  gp.stopKeep();
  resolveSearch();
  await sleep(100);

  assert.equal(enqueues.length, 0, "sugestão pós-stop foi descartada (guard de geração)");
  cleanup(gp);
});

test("fila zerada no Rails durante a busca (sem current): não enfileira", async () => {
  let call = 0;
  const { gp, enqueues } = makeGp({
    api: {
      getGuildQueue: async () => {
        call += 1;
        if (call === 1) return { current: { id: "i-1", title: "Atual", youtube_id: "dQw4w9WgXcQ" }, upcoming: [] };
        return { current: null, upcoming: [] };
      },
    },
    opts: {
      resolveSuggestion: async () => ({ title: "Sugerida", url: "https://youtu.be/abc123" }),
    },
  });

  gp.toggleDiscover();
  await sleep(100);

  assert.equal(call, 2, "chegou à revalidação (guard ativo é fresh.current, não playGen)");
  assert.equal(enqueues.length, 0, "sem current no Rails não há o que suceder: descarta");
  cleanup(gp);
});

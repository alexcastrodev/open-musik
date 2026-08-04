import { test } from "node:test";
import assert from "node:assert/strict";
import { GuildPlayer } from "./GuildPlayer.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGp(over = {}) {
  const enqueues = [];
  const api = {
    getGuildQueue: async () => ({
      current: { id: "i-1", title: "Atual", youtube_id: "dQw4w9WgXcQ" },
      upcoming: [],
    }),
    enqueue: async (...a) => { enqueues.push(a); return { playable: null, started_now: false, item: { id: "i-2" } }; },
    getItemStatus: async () => ({ cached_url: null }),
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.current = { item: { id: "i-1" }, ffmpeg: { kill: () => {} } };
  gp.refreshPanel = () => {};
  return { gp, enqueues };
}

test("clicar com faixa tocando DA FONTE: adia (não enfileira, fica pendente)", async () => {
  const { gp, enqueues } = makeGp();
  gp.currentFromSource = true;

  const on = gp.toggleDiscover();
  assert.equal(on, true, "discover ligou");
  await sleep(150);

  assert.equal(enqueues.length, 0, "NÃO enfileirou (não rodou yt-dlp do Mix)");
  assert.equal(gp.discoverPending, true, "ficou pendente pra rodar quando sair da fonte");
});

test("clicar com faixa NO CACHE: não adia (toma o caminho seguro)", async () => {
  const { gp, enqueues } = makeGp({
    api: { getGuildQueue: async () => ({ current: { id: "i-1", title: "Atual" }, upcoming: [] }) },
  });
  gp.currentFromSource = false;

  const on = gp.toggleDiscover();
  assert.equal(on, true);
  await sleep(150);

  assert.equal(gp.discoverPending, false, "não adiou: caminho seguro (cache)");
  assert.equal(enqueues.length, 0, "sem youtube_id não há o que sugerir");
});

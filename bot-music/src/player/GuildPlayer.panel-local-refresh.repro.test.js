import { test } from "node:test";
import assert from "node:assert/strict";

const { GuildPlayer } = await import("./GuildPlayer.js");

function makeGp(over = {}) {
  const api = {
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
    ...over.api,
  };
  const gp = new GuildPlayer("g1", { api, ownClientId: "me" });
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.player = { play() {}, stop() {}, pause() {}, state: { status: "idle" } };
  return gp;
}

test("REPRO DO BUG: painel não atualiza quando a fila do Rails ainda não reflete o item que já está tocando", async () => {
  const refreshCalls = [];
  const gp = makeGp();
  gp.refreshPanel = (guildId, channelId, queue) => { refreshCalls.push(queue); };

  const item = { id: "i-1", title: "Faixa Nova" };
  const playable = { item_id: "i-1", cached_url: "https://s3.example/i-1.opus", audio_format: "opus" };

  // applySkip dispara um #refreshPanel() imediato (queue: null → busca a API,
  // que aqui retorna vazio) e, em paralelo, #playUrl chama #refreshPanelLocally
  // assim que o áudio começa a tocar de fato. É essa 2ª chamada que corrige o
  // painel — sem ela, o último refresh visível seria sempre o vazio.
  gp.applySkip(playable, item);
  await new Promise((r) => setTimeout(r, 10));

  const withCurrent = refreshCalls.filter((q) => q?.current?.id === "i-1");
  assert.ok(withCurrent.length >= 1, "ao menos um refreshPanel chegou com a faixa local (current preenchido)");
});

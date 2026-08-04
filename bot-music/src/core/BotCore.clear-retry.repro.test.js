import { test } from "node:test";
import assert from "node:assert/strict";
import { BotCore } from "./BotCore.js";

const okAcker = { ack: async () => true };
const noThrottle = {
  isDuplicate: () => false,
  checkRate: () => ({ allowed: true, retryInMs: 0 }),
  minInterval: () => ({ allowed: true, retryInMs: 0 }),
};

function makeCore({ api, player } = {}) {
  return new BotCore({
    api, player, acker: okAcker, throttle: noThrottle,
    ownClientId: "this-bot",
    clearRetryDelayMs: 0,
  });
}

test("_clearRailsQueue: sucesso de primeira — chama fn só 1x", async () => {
  const core = makeCore();
  let calls = 0;
  await core._clearRailsQueue("clearAllGuild", async () => { calls++; });
  assert.equal(calls, 1);
});

test("_clearRailsQueue: falha 1x, sucesso no retry — não lança e chama fn 2x", async () => {
  const core = makeCore();
  let calls = 0;
  await core._clearRailsQueue("clearAllGuild", async () => {
    calls++;
    if (calls === 1) throw new Error("Rails indisponível");
  });
  assert.equal(calls, 2, "tentou de novo depois da falha");
});

test("_clearRailsQueue: falha nas duas tentativas — engole no final (fire-and-forget), sem lançar", async () => {
  const core = makeCore();
  let calls = 0;
  await assert.doesNotReject(() =>
    core._clearRailsQueue("stopGuild", async () => {
      calls++;
      throw new Error("Rails fora do ar");
    }),
  );
  assert.equal(calls, 2, "tentou 2x antes de desistir");
});

function makePlayer() {
  const calls = [];
  return {
    calls,
    playingInChannel: () => true,
    stopKeep: (...a) => calls.push(["stopKeep", ...a]),
  };
}

test("botão Parar: clearAllGuild falhando na 1ª chamada é retentado (não fica só no .catch mudo)", async () => {
  let clearCalls = 0;
  const api = {
    clearAllGuild: async () => {
      clearCalls++;
      if (clearCalls === 1) throw new Error("Rails indisponível");
      return {};
    },
    getGuildQueue: async () => ({ current: null, upcoming: [] }),
  };
  const player = makePlayer();
  const core = makeCore({ api, player });

  await core.dispatchButton({
    guildId: "g1", customId: "player:stop", userId: "u1", userTag: "alex#1",
    voiceChannelId: "vc1", voiceChannelName: "Geral",
    panelRef: "panel-ref", replyToken: "tok",
  });

  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  assert.equal(clearCalls, 2, "tentou de novo depois da falha, não engoliu silenciosamente");
});

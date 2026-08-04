import { test } from "node:test";
import assert from "node:assert/strict";
import { BotCore } from "./BotCore.js";

function makeApi(over = {}) {
  return {
    clientId: "me",
    enqueue: async () => ({ playable: { item_id: "i-1" }, started_now: true, position: 0, item: { id: "i-1", title: "F1" } }),
    getGuildQueue: async () => ({ current: { id: "i-1", title: "F1" }, upcoming: [] }),
    ...over,
  };
}

function makeBotPool(over = {}) {
  const calls = [];
  return {
    calls,
    enabled: over.enabled ?? true,
    botOnChannel: async () => over.onChannel ?? null,
    freeBots: async () => over.free ?? [],
    tryClaim: async (...a) => { calls.push(["tryClaim", ...a]); return over.claimWins ?? true; },
    publishWork: async (...a) => { calls.push(["publishWork", ...a]); },
    releaseChannel: async (...a) => { calls.push(["releaseChannel", ...a]); },
  };
}

function makePlayer(over = {}) {
  const calls = [];
  return {
    calls,
    currentItemId: () => null,
    playingInChannel: () => over.playingInChannel ?? false,
    ensureConnectedAndPlay: async (...a) => {
      calls.push(["ensureConnectedAndPlay", ...a]);
      if (over.joinFails) throw new Error("Não consegui entrar no canal de voz a tempo.");
    },
  };
}

const okAcker = { ack: async () => true };
const noThrottle = { isDuplicate: () => false, checkRate: () => ({ allowed: true }) };

function makeCore({ api, botPool, player } = {}) {
  return new BotCore({
    api: api ?? makeApi(), player: player ?? makePlayer(), acker: okAcker,
    botPool, ownClientId: "me", throttle: noThrottle,
  });
}

const input = (over = {}) => ({
  guildId: "g1", userId: "u1", userTag: "a#1", voiceChannelId: "c1", voiceChannelName: "Geral",
  voiceChannelRef: "vc", textChannelRef: "tc", textChannelId: "tc-123",
  options: { musica: "lofi" }, replyToken: "t", ...over,
});

test("join de voz falha após o claim rápido: libera o canal e republica o trabalho", async () => {
  const player = makePlayer({ joinFails: true });
  const botPool = makeBotPool({ onChannel: null, free: ["me"], claimWins: true });
  const core = makeCore({ botPool, player });
  const errors = [];
  core.on("reply.ephemeral", () => {});

  await core.dispatchCommand(input({ commandName: "play" })).catch((e) => errors.push(e));

  assert.ok(botPool.calls.some((c) => c[0] === "tryClaim"), "reivindicou o canal (caminho rápido)");
  const release = botPool.calls.find((c) => c[0] === "releaseChannel");
  assert.ok(release, "soltou o claim no catch — não pode ficar preso comigo");
  assert.deepEqual(release.slice(1), ["g1", "c1"]);
  const pub = botPool.calls.find((c) => c[0] === "publishWork");
  assert.ok(pub, "republicou o trabalho pra outro bot pegar o item já enfileirado");
  assert.equal(pub[3], "i-1", "o item_id já criado no Rails vai junto");
  assert.equal(pub[4], "tc-123", "o canal de texto vai junto pro novo dono postar o painel");
});

test("join de voz OK: não libera nem republica (comportamento normal preservado)", async () => {
  const player = makePlayer({ joinFails: false });
  const botPool = makeBotPool({ onChannel: null, free: ["me"], claimWins: true });
  const core = makeCore({ botPool, player });

  await core.dispatchCommand(input({ commandName: "play" }));

  assert.ok(!botPool.calls.some((c) => c[0] === "releaseChannel"), "sem falha, não solta o claim");
  assert.ok(!botPool.calls.some((c) => c[0] === "publishWork"), "sem falha, não republica (pegou o caminho rápido)");
});

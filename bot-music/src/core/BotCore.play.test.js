
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
    releaseChannel: async () => {},
  };
}

function makePlayer(over = {}) {
  const calls = [];
  return {
    calls,
    currentItemId: () => null,
    playingInChannel: () => over.playingInChannel ?? false,
    ensureConnectedAndPlay: async (...a) => calls.push(["ensureConnectedAndPlay", ...a]),
    playLofi: async (...a) => calls.push(["playLofi", ...a]),
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

function capture(core) {
  const got = [];
  for (const e of ["reply.ephemeral", "panel.upsert", "panel.upsertById"]) core.on(e, (p) => got.push([e, p]));
  return got;
}

const input = (over = {}) => ({
  guildId: "g1", userId: "u1", userTag: "a#1", voiceChannelId: "c1", voiceChannelName: "Geral",
  voiceChannelRef: "vc", textChannelRef: "tc", options: { musica: "lofi" }, replyToken: "t", ...over,
});

test("ASSIGNED + eu livre: reivindica e toca eu mesmo", async () => {
  const player = makePlayer();
  const botPool = makeBotPool({ onChannel: null, free: ["me"], claimWins: true });
  const core = makeCore({ botPool, player });
  const got = capture(core);

  await core.dispatchCommand(input({ commandName: "play" }));

  assert.ok(player.calls.some((c) => c[0] === "ensureConnectedAndPlay"), "toca localmente");
  assert.ok(botPool.calls.some((c) => c[0] === "tryClaim"), "reivindicou o canal");
  assert.ok(!botPool.calls.some((c) => c[0] === "publishWork"), "não publicou (pegou o caminho rápido)");
  assert.ok(got.some((g) => g[0] === "panel.upsert"));
});

test("ASSIGNED + eu ocupado: publica o trabalho (com text_channel_id) e NÃO posta painel", async () => {
  const player = makePlayer();
  const botPool = makeBotPool({ onChannel: null, free: ["outro"] });
  const core = makeCore({ botPool, player });
  const got = capture(core);

  await core.dispatchCommand(input({ commandName: "play", textChannelId: "tc-123" }));

  assert.ok(!player.calls.some((c) => c[0] === "ensureConnectedAndPlay"), "não toco eu");
  const pub = botPool.calls.find((c) => c[0] === "publishWork");
  assert.ok(pub, "publicou pro pool disputar");
  assert.equal(pub[4], "tc-123", "passou o id do canal de texto pro dono postar o painel");
  assert.equal(got.filter((g) => g[0] === "panel.upsert" || g[0] === "panel.upsertById").length, 0,
    "front não dono NÃO posta painel");
});

test("ENQUEUED: outro bot já está no canal → enfileira, avisa e NÃO posta painel", async () => {
  const player = makePlayer();
  const botPool = makeBotPool({ onChannel: "outro" });
  const core = makeCore({ botPool, player });
  const got = capture(core);

  await core.dispatchCommand(input({ commandName: "play" }));

  assert.ok(!player.calls.some((c) => c[0] === "ensureConnectedAndPlay"), "o dono é outro processo");
  assert.ok(!botPool.calls.some((c) => c[0] === "tryClaim"), "não disputa canal já ocupado");
  assert.ok(got.some((g) => g[0] === "reply.ephemeral"));
  assert.equal(got.filter((g) => g[0] === "panel.upsert" || g[0] === "panel.upsertById").length, 0,
    "o dono segura/atualiza o painel; o front não posta");
});

test("dono assume via pool (dispatchAssignmentWon) → posta o painel por ID", async () => {
  const player = makePlayer();
  const core = makeCore({ player });
  const got = capture(core);

  await core.dispatchAssignmentWon({
    guildId: "g1", voiceChannelId: "c1", voiceChannelRef: "vc",
    textChannelId: "tc-9", playable: {}, item: { id: "i-1", title: "F1" },
  });

  assert.ok(player.calls.some((c) => c[0] === "ensureConnectedAndPlay"), "o dono conecta e toca");
  const up = got.find((g) => g[0] === "panel.upsertById");
  assert.ok(up, "o dono posta o painel (panel.upsertById)");
  assert.equal(up[1].textChannelId, "tc-9", "no canal de texto que veio no trabalho");
});

test("REJECTED: sem bot no canal e nenhum livre → 409 sem enfileirar", async () => {
  let enqueued = false;
  const api = makeApi({ enqueue: async () => { enqueued = true; return {}; } });
  const botPool = makeBotPool({ onChannel: null, free: [] });
  const core = makeCore({ api, botPool });
  const got = capture(core);

  await core.dispatchCommand(input({ commandName: "play" }));

  assert.equal(enqueued, false, "não enfileira quando ninguém pode tocar");
  const reply = got.find((g) => g[0] === "reply.ephemeral");
  assert.match(reply[1].content, /ocupados/);
});

test("ASSIGNED: eu livre mas PERDI a disputa → publica o trabalho", async () => {
  const player = makePlayer();
  const botPool = makeBotPool({ onChannel: null, free: ["me"], claimWins: false });
  const core = makeCore({ botPool, player });
  capture(core);

  await core.dispatchCommand(input({ commandName: "play" }));

  assert.ok(!player.calls.some((c) => c[0] === "ensureConnectedAndPlay"), "perdi o claim → não toco");
  assert.ok(botPool.calls.some((c) => c[0] === "publishWork"), "publica pros outros disputarem");
});

const lofiInput = (over = {}) => ({
  guildId: "g1", commandName: "lofi-radio", userId: "u1", userTag: "a#1",
  voiceChannelId: "c1", voiceChannelName: "Geral", voiceChannelRef: "vc",
  textChannelRef: "tc", textChannelId: "tc-123", options: { estacao: "tokyo" }, replyToken: "t", ...over,
});

test("LOFI: eu livre → reivindica e toca lo-fi eu mesmo + painel", async () => {
  const player = makePlayer();
  const botPool = makeBotPool({ onChannel: null, free: ["me"], claimWins: true });
  const core = makeCore({ botPool, player });
  const got = capture(core);

  await core.dispatchCommand(lofiInput());

  assert.ok(player.calls.some((c) => c[0] === "playLofi"), "toca lo-fi localmente");
  assert.ok(botPool.calls.some((c) => c[0] === "tryClaim"), "reivindicou o canal");
  assert.ok(!botPool.calls.some((c) => c[0] === "publishWork"), "não publicou (caminho rápido)");
  assert.ok(got.some((g) => g[0] === "panel.upsert"), "postou o painel lo-fi");
});

test("LOFI: eu ocupado → delega (publishWork kind=lofi com station/text_channel_id), NÃO troco de canal", async () => {
  const player = makePlayer();
  const botPool = makeBotPool({ onChannel: null, free: ["outro"] });
  const core = makeCore({ botPool, player });
  const got = capture(core);

  await core.dispatchCommand(lofiInput());

  assert.ok(!player.calls.some((c) => c[0] === "playLofi"), "NÃO toco lo-fi (não troco de canal)");
  const pub = botPool.calls.find((c) => c[0] === "publishWork");
  assert.ok(pub, "delegou via publishWork");
  assert.equal(pub[3], null, "lo-fi não tem item_id");
  assert.equal(pub[4], "tc-123", "passou o canal de texto pro dono postar o painel");
  assert.deepEqual(pub[5], { kind: "lofi", station: { value: "tokyo" } }, "kind + estação no trabalho");
  assert.equal(got.filter((g) => g[0] === "panel.upsert" || g[0] === "panel.upsertById").length, 0, "front não posta painel");
});

test("LOFI: nenhum bot livre → 409 sem delegar", async () => {
  const player = makePlayer();
  const botPool = makeBotPool({ onChannel: null, free: [] });
  const core = makeCore({ botPool, player });
  const got = capture(core);

  await core.dispatchCommand(lofiInput());

  assert.ok(!botPool.calls.some((c) => c[0] === "publishWork"), "não delega quando ninguém livre");
  assert.match(got.find((g) => g[0] === "reply.ephemeral")[1].content, /ocupados/);
});

test("LOFI: dono assume via pool (dispatchLofiAssignmentWon) → toca + painel por ID", async () => {
  const player = makePlayer();
  const core = makeCore({ player });
  const got = capture(core);

  await core.dispatchLofiAssignmentWon({
    guildId: "g1", voiceChannelId: "c1", voiceChannelRef: "vc",
    textChannelId: "tc-9", station: { value: "tokyo", label: "Lofi Tokyo", url: "x" },
  });

  assert.ok(player.calls.some((c) => c[0] === "playLofi"), "o dono toca o lo-fi");
  const up = got.find((g) => g[0] === "panel.upsertById");
  assert.ok(up, "o dono posta o painel lo-fi por ID");
  assert.equal(up[1].textChannelId, "tc-9");
});

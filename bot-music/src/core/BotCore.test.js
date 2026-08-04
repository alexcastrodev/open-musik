
import { test } from "node:test";
import assert from "node:assert/strict";
import { BotCore } from "./BotCore.js";

function makeApi(over = {}) {
  return {
    clientId: "this-bot",
    getGuildQueue: async () => ({ current: { id: "i-1", title: "F1" }, upcoming: [] }),
    getGuildHistory: async () => ({ history: [{ position: 1, title: "Hist", query: "/songs/uuid", requested_by: "alex#1" }] }),
    previousGuild: async () => ({ moved: true, playable: {}, item: { id: "i-0", title: "Prev" } }),
    skipGuild: async () => ({ skipped: true, has_current: true, playable: {}, item: { id: "i-2", title: "F2" } }),
    toggleRepeatGuild: async () => ({ repeat_mode: "track" }),
    clearUpcomingGuild: async () => ({ cleared: 3 }),
    clearAllGuild: async () => ({}),
    stopGuild: async () => ({ stopped: true }),
    shuffleQueue: async () => ({ shuffled: 3 }),
    removeFromQueue: async () => ({ removed: { id: "i", title: "X" } }),
    moveInQueue: async () => ({ moved: { id: "i", title: "X" }, from: 1, to: 2 }),
    enqueue: async () => ({ playable: {}, started_now: true, position: 1, item: { id: "i-1", title: "F1" } }),
    enqueuePlaylist: async () => ({ playable: {}, started_now: true, position: 0, item: { id: "i-1", title: "F1" }, enqueued: 5, building: false }),
    createPlaylist: async () => ({ playlist: { name: "Minha" }, track_count: 1 }),
    addPlaylistTrack: async () => ({ playlist: { name: "Minha" }, track_count: 2 }),
    searchPlaylists: async () => ({ playlists: [{ id: 7, name: "Rock", build_status: "ready" }] }),
    topSongs: async () => ({ scope: "global", songs: [{ rank: 1, title: "Hit", artist: "Banda", plays: 3 }] }),
    listFavorites: async () => ({ favorites: [{ id: 1, position: 1, title: "Fav", query: "/songs/uuid" }] }),
    addFavorite: async () => ({ favorite: { id: 1, title: "Fav", query: "/songs/uuid" } }),
    removeFavorite: async () => ({ ok: true, removed: { id: 1, title: "Fav" } }),
    saveQueueAsPlaylist: async () => ({ playlist: { id: 1, name: "P" }, saved: 3, total: 3 }),
    listDjs: async () => ({ djs: [], restricted: false }),
    addDj: async () => ({ dj: { discord_user_id: "u9", username: "Novo DJ" } }),
    removeDj: async () => ({ ok: true, dj: { discord_user_id: "u9", username: "Ex DJ" } }),
    ...over,
  };
}

function makePlayer(over = {}) {
  const calls = [];
  const player = {
    calls,
    playingInChannel: () => over.mine ?? false,
    currentItemId: () => over.currentItemId ?? null,
    applySkip: (...a) => calls.push(["applySkip", ...a]),
    applyPrevious: (...a) => calls.push(["applyPrevious", ...a]),
    stopKeep: (...a) => calls.push(["stopKeep", ...a]),
    stopAndDisconnect: (...a) => { calls.push(["stopAndDisconnect", ...a]); return over.stopReturns ?? true; },
    ensureConnectedAndPlay: async (...a) => calls.push(["ensureConnectedAndPlay", ...a]),
    playLofi: async (...a) => { calls.push(["playLofi", ...a]); if (over.lofiThrows) throw new Error("voice channel ref não resolveu"); },
    requestLeaveGrace: (...a) => calls.push(["requestLeaveGrace", ...a]),
    cancelLeaveGrace: (...a) => calls.push(["cancelLeaveGrace", ...a]),
    pauseForEmpty: (...a) => calls.push(["pauseForEmpty", ...a]),
    resumeIfAutoPaused: (...a) => calls.push(["resumeIfAutoPaused", ...a]),
    playbackPositionMs: () => over.positionMs ?? 61000,
    toggleDiscover: (...a) => { calls.push(["toggleDiscover", ...a]); return over.discoverReturns ?? true; },
    discoverEnabled: () => over.discover ?? false,
    togglePause: (...a) => { calls.push(["togglePause", ...a]); return over.pauseReturns ?? true; },
    paused: () => over.paused ?? false,
    ...over.methods,
  };
  return player;
}

const okAcker = { ack: async () => true };
const noThrottle = {
  isDuplicate: () => false,
  checkRate: () => ({ allowed: true, retryInMs: 0 }),
  minInterval: () => ({ allowed: true, retryInMs: 0 }),
};

function capture(core, events) {
  const got = [];
  for (const e of events) core.on(e, (p) => got.push([e, p]));
  return got;
}
const ALL_OUT = [
  "reply.ephemeral", "reply.followUp", "panel.edit", "panel.editRef",
  "panel.upsert", "panel.repost", "panel.delete", "autocomplete.respond", "dm.send", "chat.send",
];

function makeBotPool(over = {}) {
  return {
    enabled: true,
    botOnChannel: async () => over.onChannel ?? null,
    freeBots: async () => over.free ?? ["this-bot"],
    tryClaim: async () => over.claimWins ?? true,
    publishWork: async () => {},
    releaseChannel: async () => {},
    ...over.methods,
  };
}

function makeCore(over = {}) {
  return new BotCore({
    api: over.api ?? makeApi(),
    player: over.player ?? makePlayer(),
    acker: over.acker ?? okAcker,
    botPool: over.botPool ?? makeBotPool(),
    ownClientId: "this-bot",
    throttle: over.throttle ?? noThrottle,
  });
}

const btn = (over = {}) => ({
  guildId: "g1", customId: "player:next", userId: "u1", userTag: "alex#1",
  voiceChannelId: "vc1", voiceChannelName: "Geral",
  panelRef: "panel-ref", textChannelRef: "tc-ref", voiceChannelRef: "vc-ref", replyToken: "tok", ...over,
});

test("botão Próxima: edita a mensagem durável do painel (editRef), sem duplicar", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);

  await core.dispatchButton(btn({ customId: "player:next" }));

  const edits = out.filter(([e]) => e === "panel.editRef");
  assert.equal(edits.length, 1, "editou via editRef");
  assert.equal(edits[0][1].panelRef, "panel-ref");
  assert.ok(edits[0][1].panel.embeds, "painel é dado puro");
  assert.equal(out.filter(([e]) => e === "panel.repost").length, 0, "não repostou (sem duplicata)");
  assert.deepEqual(player.calls.map((c) => c[0]), ["applySkip"], "mine → reagiu local");
});

test("botão Próxima com mine=false: muta o Rails mas NÃO reage local", async () => {
  const player = makePlayer({ mine: false });
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:next" }));
  assert.equal(player.calls.length, 0, "nenhuma reação local");
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 1);
});

test("botão Discover com mine=true: alterna o flag local e repinta", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);

  await core.dispatchButton(btn({ customId: "player:discover" }));

  assert.deepEqual(player.calls.map((c) => c[0]), ["toggleDiscover"], "alternou local");
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 1, "repintou o painel");
});

test("botão Discover com mine=false: publica discover_toggle pro dono, sem agir local", async () => {
  const published = [];
  const player = makePlayer({ mine: false });
  const core = makeCore({ player });
  core._publishQueueEvent = (...a) => published.push(a);
  const out = capture(core, ALL_OUT);

  await core.dispatchButton(btn({ customId: "player:discover" }));

  assert.equal(player.calls.length, 0, "não alterou local (não é o dono)");
  assert.equal(published.length, 1, "publicou um evento");
  assert.equal(published[0][2].type, "discover_toggle", "tipo discover_toggle");
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 1, "repintou o painel");
});

test("botão Pausar com mine=true: alterna a pausa local e repinta", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);

  await core.dispatchButton(btn({ customId: "player:playpause" }));

  assert.deepEqual(player.calls.map((c) => c[0]), ["togglePause"], "alternou local");
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 1, "repintou o painel");
});

test("botão Pausar rate-limited: responde efêmero e NÃO alterna nem repinta", async () => {
  const player = makePlayer({ mine: true });
  const blocking = { ...noThrottle, minInterval: () => ({ allowed: false, retryInMs: 1500 }) };
  const core = makeCore({ player, throttle: blocking });
  const out = capture(core, ALL_OUT);

  await core.dispatchButton(btn({ customId: "player:playpause" }));

  assert.equal(player.calls.length, 0, "não alternou a pausa");
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 0, "não repintou");
  const eph = out.filter(([e]) => e === "reply.ephemeral");
  assert.equal(eph.length, 1, "respondeu efêmero pedindo pra esperar");
  assert.match(eph[0][1].content, /espera/i);
});

test("botão Pausar com mine=false: publica pause_toggle pro dono, sem agir local", async () => {
  const published = [];
  const player = makePlayer({ mine: false });
  const core = makeCore({ player });
  core._publishQueueEvent = (...a) => published.push(a);
  const out = capture(core, ALL_OUT);

  await core.dispatchButton(btn({ customId: "player:playpause" }));

  assert.equal(player.calls.length, 0, "não alterou local (não é o dono)");
  assert.equal(published.length, 1, "publicou um evento");
  assert.equal(published[0][2].type, "pause_toggle", "tipo pause_toggle");
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 1, "repintou o painel");
});

test("botão em painel obsoleto (ack=false): followUp e nenhuma edição", async () => {
  const core = makeCore({ acker: { ack: async () => false } });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn());
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 0);
  const fu = out.filter(([e]) => e === "reply.followUp");
  assert.equal(fu.length, 1);
  assert.equal(fu[0][1].replyToken, "tok");
});

test("botão Anterior sem histórico: followUp e sem editar painel", async () => {
  const api = makeApi({ previousGuild: async () => ({ moved: false }) });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:prev" }));
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 0);
  assert.equal(out.filter(([e]) => e === "reply.followUp").length, 1);
});

test("botão Sair: apaga o painel, desconecta (mine) e não edita", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:leave" }));
  assert.equal(out.filter(([e]) => e === "panel.delete").length, 1);
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 0);
  assert.ok(player.calls.some((c) => c[0] === "stopAndDisconnect"));
});

test("botão Sair com Rails pendurado: desconecta JÁ, sem esperar a api", async () => {
  const api = makeApi({ stopGuild: () => new Promise(() => {}) });
  const player = makePlayer({ mine: true });
  const core = makeCore({ api, player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:leave" }));
  assert.ok(player.calls.some((c) => c[0] === "stopAndDisconnect"), "desconectou sem esperar o Rails");
  assert.equal(out.filter(([e]) => e === "panel.delete").length, 1);
  assert.equal(out.filter(([e]) => e === "reply.followUp").length, 1, "respondeu mesmo com Rails pendurado");
});

test("botão Lo-Fi com mine=true: toca a estação Focus, esvazia a fila e troca pro painel lo-fi", async () => {
  const cleared = [];
  const api = makeApi({ clearAllGuild: async (...a) => { cleared.push(a); return {}; } });
  const player = makePlayer({ mine: true });
  const core = makeCore({ api, player });
  const out = capture(core, ALL_OUT);

  await core.dispatchButton(btn({ customId: "player:lofi" }));

  const lofi = player.calls.find((c) => c[0] === "playLofi");
  assert.ok(lofi, "chamou playLofi");
  assert.equal(lofi[3]?.value, "focus", "estação padrão = Focus");
  assert.equal(cleared.length, 1, "esvaziou a fila do Rails");
  const edits = out.filter(([e]) => e === "panel.editRef");
  assert.equal(edits.length, 1, "redesenhou via editRef");
  assert.ok(edits[0][1].panel.embeds[0].data.title.includes("Lo-fi"), "painel trocado pro lo-fi");
});

test("botão Lo-Fi com mine=false: avisa que outro player controla a rádio, sem agir", async () => {
  const player = makePlayer({ mine: false });
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:lofi" }));
  assert.equal(player.calls.filter((c) => c[0] === "playLofi").length, 0, "não tocou lo-fi");
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 0, "não redesenhou");
  assert.equal(out.filter(([e]) => e === "reply.followUp").length, 1, "avisou quem clicou");
});

test("botão Parar com Rails pendurado: stopKeep JÁ, sem esperar a api", async () => {
  const api = makeApi({ clearAllGuild: () => new Promise(() => {}) });
  const player = makePlayer({ mine: true });
  const core = makeCore({ api, player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:stop" }));
  assert.deepEqual(player.calls.map((c) => c[0]), ["stopKeep"], "parou local sem esperar o Rails");
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 1, "redesenhou o painel");
});

test("botão sem canal de voz: recusa efêmera, sem ack/api", async () => {
  const player = makePlayer();
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ voiceChannelId: null }));
  const eph = out.filter(([e]) => e === "reply.ephemeral");
  assert.equal(eph.length, 1);
  assert.match(eph[0][1].content, /canal de voz/);
});

test("botão throttled: só recusa efêmera, sem tocar api nem player", async () => {
  const throttle = { isDuplicate: () => true, checkRate: () => ({ allowed: true }) };
  const player = makePlayer({ mine: true });
  const core = makeCore({ player, throttle });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn());
  assert.equal(out.length, 1);
  assert.equal(out[0][0], "reply.ephemeral");
  assert.equal(player.calls.length, 0);
});

test("botão Guardar (grab): manda a faixa na DM de quem clicou, sem redesenhar o painel", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:grab", userId: "u1" }));
  const dm = out.find(([e]) => e === "dm.send");
  assert.ok(dm, "emitiu dm.send");
  assert.equal(dm[1].userId, "u1");
  assert.match(dm[1].content, /guardada/i);
  assert.equal(out.filter(([e]) => e === "panel.editRef").length, 0, "não redesenha o painel");
});

test("botão Guardar sem nada tocando avisa via followUp", async () => {
  const api = makeApi({ getGuildQueue: async () => ({ current: null, upcoming: [] }) });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:grab" }));
  assert.ok(out.some(([e]) => e === "reply.followUp"), "avisa via followUp");
  assert.equal(out.filter(([e]) => e === "dm.send").length, 0);
});

const cmd = (over = {}) => ({
  guildId: "g1", commandName: "queue", userId: "u1", userTag: "alex#1",
  voiceChannelId: "vc1", voiceChannelName: "Geral",
  textChannelRef: "tc-ref", voiceChannelRef: "vc-ref", options: {}, replyToken: "tok", ...over,
});

test("/nowplaying reposta o painel no fim do chat", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "nowplaying" }));
  const repost = out.filter(([e]) => e === "panel.repost");
  assert.equal(repost.length, 1);
  assert.equal(repost[0][1].channelId, "vc1");
  assert.equal(repost[0][1].textChannelRef, "tc-ref");
  assert.ok(repost[0][1].panel.embeds);
  assert.equal(out.filter(([e]) => e === "reply.ephemeral").length, 1, "ack/confirma a quem digitou");
});

test("/top escopo=user manda a tag de quem chamou (requested_by) e devolve embed", async () => {
  let received = null;
  const api = makeApi({ topSongs: async (args) => { received = args; return { scope: "user", songs: [{ rank: 1, title: "X", plays: 2 }] }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);

  await core.dispatchCommand(cmd({ commandName: "top", userTag: "alex#1", options: { escopo: "user" } }));

  assert.equal(received.scope, "user");
  assert.equal(received.user, "alex#1", "filtra pela tag de quem chamou");
  const reply = out.filter(([e]) => e === "reply.ephemeral");
  assert.equal(reply.length, 1);
  assert.ok(reply[0][1].content.embeds, "responde com embed do ranking");
});

test("/top escopo=guild manda o guildId; global não manda user nem guild", async () => {
  let received = null;
  const api = makeApi({ topSongs: async (args) => { received = args; return { scope: "guild", songs: [] }; } });
  const core = makeCore({ api });

  await core.dispatchCommand(cmd({ commandName: "top", guildId: "g1", options: { escopo: "guild" } }));
  assert.equal(received.scope, "guild");
  assert.equal(received.guildId, "g1");

  await core.dispatchCommand(cmd({ commandName: "top", options: { escopo: "global" } }));
  assert.equal(received.scope, "global");
  assert.equal(received.user, undefined);
  assert.equal(received.guildId, undefined);
});

test("/top propaga o período escolhido", async () => {
  let received = null;
  const api = makeApi({ topSongs: async (args) => { received = args; return { scope: "global", songs: [] }; } });
  const core = makeCore({ api });
  await core.dispatchCommand(cmd({ commandName: "top", options: { escopo: "global", periodo: "week" } }));
  assert.equal(received.period, "week");
});

test("/top: falha da API vira aviso efêmero, não derruba", async () => {
  const api = makeApi({ topSongs: async () => { throw new Error("Rails fora"); } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "top", options: { escopo: "global" } }));
  const reply = out.filter(([e]) => e === "reply.ephemeral");
  assert.equal(reply.length, 1);
  assert.match(reply[0][1].content, /não consegui buscar o ranking/i);
});

test("/shuffle: embaralha a fila e confirma, repintando o painel", async () => {
  let called = null;
  const api = makeApi({ shuffleQueue: async (...a) => { called = a; return { shuffled: 3 }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "shuffle" }));
  assert.deepEqual(called.slice(0, 2), ["g1", "vc1"]);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /embaralhada/i);
  assert.equal(out.filter(([e]) => e === "panel.upsert").length, 1);
});

test("/shuffle: sem voice channel avisa e não chama a API", async () => {
  let called = false;
  const api = makeApi({ shuffleQueue: async () => { called = true; return { shuffled: 0 }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "shuffle", voiceChannelId: null }));
  assert.equal(called, false);
  assert.match(out[0][1].content, /canal de voz/i);
});

test("/remove: passa a posição e confirma a faixa removida", async () => {
  let received = null;
  const api = makeApi({ removeFromQueue: async (g, c, pos) => { received = pos; return { removed: { id: "i", title: "X" } }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "remove", options: { posicao: 2 } }));
  assert.equal(received, 2);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /removida/i);
});

test("/remove: posição inválida (erro da API) vira aviso efêmero", async () => {
  const api = makeApi({ removeFromQueue: async () => { throw new Error("Posição inválida."); } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "remove", options: { posicao: 99 } }));
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /inválida/i);
});

test("/move: passa de/para e confirma", async () => {
  let received = null;
  const api = makeApi({ moveInQueue: async (g, c, from, to) => { received = [from, to]; return { moved: { id: "i", title: "X" }, from, to }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "move", options: { de: 1, para: 3 } }));
  assert.deepEqual(received, [1, 3]);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /movida/i);
});

test("/historico lista as últimas tocadas (embed)", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "historico" }));
  const reply = out.find(([e]) => e === "reply.ephemeral");
  assert.ok(reply[1].content.embeds, "responde com embed do histórico");
});

test("/historico vazio avisa sem quebrar", async () => {
  const api = makeApi({ getGuildHistory: async () => ({ history: [] }) });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "historico" }));
  assert.match(out[0][1].content, /histórico/i);
});

test("/replay usa a query do histórico na posição pedida e reenfileira", async () => {
  let enqueued = null;
  const api = makeApi({
    getGuildHistory: async () => ({ history: [
      { position: 1, title: "Um", query: "/songs/aaa" },
      { position: 2, title: "Dois", query: "titulo dois" },
    ] }),
    enqueue: async (g, c, query) => { enqueued = query; return { started_now: true, position: 1, item: { id: "i", title: "Dois" } }; },
  });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "replay", options: { posicao: 2 } }));
  assert.equal(enqueued, "titulo dois", "reenfileira a query da posição 2");
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /repetindo/i);
});

test("/replay sem posição usa a última (posição 1)", async () => {
  let enqueued = null;
  const api = makeApi({
    getGuildHistory: async () => ({ history: [{ position: 1, title: "Um", query: "/songs/aaa" }] }),
    enqueue: async (g, c, query) => { enqueued = query; return { started_now: false, position: 3, item: { id: "i", title: "Um" } }; },
  });
  const core = makeCore({ api });
  await core.dispatchCommand(cmd({ commandName: "replay", options: {} }));
  assert.equal(enqueued, "/songs/aaa");
});

test("/replay com histórico vazio na posição avisa", async () => {
  const api = makeApi({ getGuildHistory: async () => ({ history: [] }) });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "replay", options: { posicao: 1 } }));
  assert.match(out[0][1].content, /histórico/i);
});

test("/fav add favorita a faixa atual do canal", async () => {
  let called = null;
  const api = makeApi({ addFavorite: async (uid, g, c) => { called = [uid, g, c]; return { favorite: { id: 1, title: "Atual" } }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "fav", subcommand: "add", userId: "u1", guildId: "g1", voiceChannelId: "vc1" }));
  assert.deepEqual(called, ["u1", "g1", "vc1"]);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /favoritada/i);
});

test("/fav add sem nada tocando (404) avisa amigável", async () => {
  const api = makeApi({ addFavorite: async () => { const e = new Error("Nada tocando"); e.status = 404; throw e; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "fav", subcommand: "add", voiceChannelId: "vc1" }));
  assert.match(out[0][1].content, /nada tocando/i);
});

test("/fav list mostra o embed dos favoritos", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "fav", subcommand: "list" }));
  assert.ok(out.find(([e]) => e === "reply.ephemeral")[1].content.embeds);
});

test("/fav remove tira o favorito na posição", async () => {
  let removedId = null;
  const api = makeApi({
    listFavorites: async () => ({ favorites: [{ id: 10, position: 1, title: "A" }, { id: 20, position: 2, title: "B" }] }),
    removeFavorite: async (uid, id) => { removedId = id; return { ok: true }; },
  });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "fav", subcommand: "remove", userId: "u1", options: { posicao: 2 } }));
  assert.equal(removedId, 20);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /removido/i);
});

test("/play favs toca os favoritos: 1º pelo dispatch, resto enfileirado", async () => {
  const enq = [];
  const api = makeApi({
    listFavorites: async () => ({ favorites: [{ id: 1, title: "Um", query: "/songs/a" }, { id: 2, title: "Dois", query: "titulo" }] }),
    enqueue: async (g, c, query) => { enq.push(query); return { started_now: true, position: 1, item: { id: "i", title: "Um" } }; },
  });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "play", options: { musica: "favs" } }));
  assert.deepEqual(enq, ["/songs/a", "titulo"], "1ª + resto enfileirados na ordem");
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /favoritos/i);
});

test("/play favs sem favoritos avisa", async () => {
  const api = makeApi({ listFavorites: async () => ({ favorites: [] }) });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "play", options: { musica: "favs" } }));
  assert.match(out[0][1].content, /favoritos/i);
});

test("/play sem música pede um input (guard defensivo; a opção é required)", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "play", options: {} }));
  assert.match(out[0][1].content, /m[úu]sica/i);
});

test("/salvar_fila salva a fila como playlist e confirma", async () => {
  let called = null;
  const api = makeApi({ saveQueueAsPlaylist: async (g, c, name, uid) => { called = [g, c, name, uid]; return { playlist: { id: 1, name: "Minha" }, saved: 4 }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "salvar_fila", userId: "u1", options: { nome: "Minha" } }));
  assert.deepEqual(called, ["g1", "vc1", "Minha", "u1"]);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /salva como playlist/i);
});

test("/salvar_fila sem voice channel avisa", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "salvar_fila", voiceChannelId: null, options: { nome: "X" } }));
  assert.match(out[0][1].content, /canal de voz/i);
});

test("/dj list mostra o embed dos DJs", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "dj", subcommand: "list" }));
  assert.ok(out.find(([e]) => e === "reply.ephemeral")[1].content.embeds);
});

test("/dj add passa actorId/isAdmin e confirma", async () => {
  let received = null;
  const api = makeApi({ addDj: async (g, opts) => { received = opts; return { dj: {} }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "dj", subcommand: "add", userId: "admin1", isAdmin: true, targetUser: { id: "u9", username: "Fulano" } }));
  assert.equal(received.userId, "u9");
  assert.equal(received.actorId, "admin1");
  assert.equal(received.isAdmin, true);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /DJ/);
});

test("/dj add sem usuário pede o alvo", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "dj", subcommand: "add" }));
  assert.match(out[0][1].content, /usu[áa]rio/i);
});

test("/dj add negado (403) avisa", async () => {
  const api = makeApi({ addDj: async () => { const e = new Error("forbidden"); e.status = 403; throw e; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "dj", subcommand: "add", targetUser: { id: "u9", username: "F" } }));
  assert.match(out[0][1].content, /DJ ou admin/i);
});

test("/dj remove confirma", async () => {
  let removed = null;
  const api = makeApi({ removeDj: async (g, uid) => { removed = uid; return { ok: true }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "dj", subcommand: "remove", targetUser: { id: "u9", username: "F" } }));
  assert.equal(removed, "u9");
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /não é mais DJ/i);
});

const djRestricted = () => ({ listDjs: async () => ({ djs: [{ discord_user_id: "dj1" }], restricted: true }) });

test("modo DJ: /skip de não-DJ é barrado (não chama skipGuild)", async () => {
  let skipped = false;
  const api = makeApi({ ...djRestricted(), skipGuild: async () => { skipped = true; return { skipped: true, has_current: true, playable: {}, item: { id: "i" } }; } });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "skip", userId: "rando", isAdmin: false }));
  assert.equal(skipped, false, "não pulou");
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /DJs/);
});

test("modo DJ: um DJ pode dar /skip", async () => {
  let skipped = false;
  const api = makeApi({ ...djRestricted(), skipGuild: async () => { skipped = true; return { skipped: true, has_current: true, playable: {}, item: { id: "i", title: "X" } }; } });
  const core = makeCore({ api });
  await core.dispatchCommand(cmd({ commandName: "skip", userId: "dj1" }));
  assert.equal(skipped, true);
});

test("modo DJ: admin do servidor pode dar /skip sem ser DJ", async () => {
  let skipped = false;
  const api = makeApi({ ...djRestricted(), skipGuild: async () => { skipped = true; return { skipped: true, has_current: true, playable: {}, item: { id: "i", title: "X" } }; } });
  const core = makeCore({ api });
  await core.dispatchCommand(cmd({ commandName: "skip", userId: "rando", isAdmin: true }));
  assert.equal(skipped, true);
});

test("modo aberto (sem DJs): /skip liberado pra todos", async () => {
  let skipped = false;
  const api = makeApi({ skipGuild: async () => { skipped = true; return { skipped: true, has_current: true, playable: {}, item: { id: "i", title: "X" } }; } });
  const core = makeCore({ api });
  await core.dispatchCommand(cmd({ commandName: "skip", userId: "qualquer" }));
  assert.equal(skipped, true);
});

test("modo DJ: botão Parar de não-DJ é barrado (não para nem limpa)", async () => {
  let cleared = false;
  const api = makeApi({ ...djRestricted(), clearAllGuild: async () => { cleared = true; return {}; } });
  const player = makePlayer({ mine: true });
  const core = makeCore({ api, player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:stop", userId: "rando", isAdmin: false }));
  assert.equal(player.calls.length, 0, "não agiu no player");
  assert.equal(cleared, false, "não limpou a fila no Rails");
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /DJs/);
});

test("modo DJ: DJ pode clicar Parar", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ api: makeApi(djRestricted()), player });
  await core.dispatchButton(btn({ customId: "player:stop", userId: "dj1", isAdmin: false }));
  assert.deepEqual(player.calls[0], ["stopKeep", "g1"]);
});

test("modo DJ: admin do servidor pode clicar Parar sem ser DJ", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ api: makeApi(djRestricted()), player });
  await core.dispatchButton(btn({ customId: "player:stop", userId: "rando", isAdmin: true }));
  assert.deepEqual(player.calls[0], ["stopKeep", "g1"]);
});

test("modo DJ: botão Guardar (grab) segue livre pra não-DJ (só leitura)", async () => {
  const core = makeCore({ api: makeApi(djRestricted()) });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "player:grab", userId: "rando", isAdmin: false }));
  assert.ok(out.find(([e]) => e === "dm.send"), "mandou a DM normalmente");
});

test("modo DJ: botão do painel lo-fi de não-DJ é barrado", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ api: makeApi(djRestricted()), player });
  const out = capture(core, ALL_OUT);
  await core.dispatchButton(btn({ customId: "lofi:leave", userId: "rando", isAdmin: false }));
  assert.equal(player.calls.length, 0, "não agiu no player");
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /DJs/);
});

test("/play (mine): toca local, confirma efêmero e upserta o painel", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ player });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "play", options: { musica: "lofi" } }));
  assert.ok(player.calls.some((c) => c[0] === "ensureConnectedAndPlay"));
  assert.equal(out.filter(([e]) => e === "panel.upsert").length, 1);
  assert.equal(out.filter(([e]) => e === "reply.ephemeral").length, 1);
});

test("/play sem bot livre (409): mensagem de ocupado, sem painel", async () => {
  const botPool = makeBotPool({ onChannel: null, free: [] });
  const core = makeCore({ botPool });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "play", options: { musica: "x" } }));
  const eph = out.filter(([e]) => e === "reply.ephemeral");
  assert.equal(eph.length, 1);
  assert.match(eph[0][1].content, /ocupados/);
  assert.equal(out.filter(([e]) => e === "panel.upsert").length, 0);
});

test("/skip sem próxima: avisa e não upserta painel", async () => {
  const api = makeApi({ skipGuild: async () => ({ skipped: false, has_current: true }) });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "skip" }));
  assert.equal(out.filter(([e]) => e === "panel.upsert").length, 0);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /última/);
});

test("/limpar_fila: confirma e upserta painel", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "limpar_fila" }));
  assert.equal(out.filter(([e]) => e === "panel.upsert").length, 1);
  assert.match(out.find(([e]) => e === "reply.ephemeral")[1].content, /Fila limpa/);
});

test("/queue vazia: responde 'fila vazia' sem embed", async () => {
  const api = makeApi({ getGuildQueue: async () => ({ current: null, upcoming: [] }) });
  const core = makeCore({ api });
  const out = capture(core, ALL_OUT);
  await core.dispatchCommand(cmd({ commandName: "queue" }));
  assert.equal(out.find(([e]) => e === "reply.ephemeral")[1].content, "A fila está vazia.");
});

test("autocomplete /playlist: devolve choices com id como value", async () => {
  const core = makeCore();
  const out = capture(core, ALL_OUT);
  await core.dispatchAutocomplete({ commandName: "playlist", userId: "u1", focusedValue: "ro", replyToken: "tok" });
  const r = out.find(([e]) => e === "autocomplete.respond");
  assert.deepEqual(r[1].choices, [{ name: "Rock", value: "7" }]);
});

test("voz: canal vazio no MEU canal → requestLeaveGrace", async () => {
  const player = makePlayer({ methods: { playingInChannel: (g, c) => c === "vc1" } });
  const core = makeCore({ player });
  await core.dispatchVoiceUpdate({ guildId: "g1", channelId: "vc1", humansInChannel: 0 });
  assert.ok(player.calls.some((c) => c[0] === "requestLeaveGrace"), "agenda saída");
  assert.ok(player.calls.some((c) => c[0] === "pauseForEmpty"), "auto-pausa (Épico 3)");
});

test("voz: alguém entrou → cancelLeaveGrace + resumeIfAutoPaused", async () => {
  const player = makePlayer({ methods: { playingInChannel: (g, c) => c === "vc1" } });
  const core = makeCore({ player });
  await core.dispatchVoiceUpdate({ guildId: "g1", channelId: "vc1", humansInChannel: 2 });
  assert.ok(player.calls.some((c) => c[0] === "cancelLeaveGrace"), "cancela saída");
  assert.ok(player.calls.some((c) => c[0] === "resumeIfAutoPaused"), "retoma (Épico 3)");
});

test("voz: canal que não é meu → ignora", async () => {
  const player = makePlayer({ methods: { playingInChannel: () => false } });
  const core = makeCore({ player });
  await core.dispatchVoiceUpdate({ guildId: "g1", channelId: "vc9", humansInChannel: 0 });
  assert.equal(player.calls.length, 0);
});

test("pool: assignment vencido → ensureConnectedAndPlay uma vez", async () => {
  const player = makePlayer({ currentItemId: null });
  const core = makeCore({ player });
  await core.dispatchAssignmentWon({ guildId: "g1", voiceChannelRef: "vc-ref", playable: {}, item: { id: "i-9" } });
  const c = player.calls.find((x) => x[0] === "ensureConnectedAndPlay");
  assert.ok(c, "tocou");
  assert.equal(c[2], "vc-ref", "passou o ref opaco do canal");
  assert.equal(c[4].id, "i-9");
});

test("pool: mesmo item já tocando → no-op idempotente", async () => {
  const player = makePlayer({ currentItemId: "i-9" });
  const core = makeCore({ player });
  await core.dispatchAssignmentWon({ guildId: "g1", voiceChannelRef: "vc-ref", playable: {}, item: { id: "i-9" } });
  assert.equal(player.calls.filter((c) => c[0] === "ensureConnectedAndPlay").length, 0);
});

const lofiCmd = (over = {}) => ({
  guildId: "g1", commandName: "lofi-radio", userId: "u1", userTag: "alex#1",
  voiceChannelId: "vc1", voiceChannelName: "Geral", voiceChannelRef: "vc-ref",
  textChannelRef: "tc-ref", options: { estacao: "tokyo" }, replyToken: "tok", ...over,
});

const lofiBtn = (over = {}) => ({
  guildId: "g1", customId: "lofi:focus", userId: "u1", userTag: "alex#1",
  voiceChannelId: "vc1", voiceChannelName: "Geral", voiceChannelRef: "vc-ref",
  panelRef: "panel-ref", textChannelRef: "tc-ref", replyToken: "tok", ...over,
});

test("/lofi-radio: toca a estação via playLofi (URL do relay) e confirma efêmero", async () => {
  const player = makePlayer();
  const core = makeCore({ player });
  const got = capture(core, ALL_OUT);
  await core.dispatchCommand(lofiCmd());
  const call = player.calls.find((c) => c[0] === "playLofi");
  assert.ok(call, "deve chamar playLofi");
  assert.equal(call[1], "g1");
  assert.equal(call[2], "vc-ref");
  assert.equal(call[3].label, "Lofi Tokyo");
  assert.match(call[3].url, /\/tokyo\.opus$/);
  const reply = got.find((g) => g[0] === "reply.ephemeral");
  assert.match(reply[1].content, /Lofi Tokyo/);
  const up = got.find((g) => g[0] === "panel.upsert");
  assert.ok(up, "deve postar o painel lo-fi");
  assert.equal(up[1].channelId, "vc1");
  assert.equal(up[1].textChannelRef, "tc-ref");
  const row = up[1].panel.components[0].toJSON();
  const ids = row.components.map((c) => c.custom_id);
  assert.deepEqual(ids, ["lofi:focus", "lofi:anime", "lofi:anime2", "lofi:akita", "lofi:leave"]);
});

test("botão lofi troca de estação via playLofi e redesenha o painel (editRef)", async () => {
  const player = makePlayer();
  const core = makeCore({ player });
  const got = capture(core, ALL_OUT);
  await core.dispatchButton(lofiBtn({ customId: "lofi:anime" }));
  const call = player.calls.find((c) => c[0] === "playLofi");
  assert.ok(call, "deve chamar playLofi com a estação clicada");
  assert.equal(call[3].label, "Lofi Anime");
  const edit = got.find((g) => g[0] === "panel.editRef");
  assert.ok(edit, "redesenha a mensagem do botão");
  assert.equal(edit[1].panelRef, "panel-ref");
  const ids = edit[1].panel.components[0].toJSON().components.map((c) => c.custom_id);
  assert.deepEqual(ids, ["lofi:tokyo", "lofi:focus", "lofi:anime2", "lofi:akita", "lofi:leave"]);
});

test("botão lofi:leave apaga o painel e desconecta (mine)", async () => {
  const player = makePlayer({ mine: true });
  const core = makeCore({ player });
  const got = capture(core, ALL_OUT);
  await core.dispatchButton(lofiBtn({ customId: "lofi:leave" }));
  assert.equal(got.filter((g) => g[0] === "panel.delete").length, 1);
  assert.equal(got.filter((g) => g[0] === "panel.editRef").length, 0);
  assert.ok(player.calls.some((c) => c[0] === "stopAndDisconnect"));
  assert.equal(player.calls.filter((c) => c[0] === "playLofi").length, 0);
});

test("botão lofi sem canal de voz: recusa efêmera, sem tocar", async () => {
  const player = makePlayer();
  const core = makeCore({ player });
  const got = capture(core, ALL_OUT);
  await core.dispatchButton(lofiBtn({ voiceChannelId: null }));
  assert.equal(player.calls.length, 0);
  assert.match(got.find((g) => g[0] === "reply.ephemeral")[1].content, /canal de voz/);
});

test("/lofi-radio sem canal de voz: pede pra entrar e não toca", async () => {
  const player = makePlayer();
  const core = makeCore({ player });
  const got = capture(core, ALL_OUT);
  await core.dispatchCommand(lofiCmd({ voiceChannelId: null, voiceChannelRef: null }));
  assert.equal(player.calls.filter((c) => c[0] === "playLofi").length, 0);
  assert.match(got.find((g) => g[0] === "reply.ephemeral")[1].content, /canal de voz/);
});

test("/lofi-radio com estação desconhecida: recusa sem tocar", async () => {
  const player = makePlayer();
  const core = makeCore({ player });
  const got = capture(core, ALL_OUT);
  await core.dispatchCommand(lofiCmd({ options: { estacao: "nope" } }));
  assert.equal(player.calls.filter((c) => c[0] === "playLofi").length, 0);
  assert.match(got.find((g) => g[0] === "reply.ephemeral")[1].content, /desconhecida/);
});

test("/lofi-radio: erro do player vira aviso efêmero", async () => {
  const player = makePlayer({ lofiThrows: true });
  const core = makeCore({ player });
  const got = capture(core, ALL_OUT);
  await core.dispatchCommand(lofiCmd());
  assert.match(got.find((g) => g[0] === "reply.ephemeral")[1].content, /⚠️/);
});

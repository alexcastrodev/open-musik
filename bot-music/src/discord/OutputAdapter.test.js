
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { OutputAdapter } from "./OutputAdapter.js";
import { RefRegistry } from "./refs.js";

function makeChannelMessage(channel, id) {
  return {
    id,
    channel,
    edits: [],
    deleted: false,
    async edit(payload) {
      if (this.deleted) throw new Error("Unknown Message");
      this.edits.push(payload);
      return this;
    },
    async delete() {
      this.deleted = true;
      channel.sent = channel.sent.filter((m) => m !== this);
    },
  };
}

function makeTextChannel() {
  let seq = 0;
  const channel = {
    sent: [],
    async send(payload) {
      const msg = makeChannelMessage(channel, `msg-${++seq}`);
      msg.edits.push(payload);
      channel.sent.push(msg);
      return msg;
    },
  };
  return channel;
}

function setup() {
  const core = new EventEmitter();
  const replies = new RefRegistry();
  const refs = new RefRegistry();
  const out = new OutputAdapter(core, { replyRegistry: replies, refRegistry: refs, logger: { warn() {} } });
  return { core, replies, refs, out };
}

const PANEL = { embeds: [{ t: 1 }], components: [] };
const PANEL2 = { embeds: [{ t: 2 }], components: [] };

const flush = () => new Promise((r) => setImmediate(r));

test("upsert cria o painel; novo upsert edita o mesmo (sem duplicar)", async () => {
  const { core, refs, out } = setup();
  const tc = makeTextChannel();
  const tcRef = refs.put(tc, "tc");

  core.emit("panel.upsert", { guildId: "g", channelId: "c", textChannelRef: tcRef, panel: PANEL });
  await flush();
  assert.equal(tc.sent.length, 1, "postou 1 painel");

  core.emit("panel.upsert", { guildId: "g", channelId: "c", textChannelRef: refs.put(tc, "tc"), panel: PANEL2 });
  await flush();
  assert.equal(tc.sent.length, 1, "não duplicou — editou o existente");
  assert.equal(out.panelMessages.get("g:c").edits.at(-1), PANEL2);
});

test("repost apaga o antigo e posta um novo embaixo", async () => {
  const { core, refs, out } = setup();
  const tc = makeTextChannel();
  core.emit("panel.upsert", { guildId: "g", channelId: "c", textChannelRef: refs.put(tc, "tc"), panel: PANEL });
  await flush();
  const old = out.panelMessages.get("g:c");

  core.emit("panel.repost", { guildId: "g", channelId: "c", textChannelRef: refs.put(tc, "tc"), panel: PANEL2 });
  await flush();

  const current = out.panelMessages.get("g:c");
  assert.ok(old.deleted, "antigo apagado");
  assert.notEqual(current.id, old.id, "novo painel é outra mensagem");
  assert.equal(tc.sent.length, 1, "só o novo segue no chat");
});

test("editRef na msg corrente: edita e mantém o ponteiro", async () => {
  const { core, refs, out } = setup();
  const tc = makeTextChannel();
  core.emit("panel.upsert", { guildId: "g", channelId: "c", textChannelRef: refs.put(tc, "tc"), panel: PANEL });
  await flush();
  const current = out.panelMessages.get("g:c");

  const ref = refs.put(current, "panel");
  core.emit("panel.editRef", { panelRef: ref, guildId: "g", channelId: "c", panel: PANEL2 });
  await flush();

  assert.equal(current.edits.at(-1), PANEL2, "editou a msg");
  assert.equal(out.panelMessages.get("g:c").id, current.id, "ponteiro segue na mesma msg");
});

test("editRef numa msg NÃO-corrente (ainda viva): edita o visual sem roubar o ponteiro", async () => {
  const { core, refs, out } = setup();
  const tc = makeTextChannel();
  core.emit("panel.upsert", { guildId: "g", channelId: "c", textChannelRef: refs.put(tc, "tc"), panel: PANEL });
  await flush();
  const current = out.panelMessages.get("g:c");

  const stale = makeChannelMessage(tc, "stale-1");
  const ref = refs.put(stale, "panel");
  core.emit("panel.editRef", { panelRef: ref, guildId: "g", channelId: "c", panel: PANEL2 });
  await flush();

  assert.equal(stale.edits.at(-1), PANEL2, "editou o visual do painel clicado");
  assert.equal(out.panelMessages.get("g:c").id, current.id, "ponteiro NÃO foi roubado");
});

test("panel.edit sem painel registrado: no-op silencioso", async () => {
  const { core, out } = setup();
  core.emit("panel.edit", { guildId: "g", channelId: "c", panel: PANEL });
  await flush();
  assert.equal(out.panelMessages.size, 0);
});

test("panel.edit que falha (msg apagada) remove do Map", async () => {
  const { core, refs, out } = setup();
  const tc = makeTextChannel();
  core.emit("panel.upsert", { guildId: "g", channelId: "c", textChannelRef: refs.put(tc, "tc"), panel: PANEL });
  await flush();
  out.panelMessages.get("g:c").deleted = true;

  core.emit("panel.edit", { guildId: "g", channelId: "c", panel: PANEL2 });
  await flush();
  assert.equal(out.panelMessages.has("g:c"), false, "painel removido do Map ao falhar");
});

test("panel.edit com o MESMO conteúdo do último envio: pula o .edit() no Discord", async () => {
  const { core, refs, out } = setup();
  const tc = makeTextChannel();
  core.emit("panel.upsert", { guildId: "g", channelId: "c", textChannelRef: refs.put(tc, "tc"), panel: PANEL });
  await flush();
  const msg = out.panelMessages.get("g:c");
  const editsBefore = msg.edits.length;

  core.emit("panel.edit", { guildId: "g", channelId: "c", panel: { embeds: [{ t: 1 }], components: [] } });
  await flush();

  assert.equal(msg.edits.length, editsBefore, "não chamou .edit() de novo — conteúdo idêntico");
});

test("panel.edit com conteúdo DIFERENTE: edita normalmente", async () => {
  const { core, refs, out } = setup();
  const tc = makeTextChannel();
  core.emit("panel.upsert", { guildId: "g", channelId: "c", textChannelRef: refs.put(tc, "tc"), panel: PANEL });
  await flush();
  const msg = out.panelMessages.get("g:c");

  core.emit("panel.edit", { guildId: "g", channelId: "c", panel: PANEL2 });
  await flush();

  assert.equal(msg.edits.at(-1), PANEL2, "editou — conteúdo mudou de fato");
});

test("reply.ephemeral edita a resposta da interação e esquece o token", async () => {
  const { core, replies } = setup();
  const edits = [];
  const token = replies.put({ async editReply(p) { edits.push(p); } }, "tok");
  core.emit("reply.ephemeral", { replyToken: token, content: "oi" });
  await flush();
  assert.deepEqual(edits, ["oi"]);
  assert.equal(replies.get(token), undefined, "token esquecido após responder");
});

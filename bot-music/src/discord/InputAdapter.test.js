import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PermissionFlagsBits } from "discord.js";

import { InputAdapter } from "./InputAdapter.js";
import { RefRegistry } from "./refs.js";

function setup() {
  const client = new EventEmitter();
  let captured = null;
  const core = { dispatchButton: async (input) => { captured = input; } };
  const adapter = new InputAdapter({
    client,
    core,
    replyRegistry: new RefRegistry(),
    refRegistry: new RefRegistry(),
  });
  adapter.attach();
  return {
    emit: (interaction) => client.emit("interactionCreate", interaction),
    get captured() { return captured; },
  };
}

function buttonInteraction({ admin = false } = {}) {
  return {
    isButton: () => true,
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    customId: "player:stop",
    guild: { id: "g1" },
    user: { id: "u1", tag: "User#1" },
    member: { voice: { channel: { id: "vc1", name: "Voz" } } },
    channel: { id: "tc1" },
    message: {},
    memberPermissions: { has: (flag) => admin && flag === PermissionFlagsBits.Administrator },
    locale: "pt-BR",
  };
}

test("botão do painel: encaminha isAdmin=true quando quem clica é admin do servidor", async () => {
  const h = setup();
  h.emit(buttonInteraction({ admin: true }));
  await Promise.resolve();
  assert.equal(h.captured.isAdmin, true);
});

test("botão do painel: encaminha isAdmin=false quando quem clica não é admin", async () => {
  const h = setup();
  h.emit(buttonInteraction({ admin: false }));
  await Promise.resolve();
  assert.equal(h.captured.isAdmin, false);
});

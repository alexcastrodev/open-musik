
const panelKey = (guildId, channelId) => `${guildId}:${channelId}`;

export class OutputAdapter {
  constructor(core, { client = null, replyRegistry, refRegistry, logger = console } = {}) {
    this.core = core;
    this.client = client;
    this.replies = replyRegistry;
    this.refs = refRegistry;
    this.log = logger;
    this.panelMessages = new Map();
    this.panelSignatures = new Map();
    this.#subscribe();
  }

  #panelSignature(panel) {
    return JSON.stringify(panel);
  }

  #subscribe() {
    const c = this.core;
    c.on("reply.ephemeral", (p) => this.#onReplyEphemeral(p));
    c.on("reply.followUp", (p) => this.#onFollowUp(p));
    c.on("panel.edit", (p) => this.#onPanelEdit(p));
    c.on("panel.editRef", (p) => this.#onPanelEditRef(p));
    c.on("panel.upsert", (p) => this.#onPanelUpsert(p));
    c.on("panel.upsertById", (p) => this.#onPanelUpsertById(p));
    c.on("panel.repost", (p) => this.#onPanelRepost(p));
    c.on("panel.delete", (p) => this.#onPanelDelete(p));
    c.on("autocomplete.respond", (p) => this.#onAutocomplete(p));
    c.on("dm.send", (p) => this.#onDmSend(p));
    c.on("chat.send", (p) => this.#onChatSend(p));
  }

  async #onReplyEphemeral({ replyToken, content }) {
    const interaction = this.replies.get(replyToken);
    if (!interaction) return;
    try {
      await interaction.editReply(content);
    } catch (e) {
      this.log.warn?.(`[output] reply.ephemeral falhou: ${e.message}`);
    } finally {
      this.replies.forget(replyToken);
    }
  }

  async #onChatSend({ channelId, content }) {
    if (!channelId || !content) return;
    try {
      const channel = await this.client?.channels?.fetch(channelId);
      if (channel?.isTextBased?.()) await channel.send(content);
    } catch (e) {
      this.log.warn?.(`[output] chat.send falhou: ${e.message}`);
    }
  }

  async #onDmSend({ userId, content, replyToken }) {
    let ok = false;
    try {
      const user = await this.client?.users?.fetch(userId);
      if (user) {
        await user.send(content);
        ok = true;
      }
    } catch (e) {
      this.log.warn?.(`[output] dm.send falhou: ${e.message}`);
    }

    const interaction = this.replies.get(replyToken);
    if (!interaction) return;
    const msg = ok
      ? "📬 Mandei a faixa na tua DM!"
      : "⚠️ Não consegui te enviar DM — abre as mensagens diretas do servidor e tenta de novo.";
    try {
      await interaction.followUp({ content: msg, flags: 64 /* Ephemeral */ });
    } catch (e) {
      this.log.warn?.(`[output] dm.send followUp falhou: ${e.message}`);
    }
  }

  async #onFollowUp({ replyToken, content }) {
    const interaction = this.replies.get(replyToken);
    if (!interaction) return;
    const payload = typeof content === "string" ? { content } : content;
    try {
      await interaction.followUp({ ...payload, flags: 64 /* Ephemeral */ });
    } catch (e) {
      this.log.warn?.(`[output] reply.followUp falhou: ${e.message}`);
    }
  }

  async #onPanelEdit({ guildId, channelId, panel }) {
    const key = panelKey(guildId, channelId);
    const msg = this.panelMessages.get(key);
    if (!msg) return;
    const sig = this.#panelSignature(panel);
    if (this.panelSignatures.get(key) === sig) return;
    try {
      const edited = await msg.edit(panel);
      this.panelMessages.set(key, edited);
      this.panelSignatures.set(key, sig);
    } catch (e) {
      this.log.warn?.(`[output] panel.edit falhou (${key}): ${e.message}`);
      this.panelMessages.delete(key);
      this.panelSignatures.delete(key);
    }
  }

  async #onPanelEditRef({ panelRef, guildId, channelId, panel }) {
    const msg = this.refs.get(panelRef);
    if (!msg) return;
    const key = panelKey(guildId, channelId);
    try {
      const edited = await msg.edit(panel);
      if (this.panelMessages.get(key)?.id === msg.id) {
        this.panelMessages.set(key, edited);
      }
    } catch (e) {
      this.log.warn?.(`[output] panel.editRef falhou (${key}): ${e.message}`);
    } finally {
      this.refs.forget(panelRef);
    }
  }

  async #onPanelUpsert({ guildId, channelId, textChannelRef, panel }) {
    await this.#upsert(guildId, channelId, textChannelRef, panel, { repost: false });
  }

  async #onPanelUpsertById({ guildId, channelId, textChannelId, panel }) {
    const key = panelKey(guildId, channelId);
    const existing = this.panelMessages.get(key);
    if (existing) {
      try {
        this.panelMessages.set(key, await existing.edit(panel));
        this.panelSignatures.set(key, this.#panelSignature(panel));
        return;
      } catch {
        this.panelMessages.delete(key);
        this.panelSignatures.delete(key);
      }
    }
    if (!textChannelId || !this.client) return;
    try {
      const textChannel = this.client.channels.cache.get(textChannelId)
        ?? await this.client.channels.fetch(textChannelId);
      if (!textChannel?.send) return;
      this.panelMessages.set(key, await textChannel.send(panel));
      this.panelSignatures.set(key, this.#panelSignature(panel));
    } catch (e) {
      this.log.warn?.(`[output] panel.upsertById falhou (${key}): ${e.message}`);
    }
  }

  async #onPanelRepost({ guildId, channelId, textChannelRef, panel }) {
    await this.#upsert(guildId, channelId, textChannelRef, panel, { repost: true });
  }

  async #upsert(guildId, channelId, textChannelRef, panel, { repost }) {
    const key = panelKey(guildId, channelId);
    const existing = this.panelMessages.get(key);
    if (existing && !repost) {
      try {
        const edited = await existing.edit(panel);
        this.panelMessages.set(key, edited);
        this.panelSignatures.set(key, this.#panelSignature(panel));
        return;
      } catch {
        this.panelMessages.delete(key);
        this.panelSignatures.delete(key);
      }
    }
    const textChannel = this.refs.get(textChannelRef);
    if (!textChannel?.send) {
      this.log.warn?.(`[output] panel upsert sem canal de texto (${key})`);
      return;
    }
    if (existing) existing.delete?.().catch(() => {});
    try {
      const msg = await textChannel.send(panel);
      this.panelMessages.set(key, msg);
      this.panelSignatures.set(key, this.#panelSignature(panel));
    } catch (e) {
      this.log.warn?.(`[output] panel send falhou (${key}): ${e.message}`);
    }
  }

  async #onPanelDelete({ guildId, channelId }) {
    const key = panelKey(guildId, channelId);
    this.panelMessages.get(key)?.delete?.().catch(() => {});
    this.panelMessages.delete(key);
    this.panelSignatures.delete(key);
  }

  async #onAutocomplete({ replyToken, choices }) {
    const interaction = this.replies.get(replyToken);
    if (!interaction) return;
    try {
      await interaction.respond(choices);
    } catch {
    } finally {
      this.replies.forget(replyToken);
    }
  }
}

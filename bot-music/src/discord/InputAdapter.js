
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { resolveLocale } from "../i18n/index.js";
import { PANEL_BUTTON_IDS } from "../core/panel.js";
import { isLofiButton } from "../core/lofiPanel.js";
import { ACK_DEFER_EPHEMERAL } from "../core/BotCore.js";

const COMMAND_OPTION_NAMES = ["musica", "nome", "fonte", "playlist", "estacao", "escopo", "periodo"];
const COMMAND_INT_OPTION_NAMES = ["posicao", "de", "para"];

export class InputAdapter {
  constructor({ client, core, replyRegistry, refRegistry, getPlayingChannelId = null, logger = console }) {
    this.client = client;
    this.core = core;
    this.replies = replyRegistry;
    this.refs = refRegistry;
    this.getPlayingChannelId = getPlayingChannelId;
    this.log = logger;
  }

  acker() {
    return {
      ack: async (replyToken, mode) => {
        const interaction = this.replies.get(replyToken);
        if (!interaction) return false;
        try {
          if (mode === ACK_DEFER_EPHEMERAL) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          } else {
            await interaction.deferUpdate();
          }
          return true;
        } catch {
          return false;
        }
      },
    };
  }

  attach() {
    this.client.on("interactionCreate", (i) => this.#onInteraction(i));
    this.client.on("voiceStateUpdate", (oldS, newS) => this.#onVoiceState(oldS, newS));
  }

  #voiceChannelOf(interaction) {
    return interaction.member?.voice?.channel ?? null;
  }

  #optionsOf(interaction) {
    const out = {};
    for (const name of COMMAND_OPTION_NAMES) {
      const v = interaction.options?.getString?.(name);
      if (v != null) out[name] = v;
    }
    for (const name of COMMAND_INT_OPTION_NAMES) {
      const v = interaction.options?.getInteger?.(name);
      if (v != null) out[name] = v;
    }
    return out;
  }

  async #onInteraction(interaction) {
    try {
      if (interaction.isAutocomplete?.()) return this.#onAutocomplete(interaction);
      if (interaction.isButton?.()) return this.#onButton(interaction);
      if (interaction.isChatInputCommand?.()) return this.#onCommand(interaction);
    } catch (err) {
      this.log.error?.(`[input] erro roteando interação: ${err.message}`);
      const msg = "⚠️ Algo deu errado ao processar o comando.";
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(msg);
        } else if (interaction.isRepliable?.()) {
          await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
      } catch { /* nada a fazer */ }
    }
  }

  #onButton(interaction) {
    if (!PANEL_BUTTON_IDS.has(interaction.customId) && !isLofiButton(interaction.customId)) return;
    const vc = this.#voiceChannelOf(interaction);
    const replyToken = this.replies.put(interaction, "tok");
    const panelRef = this.refs.put(interaction.message, "panel");
    const textChannelRef = this.refs.put(interaction.channel, "tc");
    return this.core.dispatchButton({
      guildId: interaction.guild.id,
      customId: interaction.customId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      voiceChannelId: vc?.id ?? null,
      voiceChannelName: vc?.name ?? null,
      voiceChannelRef: vc ? this.refs.put(vc, "vc") : null,
      panelRef,
      textChannelRef,
      replyToken,
      isAdmin: this.#isAdmin(interaction),
      locale: resolveLocale(interaction.locale),
    }).catch((e) => {
      console.error(`[input] dispatchButton (${interaction.customId}) falhou:`, e?.message ?? e);
    });
  }

  #onCommand(interaction) {
    const vc = this.#voiceChannelOf(interaction);
    const replyToken = this.replies.put(interaction, "tok");
    return this.core.dispatchCommand({
      guildId: interaction.guild.id,
      commandName: interaction.commandName,
      subcommand: interaction.options?.getSubcommand?.(false) ?? null,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      voiceChannelId: vc?.id ?? null,
      voiceChannelName: vc?.name ?? null,
      voiceChannelRef: vc ? this.refs.put(vc, "vc") : null,
      textChannelRef: this.refs.put(interaction.channel, "tc"),
      textChannelId: interaction.channel?.id ?? null,
      options: this.#optionsOf(interaction),
      targetUser: this.#userOptionOf(interaction),
      isAdmin: this.#isAdmin(interaction),
      locale: resolveLocale(interaction.locale),
      replyToken,
    });
  }

  #userOptionOf(interaction) {
    const u = interaction.options?.getUser?.("usuario");
    if (!u) return null;
    return { id: u.id, username: u.tag ?? u.username ?? u.id };
  }

  #isAdmin(interaction) {
    const perms = interaction.memberPermissions;
    if (!perms) return false;
    return perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.Administrator);
  }

  #onAutocomplete(interaction) {
    const replyToken = this.replies.put(interaction, "tok");
    return this.core.dispatchAutocomplete({
      commandName: interaction.commandName,
      userId: interaction.user.id,
      focusedValue: interaction.options.getFocused(),
      replyToken,
    });
  }

  #onVoiceState(oldState, newState) {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;
    const channelId = this.#playingChannelId(guild.id);
    if (!channelId) return;
    const channel = guild.channels?.cache?.get(channelId);
    const humansInChannel = channel
      ? channel.members.filter((m) => !m.user.bot).size
      : 0;
    return this.core.dispatchVoiceUpdate({ guildId: guild.id, channelId, humansInChannel });
  }

  #playingChannelId(guildId) {
    return this.getPlayingChannelId?.(guildId) ?? null;
  }
}

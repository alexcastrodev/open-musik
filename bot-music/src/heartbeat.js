
import { ChannelType, PermissionsBitField } from "discord.js";

const INTERVAL_MS = 30_000;

export class Heartbeat {
  constructor({ client, api, playerManager, botPool = null }) {
    this.client = client;
    this.api = api;
    this.playerManager = playerManager;
    this.botPool = botPool;
    this.timer = null;
  }

  #buildSnapshot() {
    return this.client.guilds.cache.map((guild) => {
      const voice = this.playerManager.voiceSnapshot(guild.id);
      const channel = voice.channel_id
        ? this.client.channels.cache.get(voice.channel_id)
        : null;
      return {
        id: guild.id,
        name: guild.name,
        icon_url: guild.iconURL() ?? null,
        member_count: guild.memberCount ?? null,
        voice_state: voice.voice_state,
        voice_channel_name: channel?.name ?? null,
        voice_channel_id: voice.channel_id,
        available: voice.channel_id == null,
        current_title: voice.current_title,
      };
    });
  }

  async #sendOnce() {
    const guilds = this.#buildSnapshot();
    if (this.botPool) {
      const present = [];
      for (const g of guilds) {
        present.push(g.id);
        this.botPool.registerPresence(g.id, {
          voiceChannelId: g.voice_channel_id,
          voiceChannelName: g.voice_channel_name,
          voiceState: g.voice_state,
          available: g.available,
          name: g.name,
          iconUrl: g.icon_url,
          memberCount: g.member_count,
          currentTitle: g.current_title,
        });
      }
      this.botPool.forgetAbsent(present);
    }
    try {
      const res = await this.api.postHeartbeat({ guilds });
      await this.#deliverWrapped(res?.wrapped);
    } catch (e) {
      console.error("[heartbeat] falha ao reportar:", e.message);
    }
  }

  async #deliverWrapped(wrapped) {
    if (!Array.isArray(wrapped) || wrapped.length === 0) return;
    for (const w of wrapped) {
      try {
        const guild = this.client.guilds.cache.get(String(w.guild_id));
        if (!guild) continue;
        const channel = this.#announceChannel(guild);
        if (!channel) {
          console.warn(`[wrapped] sem canal de texto pra postar no guild ${w.guild_id}`);
          continue;
        }
        await channel.send(w.message);
        await this.api.ackWrapped(w.id);
      } catch (e) {
        console.error(`[wrapped] falha ao entregar ${w.id}:`, e.message);
      }
    }
  }

  #announceChannel(guild) {
    const me = guild.members.me;
    const canSend = (ch) =>
      ch?.isTextBased?.() &&
      ch.viewable &&
      ch.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages);

    if (canSend(guild.systemChannel)) return guild.systemChannel;
    return (
      guild.channels.cache.find(
        (ch) => ch.type === ChannelType.GuildText && canSend(ch),
      ) ?? null
    );
  }

  start() {
    this.#sendOnce();
    this.timer = setInterval(() => this.#sendOnce(), INTERVAL_MS);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

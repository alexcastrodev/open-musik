
import { resolveStation } from "../player/lofi.js";

const POLL_INTERVAL_MS = Number(process.env.ASSIGNMENT_POLL_MS) || 500;

export class PoolAdapter {
  constructor({ client, api, core, botPool = null, refRegistry, isBusy, logger = console, pollMs = POLL_INTERVAL_MS }) {
    this.client = client;
    this.api = api;
    this.core = core;
    this.botPool = botPool;
    this.refs = refRegistry;
    this.isBusy = isBusy ?? (() => false);
    this.log = logger;
    this.pollMs = pollMs;
    this.timer = null;
    this.running = false;
    this.wakeAgain = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.#tick(), this.pollMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  wake() {
    if (this.isBusy()) return;
    if (this.running) {
      this.wakeAgain = true;
      return;
    }
    this.stop();
    this.timer = setTimeout(() => this.#tick(), 0);
    this.timer.unref?.();
  }

  async #tick() {
    this.timer = null;
    if (this.running) {
      this.start();
      return;
    }
    this.running = true;
    try {
      await this.#pollOnce();
    } catch (e) {
      this.log.error?.(`[pool] tick falhou: ${e.message}`);
    } finally {
      this.running = false;
      if (this.wakeAgain) {
        this.wakeAgain = false;
        if (!this.isBusy()) {
          this.stop();
          this.timer = setTimeout(() => this.#tick(), 0);
          this.timer.unref?.();
        }
      } else if (this.timer === null && !this.isBusy()) {
        this.start();
      }
    }
  }

  async #pollOnce() {
    for (const [guildId] of this.client.guilds.cache) {
      const work = await this.botPool.pendingWork(guildId);
      if (!work) continue;
      const { channelId, kind, itemId, textChannelId, station } = work;

      if (!(await this.botPool.tryClaim(guildId, channelId))) continue;

      if (kind === "lofi") {
        await this.#assumeLofi({ guildId, channelId, textChannelId, station });
      } else {
        const status = await this.api.getItemStatus(guildId, channelId, itemId).catch(() => null);
        if (!status?.item) {
          await this.botPool.releaseChannel(guildId, channelId);
          continue;
        }
        const playable = {
          item_id: itemId,
          cached_url: status.cached_url ?? null,
          audio_format: status.audio_format ?? null,
          candidates: status.item.candidates ?? [],
          source_query: status.item.source_query ?? null,
        };
        await this.#assume({ guildId, channelId, textChannelId, playable, item: status.item });
      }
      return;
    }
  }

  async #resolveVoiceChannel(guildId, channelId) {
    let guild;
    try {
      guild = this.client.guilds.cache.get(guildId) ?? await this.client.guilds.fetch(guildId);
    } catch {
      await this.#reject(guildId, channelId, "guild_unavailable");
      return null;
    }
    let channel;
    try {
      channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId);
    } catch {
      channel = null;
    }
    if (!channel || !channel.isVoiceBased?.()) {
      await this.#reject(guildId, channelId, "channel_unavailable");
      return null;
    }
    return channel;
  }

  async #assume({ guildId, channelId, textChannelId, playable, item }) {
    this.stop();
    const channel = await this.#resolveVoiceChannel(guildId, channelId);
    if (!channel) return;
    const voiceChannelRef = this.refs.put(channel, "vc");
    try {
      await this.core.dispatchAssignmentWon({
        guildId,
        voiceChannelId: channelId,
        voiceChannelName: channel.name,
        voiceChannelRef,
        textChannelId,
        playable,
        item,
      });
    } catch (e) {
      this.log.error?.(`[pool] join falhou em ${guildId}/${channelId}: ${e.message}`);
      await this.#reject(guildId, channelId, `join_failed: ${e.message}`);
    }
  }

  async #assumeLofi({ guildId, channelId, textChannelId, station }) {
    this.stop();
    const resolved = resolveStation(station?.value);
    if (!resolved) {
      await this.#reject(guildId, channelId, "lofi_station_unknown");
      return;
    }
    const channel = await this.#resolveVoiceChannel(guildId, channelId);
    if (!channel) return;
    const voiceChannelRef = this.refs.put(channel, "vc");
    try {
      await this.core.dispatchLofiAssignmentWon({
        guildId,
        voiceChannelId: channelId,
        voiceChannelName: channel.name,
        voiceChannelRef,
        textChannelId,
        station: resolved,
      });
    } catch (e) {
      this.log.error?.(`[pool] join lofi falhou em ${guildId}/${channelId}: ${e.message}`);
      await this.#reject(guildId, channelId, `join_failed: ${e.message}`);
    }
  }

  async #reject(guildId, channelId, _reason) {
    try {
      await this.botPool.releaseChannel(guildId, channelId);
    } catch (e) {
      this.log.warn?.(`[pool] reject(release) falhou: ${e.message}`);
    }
    this.start();
  }
}

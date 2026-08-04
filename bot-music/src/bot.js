
import { Client, Events, GatewayIntentBits } from "discord.js";
import { MusikApi } from "./api/MusikApi.js";
import { PlayerManager } from "./player/PlayerManager.js";
import { BotCore } from "./core/BotCore.js";
import { PlayerManagerPort } from "./core/PlayerPort.js";
import { buildPanel } from "./core/panel.js";
import { RefRegistry } from "./discord/refs.js";
import { InputAdapter } from "./discord/InputAdapter.js";
import { OutputAdapter } from "./discord/OutputAdapter.js";
import { PoolAdapter } from "./discord/PoolAdapter.js";
import { Heartbeat } from "./heartbeat.js";
import { ValkeyBus } from "./valkey/ValkeyBus.js";
import { BotPool, WORK_PUBLISHED_CHANNEL } from "./pool/BotPool.js";
import { ensureVoiceDeps } from "./voice-deps.js";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 1_500;

export class Bot {
  constructor(config) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    this.api = new MusikApi({
      baseUrl: config.api.baseUrl,
      clientId: config.discord.clientId,
      timeoutMs: config.api.timeoutMs,
    });
    this.bus = new ValkeyBus(config.valkey);
    this.botPool = new BotPool({
      url: config.valkey.url,
      ownClientId: config.discord.clientId,
      enabled: config.valkey.poolEnabled,
    });
    this.playerManager = new PlayerManager({
      api: this.api,
      bus: this.bus,
      botPool: this.botPool,
      ownClientId: config.discord.clientId,
    });

    this.replies = new RefRegistry();
    this.refs = new RefRegistry();

    this.playerPort = new PlayerManagerPort(this.playerManager, {
      resolveChannel: (ref) => this.refs.get(ref),
    });

    this.core = new BotCore({
      api: this.api,
      player: this.playerPort,
      bus: this.bus,
      botPool: this.botPool,
      ownClientId: config.discord.clientId,
    });
    this.input = new InputAdapter({
      client: this.client,
      core: this.core,
      replyRegistry: this.replies,
      refRegistry: this.refs,
      getPlayingChannelId: (gid) => this.playerManager.playingChannelId(gid),
    });
    this.output = new OutputAdapter(this.core, {
      client: this.client,
      replyRegistry: this.replies,
      refRegistry: this.refs,
    });
    this.core.acker = this.input.acker();

    this.pool = new PoolAdapter({
      client: this.client,
      api: this.api,
      core: this.core,
      botPool: this.botPool,
      refRegistry: this.refs,
      isBusy: () => this.playerManager.busy(),
      pollMs: Number(process.env.ASSIGNMENT_POLL_MS) || (this.bus.enabled ? 5_000 : 500),
    });
    this.playerManager.setPoolHooks({
      onBusy: () => this.pool.stop(),
      onFree: () => this.pool.wake(),
    });

    this.playerManager.setRefreshPanel(async (guildId, channelId, queueHint = null) => {
      const queue = queueHint ?? await this.api.getGuildQueue(guildId, channelId);
      const discoverEnabled = this.playerManager.discoverEnabled(guildId, channelId);
      const paused = this.playerManager.paused(guildId, channelId);
      this.core.emit("panel.edit", { guildId, channelId, panel: buildPanel({ ...queue, discoverEnabled, paused }) });
    });
    this.playerManager.setRemovePanel((guildId, channelId) => {
      this.core.emit("panel.delete", { guildId, channelId });
    });

    this.heartbeat = new Heartbeat({
      client: this.client,
      api: this.api,
      playerManager: this.playerManager,
      botPool: this.botPool,
    });
  }

  #onReady = (c) => {
    console.log(`🤖 Logado como ${c.user.tag}`);
    console.log(
      `[diag] bot.user.id=${c.user.id} application.id=${c.application.id} config.clientId=${this.config.discord.clientId}`,
    );
    this.bus.connect();
    this.botPool.connect();
    this.bus.subscribeRaw(WORK_PUBLISHED_CHANNEL, (msg) => {
      const g = msg?.guild_id ? String(msg.guild_id) : null;
      if (g && !this.client.guilds.cache.has(g)) return;
      this.pool.wake();
    });
    this.heartbeat.start();
    this.pool.start();
  };

  #shutdown = async (signal) => {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    console.log(`\n${signal} recebido, encerrando…`);
    this.heartbeat.stop();
    this.pool.stop();
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.playerManager.stopAll();
    await new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS));
    this.bus.close();
    this.botPool.close();
    this.client.destroy();
    process.exit(0);
  };

  start() {
    this.client.once(Events.ClientReady, this.#onReady);
    this.input.attach();

    this.sweepTimer = setInterval(() => {
      this.replies.sweep();
      this.refs.sweep();
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();

    process.on("SIGINT", () => this.#shutdown("SIGINT"));
    process.on("SIGTERM", () => this.#shutdown("SIGTERM"));

    ensureVoiceDeps();
    this.client.login(this.config.discord.token);
  }
}

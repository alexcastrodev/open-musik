import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { resolveStation } from "./stations.js";
import { httpOpusStream } from "./stream.js";

const READY_TIMEOUT_MS = 20_000;
const RECONNECT_GRACE_MS = 5_000;

function defaultCreatePlayer() {
  return createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });
}

export class RadioSession {
  constructor(guildId, {
    join = joinVoiceChannel,
    openStream = httpOpusStream,
    createPlayer = defaultCreatePlayer,
    createResource = createAudioResource,
  } = {}) {
    this.guildId = guildId;
    this.join = join;
    this.openStream = openStream;
    this.createPlayer = createPlayer;
    this.createResource = createResource;
    this.connection = null;
    this.player = null;
    this.station = null;
    this.current = null;
    this.destroyed = false;
  }

  get channelId() {
    return this.connection?.joinConfig.channelId ?? null;
  }

  async start(voiceChannel, stationValue) {
    const station = resolveStation(stationValue);
    if (!station) throw new Error(`Estação inválida: ${stationValue}`);
    this.destroyed = false;
    this.station = station;
    await this.#connect(voiceChannel);
    this.#play();
    return station;
  }

  switchStation(stationValue) {
    if (this.destroyed) throw new Error("Sessão encerrada.");
    const station = resolveStation(stationValue);
    if (!station) throw new Error(`Estação inválida: ${stationValue}`);
    this.station = station;
    this.#play();
    return station;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.current) {
      this.current.kill();
      this.current = null;
    }
    this.player?.stop(true);
    this.connection?.destroy();
    this.connection = null;
    this.station = null;
  }

  async #connect(voiceChannel) {
    if (this.connection && this.channelId === voiceChannel.id) return this.connection;

    const connection = this.join({
      channelId: voiceChannel.id,
      guildId: this.guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_GRACE_MS),
          entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_GRACE_MS),
        ]);
      } catch {
        this.destroy();
      }
    });
    connection.on("error", (err) => {
      console.error(`[radio ${this.guildId}] erro na conexão: ${err.message}`);
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
    } catch {
      connection.destroy();
      this.connection = null;
      throw new Error("Não consegui entrar no canal de voz a tempo.");
    }

    connection.subscribe(this.#ensurePlayer());
    this.connection = connection;
    return connection;
  }

  #ensurePlayer() {
    if (this.player) return this.player;
    const player = this.createPlayer();
    player.on(AudioPlayerStatus.Idle, () => this.#reopen());
    player.on("error", (err) => {
      console.error(`[radio ${this.guildId}] erro no player: ${err.message}`);
      this.#reopen();
    });
    this.player = player;
    return player;
  }

  #play() {
    if (this.destroyed || !this.station) return;
    if (this.current) this.current.kill();
    console.log(`[radio ${this.guildId}] tocando (pass-through): ${this.station.label}`);
    const { stream, kill } = this.openStream(this.station.url);
    this.current = { kill };
    const resource = this.createResource(stream, { inputType: StreamType.OggOpus });
    this.#ensurePlayer().play(resource);
  }

  #reopen() {
    if (this.destroyed || !this.station) return;
    this.#play();
  }
}

export class RadioManager {
  constructor(opts = {}) {
    this.opts = opts;
    this.sessions = new Map();
  }

  get(guildId) {
    return this.sessions.get(guildId) ?? null;
  }

  async start(voiceChannel, stationValue) {
    const guildId = voiceChannel.guild.id;
    let session = this.sessions.get(guildId);
    if (!session) {
      session = new RadioSession(guildId, this.opts);
      this.sessions.set(guildId, session);
    }
    try {
      await session.start(voiceChannel, stationValue);
    } catch (err) {
      this.sessions.delete(guildId);
      throw err;
    }
    return session;
  }

  switchStation(guildId, stationValue) {
    const session = this.sessions.get(guildId);
    if (!session) return null;
    return session.switchStation(stationValue);
  }

  stop(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) return false;
    session.destroy();
    this.sessions.delete(guildId);
    return true;
  }

  stopAll() {
    for (const session of this.sessions.values()) session.destroy();
    this.sessions.clear();
  }
}

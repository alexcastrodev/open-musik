
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
import { ffmpegPcmStream, holdMusicStream, HOLD_MUSIC } from "./ffmpeg.js";
import { httpOpusStream } from "./stream.js";
import { ytdlpSourceStream, YTDLP_SKIP_JS } from "./ytdlp.js";
import { resolveNextSuggestion, normalizeTitle } from "./discover.js";

const OPUS_BITRATE = Number(process.env.OPUS_BITRATE) || 96_000;
const OPUS_FEC = process.env.OPUS_FEC !== "0";
const CACHE_POLL_INTERVAL_MS = Number(process.env.CACHE_POLL_INTERVAL_MS) || 2_000;
const YTDLP_RESOLVE_TIMEOUT_MS = Number(process.env.YTDLP_RESOLVE_TIMEOUT_MS) || 15_000;
const CACHE_STALL_TIMEOUT_MS = Number(process.env.CACHE_STALL_TIMEOUT_MS) || 90_000;
const EMPTY_CHANNEL_GRACE_MS = Number(process.env.EMPTY_CHANNEL_GRACE_MS) || 30_000;
const IDLE_DISCONNECT_MS = Number(process.env.IDLE_DISCONNECT_MS) || 1_800_000;
const PANEL_POLL_INTERVAL_MS = Number(process.env.PANEL_POLL_INTERVAL_MS ?? 200);
const PANEL_POLL_FALLBACK_MS = Number(process.env.PANEL_POLL_FALLBACK_MS ?? 1_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const PHASES = ["none", "transitioning", "awaiting_cache", "kept_idle", "idle_empty"];

export class GuildPlayer {
  #phase = "none";

  constructor(guildId, { api, bus = null, botPool = null, ownClientId = null, refreshPanel = null, removePanel = null, onConnect = null, onLeave = null, resolveSuggestion = null, join = null } = {}) {
    this.guildId = guildId;
    this.api = api;
    this.resolveSuggestion = resolveSuggestion ?? resolveNextSuggestion;
    this.join = join ?? joinVoiceChannel;
    this.botPool = botPool;
    this.bus = bus;
    this.ownClientId = ownClientId;
    this.queueEventHandler = null;
    this.refreshPanel = refreshPanel;
    this.removePanel = removePanel;
    this.onConnect = onConnect;
    this.onLeave = onLeave;

    this.connection = null;
    this.connectionListeners = null;
    this.player = null;
    this.current = null;
    this.pendingItemId = null;
    this.playGen = 0;
    this.panelPolling = false;
    this.syncTimer = null;
    this.syncing = false;
    this.lonelyTimer = null;
    this.idleTimer = null;
    this.lofiStation = null;
    this.discoverEnabled = false;
    this.discovering = false;
    this.currentFromSource = false;
    this.discoverPending = false;
    this.paused = false;
    this.autoPaused = false;
    this.stayInRoom = false;
  }

  get phase() { return this.#phase; }

  get transitioning() { return this.#phase === "transitioning"; }
  set transitioning(v) { this.#setPhase("transitioning", v); }

  get awaitingCache() { return this.#phase === "awaiting_cache"; }
  set awaitingCache(v) { this.#setPhase("awaiting_cache", v); }

  get keptIdle() { return this.#phase === "kept_idle"; }
  set keptIdle(v) { this.#setPhase("kept_idle", v); }

  get idleEmpty() { return this.#phase === "idle_empty"; }
  set idleEmpty(v) { this.#setPhase("idle_empty", v); }

  #setPhase(phase, on) {
    if (on) this.#phase = phase;
    else if (this.#phase === phase) this.#phase = "none";
  }

  toggleDiscover() {
    this.discoverEnabled = !this.discoverEnabled;
    if (this.discoverEnabled) this.#maybeDiscoverNext().catch(() => {});
    return this.discoverEnabled;
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) this.player?.pause(true);
    else this.player?.unpause();
    return this.paused;
  }

  toggleStayInRoom() {
    this.stayInRoom = !this.stayInRoom;
    if (this.stayInRoom) {
      this.#cancelLonelyTimer();
      this.#cancelIdleTimer();
    }
    return this.stayInRoom;
  }

  #applyPausedIntent() {
    if (this.paused || this.autoPaused) this.player?.pause(true);
  }

  get channelId() {
    return this.connection?.joinConfig.channelId ?? null;
  }

  #ensurePlayer() {
    if (this.player) return this.player;
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    player.on(AudioPlayerStatus.Idle, () => this.handleIdle());
    player.on("error", (err) => this.handleError(err));

    this.player = player;
    return player;
  }

  handleIdle() {
    if (this.current?.ffmpeg) this.current.ffmpeg.kill();
    this.current = null;
    this.currentFromSource = false;
    if (this.lofiStation) {
      this.#startLofiResource();
      return;
    }
    if (this.discoverEnabled && this.discoverPending) {
      this.#maybeDiscoverNext()
        .catch(() => {})
        .finally(() => this.#advanceAndPlay().catch((e) =>
          console.error(`[player ${this.guildId}] advance falhou:`, e.message)
        ));
      return;
    }
    this.#advanceAndPlay().catch((e) =>
      console.error(`[player ${this.guildId}] advance falhou:`, e.message)
    );
  }

  handleError(err) {
    console.error("[player] erro:", err.message);
    const failed = this.current;
    if (this.current?.ffmpeg) this.current.ffmpeg.kill();
    this.current = null;
    if (this.lofiStation) {
      this.#startLofiResource();
      return;
    }
    if (this.currentFromSource && failed?.item?.id) {
      this.currentFromSource = false;
      const item = failed.item;
      const title = item?.title ?? "?";
      console.log(`[player ${this.guildId}] [origem:musica-espera] erro no stream da fonte; caindo no hold e esperando o cache do Rails: ${title}`);
      const gen = ++this.playGen;
      this.#startResource(item, this._holdStream());
      this.awaitingCache = true;
      this.#waitForCacheAndPlay(gen, item.id, item)
        .catch(() => {})
        .finally(() => { if (this.playGen === gen) this.awaitingCache = false; });
      return;
    }
    this.#advanceAndPlay().catch(() => {});
  }

  async #playUrl(playable, item) {
    const gen = ++this.playGen;
    const title = item?.title ?? "?";
    this.pendingItemId = playable?.item_id ?? item?.id ?? null;
    this.awaitingCache = false;
    this.keptIdle = false;

    if (playable.cached_url) {
      const src = this.#cachedStream(playable.cached_url, playable.audio_format);
      console.log(`[player ${this.guildId}] [origem:rails-cache] começou a tocar do cache do Rails (S3, ${src.label}): ${title}`);
      this.#startResource(item, src);
      this.currentFromSource = false;
      this.#maybeDiscoverNext().catch(() => {});
      return;
    }

    console.log(`[player ${this.guildId}] [origem:rails-cache-agendado] sem cache pronto; Rails está baixando pro S3 em paralelo: ${title}`);
    const src = await this.#trySourceStream(playable.candidates, gen, playable.source_query, { live: !!playable.is_live });
    if (this.playGen !== gen) return;
    if (src) {
      console.log(`[player ${this.guildId}] [origem:memoria-local] começou a tocar da memória (yt-dlp, baixado local): ${title}`);
      this.#startResource(item, src);
      this.currentFromSource = true;
      if (this.discoverEnabled) this.discoverPending = true;
      return;
    }

    console.log(`[player ${this.guildId}] [origem:musica-espera] fonte não resolveu; tocando música de espera até o cache do Rails ficar pronto: ${title}`);
    this.#startResource(item, this._holdStream());
    this.awaitingCache = true;

    try {
      await this.#waitForCacheAndPlay(gen, playable.item_id, item);
    } finally {
      if (this.playGen === gen) this.awaitingCache = false;
    }
  }

  async #trySourceStream(candidates, gen, sourceQuery = null, { live = false } = {}) {
    const urls = (candidates ?? [])
      .map((c) => c?.url)
      .filter((u) => typeof u === "string" && u.length > 0);
    if (urls.length === 0 && typeof sourceQuery === "string" && sourceQuery.length > 0) {
      urls.push(sourceQuery);
    }
    if (urls.length === 0) return null;

    for (const url of urls) {
      if (this.playGen !== gen) return null;
      const src = ytdlpSourceStream(url, { live });
      const flowing = await this.#firstChunk(src.stream, YTDLP_RESOLVE_TIMEOUT_MS);
      if (this.playGen !== gen) { src.kill(); return null; }
      if (flowing) return src;
      src.kill();
      console.warn(`[player ${this.guildId}] fonte não resolveu via yt-dlp: ${url}`);
    }
    if (!live && YTDLP_SKIP_JS) {
      console.log(`[player ${this.guildId}] retentando sem player_skip=js`);
      for (const url of urls) {
        if (this.playGen !== gen) return null;
        const src = ytdlpSourceStream(url, { live: true });
        const flowing = await this.#firstChunk(src.stream, YTDLP_RESOLVE_TIMEOUT_MS);
        if (this.playGen !== gen) { src.kill(); return null; }
        if (flowing) return src;
        src.kill();
        console.warn(`[player ${this.guildId}] fonte não resolveu via yt-dlp (sem skip_js): ${url}`);
      }
    }
    return null;
  }

  #firstChunk(stream, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        stream.removeListener("readable", onReadable);
        stream.removeListener("error", onErrorOrEnd);
        stream.removeListener("end", onErrorOrEnd);
        resolve(ok);
      };
      const onReadable = () => {
        const chunk = stream.read();
        if (chunk === null) return;
        stream.unshift(chunk);
        finish(true);
      };
      const onErrorOrEnd = () => finish(false);
      const timer = setTimeout(() => finish(false), timeoutMs);
      stream.on("readable", onReadable);
      stream.on("error", onErrorOrEnd);
      stream.on("end", onErrorOrEnd);
    });
  }

  #cachedStream(url, audioFormat) {
    if (audioFormat === "opus") {
      return { ...httpOpusStream(url), type: StreamType.OggOpus, label: "pass-through" };
    }
    return { ...ffmpegPcmStream(url), type: StreamType.Raw, label: "ffmpeg" };
  }

  #startResource(item, { stream, kill, type = StreamType.Raw }, { leaveLofi = true } = {}) {
    if (leaveLofi) this.lofiStation = null;
    this.pendingItemId = null;
    this.idleEmpty = false;
    this.#cancelIdleTimer();
    if (this.current?.ffmpeg) this.current.ffmpeg.kill();
    const resource = createAudioResource(stream, { inputType: type });
    if (resource.encoder) {
      resource.encoder.setBitrate(OPUS_BITRATE);
      if (OPUS_FEC) {
        resource.encoder.setFEC(true);
        resource.encoder.setPLP(0.05);
      }
    }
    this.current = { item, ffmpeg: { kill } };
    this.transitioning = false;
    this.#ensurePlayer().play(resource);
    this.#applyPausedIntent();
  }

  async #waitForCacheAndPlay(gen, itemId, item) {
    const title = item?.title ?? "?";
    if (!itemId) {
      console.warn(`[player ${this.guildId}] sem item_id; não dá pra esperar cache de "${title}"`);
      if (this.playGen === gen && this.current?.ffmpeg) {
        this.current.ffmpeg.kill();
        this.current = null;
      }
      return;
    }
    console.log(`[player ${this.guildId}] [origem:rails-cache-espera] entrando em espera pelo cache do Rails: ${title}`);

    let stallDeadline = Date.now() + CACHE_STALL_TIMEOUT_MS;
    while (Date.now() < stallDeadline) {
      if (this.playGen !== gen) return;
      let status;
      try {
        console.log(`[player ${this.guildId}] [origem:rails-poll-cache] perguntando ao Rails se o cache ficou pronto: ${title}`);
        status = await this.api.getItemStatus(this.guildId, this.channelId, itemId);
      } catch (e) {
        console.warn(`[player ${this.guildId}] status do item falhou: ${e.message}`);
      }
      if (this.playGen !== gen) return;
      if (status?.cache_status === "live") {
        console.log(`[player ${this.guildId}] faixa ao vivo, não espera cache: ${title}`);
        return;
      }
      if (status?.cached_url) {
        const src = this.#cachedStream(status.cached_url, status.audio_format);
        console.log(`[player ${this.guildId}] [origem:rails-cache] começou a tocar do cache do Rails (S3, ${src.label}): ${title}`);
        this.#startResource(item, src);
        this.currentFromSource = false;
        this.#maybeDiscoverNext().catch(() => {});
        return;
      }
      if (status?.cache_status === "caching") {
        stallDeadline = Date.now() + CACHE_STALL_TIMEOUT_MS;
      }
      await sleep(CACHE_POLL_INTERVAL_MS);
    }
    console.error(`[player ${this.guildId}] download de "${title}" não progrediu; avançando`);
    if (this.playGen === gen) {
      if (this.current?.ffmpeg) this.current.ffmpeg.kill();
      this.current = null;
      this.#advanceAndPlay().catch(() => {});
    }
  }

  async #advanceAndPlay() {
    this.transitioning = true;
    try {
      const { playable, item } = await this.api.advanceGuild(this.guildId, this.channelId);
      if (!playable) {
        this.current = null;
        this.idleEmpty = true;
        this.#scheduleIdleDisconnect();
        this.#refreshPanel().catch(() => {});
        return;
      }
      const title = item?.title ?? "?";
      console.log(`[player ${this.guildId}] advance: ${title} hasCallback=${!!this.refreshPanel}`);
      this.#refreshPanel().catch(() => {});
      this.#publishQueueEvent({ type: "advance", current_id: item?.id ?? null });
      await this.#playUrl(playable, item);
    } finally {
      this.transitioning = false;
    }
  }

  async #maybeDiscoverNext() {
    if (!this.discoverEnabled || !this.channelId) return;
    if (this.keptIdle) return;
    if (this.discovering) return;
    if (this.currentFromSource) {
      this.discoverPending = true;
      console.log(`[player ${this.guildId}] [discover] adiado: faixa atual toca da fonte (yt-dlp); aguarda o cache`);
      return;
    }
    this.discoverPending = false;
    this.discovering = true;
    const gen = this.playGen;
    try {
      const { current, upcoming } = await this.api.getGuildQueue(this.guildId, this.channelId);
      if (this.playGen !== gen) return;
      if (!current || (upcoming && upcoming.length > 0)) return;

      const seedId = current.youtube_id;
      if (!seedId) {
        console.log(`[player ${this.guildId}] [discover] faixa atual não é do YouTube; sem sugestão`);
        return;
      }
      const exclude = new Set([seedId]);

      const excludeTitles = new Set();
      if (current.title) excludeTitles.add(normalizeTitle(current.title));
      try {
        const recent = await this.api.getGuildHistory?.(this.guildId, 25);
        for (const h of recent?.history ?? []) {
          const n = normalizeTitle(h.title);
          if (n) excludeTitles.add(n);
        }
      } catch { /* histórico é best-effort: sem ele, dedupe só por id */ }
      if (this.playGen !== gen) return;

      const suggestion = await this.resolveSuggestion(seedId, exclude, excludeTitles);
      if (this.playGen !== gen) return;
      if (!this.discoverEnabled || !this.channelId) return;
      if (!suggestion) {
        console.log(`[player ${this.guildId}] [discover] nenhuma sugestão para "${current.title ?? "?"}"`);
        return;
      }

      const fresh = await this.api.getGuildQueue(this.guildId, this.channelId);
      if (this.playGen !== gen) return;
      if (!fresh.current) return;
      if (fresh.upcoming && fresh.upcoming.length > 0) return;

      console.log(`[player ${this.guildId}] [discover] enfileirando sugerida: ${suggestion.title}`);
      if (this.playGen !== gen) return;
      await this.api.enqueue(this.guildId, this.channelId, suggestion.url, "🔮 Discover", null, { queueOnly: true });
      this.#refreshPanel().catch(() => {});
    } catch (e) {
      console.warn(`[player ${this.guildId}] [discover] falhou: ${e.message}`);
    } finally {
      this.discovering = false;
    }
  }

  #publishQueueEvent(message) {
    if (!this.bus || !this.channelId) return;
    this.bus.publish(this.guildId, this.channelId, {
      origin: this.ownClientId, ts: Date.now(), ...message,
    });
  }

  async #connect(voiceChannel) {
    if (
      this.connection &&
      this.connection.joinConfig.channelId === voiceChannel.id
    ) {
      return this.connection;
    }

    const gid = voiceChannel.guild.id;
    const connection = this.join({
      channelId: voiceChannel.id,
      guildId: gid,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.#detachConnectionListeners();

    let lastStatus = connection.state.status;
    let connectLoops = 0;
    const onStateChange = (oldState, newState) => {
      lastStatus = newState.status;
      if (oldState.status === "connecting" && newState.status === "signalling") {
        connectLoops++;
      }
      const endpoint = newState.networking?.state?.connectionOptions?.endpoint ??
        newState.adapter?.endpoint;
      console.log(
        `[voice ${gid}] ${oldState.status} -> ${newState.status}` +
          (endpoint ? ` (endpoint=${endpoint})` : ""),
      );
    };
    const onError = (err) => {
      console.error(
        `[voice ${gid}] erro:`,
        err.message,
        err.code != null ? `(code=${err.code})` : "",
      );
    };

    const onDisconnected = async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.handleHardDisconnect(connection);
      }
    };

    connection.on("stateChange", onStateChange);
    connection.on("error", onError);
    connection.on(VoiceConnectionStatus.Disconnected, onDisconnected);
    this.connectionListeners = { connection, onStateChange, onError, onDisconnected };

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      console.error(
        `[voice ${gid}] timeout: parou em '${lastStatus}', ` +
          `${connectLoops} loop(s) connecting->signalling`,
      );
      this.#detachConnectionListeners();
      connection.destroy();
      throw new Error("Não consegui entrar no canal de voz a tempo.");
    }

    connection.subscribe(this.#ensurePlayer());
    this.connection = connection;
    return connection;
  }

  #detachConnectionListeners() {
    const l = this.connectionListeners;
    if (!l) return;
    l.connection.removeListener("stateChange", l.onStateChange);
    l.connection.removeListener("error", l.onError);
    l.connection.removeListener(VoiceConnectionStatus.Disconnected, l.onDisconnected);
    this.connectionListeners = null;
  }

  async #refreshPanel(queue = null) {
    if (!this.refreshPanel) return;
    await this.refreshPanel(this.guildId, this.channelId, queue);
  }

  _holdStream() {
    return holdMusicStream(HOLD_MUSIC);
  }

  #startQueueSync() {
    const interval = this.#busActive() ? PANEL_POLL_FALLBACK_MS : PANEL_POLL_INTERVAL_MS;
    if (!interval || this.panelPolling) return;
    this.panelPolling = true;

    const loop = async () => {
      if (!this.connection) { this.panelPolling = false; return; }
      await this.#syncTick();
      if (this.connection) {
        this.syncTimer = setTimeout(loop, interval);
        this.syncTimer.unref?.();
      } else {
        this.panelPolling = false;
      }
    };
    this.syncTimer = setTimeout(loop, interval);
    this.syncTimer.unref?.();
  }

  async syncNow() {
    return this.#syncTick();
  }

  async #syncTick() {
    if (this.syncing) return;
    this.syncing = true;
    let result = { changed: true, queue: null };
    try {
      result = await this.#syncWithQueue();
    } catch (e) {
      console.warn(`[player ${this.guildId}] queue sync falhou: ${e.message}`);
    } finally {
      this.syncing = false;
    }
    if (result.changed !== false) this.#refreshPanel(result.queue).catch(() => {});
  }

  async #syncWithQueue() {
    if (this.transitioning) return { changed: false, queue: null };

    const queue = await this.api.getGuildQueue(this.guildId, this.channelId);
    const { current, upcoming } = queue;

    if (this.lofiStation) {
      if (current?.id) {
        console.log(`[player ${this.guildId}] /play durante lo-fi: trocando pra faixa da fila: ${current.title ?? current.id}`);
        if (this.pendingItemId && this.pendingItemId === current.id) return { changed: false, queue };
        const gen = ++this.playGen;
        const status = await this.api.getItemStatus(this.guildId, this.channelId, current.id).catch(() => null);
        if (this.playGen !== gen || this.transitioning || this.awaitingCache) return { changed: true, queue };
        const playable = { item_id: current.id, cached_url: status?.cached_url ?? null, audio_format: status?.audio_format ?? null };
        await this.#playUrl(playable, current);
        return { changed: true, queue };
      }
      return { changed: false, queue };
    }

    if (!current && (!upcoming || upcoming.length === 0)) {
      if (this.keptIdle || this.idleEmpty) return { changed: false, queue };
      if (this.current || this.connection) {
        console.log(`[player ${this.guildId}] fila esvaziada externamente (stop); encerrando`);
        this.stopAndDisconnect();
      }
      return { changed: false, queue };
    }

    if (this.awaitingCache) return { changed: true, queue };

    if (current?.id && this.current?.item?.id && current.id !== this.current.item.id) {
      if (this.pendingItemId && this.pendingItemId === current.id) return { changed: true, queue };
      console.log(
        `[player ${this.guildId}] current mudou externamente (skip): ${this.current.item.id} → ${current.id}`,
      );
      const gen = ++this.playGen;
      const status = await this.api.getItemStatus(this.guildId, this.channelId, current.id);
      if (this.playGen !== gen || this.transitioning || this.awaitingCache) return { changed: true, queue };
      const playable = { item_id: current.id, cached_url: status?.cached_url ?? null };
      await this.#playUrl(playable, current);
    }
    return { changed: true, queue };
  }

  #busActive() {
    return !!this.bus?.enabled;
  }

  #subscribeQueueEvents() {
    if (!this.#busActive() || this.queueEventHandler) return;
    const channelId = this.channelId;
    if (!channelId) return;
    this.queueEventHandler = (msg) => this.handleQueueEvent(msg);
    this.bus.subscribe(this.guildId, channelId, this.queueEventHandler);
  }

  #unsubscribeQueueEvents(channelId) {
    if (!this.queueEventHandler) return;
    this.bus?.unsubscribe(this.guildId, channelId, this.queueEventHandler);
    this.queueEventHandler = null;
  }

  async handleQueueEvent(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.origin && msg.origin === this.ownClientId) return;
    if (this.transitioning || this.syncing) return;

    if (this.lofiStation && (msg.type === "enqueue" || msg.type === "skip" || msg.type === "advance" || msg.type === "previous")) {
      await this.syncNow();
      return;
    }

    switch (msg.type) {
      case "stop": {
        if (this.keptIdle) return;
        if (this.current || this.connection) {
          console.log(`[player ${this.guildId}] stop externo (pub/sub); encerrando`);
          this.stopAndDisconnect();
        }
        return;
      }
      case "clear_keep": {
        if (this.current || this.connection) this.stopKeep();
        return;
      }
      case "skip":
      case "previous":
      case "advance": {
        await this.#applyExternalCurrent(msg);
        return;
      }
      case "discover_toggle":
        this.toggleDiscover();
        this.#refreshPanel().catch(() => {});
        return;
      case "pause_toggle":
        this.togglePause();
        this.#refreshPanel().catch(() => {});
        return;
      case "stay_toggle":
        this.toggleStayInRoom();
        this.#refreshPanel().catch(() => {});
        return;
      case "clear_upcoming":
      case "repeat":
      case "enqueue":
        this.#refreshPanel().catch(() => {});
        return;
      default:
        return;
    }
  }

  async #applyExternalCurrent(msg) {
    const newId = msg.current_id;
    if (!newId) {
      this.#refreshPanel().catch(() => {});
      return;
    }
    if (this.awaitingCache) return;
    if (this.pendingItemId && this.pendingItemId === newId) return;
    if (this.current?.item?.id && this.current.item.id === newId) {
      this.#refreshPanel().catch(() => {});
      return;
    }
    const gen = ++this.playGen;
    let playable = msg.playable && msg.playable.item_id ? msg.playable : null;
    const item = msg.item ?? { id: newId };
    if (!playable) {
      const status = await this.api.getItemStatus(this.guildId, this.channelId, newId).catch(() => null);
      playable = { item_id: newId, cached_url: status?.cached_url ?? null, audio_format: status?.audio_format ?? null };
    }
    if (this.playGen !== gen || this.transitioning || this.awaitingCache) return;
    await this.#playUrl(playable, item);
  }

  async ensureConnectedAndPlay(voiceChannel, playable, item) {
    console.log(`[player ${this.guildId}] [origem:pedido] pedido recebido: ${item?.title ?? "?"}`);
    await this.#connect(voiceChannel);
    this.onConnect?.();
    if (this.channelId) {
      this.botPool?.registerPresence(this.guildId, {
        voiceChannelId: this.channelId,
        voiceState: "active",
        available: false,
        currentTitle: item?.title ?? null,
      });
    }
    this.#subscribeQueueEvents();
    this.#startQueueSync();
    if (playable) {
      this.#playUrl(playable, item).catch((e) =>
        console.error(`[player ${this.guildId}] playUrl falhou:`, e.message)
      );
    } else if (!this.current) {
      this.#advanceAndPlay().catch((e) =>
        console.error(`[player ${this.guildId}] advance falhou:`, e.message)
      );
    }
  }

  async playLofi(voiceChannel, station) {
    await this.#connect(voiceChannel);
    this.lofiStation = station;
    this.onConnect?.();
    if (this.channelId) {
      this.botPool?.registerPresence(this.guildId, {
        voiceChannelId: this.channelId,
        voiceState: "active",
        available: false,
        currentTitle: station.label,
      });
    }
    this.#subscribeQueueEvents();
    this.#startQueueSync();
    this.#startLofiResource();
  }

  #startLofiResource() {
    if (!this.lofiStation) return;
    const { label, url } = this.lofiStation;
    console.log(`[player ${this.guildId}] [origem:lofi-radio] tocando estação (pass-through): ${label}`);
    this.#startResource({ title: label }, this.#cachedStream(url, "opus"), { leaveLofi: false });
  }

  applySkip(playable, item) {
    this.playGen++;
    this.transitioning = true;
    if (this.current?.ffmpeg) this.current.ffmpeg.kill();
    this.current = null;
    if (playable) {
      this.#playUrl(playable, item).catch((e) =>
        console.error(`[player ${this.guildId}] playUrl falhou:`, e.message)
      );
    } else {
      this.transitioning = false;
      this.player?.stop(true);
    }
    this.#refreshPanel().catch(() => {});
    return true;
  }

  applyPrevious(playable, item) {
    this.playGen++;
    this.transitioning = true;
    if (this.current?.ffmpeg) this.current.ffmpeg.kill();
    this.current = null;
    if (playable) {
      this.#playUrl(playable, item).catch((e) =>
        console.error(`[player ${this.guildId}] playUrl falhou:`, e.message)
      );
    } else {
      this.transitioning = false;
      this.player?.stop(true);
    }
    this.#refreshPanel().catch(() => {});
    return true;
  }

  stopKeep() {
    this.playGen++;
    this.pendingItemId = null;
    this.transitioning = false;
    this.keptIdle = true;
    this.paused = false;
    this.autoPaused = false;
    this.discoverPending = false;
    if (this.current?.ffmpeg) this.current.ffmpeg.kill();
    this.current = null;
    this.player?.stop(true);
    this.#scheduleIdleDisconnect();
    this.#refreshPanel().catch(() => {});
    return true;
  }

  handleHardDisconnect(connection) {
    if (this.connection === connection) {
      this.stopAndDisconnect();
    } else {
      connection?.destroy?.();
    }
  }

  voiceSnapshot() {
    const playing =
      !!this.connection &&
      this.player?.state.status === AudioPlayerStatus.Playing;
    return {
      voice_state: playing ? "active" : "idle",
      channel_id: this.channelId,
      current_title: playing ? this.current?.item?.title ?? null : null,
    };
  }

  stopAndDisconnect() {
    this.#cancelLonelyTimer();
    this.#cancelIdleTimer();
    this.playGen++;
    this.pendingItemId = null;
    this.#phase = "none";
    this.lofiStation = null;
    this.discoverEnabled = false;
    this.discoverPending = false;
    this.paused = false;
    this.autoPaused = false;
    this.stayInRoom = false;
    this.currentFromSource = false;
    if (this.current?.ffmpeg) this.current.ffmpeg.kill();
    this.current = null;
    this.player?.stop(true);
    const channelId = this.channelId;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.panelPolling = false;
    if (channelId) this.#unsubscribeQueueEvents(channelId);
    if (channelId) this.botPool?.releaseMe(this.guildId, channelId);
    this.#detachConnectionListeners();
    this.connection?.destroy();
    this.connection = null;
    if (channelId) this.removePanel?.(this.guildId, channelId);
    this.onLeave?.(this.guildId);
    return true;
  }

  #cancelLonelyTimer() {
    if (this.lonelyTimer) {
      clearTimeout(this.lonelyTimer);
      this.lonelyTimer = null;
    }
  }

  #cancelIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  #scheduleIdleDisconnect() {
    if (this.stayInRoom) return;
    if (this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.connection) return;
      if (this.current || this.player?.state.status === AudioPlayerStatus.Playing) {
        return;
      }
      console.log(
        `[player ${this.guildId}] sem música por ${IDLE_DISCONNECT_MS / 1000}s, encerrando`,
      );
      const channelId = this.channelId;
      this.api.stopGuild(this.guildId, channelId).catch(() => {});
      this.stopAndDisconnect();
    }, IDLE_DISCONNECT_MS);
    this.idleTimer.unref?.();
  }

  requestLeaveGrace() {
    if (!this.connection) return;
    if (this.stayInRoom) return;
    if (this.lonelyTimer) return;
    this.lonelyTimer = setTimeout(() => {
      this.lonelyTimer = null;
      console.log(`[player ${this.guildId}] canal vazio, encerrando`);
      const channelId = this.channelId;
      this.api.stopGuild(this.guildId, channelId).catch(() => {});
      this.stopAndDisconnect();
    }, EMPTY_CHANNEL_GRACE_MS);
    this.lonelyTimer.unref?.();
  }

  cancelLeaveGrace() {
    this.#cancelLonelyTimer();
  }

  pauseForEmpty() {
    if (!this.connection) return;
    if (this.paused || this.autoPaused) return;
    if (!this.player) return;
    this.player.pause(true);
    this.autoPaused = true;
    console.log(`[player ${this.guildId}] canal vazio: auto-pause`);
  }

  resumeIfAutoPaused() {
    if (!this.autoPaused) return;
    this.autoPaused = false;
    if (!this.paused) this.player?.unpause();
    console.log(`[player ${this.guildId}] alguém voltou: retoma o áudio`);
  }

  playbackPositionMs() {
    return this.player?.state?.resource?.playbackDuration ?? null;
  }
}

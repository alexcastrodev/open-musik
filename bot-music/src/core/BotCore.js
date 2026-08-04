
import { EventEmitter } from "node:events";
import { checkRate, isDuplicate, minInterval } from "../throttle.js";
import { buildPanel, buildQueueEmbed, buildTopEmbed, buildHistoryEmbed, buildFavoritesEmbed, buildGrabDM, buildDjsEmbed, itemLine, PANEL_BUTTON_IDS, BTN_LOFI, BTN_GRAB, BTN_STAY } from "./panel.js";
import { t } from "../i18n/index.js";
import { resolveStation } from "../player/lofi.js";

const DEFAULT_LOFI_STATION = "focus";
import { buildLofiPanel, isLofiButton, parseLofiStationValue, LOFI_BTN_LEAVE } from "./lofiPanel.js";

const PLAYPAUSE_MIN_INTERVAL_MS = 2000;

const defaultThrottle = {
  isDuplicate: (key) => isDuplicate(key),
  checkRate: (userId) => checkRate(userId),
  minInterval: (key, ms) => minInterval(key, ms),
};

export const ACK_DEFER_UPDATE = "deferUpdate";
export const ACK_DEFER_EPHEMERAL = "deferReplyEphemeral";

const CLEAR_RETRY_DELAY_MS = 1500;

export class BotCore extends EventEmitter {
  constructor({
    api, player, acker, bus = null, botPool = null, ownClientId = null,
    throttle = defaultThrottle, clearRetryDelayMs = CLEAR_RETRY_DELAY_MS,
  } = {}) {
    super();
    this.api = api;
    this.player = player;
    this.acker = acker;
    this.bus = bus;
    this.botPool = botPool;
    this.ownClientId = ownClientId ?? api?.clientId ?? null;
    this.throttle = throttle;
    this.clearRetryDelayMs = clearRetryDelayMs;
  }

  _publishQueueEvent(guildId, channelId, message) {
    this.bus?.publish(guildId, channelId, { origin: this.ownClientId, ts: Date.now(), ...message });
  }

  async _clearRailsQueue(action, fn) {
    try {
      await fn();
    } catch (err) {
      console.error(`[bot-core] ${action} falhou (retry em ${this.clearRetryDelayMs}ms): ${err.message}`);
      if (this.clearRetryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.clearRetryDelayMs));
      }
      try {
        await fn();
      } catch (err2) {
        console.error(`[bot-core] ${action} falhou de novo (fila pode ficar fantasma): ${err2.message}`);
      }
    }
  }

  async _dispatchPlay(input, { enqueueFn, onReply }) {
    const { guildId, voiceChannelId, textChannelRef, textChannelId } = input;
    const onChannel = await this.botPool.botOnChannel(guildId, voiceChannelId);

    if (onChannel) {
      const result = await enqueueFn();
      const iAmOwner = onChannel === this.ownClientId;
      if (iAmOwner) {
        if (result.started_now) {
          await this.player.ensureConnectedAndPlay(guildId, input.voiceChannelRef, result.playable ?? null, result.item);
        }
        await this.#upsertPanel(guildId, voiceChannelId, textChannelRef);
      } else {
        this._publishQueueEvent(guildId, voiceChannelId, { type: "enqueue" });
      }
      onReply({ ...result, mine: iAmOwner });
      return result;
    }

    const free = await this.botPool.freeBots(guildId);
    if (free.length === 0) {
      const err = new Error("Todos os players estão ocupados agora.");
      err.status = 409;
      throw err;
    }

    const result = await enqueueFn();

    if (free.includes(this.ownClientId) && (await this.botPool.tryClaim(guildId, voiceChannelId))) {
      try {
        await this.player.ensureConnectedAndPlay(guildId, input.voiceChannelRef, result.playable, result.item);
        await this.#upsertPanel(guildId, voiceChannelId, textChannelRef);
        onReply({ ...result, mine: true });
      } catch (err) {
        await this.botPool.releaseChannel(guildId, voiceChannelId).catch(() => {});
        await this.botPool.publishWork(guildId, voiceChannelId, result.item.id, textChannelId).catch(() => {});
        throw err;
      }
    } else {
      await this.botPool.publishWork(guildId, voiceChannelId, result.item.id, textChannelId);
      onReply({ ...result, mine: false });
    }
    return result;
  }

  async _playFavorites(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, replyToken } = input;
    let favorites;
    try {
      ({ favorites } = await this.api.listFavorites(userId));
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ Não consegui buscar teus favoritos: ${err.message}` });
      return;
    }
    if (!favorites || favorites.length === 0) {
      this.emit("reply.ephemeral", { replyToken, content: "⭐ Você ainda não tem favoritos. Use `/fav add` enquanto uma música toca." });
      return;
    }

    const [first, ...rest] = favorites;
    try {
      await this._dispatchPlay(input, {
        enqueueFn: () => this.api.enqueue(guildId, voiceChannelId, first.query, userTag, voiceChannelName),
        onReply: async ({ mine }) => {
          for (const fav of rest) {
            try { await this.api.enqueue(guildId, voiceChannelId, fav.query, userTag, voiceChannelName); }
            catch (e) { console.error(`[favs] falha ao enfileirar ${fav.title}:`, e.message); }
          }
          const where = mine ? "" : ` no canal **${voiceChannelName}**`;
          this.emit("reply.ephemeral", { replyToken, content: `⭐ Tocando teus ${favorites.length} favoritos${where}.` });
        },
      });
    } catch (err) {
      const content = err.status === 409
        ? "🚫 Todos os players estão ocupados agora — tenta de novo em instantes."
        : `⚠️ ${err.message}`;
      this.emit("reply.ephemeral", { replyToken, content });
    }
  }

  async _djAllowed(input) {
    const { guildId, userId, isAdmin, locale, replyToken } = input;
    try {
      const { djs, restricted } = await this.api.listDjs(guildId);
      if (!restricted) return true;
      if (isAdmin) return true;
      if (djs?.some((d) => d.discord_user_id === userId)) return true;
      this.emit("reply.ephemeral", { replyToken, content: t(locale, "dj.onlyDjs") });
      return false;
    } catch {
      return true;
    }
  }

  async _dispatchLofi(input, station) {
    const { guildId, voiceChannelId, voiceChannelRef, textChannelRef, textChannelId, replyToken } = input;
    const onChannel = await this.botPool.botOnChannel(guildId, voiceChannelId);

    if (onChannel) {
      if (onChannel === this.ownClientId) {
        await this.player.playLofi(guildId, voiceChannelRef, station);
        this.emit("reply.ephemeral", { replyToken, content: `📻 Tocando **${station.label}** em loop.` });
        this.emit("panel.upsert", { guildId, channelId: voiceChannelId, textChannelRef, panel: buildLofiPanel(station) });
      } else {
        this.emit("reply.ephemeral", { replyToken, content: "📻 Já há uma rádio tocando neste canal." });
      }
      return;
    }

    const free = await this.botPool.freeBots(guildId);
    if (free.length === 0) {
      const err = new Error("Todos os players estão ocupados agora.");
      err.status = 409;
      throw err;
    }

    if (free.includes(this.ownClientId) && (await this.botPool.tryClaim(guildId, voiceChannelId))) {
      await this.player.playLofi(guildId, voiceChannelRef, station);
      this.emit("reply.ephemeral", { replyToken, content: `📻 Tocando **${station.label}** em loop.` });
      this.emit("panel.upsert", { guildId, channelId: voiceChannelId, textChannelRef, panel: buildLofiPanel(station) });
    } else {
      await this.botPool.publishWork(guildId, voiceChannelId, null, textChannelId, {
        kind: "lofi", station: { value: station.value },
      });
      this.emit("reply.ephemeral", { replyToken, content: `📻 Tocando **${station.label}** em loop.` });
    }
  }

  async #upsertPanel(guildId, channelId, textChannelRef) {
    const panel = await this._panelFor(guildId, channelId);
    this.emit("panel.upsert", { guildId, channelId, textChannelRef, panel });
  }

  async _panelFor(guildId, channelId) {
    const queue = await this.api.getGuildQueue(guildId, channelId);
    const discoverEnabled = this.player.discoverEnabled?.(guildId, channelId) ?? false;
    const paused = this.player.paused?.(guildId, channelId) ?? false;
    const stayInRoom = this.player.stayInRoom?.(guildId, channelId) ?? false;
    return buildPanel({ ...queue, discoverEnabled, paused, stayInRoom });
  }

  _throttled(replyToken, userId, action) {
    if (this.throttle.isDuplicate(`${userId}:${action}`)) {
      this.emit("reply.ephemeral", { replyToken, content: "⏳ Calma — comando repetido rápido demais." });
      return true;
    }
    const { allowed, retryInMs } = this.throttle.checkRate(userId);
    if (!allowed) {
      this.emit("reply.ephemeral", {
        replyToken,
        content: `⏳ Devagar! Tenta de novo em ${Math.ceil(retryInMs / 1000)}s.`,
      });
      return true;
    }
    return false;
  }

  async dispatchButton(input) {
    const { guildId, customId, userId, userTag, voiceChannelId, voiceChannelName,
      voiceChannelRef, panelRef, replyToken } = input;

    if (isLofiButton(customId)) return this.#dispatchLofiButton(input);

    if (!PANEL_BUTTON_IDS.has(customId)) return;

    if (this._throttled(replyToken, userId, customId)) return;

    if (!voiceChannelId) {
      this.emit("reply.ephemeral", {
        replyToken,
        content: "🔇 Entra no canal de voz onde a música está tocando.",
      });
      return;
    }

    if (customId !== BTN_GRAB && customId !== BTN_STAY && !(await this._djAllowed(input))) return;

    if (customId === "player:playpause") {
      const { allowed, retryInMs } = this.throttle.minInterval(
        `playpause:${guildId}:${voiceChannelId}`,
        PLAYPAUSE_MIN_INTERVAL_MS,
      );
      if (!allowed) {
        this.emit("reply.ephemeral", {
          replyToken,
          content: `⏳ Espera ${Math.ceil(retryInMs / 1000)}s antes de pausar/continuar de novo.`,
        });
        return;
      }
    }

    const acked = await this.acker.ack(replyToken, ACK_DEFER_UPDATE);
    if (!acked) {
      this.emit("reply.followUp", {
        replyToken,
        content: "🔄 Esse painel foi substituído por um mais recente lá embaixo.",
      });
      return;
    }

    const mine = this.player.playingInChannel(guildId, voiceChannelId);
    const args = [guildId, voiceChannelId, userTag, voiceChannelName];

    switch (customId) {
      case "player:prev": {
        const { moved, playable, item } = await this.api.previousGuild(...args);
        if (!moved) {
          this.emit("reply.followUp", { replyToken, content: "⏮️ Não há faixa anterior." });
          return;
        }
        if (mine) this.player.applyPrevious(guildId, playable, item);
        this._publishQueueEvent(guildId, voiceChannelId, {
          type: "previous", current_id: item?.id ?? null, playable: playable ?? null, item: item ?? null,
        });
        break;
      }
      case "player:next": {
        const { skipped, playable, item } = await this.api.skipGuild(...args);
        if (skipped && mine) this.player.applySkip(guildId, playable, item);
        if (skipped) {
          this._publishQueueEvent(guildId, voiceChannelId, {
            type: "skip", current_id: item?.id ?? null, playable: playable ?? null, item: item ?? null,
          });
        }
        break;
      }
      case "player:repeat": {
        const { repeat_mode } = await this.api.toggleRepeatGuild(...args);
        this._publishQueueEvent(guildId, voiceChannelId, { type: "repeat", repeat_mode });
        break;
      }
      case "player:discover": {
        if (mine) {
          this.player.toggleDiscover(guildId);
        } else {
          this._publishQueueEvent(guildId, voiceChannelId, { type: "discover_toggle" });
        }
        break;
      }
      case "player:playpause": {
        if (mine) {
          this.player.togglePause(guildId);
        } else {
          this._publishQueueEvent(guildId, voiceChannelId, { type: "pause_toggle" });
        }
        break;
      }
      case BTN_STAY: {
        if (mine) {
          this.player.toggleStayInRoom(guildId);
        } else {
          this._publishQueueEvent(guildId, voiceChannelId, { type: "stay_toggle" });
        }
        break;
      }
      case "player:clear":
        this.api.clearUpcomingGuild(...args).catch(() => {});
        this._publishQueueEvent(guildId, voiceChannelId, { type: "clear_upcoming" });
        break;
      case "player:stop":
        if (mine) this.player.stopKeep(guildId);
        this._clearRailsQueue("clearAllGuild", () => this.api.clearAllGuild(...args));
        this._publishQueueEvent(guildId, voiceChannelId, { type: "clear_keep" });
        break;
      case BTN_LOFI: {
        if (!mine) {
          this.emit("reply.followUp", {
            replyToken,
            content: "📻 A rádio é controlada por outro player neste canal.",
          });
          return;
        }
        const station = resolveStation(DEFAULT_LOFI_STATION);
        try {
          await this.player.playLofi(guildId, voiceChannelRef, station);
        } catch (err) {
          this.emit("reply.followUp", { replyToken, content: `⚠️ ${err.message}` });
          return;
        }
        this._clearRailsQueue("clearAllGuild", () => this.api.clearAllGuild(...args));
        this._publishQueueEvent(guildId, voiceChannelId, { type: "clear_keep" });
        this.emit("panel.editRef", {
          panelRef, guildId, channelId: voiceChannelId, panel: buildLofiPanel(station),
        });
        return;
      }
      case "player:leave":
        this.emit("panel.delete", { guildId, channelId: voiceChannelId });
        if (mine) this.player.stopAndDisconnect(guildId);
        this._clearRailsQueue("stopGuild", () => this.api.stopGuild(...args));
        this._publishQueueEvent(guildId, voiceChannelId, { type: "stop" });
        this.emit("reply.followUp", { replyToken, content: "🚪 Saí do canal." });
        return;
      case BTN_GRAB: {
        const q = await this.api.getGuildQueue(guildId, voiceChannelId).catch(() => null);
        const cur = q?.current;
        if (!cur) {
          this.emit("reply.followUp", { replyToken, content: "🔇 Não há nada tocando pra guardar." });
          return;
        }
        const positionMs = mine ? this.player.playbackPositionMs(guildId, voiceChannelId) : null;
        this.emit("dm.send", { userId, replyToken, content: buildGrabDM(cur, positionMs) });
        return;
      }
    }

    const panel = await this._panelFor(guildId, voiceChannelId);
    this.emit("panel.editRef", { panelRef, guildId, channelId: voiceChannelId, panel });
  }

  async #dispatchLofiButton(input) {
    const { guildId, customId, userId, voiceChannelId, voiceChannelRef, panelRef, replyToken } = input;

    if (this._throttled(replyToken, userId, customId)) return;

    if (!voiceChannelId) {
      this.emit("reply.ephemeral", {
        replyToken,
        content: "🔇 Entra no canal de voz onde a rádio está tocando.",
      });
      return;
    }

    if (!(await this._djAllowed(input))) return;

    const acked = await this.acker.ack(replyToken, ACK_DEFER_UPDATE);
    if (!acked) {
      this.emit("reply.followUp", {
        replyToken,
        content: "🔄 Esse painel foi substituído por um mais recente lá embaixo.",
      });
      return;
    }

    if (customId === LOFI_BTN_LEAVE) {
      this.emit("panel.delete", { guildId, channelId: voiceChannelId });
      if (this.player.playingInChannel(guildId, voiceChannelId)) {
        this.player.stopAndDisconnect(guildId);
      }
      this.emit("reply.followUp", { replyToken, content: "🚪 Saí do canal." });
      return;
    }

    const station = resolveStation(parseLofiStationValue(customId));
    if (!station) {
      this.emit("reply.followUp", { replyToken, content: "📻 Estação desconhecida." });
      return;
    }
    try {
      await this.player.playLofi(guildId, voiceChannelRef, station);
    } catch (err) {
      this.emit("reply.followUp", { replyToken, content: `⚠️ ${err.message}` });
      return;
    }
    this.emit("panel.editRef", {
      panelRef, guildId, channelId: voiceChannelId, panel: buildLofiPanel(station),
    });
  }

  async dispatchCommand(input) {
    const fn = this._commands[input.commandName];
    if (fn) await fn.call(this, input);
  }

  async dispatchAutocomplete({ commandName, userId, focusedValue, replyToken }) {
    if (commandName !== "playlist" && commandName !== "add_playlist_track") return;
    try {
      const { playlists } = await this.api.searchPlaylists(userId, focusedValue);
      const choices = playlists.slice(0, 25).map((p) => ({
        name: p.build_status === "building" ? `${p.name} (montando…)` : p.name,
        value: String(p.id),
      }));
      this.emit("autocomplete.respond", { replyToken, choices });
    } catch {
      this.emit("autocomplete.respond", { replyToken, choices: [] });
    }
  }

  async dispatchVoiceUpdate({ guildId, channelId, humansInChannel }) {
    if (!this.player.playingInChannel(guildId, channelId)) return;
    if (humansInChannel > 0) {
      this.player.cancelLeaveGrace(guildId);
      this.player.resumeIfAutoPaused(guildId);
    } else if (humansInChannel === 0) {
      this.player.pauseForEmpty(guildId);
      this.player.requestLeaveGrace(guildId);
    }
  }

  async dispatchAssignmentWon({ guildId, voiceChannelId, voiceChannelRef, textChannelId, playable, item }) {
    if (item?.id && this.player.currentItemId(guildId) === item.id) return;
    await this.player.ensureConnectedAndPlay(guildId, voiceChannelRef, playable, item);
    if (voiceChannelId && textChannelId) {
      const panel = await this._panelFor(guildId, voiceChannelId);
      this.emit("panel.upsertById", { guildId, channelId: voiceChannelId, textChannelId, panel });
    }
  }

  async dispatchLofiAssignmentWon({ guildId, voiceChannelId, voiceChannelRef, textChannelId, station }) {
    if (this.player.playingInChannel(guildId, voiceChannelId)) return;
    await this.player.playLofi(guildId, voiceChannelRef, station);
    if (textChannelId) {
      this.emit("panel.upsertById", {
        guildId, channelId: voiceChannelId, textChannelId, panel: buildLofiPanel(station),
      });
    }
  }
}

BotCore.prototype._commands = {
  async play(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, textChannelRef,
      options, locale, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "play")) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: t(locale, "play.needVoice") });
      return;
    }
    const query = options?.musica;
    if (query && ["favs", "favoritos", "favorites"].includes(String(query).trim().toLowerCase())) {
      return this._playFavorites(input);
    }
    if (!query) {
      this.emit("reply.ephemeral", { replyToken, content: t(locale, "play.needInput") });
      return;
    }
    try {
      await this._dispatchPlay(input, {
        enqueueFn: () => this.api.enqueue(guildId, voiceChannelId, query, userTag, voiceChannelName),
        onReply: ({ started_now, position, item, mine }) => {
          const track = itemLine(item);
          const content = started_now
            ? (mine ? t(locale, "play.nowMine", { track }) : t(locale, "play.nowChannel", { channel: voiceChannelName, track }))
            : t(locale, "play.queued", { pos: position, track });
          this.emit("reply.ephemeral", { replyToken, content });
        },
      });
    } catch (err) {
      const content = err.status === 404
        ? t(locale, "play.notFound", { q: query })
        : err.status === 409
        ? t(locale, "play.allBusy")
        : t(locale, "common.error", { msg: err.message });
      this.emit("reply.ephemeral", { replyToken, content });
    }
  },

  async queue(input) {
    const { guildId, voiceChannelId, locale, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: t(locale, "queue.needVoice") });
      return;
    }
    const q = await this.api.getGuildQueue(guildId, voiceChannelId);
    if (!q.current && (!q.upcoming || q.upcoming.length === 0)) {
      this.emit("reply.ephemeral", { replyToken, content: t(locale, "queue.empty") });
      return;
    }
    this.emit("reply.ephemeral", { replyToken, content: buildQueueEmbed(q) });
  },

  async salvar_fila(input) {
    const { guildId, userId, voiceChannelId, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "salvar_fila")) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra no canal de voz pra salvar a fila dele." });
      return;
    }
    const name = options?.nome;
    try {
      const { playlist, saved } = await this.api.saveQueueAsPlaylist(guildId, voiceChannelId, name, userId);
      this.emit("reply.ephemeral", {
        replyToken,
        content: `💾 Fila salva como playlist **${playlist.name}** (${saved} ${saved === 1 ? "música" : "músicas"}). Use \`/playlist\` pra tocar.`,
      });
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ ${err.message}` });
    }
  },

  async skip(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, textChannelRef, locale, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "skip")) return;
    if (!(await this._djAllowed(input))) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: t(locale, "skip.needVoice") });
      return;
    }
    const { skipped, has_current, playable, item } =
      await this.api.skipGuild(guildId, voiceChannelId, userTag, voiceChannelName);
    if (!skipped) {
      this.emit("reply.ephemeral", {
        replyToken,
        content: has_current ? t(locale, "skip.lastNoNext") : t(locale, "skip.nothing"),
      });
      return;
    }
    if (this.player.playingInChannel(guildId, voiceChannelId)) {
      this.player.applySkip(guildId, playable, item);
    }
    this._publishQueueEvent(guildId, voiceChannelId, {
      type: "skip", current_id: item?.id ?? null, playable: playable ?? null, item: item ?? null,
    });
    this.emit("reply.ephemeral", { replyToken, content: t(locale, "skip.done", { track: itemLine(item) }) });
    const panel = await this._panelFor(guildId, voiceChannelId);
    this.emit("panel.upsert", { guildId, channelId: voiceChannelId, textChannelRef, panel });
  },

  async stop(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, locale, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "stop")) return;
    if (!(await this._djAllowed(input))) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: t(locale, "stop.needVoice") });
      return;
    }
    this.emit("panel.delete", { guildId, channelId: voiceChannelId });
    let ok = false;
    if (this.player.playingInChannel(guildId, voiceChannelId)) {
      ok = this.player.stopAndDisconnect(guildId);
    }
    this._clearRailsQueue("stopGuild", () => this.api.stopGuild(guildId, voiceChannelId, userTag, voiceChannelName));
    this._publishQueueEvent(guildId, voiceChannelId, { type: "stop" });
    this.emit("reply.ephemeral", { replyToken, content: ok ? t(locale, "stop.left") : t(locale, "stop.cleared") });
  },

  async limpar_fila(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, textChannelRef, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "limpar_fila")) return;
    if (!(await this._djAllowed(input))) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra no canal de voz pra limpar a fila dele." });
      return;
    }
    const { cleared } = await this.api.clearUpcomingGuild(guildId, voiceChannelId, userTag, voiceChannelName);
    this._publishQueueEvent(guildId, voiceChannelId, { type: "clear_upcoming" });
    this.emit("reply.ephemeral", {
      replyToken,
      content: cleared > 0
        ? `🧹 Fila limpa (${cleared} ${cleared === 1 ? "música removida" : "músicas removidas"}). A atual continua tocando.`
        : "A fila já estava vazia — nada a limpar.",
    });
    const panel = await this._panelFor(guildId, voiceChannelId);
    this.emit("panel.upsert", { guildId, channelId: voiceChannelId, textChannelRef, panel });
  },

  async shuffle(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, textChannelRef, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "shuffle")) return;
    if (!(await this._djAllowed(input))) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra no canal de voz pra embaralhar a fila dele." });
      return;
    }
    const { shuffled } = await this.api.shuffleQueue(guildId, voiceChannelId, userTag, voiceChannelName);
    this.emit("reply.ephemeral", {
      replyToken,
      content: shuffled >= 2 ? `🔀 Fila embaralhada (${shuffled} músicas).` : "Precisa de pelo menos 2 músicas na fila pra embaralhar.",
    });
    const panel = await this._panelFor(guildId, voiceChannelId);
    this.emit("panel.upsert", { guildId, channelId: voiceChannelId, textChannelRef, panel });
  },

  async remove(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, textChannelRef, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "remove")) return;
    if (!(await this._djAllowed(input))) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra no canal de voz pra mexer na fila dele." });
      return;
    }
    const position = options?.posicao;
    try {
      const { removed } = await this.api.removeFromQueue(guildId, voiceChannelId, position, userTag, voiceChannelName);
      this.emit("reply.ephemeral", { replyToken, content: `🗑️ Removida da fila: ${itemLine(removed)}` });
      const panel = await this._panelFor(guildId, voiceChannelId);
      this.emit("panel.upsert", { guildId, channelId: voiceChannelId, textChannelRef, panel });
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ ${err.message}` });
    }
  },

  async move(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, textChannelRef, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "move")) return;
    if (!(await this._djAllowed(input))) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra no canal de voz pra mexer na fila dele." });
      return;
    }
    const from = options?.de;
    const to = options?.para;
    try {
      const { moved, from: f, to: t } = await this.api.moveInQueue(guildId, voiceChannelId, from, to, userTag, voiceChannelName);
      this.emit("reply.ephemeral", { replyToken, content: `↕️ Movida (${f} → ${t}): ${itemLine(moved)}` });
      const panel = await this._panelFor(guildId, voiceChannelId);
      this.emit("panel.upsert", { guildId, channelId: voiceChannelId, textChannelRef, panel });
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ ${err.message}` });
    }
  },

  async nowplaying(input) {
    const { guildId, voiceChannelId, textChannelRef, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra no canal de voz pra ver o que está tocando." });
      return;
    }
    const panel = await this._panelFor(guildId, voiceChannelId);
    this.emit("panel.repost", { guildId, channelId: voiceChannelId, textChannelRef, panel });
    this.emit("reply.ephemeral", { replyToken, content: "🎛️ Painel trazido pra baixo no chat." });
  },

  async top(input) {
    const { guildId, userTag, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);

    const escopo = options?.escopo ?? "global";
    const period = options?.periodo ?? "all";
    const args = { scope: escopo, period, limit: 10 };
    let title;
    if (escopo === "user") {
      args.user = userTag;
      title = "🏆 Suas músicas mais tocadas";
    } else if (escopo === "guild") {
      args.guildId = guildId;
      title = "🏆 Mais tocadas do servidor";
    } else {
      title = "🏆 Mais ouvidas";
    }
    if (period === "month") title += " · este mês";
    else if (period === "week") title += " · esta semana";

    try {
      const { songs } = await this.api.topSongs(args);
      this.emit("reply.ephemeral", { replyToken, content: buildTopEmbed({ title, songs }) });
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ Não consegui buscar o ranking: ${err.message}` });
    }
  },

  async historico(input) {
    const { guildId, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    try {
      const { history } = await this.api.getGuildHistory(guildId, 10);
      if (!history || history.length === 0) {
        this.emit("reply.ephemeral", { replyToken, content: "🕳️ Ainda não há histórico neste servidor." });
        return;
      }
      this.emit("reply.ephemeral", { replyToken, content: buildHistoryEmbed(history) });
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ Não consegui buscar o histórico: ${err.message}` });
    }
  },

  async replay(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "replay")) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra num canal de voz primeiro." });
      return;
    }
    const position = options?.posicao ?? 1;
    let entry;
    try {
      const { history } = await this.api.getGuildHistory(guildId, 10);
      entry = history?.[position - 1];
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ Não consegui buscar o histórico: ${err.message}` });
      return;
    }
    if (!entry) {
      this.emit("reply.ephemeral", { replyToken, content: "🕳️ Não há nada no histórico nessa posição." });
      return;
    }
    try {
      await this._dispatchPlay(input, {
        enqueueFn: () => this.api.enqueue(guildId, voiceChannelId, entry.query, userTag, voiceChannelName),
        onReply: ({ started_now, position: pos, item, mine }) => {
          const verb = started_now
            ? (mine ? "🔁 Repetindo agora:" : `🔁 Repetindo no canal **${voiceChannelName}**:`)
            : `🔁 De volta à fila (posição ${pos}):`;
          this.emit("reply.ephemeral", { replyToken, content: `${verb} ${itemLine(item)}` });
        },
      });
    } catch (err) {
      const content = err.status === 409
        ? "🚫 Todos os players estão ocupados agora — tenta de novo em instantes."
        : `⚠️ ${err.message}`;
      this.emit("reply.ephemeral", { replyToken, content });
    }
  },

  async fav(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, subcommand, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);

    if (subcommand === "list") {
      try {
        const { favorites } = await this.api.listFavorites(userId);
        this.emit("reply.ephemeral", { replyToken, content: buildFavoritesEmbed(favorites) });
      } catch (err) {
        this.emit("reply.ephemeral", { replyToken, content: `⚠️ Não consegui buscar teus favoritos: ${err.message}` });
      }
      return;
    }

    if (subcommand === "play") {
      if (!voiceChannelId) {
        this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra num canal de voz primeiro." });
        return;
      }
      return this._playFavorites(input);
    }

    if (subcommand === "remove") {
      const position = options?.posicao;
      try {
        const { favorites } = await this.api.listFavorites(userId);
        const target = favorites?.[position - 1];
        if (!target) {
          this.emit("reply.ephemeral", { replyToken, content: "🕳️ Não há favorito nessa posição." });
          return;
        }
        await this.api.removeFavorite(userId, target.id);
        this.emit("reply.ephemeral", { replyToken, content: `🗑️ Removido dos favoritos: **${target.title}**` });
      } catch (err) {
        this.emit("reply.ephemeral", { replyToken, content: `⚠️ ${err.message}` });
      }
      return;
    }

    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra no canal de voz onde a música está tocando." });
      return;
    }
    try {
      const { favorite } = await this.api.addFavorite(userId, guildId, voiceChannelId);
      this.emit("reply.ephemeral", { replyToken, content: `⭐ Favoritada: **${favorite.title}**` });
    } catch (err) {
      const content = err.status === 404 ? "🔇 Não há nada tocando pra favoritar." : `⚠️ ${err.message}`;
      this.emit("reply.ephemeral", { replyToken, content });
    }
  },

  async dj(input) {
    const { guildId, userId, isAdmin, subcommand, targetUser, locale, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);

    if (subcommand === "list") {
      try {
        const { djs, restricted } = await this.api.listDjs(guildId);
        this.emit("reply.ephemeral", { replyToken, content: buildDjsEmbed(djs, restricted) });
      } catch (err) {
        this.emit("reply.ephemeral", { replyToken, content: t(locale, "common.error", { msg: err.message }) });
      }
      return;
    }

    if (!targetUser) {
      this.emit("reply.ephemeral", { replyToken, content: t(locale, "dj.needTarget") });
      return;
    }

    try {
      if (subcommand === "remove") {
        await this.api.removeDj(guildId, targetUser.id, { actorId: userId, isAdmin });
        this.emit("reply.ephemeral", { replyToken, content: t(locale, "dj.removed", { user: targetUser.username }) });
      } else {
        await this.api.addDj(guildId, { userId: targetUser.id, username: targetUser.username, actorId: userId, isAdmin });
        this.emit("reply.ephemeral", { replyToken, content: t(locale, "dj.added", { user: targetUser.username }) });
      }
    } catch (err) {
      const content = err.status === 403
        ? t(locale, "dj.forbidden")
        : err.status === 404
        ? t(locale, "dj.notDj")
        : t(locale, "common.error", { msg: err.message });
      this.emit("reply.ephemeral", { replyToken, content });
    }
  },

  async criar_playlist(input) {
    const { userId, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "criar_playlist")) return;
    try {
      const { playlist, track_count } = await this.api.createPlaylist(options?.fonte, options?.nome, userId);
      const tail = track_count > 1
        ? ` Resolvendo ${track_count} faixas no YouTube em segundo plano — daqui a pouco ela estará pronta para o /playlist.`
        : " Resolvendo a faixa no YouTube em segundo plano.";
      this.emit("reply.ephemeral", { replyToken, content: `✅ Playlist **${playlist.name}** criada.${tail}` });
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ ${err.message}` });
    }
  },

  async add_playlist_track(input) {
    const { userId, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "add_playlist_track")) return;
    try {
      const { playlist, track_count } = await this.api.addPlaylistTrack(options?.playlist, options?.musica);
      const tail = track_count > 1
        ? ` Resolvendo ${track_count} faixas no YouTube em segundo plano.`
        : " Resolvendo a faixa no YouTube em segundo plano.";
      this.emit("reply.ephemeral", { replyToken, content: `✅ Adicionando à playlist **${playlist.name}**.${tail}` });
    } catch (err) {
      this.emit("reply.ephemeral", { replyToken, content: `⚠️ ${err.message}` });
    }
  },

  async "lofi-radio"(input) {
    const { guildId, userId, voiceChannelId, voiceChannelRef, textChannelRef, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "lofi-radio")) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra num canal de voz primeiro." });
      return;
    }
    const station = resolveStation(options?.estacao);
    if (!station) {
      this.emit("reply.ephemeral", { replyToken, content: "📻 Estação desconhecida." });
      return;
    }
    try {
      await this._dispatchLofi(input, station);
    } catch (err) {
      const content = err.status === 409
        ? "🚫 Todos os players estão ocupados agora — tenta de novo em instantes."
        : `⚠️ ${err.message}`;
      this.emit("reply.ephemeral", { replyToken, content });
    }
  },

  async playlist(input) {
    const { guildId, userId, userTag, voiceChannelId, voiceChannelName, textChannelRef, options, replyToken } = input;
    await this.acker.ack(replyToken, ACK_DEFER_EPHEMERAL);
    if (this._throttled(replyToken, userId, "playlist")) return;
    if (!voiceChannelId) {
      this.emit("reply.ephemeral", { replyToken, content: "🔇 Entra num canal de voz primeiro." });
      return;
    }
    try {
      await this._dispatchPlay(input, {
        enqueueFn: () => this.api.enqueuePlaylist(options?.nome, guildId, voiceChannelId, userTag, voiceChannelName),
        onReply: ({ started_now, item, mine, enqueued, building }) => {
          const buildingNote = building ? " (a playlist ainda está sendo montada — mais faixas vão entrando)" : "";
          const where = mine ? "" : ` no canal **${voiceChannelName}**`;
          const verb = started_now
            ? `▶️ Tocando playlist${where} (${enqueued} faixa(s))${buildingNote}:`
            : `➕ Playlist adicionada à fila (${enqueued} faixa(s))${buildingNote}:`;
          this.emit("reply.ephemeral", { replyToken, content: `${verb} ${itemLine(item)}` });
        },
      });
    } catch (err) {
      const content = err.status === 404
        ? "🔍 Playlist não encontrada."
        : err.status === 409
        ? "🚫 Todos os players estão ocupados agora — tenta de novo em instantes."
        : `⚠️ ${err.message}`;
      this.emit("reply.ephemeral", { replyToken, content });
    }
  },
};

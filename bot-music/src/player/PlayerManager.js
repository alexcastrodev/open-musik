
import { GuildPlayer } from "./GuildPlayer.js";

export class PlayerManager {
  constructor({ api, bus = null, botPool = null, ownClientId = null, refreshPanel = null } = {}) {
    this.api = api;
    this.bus = bus;
    this.botPool = botPool;
    this.ownClientId = ownClientId;
    this.refreshPanel = refreshPanel;
    this.removePanel = null;
    this.onBusy = null;
    this.onFree = null;
    this.players = new Map();
  }

  setRefreshPanel(fn) {
    this.refreshPanel = fn;
  }

  setRemovePanel(fn) {
    this.removePanel = fn;
  }

  setPoolHooks({ onBusy = null, onFree = null } = {}) {
    this.onBusy = onBusy;
    this.onFree = onFree;
  }

  get(guildId) {
    let p = this.players.get(guildId);
    if (!p) {
      p = new GuildPlayer(guildId, {
        api: this.api,
        bus: this.bus,
        botPool: this.botPool,
        ownClientId: this.ownClientId,
        refreshPanel: (gid, cid, queue) => this.refreshPanel?.(gid, cid, queue),
        removePanel: (gid, cid) => this.removePanel?.(gid, cid),
        onConnect: () => this.onBusy?.(),
        onLeave: (gid) => {
          this.players.delete(gid);
          this.onFree?.();
        },
      });
      this.players.set(guildId, p);
    }
    return p;
  }

  peek(guildId) {
    return this.players.get(guildId) ?? null;
  }

  toggleDiscover(guildId) {
    return this.players.get(guildId)?.toggleDiscover() ?? false;
  }

  discoverEnabled(guildId, channelId) {
    const p = this.players.get(guildId);
    return p?.channelId === channelId ? p.discoverEnabled : false;
  }

  togglePause(guildId) {
    return this.players.get(guildId)?.togglePause() ?? false;
  }

  paused(guildId, channelId) {
    const p = this.players.get(guildId);
    return p?.channelId === channelId ? p.paused : false;
  }

  toggleStayInRoom(guildId) {
    return this.players.get(guildId)?.toggleStayInRoom() ?? false;
  }

  stayInRoom(guildId, channelId) {
    const p = this.players.get(guildId);
    return p?.channelId === channelId ? p.stayInRoom : false;
  }

  pauseForEmpty(guildId) {
    this.players.get(guildId)?.pauseForEmpty();
  }

  resumeIfAutoPaused(guildId) {
    this.players.get(guildId)?.resumeIfAutoPaused();
  }

  playbackPositionMs(guildId, channelId) {
    const p = this.players.get(guildId);
    return p?.channelId === channelId ? p.playbackPositionMs() : null;
  }

  playingInChannel(guildId, channelId) {
    return this.players.get(guildId)?.channelId === channelId;
  }

  voiceSnapshot(guildId) {
    const p = this.players.get(guildId);
    return p ? p.voiceSnapshot() : { voice_state: "idle", channel_id: null, current_title: null };
  }

  stopAndDisconnect(guildId) {
    const p = this.players.get(guildId);
    if (!p) return false;
    return p.stopAndDisconnect();
  }

  stopAll() {
    for (const p of [...this.players.values()]) {
      try {
        p.stopAndDisconnect();
      } catch (e) {
        console.warn(`[player-manager] stopAll: ${p.guildId} falhou: ${e.message}`);
      }
    }
  }

  playingChannelId(guildId) {
    return this.players.get(guildId)?.channelId ?? null;
  }

  busy() {
    for (const p of this.players.values()) {
      if (p.channelId) return true;
    }
    return false;
  }
}

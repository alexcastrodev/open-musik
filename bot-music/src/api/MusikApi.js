
const g = (guildId) => `/api/guilds/${encodeURIComponent(guildId)}`;
const gc = (guildId, channelId) =>
  `${g(guildId)}/channels/${encodeURIComponent(channelId)}`;

const DEFAULT_TIMEOUT_MS = 10_000;

export class MusikApi {
  constructor({ baseUrl, clientId, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    this.base = String(baseUrl).replace(/\/+$/, "");
    this.clientId = clientId;
    this.timeoutMs = timeoutMs;
  }

  async #request(path, options = {}) {
    const res = await fetch(`${this.base}${path}`, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
      signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw await this.#apiError(res, path, options.method);
    }
    return res.json();
  }

  async #apiError(res, path, method) {
    const body = await res.json().catch(() => null);
    const err = new Error(
      body?.error || `API ${method || "GET"} ${path} → ${res.status}`,
    );
    err.status = res.status;
    return err;
  }

  #post(path, body) {
    return this.#request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: this.clientId, ...(body ?? {}) }),
    });
  }

  enqueue(guildId, channelId, query, requestedBy, channelName = null, { queueOnly = false } = {}) {
    return this.#post(`${gc(guildId, channelId)}/enqueue`, {
      q: query,
      requested_by: requestedBy,
      channel_name: channelName,
      queue_only: queueOnly,
    });
  }

  advanceGuild(guildId, channelId) {
    return this.#post(`${gc(guildId, channelId)}/advance`);
  }

  skipGuild(guildId, channelId, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/skip`, { actor, channel_name: channelName });
  }

  previousGuild(guildId, channelId, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/previous`, { actor, channel_name: channelName });
  }

  toggleRepeatGuild(guildId, channelId, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/repeat`, { actor, channel_name: channelName });
  }

  clearAllGuild(guildId, channelId, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/clear`, { actor, channel_name: channelName });
  }

  stopGuild(guildId, channelId, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/stop`, { actor, channel_name: channelName });
  }

  clearUpcomingGuild(guildId, channelId, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/clear_upcoming`, { actor, channel_name: channelName });
  }

  shuffleQueue(guildId, channelId, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/shuffle`, { actor, channel_name: channelName });
  }

  removeFromQueue(guildId, channelId, position, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/remove`, { position, actor, channel_name: channelName });
  }

  moveInQueue(guildId, channelId, from, to, actor = null, channelName = null) {
    return this.#post(`${gc(guildId, channelId)}/move`, { from, to, actor, channel_name: channelName });
  }

  getGuildQueue(guildId, channelId) {
    return this.#request(`${gc(guildId, channelId)}/queue`);
  }

  saveQueueAsPlaylist(guildId, channelId, name, discordUserId) {
    return this.#post(`${gc(guildId, channelId)}/save_playlist`, {
      name,
      discord_user_id: discordUserId,
    });
  }

  listDjs(guildId) {
    return this.#request(`/api/guilds/${encodeURIComponent(guildId)}/djs`);
  }

  addDj(guildId, { userId, username, actorId, isAdmin }) {
    return this.#post(`/api/guilds/${encodeURIComponent(guildId)}/djs`, {
      discord_user_id: userId, username, actor_id: actorId, is_admin: isAdmin,
    });
  }

  removeDj(guildId, userId, { actorId, isAdmin }) {
    const params = new URLSearchParams({ actor_id: actorId ?? "", is_admin: String(!!isAdmin) });
    return this.#request(
      `/api/guilds/${encodeURIComponent(guildId)}/djs/${encodeURIComponent(userId)}?${params.toString()}`,
      { method: "DELETE" },
    );
  }

  getGuildHistory(guildId, limit = 10) {
    return this.#request(`/api/guilds/${encodeURIComponent(guildId)}/history?limit=${encodeURIComponent(limit)}`);
  }

  listFavorites(discordUserId) {
    return this.#request(`/api/favorites?discord_user_id=${encodeURIComponent(discordUserId)}`);
  }

  addFavorite(discordUserId, guildId, channelId) {
    return this.#post("/api/favorites", {
      discord_user_id: discordUserId,
      guild_id: guildId,
      channel_id: channelId,
    });
  }

  removeFavorite(discordUserId, id) {
    return this.#request(
      `/api/favorites/${encodeURIComponent(id)}?discord_user_id=${encodeURIComponent(discordUserId)}`,
      { method: "DELETE" },
    );
  }

  getItemStatus(guildId, channelId, itemId) {
    return this.#request(`${gc(guildId, channelId)}/items/${encodeURIComponent(itemId)}`);
  }

  createPlaylist(source, name, discordUserId) {
    return this.#post("/api/playlists", {
      source,
      name,
      discord_user_id: discordUserId,
    });
  }

  searchPlaylists(discordUserId, query) {
    const params = new URLSearchParams({ discord_user_id: discordUserId });
    if (query) params.set("q", query);
    return this.#request(`/api/playlists?${params.toString()}`);
  }

  addPlaylistTrack(playlistId, source) {
    return this.#post(`/api/playlists/${encodeURIComponent(playlistId)}/add_track`, {
      source,
    });
  }

  enqueuePlaylist(playlistId, guildId, channelId, requestedBy, channelName = null) {
    return this.#post(`/api/playlists/${encodeURIComponent(playlistId)}/channels/${encodeURIComponent(channelId)}/enqueue`, {
      guild_id: guildId,
      requested_by: requestedBy,
      channel_name: channelName,
    });
  }

  postHeartbeat(payload) {
    return this.#post("/api/bot/heartbeat", { bot_client_id: this.clientId, ...payload });
  }

  ackWrapped(id) {
    return this.#post(`/api/bot/wrapped/${encodeURIComponent(id)}/delivered`, {
      bot_client_id: this.clientId,
    });
  }

  topSongs({ scope, guildId = null, user = null, period = null, limit = 10 } = {}) {
    const params = new URLSearchParams({ scope, limit: String(limit) });
    if (guildId) params.set("guild_id", guildId);
    if (user) params.set("user", user);
    if (period) params.set("period", period);
    return this.#request(`/api/stats/top?${params.toString()}`);
  }
}

export function displayTitle(item) {
  return item?.title || "música";
}

export function displayArtist(item) {
  return item?.artist || "Artista desconhecido";
}

export function formatDuration(item) {
  return item?.formatted_duration || "--:--";
}

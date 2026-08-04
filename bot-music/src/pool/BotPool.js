
import Redis from "ioredis";

const PRESENCE_TTL = 90;
const CLAIM_TTL = 20;

export const WORK_PUBLISHED_CHANNEL = "work:published";

const CLAIM_SCRIPT = `
if redis.call('set', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) then
  return 1
else
  return 0
end
`;

export class BotPool {
  constructor({ url, ownClientId, enabled = true } = {}) {
    this.url = url;
    this.ownClientId = String(ownClientId ?? "");
    this.enabled = enabled && !!url && !!this.ownClientId;
    this.redis = null;
  }

  connect() {
    if (!this.enabled || this.redis) return;
    this.redis = new Redis(this.url, { lazyConnect: true, maxRetriesPerRequest: 2 });
    this.redis.on("error", (e) => console.warn(`[bot-pool] erro: ${e.message}`));
    this.redis.defineCommand("poolClaim", { numberOfKeys: 1, lua: CLAIM_SCRIPT });
    this.redis
      .connect()
      .then(() => console.log("[bot-pool] conectado (pool no bot-cache)"))
      .catch((e) => console.warn(`[bot-pool] conexão falhou (seguindo no pool antigo): ${e.message}`));
  }

  close() {
    this.redis?.quit().catch(() => {});
    this.redis = null;
  }

  #botKey(g, b) { return `pool:bot:${g}:${b}`; }
  #freeKey(g) { return `pool:free:${g}`; }
  #claimKey(g, c) { return `pool:claim:${g}:${c}`; }
  #workKey(g, c) { return `pool:work:${g}:${c}`; }
  #guildsKey(b) { return `pool:guilds:${b}`; }

  async registerPresence(guildId, {
    voiceChannelId = null, voiceChannelName = null, voiceState = "idle",
    available = true, name = null, iconUrl = null, memberCount = null, currentTitle = null,
  } = {}) {
    if (!this.enabled || !this.redis) return;
    const g = String(guildId);
    const b = this.ownClientId;
    if (!g || !b) return;
    try {
      const m = this.redis.multi();
      m.hset(this.#botKey(g, b),
        "voice_channel_id", String(voiceChannelId ?? ""),
        "voice_channel_name", String(voiceChannelName ?? ""),
        "voice_state", String(voiceState ?? ""),
        "name", String(name ?? ""),
        "icon_url", String(iconUrl ?? ""),
        "member_count", String(memberCount ?? ""),
        "current_title", String(currentTitle ?? ""),
        "last_seen_at", new Date().toISOString());
      m.expire(this.#botKey(g, b), PRESENCE_TTL);
      m.sadd(this.#guildsKey(b), g);
      m.expire(this.#guildsKey(b), PRESENCE_TTL);
      if (available) m.sadd(this.#freeKey(g), b);
      else m.srem(this.#freeKey(g), b);
      m.expire(this.#freeKey(g), PRESENCE_TTL);
      await m.exec();
    } catch (e) {
      console.warn(`[bot-pool] registerPresence falhou: ${e.message}`);
    }
  }

  async forgetAbsent(presentGuildIds) {
    if (!this.enabled || !this.redis) return;
    const b = this.ownClientId;
    try {
      const known = await this.redis.smembers(this.#guildsKey(b));
      const present = new Set(presentGuildIds.map(String));
      await Promise.all(known.filter((g) => !present.has(g)).map((g) => this.#forget(g, b)));
    } catch (e) {
      console.warn(`[bot-pool] forgetAbsent falhou: ${e.message}`);
    }
  }

  async #forget(g, b) {
    const m = this.redis.multi();
    m.del(this.#botKey(g, b));
    m.srem(this.#freeKey(g), b);
    m.srem(this.#guildsKey(b), g);
    await m.exec();
  }

  async freeBots(guildId) {
    if (!this.enabled || !this.redis) return [];
    const g = String(guildId);
    try {
      const ids = await this.redis.smembers(this.#freeKey(g));
      if (ids.length === 0) return [];
      const pipe = this.redis.pipeline();
      ids.forEach((b) => pipe.exists(this.#botKey(g, b)));
      const res = await pipe.exec();
      const alive = [];
      for (let i = 0; i < ids.length; i++) {
        const present = res[i]?.[1] === 1;
        if (present) alive.push(ids[i]);
        else this.redis.srem(this.#freeKey(g), ids[i]).catch(() => {});
      }
      return alive;
    } catch (e) {
      console.warn(`[bot-pool] freeBots falhou: ${e.message}`);
      return [];
    }
  }

  async botOnChannel(guildId, channelId) {
    if (!this.enabled || !this.redis) return null;
    const g = String(guildId);
    const c = String(channelId);
    try {
      const keys = [];
      let cursor = "0";
      do {
        const [next, batch] = await this.redis.scan(cursor, "MATCH", `pool:bot:${g}:*`, "COUNT", 100);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== "0");
      if (keys.length === 0) return null;
      const pipe = this.redis.pipeline();
      keys.forEach((key) => pipe.hget(key, "voice_channel_id"));
      const res = await pipe.exec();
      for (let i = 0; i < keys.length; i++) {
        if (res[i]?.[1] === c) return keys[i].split(":", 4)[3];
      }
      return null;
    } catch (e) {
      console.warn(`[bot-pool] botOnChannel falhou: ${e.message}`);
      return null;
    }
  }

  async publishWork(guildId, channelId, itemId, textChannelId = null, extra = {}) {
    if (!this.enabled || !this.redis) return;
    try {
      const payload = JSON.stringify({
        kind: extra.kind ?? "track",
        item_id: itemId,
        text_channel_id: textChannelId,
        station: extra.station ?? null,
      });
      await this.redis.set(this.#workKey(guildId, channelId), payload, "EX", CLAIM_TTL);
      this.redis
        .publish(WORK_PUBLISHED_CHANNEL, JSON.stringify({
          guild_id: String(guildId), channel_id: String(channelId), ts: Date.now(),
        }))
        .catch(() => {});
    } catch (e) {
      console.warn(`[bot-pool] publishWork falhou: ${e.message}`);
    }
  }

  async pendingWork(guildId) {
    if (!this.enabled || !this.redis) return null;
    const g = String(guildId);
    try {
      let cursor = "0";
      do {
        const [next, batch] = await this.redis.scan(cursor, "MATCH", `pool:work:${g}:*`, "COUNT", 100);
        cursor = next;
        for (const key of batch) {
          const cid = key.split(":", 4)[3];
          if (await this.redis.exists(this.#claimKey(g, cid))) continue;
          const raw = await this.redis.get(key);
          if (raw == null) continue;
          const work = JSON.parse(raw);
          return {
            channelId: cid,
            kind: work.kind ?? "track",
            itemId: work.item_id ?? null,
            textChannelId: work.text_channel_id ?? null,
            station: work.station ?? null,
          };
        }
      } while (cursor !== "0");
      return null;
    } catch (e) {
      console.warn(`[bot-pool] pendingWork falhou: ${e.message}`);
      return null;
    }
  }

  async tryClaim(guildId, channelId) {
    if (!this.enabled || !this.redis) return false;
    try {
      const res = await this.redis.poolClaim(this.#claimKey(guildId, channelId), this.ownClientId, CLAIM_TTL);
      return Number(res) === 1;
    } catch (e) {
      console.warn(`[bot-pool] tryClaim falhou: ${e.message}`);
      return false;
    }
  }

  async releaseChannel(guildId, channelId) {
    if (!this.enabled || !this.redis) return;
    try {
      await this.redis.del(this.#claimKey(guildId, channelId), this.#workKey(guildId, channelId));
    } catch (e) {
      console.warn(`[bot-pool] releaseChannel falhou: ${e.message}`);
    }
  }

  async releaseMe(guildId, channelId) {
    if (!this.enabled || !this.redis) return;
    const g = String(guildId);
    const b = this.ownClientId;
    if (!g || !b) return;
    try {
      const m = this.redis.multi();
      m.sadd(this.#freeKey(g), b);
      m.expire(this.#freeKey(g), PRESENCE_TTL);
      m.hset(this.#botKey(g, b), "voice_channel_id", "", "voice_state", "idle", "current_title", "");
      m.expire(this.#botKey(g, b), PRESENCE_TTL);
      if (channelId) m.del(this.#claimKey(g, channelId), this.#workKey(g, channelId));
      await m.exec();
    } catch (e) {
      console.warn(`[bot-pool] releaseMe falhou: ${e.message}`);
    }
  }
}

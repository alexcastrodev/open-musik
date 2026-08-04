
import Redis from "ioredis";

export function queueChannel(guildId, channelId) {
  return `queue:events:${guildId}:${channelId}`;
}

export class ValkeyBus {
  constructor({ url, enabled = true } = {}) {
    this.url = url;
    this.enabled = enabled && !!url;
    this.pub = null;
    this.sub = null;
    this.handlers = new Map();
  }

  connect() {
    if (!this.enabled || this.pub) return;
    const opts = { lazyConnect: true, maxRetriesPerRequest: 2 };
    this.pub = new Redis(this.url, opts);
    this.sub = new Redis(this.url, opts);

    this.pub.on("error", (e) => console.warn(`[valkey-bus] pub erro: ${e.message}`));
    this.sub.on("error", (e) => console.warn(`[valkey-bus] sub erro: ${e.message}`));

    this.sub.on("message", (channel, payload) => {
      const set = this.handlers.get(channel);
      if (!set || set.size === 0) return;
      let msg;
      try {
        msg = JSON.parse(payload);
      } catch {
        return;
      }
      for (const fn of set) {
        try {
          fn(msg);
        } catch (e) {
          console.warn(`[valkey-bus] handler erro em ${channel}: ${e.message}`);
        }
      }
    });

    Promise.all([this.pub.connect(), this.sub.connect()])
      .then(() => console.log("[valkey-bus] conectado (pub/sub bot-a-bot ativo)"))
      .catch((e) => console.warn(`[valkey-bus] conexão falhou (seguindo no poll): ${e.message}`));
  }

  publish(guildId, channelId, message) {
    if (!this.enabled || !this.pub) return;
    try {
      this.pub.publish(queueChannel(guildId, channelId), JSON.stringify(message)).catch(() => {});
    } catch {
      /* no-op */
    }
  }

  subscribe(guildId, channelId, handler) {
    this.subscribeRaw(queueChannel(guildId, channelId), handler);
  }

  unsubscribe(guildId, channelId, handler) {
    this.unsubscribeRaw(queueChannel(guildId, channelId), handler);
  }

  subscribeRaw(channel, handler) {
    if (!this.enabled || !this.sub) return;
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      this.sub.subscribe(channel).catch((e) =>
        console.warn(`[valkey-bus] subscribe ${channel} falhou: ${e.message}`),
      );
    }
    set.add(handler);
  }

  unsubscribeRaw(channel, handler) {
    if (!this.sub) return;
    const set = this.handlers.get(channel);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(channel);
      this.sub.unsubscribe(channel).catch(() => {});
    }
  }

  close() {
    this.pub?.quit().catch(() => {});
    this.sub?.quit().catch(() => {});
    this.pub = null;
    this.sub = null;
    this.handlers.clear();
  }
}

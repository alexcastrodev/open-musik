import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STORE_PATH = join(
  dirname(fileURLToPath(import.meta.url)), "..", "data", "config.json",
);

const GUILD_FIELDS = ["voiceChannelId", "panelChannelId", "panelMessageId", "station"];

export class ConfigStore {
  constructor(path = process.env.LOFI_STORE_PATH || DEFAULT_STORE_PATH) {
    this.path = path;
    this.guilds = this.#load();
  }

  #load() {
    try {
      const raw = readFileSync(this.path, "utf8");
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data.guilds ?? {} : {};
    } catch {
      return {};
    }
  }

  #persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ guilds: this.guilds }, null, 2));
    renameSync(tmp, this.path);
  }

  getGuild(guildId) {
    return this.guilds[guildId] ?? null;
  }

  allGuilds() {
    return Object.entries(this.guilds).map(([guildId, cfg]) => ({ guildId, ...cfg }));
  }

  setGuild(guildId, patch) {
    const clean = {};
    for (const k of GUILD_FIELDS) {
      if (patch[k] !== undefined) clean[k] = patch[k];
    }
    this.guilds[guildId] = { ...(this.guilds[guildId] ?? {}), ...clean };
    this.#persist();
    return this.guilds[guildId];
  }

  removeGuild(guildId) {
    if (!(guildId in this.guilds)) return false;
    delete this.guilds[guildId];
    this.#persist();
    return true;
  }
}

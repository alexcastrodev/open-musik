
function unquote(value) {
  if (typeof value !== "string") return value;
  return value.replace(/^(['"])(.*)\1$/s, "$2");
}

function env(name, fallback) {
  const value = process.env[name];
  return value == null ? fallback : unquote(value);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return unquote(value);
}

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    guildId: env("DISCORD_GUILD_ID", null),
  },
  api: {
    baseUrl: env("MUSIK_API_URL", "http://localhost:3001"),
    timeoutMs: Number(env("MUSIK_API_TIMEOUT_MS", 10_000)),
  },
  valkey: {
    url: env("BOT_VALKEY_URL", "redis://localhost:16379/0"),
    enabled: env("QUEUE_PUBSUB", "1") !== "0",
    poolEnabled: env("POOL_IN_BOTCACHE", "1") !== "0",
  },
};

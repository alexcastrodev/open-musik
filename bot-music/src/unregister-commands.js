
import { REST, Routes } from "discord.js";
import { config } from "./config.js";

const rest = new REST({ version: "10" }).setToken(config.discord.token);

const route = config.discord.guildId
  ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
  : Routes.applicationCommands(config.discord.clientId);

try {
  await rest.put(route, { body: [] });
  const scope = config.discord.guildId ? `guild ${config.discord.guildId}` : "global";
  console.log(`🧹 Comandos removidos do app ${config.discord.clientId} (${scope}).`);
} catch (err) {
  console.error("❌ Falha ao remover comandos:", err);
  process.exit(1);
}

import { REST, Routes } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const rest = new REST({ version: "10" }).setToken(token);

try {
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  console.log("✅ Comandos globais removidos.");
} catch (err) {
  console.error("❌ Falha ao remover comandos:", err);
  process.exit(1);
}

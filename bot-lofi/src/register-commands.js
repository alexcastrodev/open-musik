import { REST, Routes } from "discord.js";
import { commandData } from "./commands.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const rest = new REST({ version: "10" }).setToken(token);

try {
  await rest.put(Routes.applicationCommands(clientId), { body: commandData });
  console.log(`✅ ${commandData.length} comando(s) registrado(s) (global).`);
} catch (err) {
  console.error("❌ Falha ao registrar comandos:", err);
  process.exit(1);
}

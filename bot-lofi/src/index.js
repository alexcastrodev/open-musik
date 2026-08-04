import "./ipv4-only.js";
import "sodium-native";
import "@discordjs/opus";

import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { ConfigStore } from "./store.js";
import { RadioManager } from "./radio.js";
import { resolveStation, allStations } from "./stations.js";
import { buildLofiPanel, isLofiButton, parseLofiStationValue } from "./panel.js";

const TOKEN = process.env.DISCORD_TOKEN;
const DEFAULT_STATION = allStations()[0]?.value ?? "tokyo";
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 1_000;

process.on("unhandledRejection", (reason) => {
  console.error("[index] unhandledRejection (ignorado, bot segue):", reason?.stack ?? reason);
});
process.on("uncaughtException", (err) => {
  console.error("[index] uncaughtException (ignorado, bot segue):", err?.stack ?? err);
});

const store = new ConfigStore();
const radio = new RadioManager();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

async function sendOrUpdatePanel(panelChannel, station, messageId = null) {
  const payload = buildLofiPanel(station, allStations());
  if (messageId) {
    try {
      const msg = await panelChannel.messages.fetch(messageId);
      await msg.edit(payload);
      return msg.id;
    } catch {
    }
  }
  const sent = await panelChannel.send(payload);
  return sent.id;
}

async function handleSetup(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const voiceChannel = interaction.options.getChannel("sala");
  const stationValue = interaction.options.getString("estacao") ?? DEFAULT_STATION;

  const station = resolveStation(stationValue);
  if (!station) {
    await interaction.editReply(`❌ Estação inválida: \`${stationValue}\`.`);
    return;
  }

  try {
    await radio.start(voiceChannel, station.value);
  } catch (err) {
    await interaction.editReply(`❌ Não consegui entrar em **${voiceChannel.name}**: ${err.message}`);
    return;
  }

  const panelChannel = voiceChannel;
  const existing = store.getGuild(interaction.guildId);
  const panelMessageId = await sendOrUpdatePanel(
    panelChannel, station, existing?.panelMessageId ?? null,
  );

  store.setGuild(interaction.guildId, {
    voiceChannelId: voiceChannel.id,
    panelChannelId: panelChannel.id,
    panelMessageId,
    station: station.value,
  });

  await interaction.editReply(
    `📻 Rádio **${station.label}** tocando em **${voiceChannel.name}**. ` +
      `Painel em <#${panelChannel.id}>.`,
  );
}

async function handleButton(interaction) {
  const guildId = interaction.guildId;

  if (interaction.customId === "lofi:leave") {
    radio.stop(guildId);
    store.removeGuild(guildId);
    await interaction.update({
      content: "🚪 Rádio encerrada. Rode `/lofi-setup` pra ligar de novo.",
      embeds: [],
      components: [],
      files: [],
    });
    return;
  }

  const stationValue = parseLofiStationValue(interaction.customId);
  const station = resolveStation(stationValue);
  if (!station) {
    await interaction.reply({ content: "❌ Estação desconhecida.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!radio.get(guildId)) {
    const cfg = store.getGuild(guildId);
    const voiceChannel = cfg?.voiceChannelId
      ? await client.channels.fetch(cfg.voiceChannelId).catch(() => null)
      : null;
    if (!voiceChannel) {
      await interaction.reply({
        content: "❌ Rádio não está ativa. Rode `/lofi-setup` de novo.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await radio.start(voiceChannel, station.value);
  } else {
    radio.switchStation(guildId, station.value);
  }

  store.setGuild(guildId, { station: station.value });
  await interaction.update(buildLofiPanel(station, allStations()));
}

async function rejoinConfiguredGuilds() {
  for (const cfg of store.allGuilds()) {
    const station = resolveStation(cfg.station) ?? allStations()[0];
    try {
      const voiceChannel = await client.channels.fetch(cfg.voiceChannelId);
      await radio.start(voiceChannel, station.value);

      const panelChannel = cfg.panelChannelId
        ? await client.channels.fetch(cfg.panelChannelId).catch(() => voiceChannel)
        : voiceChannel;
      const panelMessageId = await sendOrUpdatePanel(panelChannel, station, cfg.panelMessageId);
      store.setGuild(cfg.guildId, { panelMessageId });
      console.log(`[index] rádio religada em ${cfg.guildId} (${station.label}).`);
    } catch (err) {
      console.error(`[index] falha ao religar rádio em ${cfg.guildId}: ${err.message}`);
    }
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 Logado como ${c.user.tag}`);
  await rejoinConfiguredGuilds();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "lofi-setup") {
      await handleSetup(interaction);
    } else if (interaction.isButton() && isLofiButton(interaction.customId)) {
      await handleButton(interaction);
    }
  } catch (err) {
    console.error("[index] erro no handler de interação:", err?.stack ?? err);
    const msg = "❌ Deu ruim ao processar isso. Tenta de novo.";
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
      } else if (interaction.deferred) {
        await interaction.editReply(msg);
      }
    } catch {
    }
  }
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} recebido, encerrando…`);
  radio.stopAll();
  await new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS));
  client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN ausente. Defina no .env.");
  process.exit(1);
}
client.login(TOKEN);

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { allStations } from "./stations.js";

const LOFI_COVER_PATH = join(
  dirname(fileURLToPath(import.meta.url)), "..", "assets", "lofi.png",
);
const LOFI_COVER_NAME = "lofi.png";

export const LOFI_BTN_PREFIX = "lofi:";
export const LOFI_BTN_LEAVE = "lofi:leave";

export function isLofiButton(customId) {
  return typeof customId === "string" && customId.startsWith(LOFI_BTN_PREFIX);
}

export function parseLofiStationValue(customId) {
  if (!isLofiButton(customId) || customId === LOFI_BTN_LEAVE) return null;
  return customId.slice(LOFI_BTN_PREFIX.length);
}

const STATION_EMOJI = {
  tokyo: "🌆",
  focus: "🎧",
  anime: "🌸",
  anime2: "✨",
  akita: "🐕",
};

function stationEmoji(value) {
  return STATION_EMOJI[value] ?? "🎵";
}

export function buildLofiPanel(current, stations = allStations()) {
  const cover = new AttachmentBuilder(LOFI_COVER_PATH, { name: LOFI_COVER_NAME });
  const embed = new EmbedBuilder()
    .setTitle("📻 Rádio Lo-fi")
    .setColor(0xa78bfa)
    .setDescription(
      `${stationEmoji(current?.value)} **${current?.label ?? "—"}**\n` +
        "🔴 Ao vivo · tocando em loop",
    )
    .setImage(`attachment://${LOFI_COVER_NAME}`)
    .setFooter({ text: "Use os botões pra trocar de estação · 🚪 sai da sala" });

  const switches = stations
    .filter((s) => s.value !== current?.value)
    .map((s) =>
      new ButtonBuilder()
        .setCustomId(`${LOFI_BTN_PREFIX}${s.value}`)
        .setLabel(s.label)
        .setEmoji(stationEmoji(s.value))
        .setStyle(ButtonStyle.Secondary),
    );

  const leave = new ButtonBuilder()
    .setCustomId(LOFI_BTN_LEAVE)
    .setLabel("Sair da sala")
    .setEmoji("🚪")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(...switches, leave);
  return { embeds: [embed], components: [row], files: [cover] };
}

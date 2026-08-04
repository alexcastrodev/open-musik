
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { displayArtist, displayTitle, formatDuration } from "../api/MusikApi.js";

export const BTN_PREV = "player:prev";
export const BTN_PLAYPAUSE = "player:playpause";
export const BTN_NEXT = "player:next";
export const BTN_REPEAT = "player:repeat";
export const BTN_DISCOVER = "player:discover";
export const BTN_LOFI = "player:lofi";
export const BTN_CLEAR = "player:clear";
export const BTN_STOP = "player:stop";
export const BTN_LEAVE = "player:leave";
export const BTN_GRAB = "player:grab";
export const BTN_STAY = "player:stay";
export const PANEL_BUTTON_IDS = new Set([
  BTN_PREV, BTN_PLAYPAUSE, BTN_NEXT, BTN_REPEAT, BTN_DISCOVER, BTN_LOFI, BTN_CLEAR, BTN_STOP, BTN_LEAVE, BTN_GRAB, BTN_STAY,
]);

export function thumbnailUrl(item) {
  return item?.youtube_id
    ? `https://i.ytimg.com/vi/${item.youtube_id}/hqdefault.jpg`
    : null;
}

export function itemLine(item) {
  return `**${displayTitle(item)}** — ${displayArtist(item)} \`(${formatDuration(item)})\``;
}

export function buildGrabDM(item, positionMs = null) {
  const link = item?.youtube_id ? `https://youtu.be/${item.youtube_id}` : null;
  const lines = [
    "🎣 **Faixa guardada**",
    `**${displayTitle(item)}** — ${displayArtist(item)}`,
  ];
  if (link) lines.push(`🔗 ${link}`);
  if (positionMs != null) lines.push(`🕒 no momento ${formatMs(positionMs)}`);
  lines.push(`🗓️ guardado em ${new Date().toLocaleString("pt-PT")}`);
  return lines.join("\n");
}

function formatMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function nowPlayingBlock(item) {
  const lines = [
    `**${displayTitle(item)}**`,
    `⏱️ ${formatDuration(item)}`,
  ];
  if (item?.requested_by) lines.push(`👤 pedido por ${item.requested_by}`);
  return lines.join("\n");
}

export function buildPanel({ current, upcoming, discoverEnabled = false, paused = false, stayInRoom = false } = {}) {
  const next = upcoming ?? [];

  const embed = new EmbedBuilder()
    .setTitle("🎛️ Painel do Player")
    .setColor(0x5865f2)
    .addFields(
      {
        name: "Tocando agora",
        value: current ? nowPlayingBlock(current) : "Nada tocando.",
      },
      { name: "Na fila", value: `${next.length} faixa(s)` },
      {
        name: "Próximas faixas",
        value: next.length
          ? next
            .slice(0, 10)
            .map((it, i) => `\`${i + 1}.\` ${itemLine(it)}`)
            .join("\n")
          : "Fila vazia.",
      },
    );

  const thumb = thumbnailUrl(current);
  if (thumb) embed.setImage(thumb);

  const playing = !!current;
  const looping = current?.repeat_mode === "track";

  const transport = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_PREV)
      .setLabel("Anterior")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!playing),
    new ButtonBuilder()
      .setCustomId(BTN_PLAYPAUSE)
      .setLabel(paused ? "Continuar" : "Pausar")
      .setEmoji(paused ? "▶️" : "⏸️")
      .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!playing),
    new ButtonBuilder()
      .setCustomId(BTN_NEXT)
      .setLabel("Próxima")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(next.length === 0),
    new ButtonBuilder()
      .setCustomId(BTN_REPEAT)
      .setLabel(looping ? "Repetindo" : "Repetir")
      .setEmoji("🔁")
      .setStyle(looping ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!playing),
    new ButtonBuilder()
      .setCustomId(BTN_DISCOVER)
      .setLabel(discoverEnabled ? "Sugestões ON" : "Sugestões automáticas")
      .setEmoji("🔮")
      .setStyle(discoverEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!playing),
  );

  const management = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_LOFI)
      .setLabel("Lo-Fi")
      .setEmoji("🎧")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!playing),
    new ButtonBuilder()
      .setCustomId(BTN_CLEAR)
      .setLabel("Limpar fila")
      .setEmoji("🧹")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(next.length === 0),
    new ButtonBuilder()
      .setCustomId(BTN_GRAB)
      .setLabel("Guardar")
      .setEmoji("🎣")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!playing),
    new ButtonBuilder()
      .setCustomId(BTN_STOP)
      .setLabel("Parar")
      .setEmoji("⏹️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!playing && next.length === 0),
    new ButtonBuilder()
      .setCustomId(BTN_LEAVE)
      .setLabel("Sair da sala")
      .setEmoji("🚪")
      .setStyle(ButtonStyle.Danger),
  );

  const extras = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BTN_STAY)
      .setLabel(stayInRoom ? "Ficando na sala" : "Ficar na sala")
      .setEmoji("📌")
      .setStyle(stayInRoom ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [transport, management, extras] };
}

export function buildQueueEmbed({ current, upcoming } = {}) {
  const embed = new EmbedBuilder().setTitle("🎶 Fila de reprodução").setColor(0x5865f2);
  if (current) {
    embed.addFields({ name: "Tocando agora", value: itemLine(current) });
  }
  if (upcoming && upcoming.length) {
    embed.addFields({
      name: "A seguir",
      value: upcoming
        .slice(0, 10)
        .map((it, i) => `\`${i + 1}.\` ${itemLine(it)}`)
        .join("\n"),
    });
    if (upcoming.length > 10) {
      embed.setFooter({ text: `+${upcoming.length - 10} na fila` });
    }
  }
  return { embeds: [embed] };
}

export function buildTopEmbed({ title, songs = [] } = {}) {
  const embed = new EmbedBuilder().setTitle(title).setColor(0xf97316);
  if (!songs.length) {
    embed.setDescription("Nenhum play ainda. Toca alguma coisa primeiro! 🎶");
    return { embeds: [embed] };
  }
  const medals = ["🥇", "🥈", "🥉"];
  embed.setDescription(
    songs
      .map((s, i) => {
        const rank = medals[i] ?? `\`${i + 1}.\``;
        const artist = s.artist ? ` — ${s.artist}` : "";
        const plays = `${s.plays} play${s.plays === 1 ? "" : "s"}`;
        return `${rank} **${s.title}**${artist} · ${plays}`;
      })
      .join("\n"),
  );
  return { embeds: [embed] };
}

export function buildHistoryEmbed(history = []) {
  const embed = new EmbedBuilder().setTitle("🕘 Últimas tocadas").setColor(0x5865f2);
  if (!history.length) {
    embed.setDescription("Ainda não há histórico neste servidor.");
    return { embeds: [embed] };
  }
  embed.setDescription(
    history
      .map((h) => {
        const artist = h.artist && h.artist !== "Artista desconhecido" ? ` — ${h.artist}` : "";
        const who = h.requested_by ? ` · 👤 ${h.requested_by}` : "";
        return `\`${h.position}.\` **${h.title}**${artist}${who}`;
      })
      .join("\n"),
  );
  embed.setFooter({ text: "Use /replay <posição> pra tocar de novo" });
  return { embeds: [embed] };
}

export function buildFavoritesEmbed(favorites = []) {
  const embed = new EmbedBuilder().setTitle("⭐ Teus favoritos").setColor(0xf5c518);
  if (!favorites.length) {
    embed.setDescription("Você ainda não tem favoritos. Use `/fav add` enquanto uma música toca.");
    return { embeds: [embed] };
  }
  embed.setDescription(
    favorites
      .map((f) => {
        const artist = f.artist && f.artist !== "Artista desconhecido" ? ` — ${f.artist}` : "";
        return `\`${f.position}.\` **${f.title}**${artist}`;
      })
      .join("\n"),
  );
  embed.setFooter({ text: "/play favs pra tocar · /fav remove <posição> pra tirar" });
  return { embeds: [embed] };
}

export function buildDjsEmbed(djs = [], restricted = false) {
  const embed = new EmbedBuilder().setTitle("🎧 DJs do servidor").setColor(0x9b59b6);
  if (!djs.length) {
    embed.setDescription("Nenhum DJ ainda — **modo aberto**: todo mundo controla a reprodução.\nUse `/dj add @alguém` pra ativar o modo DJ.");
    return { embeds: [embed] };
  }
  embed.setDescription(djs.map((d) => `• ${d.username || d.discord_user_id}`).join("\n"));
  embed.setFooter({
    text: restricted
      ? "Modo DJ: só DJs (ou admin) controlam skip/stop/fila."
      : "Modo aberto.",
  });
  return { embeds: [embed] };
}


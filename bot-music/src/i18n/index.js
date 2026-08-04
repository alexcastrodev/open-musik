
export const DEFAULT_LOCALE = "pt";
export const SUPPORTED_LOCALES = ["pt", "en"];

export function resolveLocale(discordLocale) {
  const base = String(discordLocale || "").toLowerCase().split("-")[0];
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

const MESSAGES = {
  pt: {
    "play.needVoice": "🔇 Entra num canal de voz primeiro.",
    "play.nowMine": "▶️ Tocando agora: {track}",
    "play.nowChannel": "▶️ Tocando no canal **{channel}**: {track}",
    "play.queued": "➕ Adicionado à fila (posição {pos}): {track}",
    "play.notFound": "🔍 Nada encontrado para \"{q}\".",
    "play.allBusy": "🚫 Todos os players estão ocupados agora — tenta de novo em instantes.",
    "play.needInput": "🎵 Diz uma música (ou link).",

    "skip.needVoice": "🔇 Entra no canal de voz pra pular a música dele.",
    "skip.lastNoNext": "⏮️ Já é a última — não há próxima na fila.",
    "skip.nothing": "Não há nada tocando.",
    "skip.done": "⏭️ Pulada. Agora: {track}",

    "stop.needVoice": "🔇 Entra no canal de voz pra parar a reprodução dele.",
    "stop.left": "⏹️ Parado e saí do canal.",
    "stop.cleared": "⏹️ Fila limpa.",

    "queue.needVoice": "🔇 Entra no canal de voz pra ver a fila dele.",
    "queue.empty": "A fila está vazia.",

    "dj.onlyDjs": "🎧 Só os **DJs** do servidor podem controlar a reprodução. Veja com `/dj list`.",
    "dj.needTarget": "👤 Diga quem: `/dj add @usuário`.",
    "dj.added": "🎧 **{user}** agora é DJ.",
    "dj.removed": "🎧 **{user}** não é mais DJ.",
    "dj.forbidden": "🚫 Só um DJ ou admin do servidor pode gerenciar DJs.",
    "dj.notDj": "🤷 Esse usuário não é DJ.",

    "common.error": "⚠️ {msg}",
  },
  en: {
    "play.needVoice": "🔇 Join a voice channel first.",
    "play.nowMine": "▶️ Now playing: {track}",
    "play.nowChannel": "▶️ Playing in **{channel}**: {track}",
    "play.queued": "➕ Added to the queue (position {pos}): {track}",
    "play.notFound": "🔍 Nothing found for \"{q}\".",
    "play.allBusy": "🚫 All players are busy right now — try again in a moment.",
    "play.needInput": "🎵 Tell me a song (or link).",

    "skip.needVoice": "🔇 Join its voice channel to skip the song.",
    "skip.lastNoNext": "⏮️ That's the last one — nothing next in the queue.",
    "skip.nothing": "Nothing is playing.",
    "skip.done": "⏭️ Skipped. Now: {track}",

    "stop.needVoice": "🔇 Join its voice channel to stop playback.",
    "stop.left": "⏹️ Stopped and left the channel.",
    "stop.cleared": "⏹️ Queue cleared.",

    "queue.needVoice": "🔇 Join its voice channel to see the queue.",
    "queue.empty": "The queue is empty.",

    "dj.onlyDjs": "🎧 Only the server's **DJs** can control playback. See `/dj list`.",
    "dj.needTarget": "👤 Say who: `/dj add @user`.",
    "dj.added": "🎧 **{user}** is now a DJ.",
    "dj.removed": "🎧 **{user}** is no longer a DJ.",
    "dj.forbidden": "🚫 Only a DJ or server admin can manage DJs.",
    "dj.notDj": "🤷 That user isn't a DJ.",

    "common.error": "⚠️ {msg}",
  },
};

export function t(locale, key, vars = {}) {
  const lang = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const template = MESSAGES[lang]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`,
  );
}

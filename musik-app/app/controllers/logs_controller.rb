# Histórico de eventos do player, separado por servidor (guild). Admin-only.
# A página (Inertia Logs/Index) tem um seletor de servidor; o filtro chega em
# ?server=<discord_guild_id>. Sem servidor selecionado, mostra o primeiro
# conhecido (ou nada, se não houver logs ainda).
class LogsController < ApplicationController
  LIMIT = 200

  def index
    authorize :log

    guilds   = ServerLog.known_guilds
    selected = params[:server].presence || guilds.first&.dig(:discord_guild_id)

    logs =
      if selected
        ServerLog.for_guild(selected).recent.limit(LIMIT).map { |l| log_json(l) }
      else
        []
      end

    render inertia: "Logs/Index", props: {
      guilds: guilds,
      selected_server: selected,
      logs: logs,
      now_playing: selected && now_playing_json(selected)
    }
  end

  private

  # "Tocando agora" no servidor selecionado (Épico 2, item 4) — lido do
  # BotGuild (heartbeat do bot, item 3; princípio 5: o Rails não vê o Valkey
  # do swarm), não do ServerLog (que é histórico de eventos passados, não
  # estado atual).
  def now_playing_json(guild_id)
    guild = BotGuild.active_in(guild_id)
    return nil unless guild

    {
      title: guild.current_title,
      voice_channel_name: guild.voice_channel_name,
      bot_name: guild.bot_name
    }
  end

  def log_json(log)
    {
      id: log.id,
      kind: log.kind,
      song_title: log.song_title,
      requested_by: log.requested_by,
      actor: log.actor,
      bot_name: log.bot_name,
      voice_channel_name: log.voice_channel_name,
      detail: log.detail,
      created_at: log.created_at
    }
  end
end

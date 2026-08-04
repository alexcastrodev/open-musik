# Hub de gestão dos bots (Épico 2, item 5: redesign focado em gestão). Mostra os
# "servidores conectados" (BotGuild, alimentado pelo heartbeat — item 3) como
# página de primeira classe, fora da tela de biblioteca (Manage). O Rails não vê
# o Valkey do swarm (princípio 5): tudo aqui vem do heartbeat HTTP do bot.
class ServersController < ApplicationController
  def index
    authorize :server

    servers = servers_json
    render inertia: "Servers/Index", props: {
      servers: servers,
      summary: summary_json(servers)
    }
  end

  private

  # BotGuild guarda um registro por par (guild, bot); aqui agregamos em um card
  # por guild, com os bots instalados dentro (`bots`). Status do guild: active
  # se algum bot toca (só um toca por vez), idle se algum responde, offline se
  # nenhum deu heartbeat fresco. Metadados (nome/ícone/membros) vêm do
  # heartbeat mais recente.
  def servers_json
    BotGuild.order(:name).group_by(&:discord_guild_id).map do |guild_id, bots|
      freshest = bots.max_by { |g| g.last_seen_at || Time.at(0) }
      active = bots.find { |g| g.status == "active" }
      status =
        if active
          "active"
        elsif bots.any? { |g| g.status == "idle" }
          "idle"
        else
          "offline"
        end

      {
        discord_guild_id: guild_id,
        name: freshest.name,
        icon_url: freshest.icon_url,
        member_count: freshest.member_count,
        status: status,
        voice_channel_name: active&.voice_channel_name,
        current_title: active&.current_title,
        last_seen_at: bots.filter_map(&:last_seen_at).max,
        bots: bots.sort_by(&:bot_name).map do |g|
          { bot_client_id: g.bot_client_id, bot_name: g.bot_name, status: g.status }
        end
      }
    end
  end

  def summary_json(servers)
    {
      installed: servers.size,
      active: servers.count { |s| s[:status] == "active" },
      idle: servers.count { |s| s[:status] == "idle" },
      offline: servers.count { |s| s[:status] == "offline" }
    }
  end
end

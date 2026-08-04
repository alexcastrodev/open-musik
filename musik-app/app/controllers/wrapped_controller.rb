# Painel das retrospectivas "Wrapped" geradas (Épico 2, item 8). Admin vê os
# wrappeds por servidor/período, o estado de entrega (pendente/entregue no
# Discord) e o conteúdo (top músicas/artistas, horas). A geração é agendada
# (GenerateWrappedJob); a entrega é feita pelo bot via heartbeat.
class WrappedController < ApplicationController
  def index
    authorize :wrapped

    guild_names = BotGuild.order(updated_at: :desc).pluck(:discord_guild_id, :name).to_h

    wrappeds = ServerWrapped.recent.limit(100).map do |w|
      {
        id: w.id,
        guild_name: guild_names[w.discord_guild_id].presence || w.discord_guild_id,
        period_kind: w.period_kind,
        period_label: w.payload["period_label"],
        status: w.status,
        delivered_at: w.delivered_at,
        payload: w.payload
      }
    end

    render inertia: "Wrapped/Index", props: { wrappeds: wrappeds }
  end
end

module Api
  # Heartbeat do bot do Discord. Cada bot envia periodicamente um snapshot dos
  # guilds em que ESTE bot está (ver bot/src/heartbeat.js), identificado por
  # bot_client_id (DISCORD_CLIENT_ID).
  #
  # O POOL (disponibilidade, disputa de trabalho) NÃO vive aqui — continua só no
  # bot-cache, gerido pelos próprios bots (ver bot/src/pool/BotPool.js). Este
  # heartbeat HTTP grava METADADOS (nome/ícone/contagem, fallback de nome no
  # ServerLog) E o estado de voz INFORMATIVO (o que está tocando agora, em qual
  # canal) pro admin ver "servidores conectados" (Épico 2, item 3) — o Rails não
  # enxerga o Valkey do swarm (princípio 5), então isto é o único jeito.
  class BotController < Api::ApiController
    def heartbeat
      client_id = params[:bot_client_id].to_s
      return render_error("bot_client_id é obrigatório.", :unprocessable_entity) if client_id.empty?

      guilds = params.fetch(:guilds, [])
      ids = []

      guilds.each do |g|
        gid = g[:id].to_s
        next if gid.blank?

        ids << gid
        record = BotGuild.find_or_initialize_by(discord_guild_id: gid, bot_client_id: client_id)
        record.assign_attributes(
          name: g[:name],
          icon_url: g[:icon_url],
          member_count: g[:member_count],
          voice_state: g[:voice_state].presence || "idle",
          voice_channel_id: g[:voice_channel_id],
          voice_channel_name: g[:voice_channel_name],
          current_title: g[:current_title],
          last_seen_at: Time.current
        )
        record.save!
      end

      # Snapshot completo DESTE bot: guilds fora da lista = este bot saiu deles.
      # Limpa a linha de metadados (escopado por bot pra não apagar os outros bots
      # no mesmo guild).
      if ids.any?
        BotGuild.where(bot_client_id: client_id).where.not(discord_guild_id: ids).delete_all
      end

      render json: { ok: true, wrapped: claim_pending_wrapped(ids, client_id) }
    end

    # POST /api/bot/wrapped/:id/delivered { bot_client_id }
    # Ack do bot após postar o Wrapped no canal do Discord (Épico 2, item 8):
    # marca entregue pra não reenviar. Idempotente.
    def wrapped_delivered
      wrapped = ServerWrapped.find_by(id: params[:id])
      return render_error("Wrapped não encontrado.", :not_found) unless wrapped

      wrapped.update!(
        status: "delivered",
        delivered_by: params[:bot_client_id].presence,
        delivered_at: Time.current
      )
      render json: { ok: true }
    end

    private

    # Reivindica (claim atômico) os wrappeds pendentes dos guilds em que ESTE bot
    # está e devolve pra postagem. O UPDATE guardado por `deliverable` garante que
    # só UM bot pega cada wrapped: se o outro bot do guild já reivindicou dentro do
    # TTL, o segundo UPDATE casa 0 linhas. Sem guilds, não faz nada.
    def claim_pending_wrapped(guild_ids, client_id)
      return [] if guild_ids.empty?

      ServerWrapped.deliverable.where(discord_guild_id: guild_ids).pluck(:id).filter_map do |id|
        claimed = ServerWrapped.deliverable.where(id: id)
                               .update_all(claimed_by: client_id, claimed_at: Time.current)
        next unless claimed == 1

        w = ServerWrapped.find(id)
        { id: w.id, guild_id: w.discord_guild_id, message: w.message }
      end
    end

    def render_error(message, status)
      render json: { error: message }, status: status
    end
  end
end

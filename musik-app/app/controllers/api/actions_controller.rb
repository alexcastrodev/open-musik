module Api
  # Recebe ações do bot do Discord e as processa de forma resiliente via
  # Sidekiq (BotActionJob), com idempotência, rate-limit e prioridade.
  class ActionsController < ApiController
    # POST /api/actions
    # body: { kind:, idempotency_key:, discord_user_id:, discord_guild_id:, song_id?, payload?: {} }
    def create
      kind = params[:kind].to_s
      key  = params[:idempotency_key].to_s

      return render_error("kind inválido", :unprocessable_entity) unless BotAction::KINDS.include?(kind)
      return render_error("idempotency_key obrigatória", :unprocessable_entity) if key.blank?

      user_id = params[:discord_user_id].to_s

      # Rate-limit por usuário: defesa em camadas (o bot já faz cooldown local).
      if BotAction.recent_count_for(user_id) >= BotAction::RATE_MAX
        return render_error("rate limit", :too_many_requests)
      end

      # Idempotência: a mesma chave nunca cria duas ações nem reenfileira.
      action = BotAction.find_by(idempotency_key: key)
      if action
        return render json: { action: action_json(action), enqueued: false }
      end

      action = BotAction.create!(
        kind: kind,
        idempotency_key: key,
        discord_user_id: user_id.presence,
        discord_guild_id: params[:discord_guild_id].presence,
        song_id: params[:song_id].presence,
        payload: action_payload
      )

      # Prioridade por tipo: skip/stop passam à frente de play.
      BotActionJob.set(priority: action.job_priority).perform_later(action.id)

      render json: { action: action_json(action), enqueued: true }, status: :created
    rescue ActiveRecord::RecordNotUnique
      # Corrida na idempotency_key: trata como já enfileirada.
      existing = BotAction.find_by(idempotency_key: key)
      render json: { action: action_json(existing), enqueued: false }
    end

    private

    def action_payload
      raw = params[:payload]
      raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : (raw || {})
    end

    def action_json(action)
      {
        id: action.id,
        kind: action.kind,
        status: action.status,
        song_id: action.song_id,
        idempotency_key: action.idempotency_key,
        created_at: action.created_at
      }
    end

    def render_error(message, status)
      render json: { error: message }, status: status
    end
  end
end

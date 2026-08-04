class BotActionJob < ApplicationJob
  # Fila dedicada às ações do bot Discord, isolada dos jobs de import/upload.
  queue_as :discord

  # Resiliência: re-tenta erros transitórios com backoff exponencial.
  retry_on ActiveRecord::Deadlocked, wait: :polynomially_longer, attempts: 5
  retry_on ActiveRecord::ConnectionNotEstablished, wait: :polynomially_longer, attempts: 5

  # Se o registro sumiu, não há o que processar.
  discard_on ActiveJob::DeserializationError

  def perform(bot_action_id)
    action = BotAction.find_by(id: bot_action_id)
    return if action.nil?

    # Idempotência: só processa o que está pendente. Reenfileiramentos ou
    # entregas duplicadas (mesma idempotency_key) não reprocessam.
    return unless action.status == "pending"

    action.update!(status: "processing")

    case action.kind
    when "play"      then handle_play(action)
    when "skip", "stop", "nowplaying" then handle_transport(action)
    end

    action.update!(status: "done", error_message: nil)
  rescue => e
    action&.update(status: "failed", error_message: e.message.to_s.truncate(500))
    raise # deixa o retry_on/Sidekiq lidar com a retentativa
  end

  private

  # Efeito colateral do play: incrementa o contador (o que antes vivia no
  # SongsController#play). A reprodução em si é feita pelo bot, em tempo real.
  def handle_play(action)
    song = action.song || Song.find_by(id: action.payload["song_id"])
    return if song.nil?

    song.increment!(:play_count)
  end

  # skip/stop/nowplaying são controles de transporte: hoje só auditamos
  # (o efeito real acontece no bot). Mantido como ponto de extensão.
  def handle_transport(_action)
    # no-op por enquanto; o registro em bot_actions já serve de histórico.
  end
end

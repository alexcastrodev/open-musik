class EnqueueSpotifyTracksJob < ApplicationJob
  # Fila dedicada (abaixo de discord/default): não pode segurar a thread que roda
  # CacheProviderSongJob/BotActionJob. Ver config/sidekiq.yml.
  queue_as :playlists

  discard_on ActiveJob::DeserializationError

  # Enfileira em background as faixas RESTANTES de uma playlist/álbum do Spotify (a
  # 1ª já entrou no /play — ver ResolvePrimaryTrackJob). UM TERMO POR JOB, na ordem:
  # resolve o 1º termo ("artista nome") no YouTube, cria o item `queued` (dispara o
  # broadcast — a faixa aparece na fila na hora) e agenda o próprio job pro RESTO.
  # As faixas vão surgindo uma a uma conforme resolvem, sem esperar um lote.
  #
  # Um resolve yt-dlp por vez (sequencial): leve na memória e ordem estrita. O cache
  # S3 segue lookahead-1 (prefetch_next) — enfileirar ≠ baixar.
  #
  # Termo que não resolver (sem resultado) ou acima do limite de duração é pulado —
  # seguimos pra próximo sem derrubar a cadeia.
  def perform(guild_id, voice_channel_id, requested_by, terms, epoch = 0)
    term, *rest = Array(terms)
    return if term.nil?

    service = PlayQueueService.new(guild_id, voice_channel_id)

    # parar/limpar (stop/clear/limpar_fila) bumpou a época depois que esta cadeia
    # nasceu: foi cancelada. Não enfileira mais nada NEM encadeia o próximo job — o
    # parar cancela o preenchimento em vez de a fila voltar a se encher.
    return if service.enqueue_cancelled?(epoch)

    begin
      candidates = ProviderService.resolve_all(term)
      if candidates.present? && service.within_duration_limit?(candidates.first)
        service.create_queued_item(candidates, requested_by)
        service.prefetch_next
      end
    rescue => e
      Rails.logger.warn("[EnqueueSpotifyTracksJob] '#{term}' falhou: #{e.message}")
    end

    self.class.perform_later(guild_id, voice_channel_id, requested_by, rest, epoch) if rest.any?
  end
end

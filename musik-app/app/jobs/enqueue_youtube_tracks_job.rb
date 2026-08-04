class EnqueueYoutubeTracksJob < ApplicationJob
  # Fila dedicada (abaixo de discord/default): não pode segurar a thread que roda
  # CacheProviderSongJob/BotActionJob. Ver config/sidekiq.yml.
  queue_as :playlists

  discard_on ActiveJob::DeserializationError

  # Enfileira em background as faixas RESTANTES de uma playlist do YouTube (a 1ª já
  # entrou no /play — ver ResolvePrimaryTrackJob). UMA FAIXA POR JOB, na ordem:
  # resolve a 1ª URL da lista, cria o item `queued` (o que dispara o broadcast pro
  # bot — a faixa aparece na fila NA HORA, sem esperar um lote inteiro), e agenda o
  # próprio job pro RESTO. Assim as faixas vão surgindo uma a uma conforme resolvem,
  # em vez de o painel ficar parado até um lote de 10 terminar.
  #
  # Um resolve yt-dlp por vez (sequencial): leve na memória (um runtime JS Deno de
  # cada vez) e ordem estrita garantida pelo encadeamento. O cache S3 segue
  # lookahead-1 (prefetch_next) — enfileirar a faixa ≠ baixá-la; só a próxima a
  # tocar é baixada.
  #
  # Uma faixa que não resolver (YouTube barrou, vídeo indisponível) ou acima do
  # limite de duração é pulada — seguimos pra próxima sem derrubar a cadeia.
  def perform(guild_id, voice_channel_id, requested_by, urls, epoch = 0)
    url, *rest = Array(urls)
    return if url.nil?

    service = PlayQueueService.new(guild_id, voice_channel_id)

    # parar/limpar (stop/clear/limpar_fila) bumpou a época depois que esta cadeia
    # nasceu: foi cancelada. Não enfileira mais nada NEM encadeia o próximo job — o
    # parar cancela o preenchimento em vez de a fila voltar a se encher.
    return if service.enqueue_cancelled?(epoch)

    begin
      candidates = ProviderService.resolve_all(url)
      if candidates.present? && service.within_duration_limit?(candidates.first)
        # Cria o item; o bot mostra a faixa na fila no próximo poll de /queue (~500ms).
        service.create_queued_item(candidates, requested_by)
        # Aquece o lookahead-1: baixa só a PRÓXIMA a tocar, não esta recém-enfileirada.
        service.prefetch_next
      end
    rescue => e
      Rails.logger.warn("[EnqueueYoutubeTracksJob] '#{url}' falhou: #{e.message}")
    end

    # Encadeia a próxima faixa, repassando a época. Roda mesmo se esta falhou — uma
    # faixa ruim não interrompe o resto da playlist (mas um parar/limpar, sim).
    self.class.perform_later(guild_id, voice_channel_id, requested_by, rest, epoch) if rest.any?
  end
end

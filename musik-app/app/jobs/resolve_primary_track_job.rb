class ResolvePrimaryTrackJob < ApplicationJob
  # Fila dedicada (mesma dos jobs de playlist): o resolve via yt-dlp é pesado
  # (runtime JS) e não pode segurar a thread do discord/default. Ver sidekiq.yml.
  queue_as :playlists

  discard_on ActiveJob::DeserializationError

  # Resolve no worker a query do /play que criou um item PROVISÓRIO (ver
  # PlayQueueService#enqueue). Antes isso bloqueava o web; agora o /play responde
  # na hora (o bot toca a 1ª faixa da fonte pela source_query) e este job:
  #   1. detecta playlist do YouTube / link do Spotify / faixa única;
  #   2. resolve a 1ª faixa no provider e PREENCHE o item provisório
  #      (título/artista/duração/stream_candidates), agendando o cache S3;
  #   3. se for playlist/álbum, agenda as DEMAIS faixas (EnqueueYoutube/Spotify
  #      TracksJob), como o enqueue síncrono fazia.
  # Ao preencher o item, o painel do bot atualiza no próximo poll de /queue (~500ms).
  #
  # `started_now`: a 1ª faixa já virou current no /play (fila estava vazia). Repassa
  # pro skip_transcode do cache (a 1ª sobe no formato nativo, mais rápido).
  #
  # Faixa que não resolve (vídeo indisponível / nada encontrado) ou acima do limite
  # de duração: o item provisório é REMOVIDO (some da fila/painel) — o bot, que não
  # achou stream pela fonte, já terá avisado o usuário OU avança.
  # `epoch`: época de enfileiramento em que a cadeia nasceu (PlayQueueService#enqueue).
  # Se um stop/clear/limpar_fila bumpou a época antes deste job rodar, a cadeia foi
  # cancelada — não enfileira as demais faixas (ver EnqueueEpochService). Default 0
  # mantém compat com jobs já na fila antes do deploy.
  def perform(item_id, query, requested_by, started_now, epoch = 0)
    item = PlayQueueItem.find_by(id: item_id)
    return if item.nil?

    service = PlayQueueService.new(item.discord_guild_id, item.voice_channel_id)

    # Cadeia cancelada por um parar/limpar posterior: descarta o item provisório
    # (sairia na fila como faixa fantasma) e não enfileira o resto da playlist.
    if service.enqueue_cancelled?(epoch)
      service.discard_item(item)
      return
    end

    # YouTube playlist (playlist?list= / watch?v=&list=): lista as faixas por URL
    # canônica. A 1ª preenche este item; as demais vão pro EnqueueYoutubeTracksJob.
    yt_urls = YoutubePlaylistService.playlist_url?(query) ? YoutubePlaylistService.track_urls(query) : []
    # Spotify (DRM): traduz a URL em termos de busca. A 1ª preenche este item; as
    # demais (playlist/álbum) vão pro EnqueueSpotifyTracksJob.
    spotify_terms = yt_urls.empty? ? ProviderService.spotify_terms(query) : []
    primary_query = yt_urls.first || spotify_terms.first || query

    candidates = ProviderService.resolve_all(primary_query)
    if candidates.empty? || !service.within_duration_limit?(candidates.first)
      # Nada resolveu (ou faixa longa demais): tira o item provisório da fila.
      service.discard_item(item)
      return
    end

    service.fill_provisional_item(item, candidates, skip_transcode: started_now)

    if yt_urls.size > 1
      EnqueueYoutubeTracksJob.perform_later(item.discord_guild_id, item.voice_channel_id, requested_by, yt_urls.drop(1), epoch)
    elsif spotify_terms.size > 1
      EnqueueSpotifyTracksJob.perform_later(item.discord_guild_id, item.voice_channel_id, requested_by, spotify_terms.drop(1), epoch)
    end
  end
end

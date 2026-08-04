class EnqueuePlaylistJob < ApplicationJob
  queue_as :default

  # Enfileira em background as faixas RESTANTES de uma playlist do bot na fila do
  # guild (a 1ª já entrou no /playlist — ver Api::PlaylistsController#play).
  # As Songs já estão cacheadas no S3 (BuildPlaylistJob), então aqui só criamos
  # PlayQueueItems via PlayQueueService#enqueue_song; o cache S3 segue o
  # lookahead-1 (prefetch_next). Análogo ao EnqueueSpotifyTracksJob.
  def perform(guild_id, voice_channel_id, requested_by, song_ids, playlist_id = nil, epoch = 0)
    service = PlayQueueService.new(guild_id, voice_channel_id)

    # parar/limpar (stop/clear/limpar_fila) bumpou a época depois que este job foi
    # agendado: foi cancelado. Não enfileira o resto da playlist — o parar cancela o
    # preenchimento em vez de a fila voltar a se encher.
    return if service.enqueue_cancelled?(epoch)

    Array(song_ids).each do |song_id|
      song = Song.find_by(id: song_id)
      next if song.nil?

      service.enqueue_song(song, requested_by: requested_by, playlist_id: playlist_id)
    rescue => e
      Rails.logger.warn("[EnqueuePlaylistJob] song ##{song_id} falhou: #{e.message}")
    end
  end
end

class BuildPlaylistJob < ApplicationJob
  queue_as :default

  discard_on ActiveJob::DeserializationError

  # Monta uma playlist do bot em background: resolve cada `term` no YouTube,
  # cacheia a faixa no S3 (ProviderService.resolve_and_cache) e a anexa à
  # playlist. Os `terms` já vêm prontos (termos "artista nome" de uma playlist
  # do Spotify, ou o título cru digitado no /criar_playlist — ver
  # Api::PlaylistsController#create).
  #
  # Uma faixa que não resolver (YouTube barrou, termo sem resultado) é pulada,
  # sem derrubar o lote. Ao fim, marca build_status: "ready" pra o /playlist
  # parar de avisar "ainda montando".
  def perform(playlist_id, terms)
    playlist = Playlist.find_by(id: playlist_id)
    return if playlist.nil?

    Array(terms).each do |term|
      song = ProviderService.resolve_and_cache(term)
      next if song.nil?

      # find_or_create: reexecução do job (retry) não duplica faixas; a UNIQUE
      # [playlist_id, song_id] também protege.
      ps = PlaylistSong.find_or_create_by!(playlist: playlist, song: song)

      # Faixa realmente nova (não um retry/duplicata): se a playlist ainda está
      # tocando em algum canal, enfileira a faixa lá também — senão ela só
      # entraria numa próxima execução de /playlist. enqueue_song é idempotente
      # por canal; já terminada/parada não aparece em channels_playing.
      enqueue_into_active_guilds(playlist, song) if ps.previously_new_record?
    rescue => e
      Rails.logger.warn("[BuildPlaylistJob] '#{term}' falhou: #{e.message}")
    end

    playlist.update!(build_status: "ready")
  end

  private

  def enqueue_into_active_guilds(playlist, song)
    # A fila é por (guild, canal): a playlist pode estar tocando em canais
    # diferentes (de bots distintos do pool), então enfileira em cada canal ativo.
    PlayQueueService.channels_playing(playlist.id).each do |guild_id, voice_channel_id|
      PlayQueueService.new(guild_id, voice_channel_id).enqueue_song(
        song,
        requested_by: playlist.name,
        playlist_id: playlist.id
      )
    end
  end
end

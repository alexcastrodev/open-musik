require "open3"

class ImportYoutubeJob < ApplicationJob
  queue_as :default

  # Import permanente pela UI web. A mecânica de yt-dlp/S3 vive em
  # YoutubeProviderService (compartilhada com a fila do bot); aqui ficam só a
  # orquestração com broadcast de progresso e a checagem de duplicatas.
  def perform(youtube_url, import_id)
    broadcast(import_id, :processing, "Baixando áudio do YouTube...")

    canonical_url = YoutubeProviderService.normalize_url(youtube_url)

    if Song.exists?(youtube_url: canonical_url)
      broadcast(import_id, :duplicate, "Essa música já foi importada.")
      return
    end

    begin
      # Step 1: metadata
      broadcast(import_id, :processing, "Obtendo informações da música...")
      meta = YoutubeProviderService.resolve(canonical_url)
      raise "não consegui resolver a música" if meta.nil?

      title  = meta[:title]
      artist = meta[:artist]
      duration_seconds = meta[:duration]

      # Steps 2-4: download → upload S3 (no service). Dedup por URL já feito acima.
      broadcast(import_id, :processing, "Baixando e convertendo para MP3...")
      result = YoutubeProviderService.download_to_s3(canonical_url, title: title)

      # Step 5: persist
      song = Song.create!(
        s3_key: result[:s3_key],
        s3_url: result[:s3_url],
        youtube_url: canonical_url,
        title: title,
        artist: artist,
        duration: duration_seconds
      )

      EnrichSongMetadataJob.perform_later(song.id)

      broadcast(import_id, :done, "Importado com sucesso!", song_id: song.id)

    rescue => e
      Rails.logger.error("[ImportYoutubeJob] #{e.class}: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
      broadcast(import_id, :error, "Erro ao importar: #{e.message}")
    end
  end

  private

  def broadcast(import_id, status, message, extra = {})
    YoutubeImport.where(import_id: import_id).update_all(
      status: status.to_s,
      message: message,
      song_id: extra[:song_id],
      updated_at: Time.current
    )
    ActionCable.server.broadcast(
      "youtube_import_#{import_id}",
      { status: status, message: message }.merge(extra)
    )
  end
end

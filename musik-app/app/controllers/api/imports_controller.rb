module Api
  # Import síncrono de YouTube para o bot (MusikDownloader): um POST devolve
  # o file_url direto, sem polling.
  #
  # Diferente do fluxo da UI web (SongsController#import_youtube → fila +
  # ActionCable), aqui resolvemos e baixamos NA REQUEST e respondemos com a URL
  # do S3. A mecânica de dedup-ou-download mora em ProviderService#resolve_and_cache:
  #   - URL já importada (por URL canônica ou fingerprint, com áudio no S3) →
  #     reusa a Song e devolve o file_url IMEDIATO (sem baixar de novo);
  #   - URL nova (ou Song purgada) → baixa, sobe pro S3 e devolve o file_url.
  class ImportsController < ApiController
    # POST /api/imports/youtube  { youtube_url: "..." } → { file_url: "..." }
    def youtube
      url = params[:youtube_url].to_s.strip
      return render json: { error: "youtube_url não informada" }, status: :unprocessable_entity if url.blank?

      song = ProviderService.resolve_and_cache(url)
      return render json: { error: "não consegui resolver a música" }, status: :unprocessable_entity if song.nil?

      render json: { file_url: song.s3_url }
    rescue ProviderService::ResolveError => e
      Rails.logger.error("[Api::ImportsController] #{e.class}: #{e.message}")
      render json: { error: "Erro ao importar: #{e.message}" }, status: :unprocessable_entity
    end
  end
end

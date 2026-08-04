module Api
  # Busca síncrona: resolve um termo (ou URL) no YouTube via yt-dlp e devolve a
  # URL canônica, sem baixar nem subir pro S3 (rápido). Pra baixar de fato, ver
  # Api::ImportsController#youtube.
  class SearchController < ApiController
    # GET /api/search?q=termo → { url:, title:, artist:, duration: }
    def index
      query = params[:q].to_s.strip
      return render json: { error: "q não informada" }, status: :unprocessable_entity if query.blank?

      result = ProviderService.resolve(query)
      return render json: { error: "nada encontrado" }, status: :not_found if result.nil?

      render json: {
        url:      result[:canonical_url],
        title:    result[:title],
        artist:   result[:artist],
        duration: result[:duration]
      }
    rescue ProviderService::ResolveError => e
      Rails.logger.error("[Api::SearchController] #{e.class}: #{e.message}")
      render json: { error: "Erro ao buscar: #{e.message}" }, status: :unprocessable_entity
    end
  end
end

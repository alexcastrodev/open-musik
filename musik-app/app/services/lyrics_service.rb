require "net/http"

# Letras via lrclib.net (Épico 3): API pública, grátis, sem key, com letra
# sincronizada (LRC) quando disponível. Serviço reutilizável — o bot usa no
# /lyrics e o painel web pode usar depois. Nunca levanta: sem letra ou com erro
# de rede devolve nil (a letra é um extra, não pode quebrar nada).
class LyricsService
  BASE_URL   = "https://lrclib.net/api"
  USER_AGENT = "musik (https://github.com/alexcastrodev/musik)".freeze

  # Busca a letra de uma faixa. `duration` (segundos) ajuda o lrclib a casar a
  # versão certa. Devolve { plain:, synced:, artist:, title: } ou nil.
  def self.fetch(title:, artist: nil, album: nil, duration: nil)
    new.fetch(title:, artist:, album:, duration:)
  end

  def fetch(title:, artist: nil, album: nil, duration: nil)
    return nil if title.to_s.strip.blank?

    data = get_exact(title:, artist:, album:, duration:) || search_first(title:, artist:)
    return nil if data.nil?

    plain  = data["plainLyrics"].presence
    synced = data["syncedLyrics"].presence
    return nil if plain.nil? && synced.nil?

    {
      title:  data["trackName"].presence || title,
      artist: data["artistName"].presence || artist,
      plain:  plain,
      synced: synced
    }
  end

  private

  # GET /api/get: casa exata por título/artista (+ álbum/duração quando houver).
  # 404 quando não acha — aí caímos na busca.
  def get_exact(title:, artist:, album:, duration:)
    params = { track_name: title }
    params[:artist_name] = artist if artist.present?
    params[:album_name]  = album if album.present?
    params[:duration]    = duration if duration.to_i.positive?

    get_json(URI("#{BASE_URL}/get?#{URI.encode_www_form(params)}"))
  end

  # GET /api/search: fallback tolerante; pega o 1º resultado com letra.
  def search_first(title:, artist:)
    params = { track_name: title }
    params[:artist_name] = artist if artist.present?

    results = get_json(URI("#{BASE_URL}/search?#{URI.encode_www_form(params)}"))
    return nil unless results.is_a?(Array)

    results.find { |r| r["plainLyrics"].present? || r["syncedLyrics"].present? }
  end

  def get_json(uri)
    req = Net::HTTP::Get.new(uri)
    req["User-Agent"] = USER_AGENT
    req["Accept"] = "application/json"

    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|
      http.read_timeout = 5
      http.open_timeout = 5
      http.request(req)
    end

    JSON.parse(response.body) if response.is_a?(Net::HTTPOK)
  rescue => e
    Rails.logger.warn("[LyricsService] erro ao buscar letra: #{e.message}")
    nil
  end
end

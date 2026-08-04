require "net/http"
require "json"

# Tradutor de links do Spotify → termos de busca pro YouTube.
#
# O Spotify usa DRM, então o yt-dlp NÃO baixa áudio de lá (ERROR: [DRM]). A
# reprodução real vem sempre do YouTube. Este serviço só extrai os METADADOS
# (título + artista) das faixas e devolve termos de busca ("artista nome") que o
# ProviderService resolve no YouTube (ytsearch1:).
#
# Suporta track (1 faixa), playlist e album (N faixas).
#
# Tudo é lido da PÁGINA DE EMBED PÚBLICA (open.spotify.com/embed/<tipo>/<id>),
# que traz a trackList completa no __NEXT_DATA__ SEM token nem credenciais. A Web
# API oficial não serve mais aqui: desde nov/2024 apps em Development mode tomam
# 403 em GET /playlists/{id}/tracks (ver developer.spotify.com, "Changes to Web
# API"), e o embed cobre os três tipos sem essa restrição.
#
# Em qualquer falha (página fora, JSON mudou), retorna [] e loga — o /play então
# responde "nada encontrado", sem derrubar os outros fluxos.
class SpotifyService
  EMBED_BASE = "https://open.spotify.com/embed"

  # Limite de faixas lidas de uma playlist/album, pra uma lista gigante não virar
  # um job interminável. O embed já devolve a lista completa numa página só.
  MAX_TRACKS = 200

  # open.spotify.com/<intl-xx/>(track|playlist|album)/<id>?si=...
  SPOTIFY_URL_RE = %r{
    open\.spotify\.com/
    (?:intl-[a-z]{2}/)?      # segmento de locale opcional (ex.: intl-pt)
    (track|playlist|album)/
    ([A-Za-z0-9]+)
  }xi

  class << self
    def spotify_url?(input)
      input.to_s.match?(SPOTIFY_URL_RE)
    end

    # { type: :track|:playlist|:album, id: } ou nil.
    def parse(input)
      match = input.to_s.match(SPOTIFY_URL_RE)
      return nil unless match
      { type: match[1].downcase.to_sym, id: match[2] }
    end

    # Lista de termos de busca ("artista nome"), na ordem do Spotify. [] se não
    # for URL do Spotify ou se a página de embed falhar.
    def tracks(input)
      parsed = parse(input)
      return [] if parsed.nil?

      data = embed_data(parsed[:type], parsed[:id])
      return [] if data.nil?

      list = find_key(data, "trackList")
      if list.is_a?(Array) && !list.empty?
        # playlist/album: a trackList traz N itens (title + subtitle).
        list.filter_map { |t| term_from_embed_track(t) }.first(MAX_TRACKS)
      else
        # track avulsa: sem trackList; os dados ficam no `entity` (title + artists).
        term = term_from_embed_track(find_key(data, "entity"))
        term ? [ term ] : []
      end
    rescue => e
      Rails.logger.warn("[SpotifyService] falha resolvendo #{input}: #{e.message}")
      []
    end

    private

    # __NEXT_DATA__ da página de embed (open.spotify.com/embed/<tipo>/<id>),
    # parseado. nil se a página/JSON não vier como esperado.
    def embed_data(type, id)
      html = get_html("#{EMBED_BASE}/#{type}/#{id}")
      return nil if html.nil?

      match = html.match(%r{<script id="__NEXT_DATA__"[^>]*>(.*?)</script>}m)
      return nil if match.nil?

      JSON.parse(match[1])
    end

    # Busca recursiva por uma chave em Hash/Array aninhados. O __NEXT_DATA__ muda
    # de shape entre versões do embed, então não fixamos o caminho até trackList.
    def find_key(obj, key)
      return obj[key] if obj.is_a?(Hash) && obj.key?(key)
      children = obj.is_a?(Hash) ? obj.values : (obj.is_a?(Array) ? obj : [])
      children.each do |child|
        found = find_key(child, key)
        return found unless found.nil?
      end
      nil
    end

    # Termo "artista nome" a partir de um objeto do embed. nil se sem título.
    # O artista vem do `subtitle` (playlist/album, vários separados por vírgula —
    # usa o primeiro) ou de `artists[].name` (track avulsa, raiz do __NEXT_DATA__).
    def term_from_embed_track(track)
      return nil if track.nil?
      name = track["title"].to_s.strip
      return nil if name.empty?

      artist = track["subtitle"].to_s.split(",").first.to_s.strip
      artist = Array(track["artists"]).first&.dig("name").to_s.strip if artist.empty?

      [ artist, name ].reject(&:empty?).join(" ")
    end

    # GET de uma página HTML (embed público; sem auth). nil em erro/timeout.
    def get_html(url)
      uri = URI(url)
      req = Net::HTTP::Get.new(uri)
      # O embed só serve o HTML com __NEXT_DATA__ pra um User-Agent de browser.
      req["User-Agent"] = "Mozilla/5.0"

      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
        http.read_timeout = 8
        http.request(req)
      end

      return response.body if response.is_a?(Net::HTTPOK)
      Rails.logger.warn("[SpotifyService] GET #{url} → #{response.code}")
      nil
    rescue => e
      Rails.logger.warn("[SpotifyService] GET #{url} falhou: #{e.message}")
      nil
    end
  end
end

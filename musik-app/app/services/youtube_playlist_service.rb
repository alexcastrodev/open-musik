require "open3"
require "json"

# Extrator das faixas de uma URL de PLAYLIST do YouTube → lista de URLs canônicas
# (watch?v=ID) que o ProviderService resolve uma a uma.
#
# Diferente do SpotifyService (DRM, traduz pra termo de busca), aqui cada entry da
# playlist já traz o video_id: enfileiramos por URL canônica, que toca a faixa
# EXATA — sem risco de a busca achar um cover/remix.
#
# Dois formatos de URL:
#   - playlist pura  (music.youtube.com/playlist?list=...) → todas as faixas, do início;
#   - faixa+playlist (watch?v=ID&list=...&index=N)         → a faixa do v= e as SEGUINTES
#     (a partir do `index`), igual ao YouTube ao abrir esse link.
#
# A listagem usa `yt-dlp --flat-playlist` (só os IDs, sem resolver cada vídeo):
# barato e rápido mesmo em playlists grandes. Em qualquer falha (yt-dlp erro, JSON
# inesperado, playlist privada) retorna [] e loga — o /play então responde "nada
# encontrado", sem derrubar os outros fluxos. Usado por PlayQueueService#enqueue e
# EnqueueYoutubeTracksJob.
class YoutubePlaylistService
  YT_URL_RE = %r{(?:youtube\.com/|youtu\.be/)}i
  LIST_RE   = /[?&]list=([^&]+)/i
  VIDEO_RE  = %r{(?:v=|youtu\.be/|/embed/)([\w-]{11})}
  INDEX_RE  = /[?&]index=(\d+)/i

  # Limite de faixas ENFILEIRADAS de uma playlist, pra uma lista gigante não virar
  # um job interminável. Aplicado após o corte por index (sobre o que de fato entra).
  MAX_TRACKS = 200

  class << self
    # URL do YouTube com playlist (tem list=). Casa youtube.com e music.youtube.com
    # (youtube.com/ é substring de music.youtube.com/). watch?v sem list= NÃO é
    # playlist (segue o fluxo de faixa única do ProviderService).
    def playlist_url?(input)
      s = input.to_s
      s.match?(YT_URL_RE) && s.match?(LIST_RE)
    end

    # Lista de URLs canônicas (watch?v=ID), na ordem da playlist. Quando a URL tem
    # `index`/`v=`, começa a partir daquela faixa (inclusive). [] se não for URL de
    # playlist do YouTube ou se o yt-dlp falhar.
    def track_urls(input)
      return [] unless playlist_url?(input)

      meta = dump_playlist_json(input.to_s)
      return [] if meta.nil?

      entries = Array(meta["entries"]).compact
      urls = entries.filter_map { |e| canonical_url(e["id"] || e["url"]) }
      return [] if urls.empty?

      urls = urls.drop(start_offset(input.to_s, urls))
      urls.first(MAX_TRACKS)
    rescue => e
      Rails.logger.warn("[YoutubePlaylistService] falha resolvendo #{input}: #{e.message}")
      []
    end

    private

    # Quantas faixas pular pra começar na que o usuário pedii (v=/index). 0 numa
    # playlist pura. `index` do YouTube é 1-based; sem ele, acha a posição do v= na
    # lista (fallback). v= ausente da lista → 0 (playlist inteira).
    def start_offset(url, urls)
      if (m = url.match(INDEX_RE))
        return [ m[1].to_i - 1, 0 ].max
      end
      if (vid = url[VIDEO_RE, 1])
        pos = urls.index { |u| u[VIDEO_RE, 1] == vid }
        return pos if pos
      end
      0
    end

    # URL canônica a partir de um id de 11 chars (ou de uma URL que o contenha).
    # nil se não der pra extrair (entry sem id válido).
    def canonical_url(id_or_url)
      id = id_or_url.to_s[/\A[\w-]{11}\z/] || id_or_url.to_s[VIDEO_RE, 1]
      id && "https://www.youtube.com/watch?v=#{id}"
    end

    # JSON da playlist em modo flat (só os IDs, sem resolver cada vídeo). nil em
    # erro do yt-dlp ou JSON inesperado. Método à parte pra ser stubável nos testes
    # (espelha o get_html do SpotifyService). Resolve local no worker via yt-dlp
    # (ProviderService.flat_playlist) — o serviço extractor foi removido.
    def dump_playlist_json(url)
      ProviderService.flat_playlist(url)
    rescue ProviderService::ResolveError => e
      Rails.logger.warn("[YoutubePlaylistService] flat_playlist #{url} → #{e.message}")
      nil
    end
  end
end

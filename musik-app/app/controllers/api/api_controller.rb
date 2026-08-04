module Api
  # Base das APIs JSON consumidas pelo bot do Discord (rede interna, ver bot/).
  # Não exige login de browser; confia na rede privada (proxy_net).
  #
  # O bot é um cliente HTTP, não um browser: sem login de browser, sem checagem
  # de navegador moderno e sem CSRF.
  class ApiController < ApplicationController
    skip_before_action :require_login
    skip_before_action :share_inertia_data, raise: false
    skip_before_action :verify_authenticity_token, raise: false
    # O ApplicationController herda `allow_browser versions: :modern`, que
    # registra um before_action (lambda anônima) — não dá pra remover com
    # skip_before_action, e passar `versions: false` estoura NoMethodError no
    # Rails 8.1. Reabrimos a checagem com uma condição `if:` que nunca dispara,
    # neutralizando o bloqueio.
    allow_browser versions: :modern, if: -> { false }

    private

    # Serialização padrão de um PlayQueueItem pro bot. O Rails já manda os campos
    # de exibição prontos (o bot tem só fallbacks defensivos). Compartilhado entre
    # os controllers do bot (guilds/pool/playlists).
    def item_json(item)
      return nil if item.nil?
      {
        id: item.id,
        song_id: item.song_id,
        title: item.display_title,
        artist: item.display_artist,
        formatted_duration: item.display_duration,
        requested_by: item.requested_by,
        cache_status: item.cache_status,
        status: item.status,
        # Loop da faixa: "none"/"track". O painel do bot usa pra desenhar o botão
        # "Repetir" no estado certo entre polls (ver buildPanel).
        repeat_mode: item.repeat_mode,
        # Id do vídeo no YouTube, extraído da URL canônica do provider. O bot usa
        # pra montar a thumbnail (i.ytimg.com) no painel; nil se a fonte não for
        # do YouTube (ex.: upload manual).
        youtube_id: youtube_id_for(item)
      }
    end

    # Extrai o id de 11 chars do YouTube da primeira URL canônica que casar:
    # provider_url do item, depois youtube_url/source_url da Song. Cobre
    # watch?v=, youtu.be/ e /embed/. Retorna nil se nenhuma for do YouTube.
    def youtube_id_for(item)
      urls = [item.provider_url, item.song&.youtube_url, item.song&.source_url]
      urls.compact.each do |url|
        m = url.match(%r{(?:v=|youtu\.be/|/embed/)([\w-]{11})})
        return m[1] if m
      end
      nil
    end
  end
end

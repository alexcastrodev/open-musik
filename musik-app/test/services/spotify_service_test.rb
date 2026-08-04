# Teste do SpotifyService. Roda standalone (sem Rails/Postgres): o serviço é Ruby
# puro (HTTP + parse de HTML), então não carregamos test_helper — que puxa
# `fixtures :all` e exige o banco. Para rodar:
#   ruby -Itest test/services/spotify_service_test.rb
require "minitest/autorun"

# Stub mínimo de Rails.logger pro serviço logar sem o framework.
module Rails
  def self.logger
    @logger ||= Class.new { def warn(*) ; end }.new
  end
end

require_relative "../../app/services/spotify_service"

class SpotifyServiceTest < Minitest::Test
  PLAYLIST_URL = "https://open.spotify.com/playlist/6ttJYU5cUXCUVsfYBbsNZm?si=9d341185719a4379".freeze
  FIXTURE = File.expand_path("../fixtures/files/spotify/playlist_6ttJYU5cUXCUVsfYBbsNZm.html", __dir__).freeze

  # HTML real do embed dessa playlist (open.spotify.com/embed/playlist/<id>),
  # capturado em test/fixtures/files/spotify/. Stubamos get_html pra rodar
  # offline e determinístico: o teste não depende de rede nem do Spotify.
  def playlist_fixture
    File.read(FIXTURE)
  end

  # Stub do get_html (método privado de classe) só durante o bloco.
  def stub_embed(html)
    SpotifyService.singleton_class.send(:alias_method, :__orig_get_html, :get_html)
    SpotifyService.define_singleton_method(:get_html) { |_url| html }
    yield
  ensure
    SpotifyService.define_singleton_method(:get_html, SpotifyService.method(:__orig_get_html).unbind)
    SpotifyService.singleton_class.send(:remove_method, :__orig_get_html)
  end

  def test_tracks_devolve_as_faixas_da_playlist
    terms = stub_embed(playlist_fixture) { SpotifyService.tracks(PLAYLIST_URL) }

    assert_equal 47, terms.size
    # Cada termo é "artista nome" (1º artista, sem os demais após a vírgula).
    assert_equal "Milionário & José Rico Decida", terms.first
    assert_includes terms, "Bruno & Marrone Boate Azul - Ao Vivo"
    assert(terms.all? { |t| t.is_a?(String) && !t.strip.empty? }, "nenhum termo vazio")
  end

  def test_tracks_corta_em_max_tracks
    terms = stub_embed(playlist_fixture) { SpotifyService.tracks(PLAYLIST_URL) }
    assert_operator terms.size, :<=, SpotifyService::MAX_TRACKS
  end

  def test_tracks_retorna_vazio_quando_embed_falha
    terms = stub_embed(nil) { SpotifyService.tracks(PLAYLIST_URL) }
    assert_equal [], terms
  end

  def test_tracks_retorna_vazio_para_url_nao_spotify
    assert_equal [], SpotifyService.tracks("https://example.com/x")
  end

  # Cobertura dos 3 tipos aceitos (Épico 3: validar track/álbum/playlist).
  def test_spotify_url_reconhece_track_album_playlist
    assert SpotifyService.spotify_url?("https://open.spotify.com/track/1a2b3c")
    assert SpotifyService.spotify_url?("https://open.spotify.com/album/1a2b3c")
    assert SpotifyService.spotify_url?("https://open.spotify.com/playlist/1a2b3c")
    # segmento de locale (intl-pt) também casa
    assert SpotifyService.spotify_url?("https://open.spotify.com/intl-pt/track/1a2b3c")
    refute SpotifyService.spotify_url?("https://youtube.com/watch?v=abcdefghijk")
  end

  def test_parse_extrai_tipo_e_id
    assert_equal({ type: :track, id: "1a2b3c" }, SpotifyService.parse("https://open.spotify.com/track/1a2b3c?si=x"))
    assert_equal({ type: :album, id: "zzz999" }, SpotifyService.parse("https://open.spotify.com/album/zzz999"))
    assert_equal({ type: :playlist, id: "pl123" }, SpotifyService.parse("https://open.spotify.com/intl-pt/playlist/pl123"))
    assert_nil SpotifyService.parse("https://example.com/x")
  end

  # Teste de rede real: confirma que o link AINDA resolve hoje no Spotify.
  # Frágil (depende de rede + estrutura do embed), então só roda com LIVE=1:
  #   LIVE=1 ruby -Itest test/services/spotify_service_test.rb
  def test_live_playlist_real_devolve_faixas
    skip "defina LIVE=1 pra bater na rede" unless ENV["LIVE"] == "1"

    terms = SpotifyService.tracks(PLAYLIST_URL)
    assert_operator terms.size, :>, 0, "esperava faixas da playlist real"
    puts "\n[LIVE] #{terms.size} faixas:"
    terms.first(5).each { |t| puts "  - #{t}" }
  end
end

# Teste do YoutubePlaylistService. Roda standalone (sem Rails/Postgres): o serviço
# é Ruby puro (yt-dlp + parse de JSON), então não carregamos test_helper — que puxa
# `fixtures :all` e exige o banco. Para rodar:
#   ruby -Itest test/services/youtube_playlist_service_test.rb
require "minitest/autorun"

# Stub mínimo de Rails.logger pro serviço logar sem o framework.
module Rails
  def self.logger
    @logger ||= Class.new { def warn(*) ; end }.new
  end
end

require_relative "../../app/services/youtube_playlist_service"

class YoutubePlaylistServiceTest < Minitest::Test
  PLAYLIST_URL = "https://music.youtube.com/playlist?list=OLAK5uy_loIwDY8L_UKeVQAcPEvn58nc5".freeze
  IDS = %w[aaaaaaaaaaa bbbbbbbbbbb ccccccccccc ddddddddddd eeeeeeeeeee].freeze

  # JSON que o `yt-dlp --flat-playlist --dump-single-json` devolve: objeto de
  # playlist com `entries` (cada uma traz o id de 11 chars).
  def playlist_json
    JSON.generate("entries" => IDS.map { |id| { "id" => id, "title" => "t #{id}" } })
  end

  # Stub do dump_playlist_json (método privado de classe) só durante o bloco.
  def stub_dump(json)
    YoutubePlaylistService.singleton_class.send(:alias_method, :__orig_dump, :dump_playlist_json)
    parsed = json && JSON.parse(json)
    YoutubePlaylistService.define_singleton_method(:dump_playlist_json) { |_url| parsed }
    yield
  ensure
    YoutubePlaylistService.define_singleton_method(:dump_playlist_json, YoutubePlaylistService.method(:__orig_dump).unbind)
    YoutubePlaylistService.singleton_class.send(:remove_method, :__orig_dump)
  end

  def test_playlist_url_detecta_formatos
    assert YoutubePlaylistService.playlist_url?(PLAYLIST_URL)
    assert YoutubePlaylistService.playlist_url?("https://www.youtube.com/playlist?list=PLxyz")
    assert YoutubePlaylistService.playlist_url?("https://www.youtube.com/watch?v=NJ2regeDoJw&list=PLxyz&index=3")
    refute YoutubePlaylistService.playlist_url?("https://www.youtube.com/watch?v=NJ2regeDoJw")
    refute YoutubePlaylistService.playlist_url?("https://example.com/x")
  end

  def test_track_urls_playlist_pura_devolve_tudo_na_ordem
    urls = stub_dump(playlist_json) { YoutubePlaylistService.track_urls(PLAYLIST_URL) }

    assert_equal IDS.size, urls.size
    assert_equal "https://www.youtube.com/watch?v=#{IDS.first}", urls.first
    assert_equal IDS.map { |id| "https://www.youtube.com/watch?v=#{id}" }, urls
  end

  def test_track_urls_corta_a_partir_do_index
    url = "https://www.youtube.com/watch?v=#{IDS[2]}&list=PLxyz&index=3"
    urls = stub_dump(playlist_json) { YoutubePlaylistService.track_urls(url) }

    # index=3 (1-based) → começa na 3ª faixa.
    assert_equal IDS.drop(2).map { |id| "https://www.youtube.com/watch?v=#{id}" }, urls
  end

  def test_track_urls_fallback_pelo_v_quando_sem_index
    url = "https://www.youtube.com/watch?v=#{IDS[3]}&list=PLxyz"
    urls = stub_dump(playlist_json) { YoutubePlaylistService.track_urls(url) }

    # Sem index: acha a posição do v= na lista (4ª faixa) e corta dali.
    assert_equal IDS.drop(3).map { |id| "https://www.youtube.com/watch?v=#{id}" }, urls
  end

  def test_track_urls_corta_em_max_tracks
    many = JSON.generate("entries" => Array.new(YoutubePlaylistService::MAX_TRACKS + 50) { |i| { "id" => format("%011d", i) } })
    urls = stub_dump(many) { YoutubePlaylistService.track_urls(PLAYLIST_URL) }
    assert_equal YoutubePlaylistService::MAX_TRACKS, urls.size
  end

  def test_track_urls_retorna_vazio_quando_ytdlp_falha
    urls = stub_dump(nil) { YoutubePlaylistService.track_urls(PLAYLIST_URL) }
    assert_equal [], urls
  end

  def test_track_urls_retorna_vazio_para_url_nao_playlist
    assert_equal [], YoutubePlaylistService.track_urls("https://www.youtube.com/watch?v=NJ2regeDoJw")
    assert_equal [], YoutubePlaylistService.track_urls("https://example.com/x")
  end

  # Teste de rede real: confirma que o link AINDA resolve hoje no YouTube.
  # Frágil (depende de rede + yt-dlp instalado), então só roda com LIVE=1:
  #   LIVE=1 ruby -Itest test/services/youtube_playlist_service_test.rb
  def test_live_playlist_real_devolve_faixas
    skip "defina LIVE=1 pra bater na rede" unless ENV["LIVE"] == "1"

    urls = YoutubePlaylistService.track_urls("https://music.youtube.com/playlist?list=OLAK5uy_loIwDY8L_UKeVQAcPEvn58nc5-AtjPvF0")
    assert_operator urls.size, :>, 0, "esperava faixas da playlist real"
    puts "\n[LIVE] #{urls.size} faixas:"
    urls.first(5).each { |u| puts "  - #{u}" }
  end
end

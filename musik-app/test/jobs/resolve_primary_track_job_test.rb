require "test_helper"

# Valida o ResolvePrimaryTrackJob: resolve no worker a query do /play (que criou um
# item PROVISÓRIO), PREENCHE o item (título/candidates) e — se for playlist/álbum —
# enfileira as DEMAIS faixas. Stuba a fronteira de rede (YoutubePlaylistService /
# ProviderService) — sem yt-dlp.
class ResolvePrimaryTrackJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  GUILD = "guild-test-resolvejob".freeze
  CHANNEL = "chan-test-resolvejob".freeze

  YT_PLAYLIST = "https://music.youtube.com/playlist?list=PLtest".freeze
  YT_IDS = %w[aaaaaaaaaaa bbbbbbbbbbb ccccccccccc].freeze
  YT_URLS = YT_IDS.map { |id| "https://www.youtube.com/watch?v=#{id}" }.freeze

  SPOTIFY_URL = "https://open.spotify.com/playlist/abc123".freeze
  SPOTIFY_TERMS = [ "A1 - F1", "A2 - F2", "A3 - F3" ].freeze

  def teardown
    PlayQueueItem.where(discord_guild_id: GUILD).delete_all
  end

  # Cria o item provisório como o /play faz, e devolve-o.
  def provisional(query)
    PlayQueueService.new(GUILD, CHANNEL).create_provisional_item(query, "alex")
  end

  # Stuba a detecção+resolução (track_urls/spotify_terms/resolve_all). resolve_all
  # responde por query, mapeando URL/termo → candidato. fail = query que resolve [].
  def stub_resolution(yt_urls: [], spotify_terms: [], fail: [])
    yps = YoutubePlaylistService.singleton_class
    ps  = ProviderService.singleton_class
    yps.send(:alias_method, :__o_purl, :playlist_url?)
    yps.send(:alias_method, :__o_turls, :track_urls)
    ps.send(:alias_method, :__o_ra, :resolve_all)
    ps.send(:alias_method, :__o_st, :spotify_terms)

    YoutubePlaylistService.define_singleton_method(:playlist_url?) { |q| yt_urls.any? && q.to_s.include?("list=") }
    YoutubePlaylistService.define_singleton_method(:track_urls) { |_q| yt_urls }
    ProviderService.define_singleton_method(:spotify_terms) { |_q| spotify_terms }
    ProviderService.define_singleton_method(:resolve_all) do |q|
      next [] if fail.include?(q)
      url = q.to_s.start_with?("http") ? q.to_s : "https://www.youtube.com/watch?v=#{q.to_s.gsub(/\W/, '')[0, 11].ljust(11, 'x')}"
      [ { provider: :youtube, canonical_url: url, title: "Título de #{q}", artist: "Artista", duration: 200 } ]
    end
    yield
  ensure
    YoutubePlaylistService.define_singleton_method(:playlist_url?, YoutubePlaylistService.method(:__o_purl).unbind)
    YoutubePlaylistService.define_singleton_method(:track_urls, YoutubePlaylistService.method(:__o_turls).unbind)
    ProviderService.define_singleton_method(:resolve_all, ProviderService.method(:__o_ra).unbind)
    ProviderService.define_singleton_method(:spotify_terms, ProviderService.method(:__o_st).unbind)
    [ :__o_purl, :__o_turls ].each { |m| yps.send(:remove_method, m) }
    [ :__o_ra, :__o_st ].each { |m| ps.send(:remove_method, m) }
  end

  test "faixa única: preenche o item provisório com o resultado resolvido" do
    item = provisional("alguma música")
    stub_resolution do
      ResolvePrimaryTrackJob.perform_now(item.id, "alguma música", "alex", true)
    end
    item.reload
    assert_equal "Título de alguma música", item.title, "título placeholder substituído pelo real"
    refute_empty item.stream_candidates, "candidates preenchidos pro bot/cache"
    assert_equal 200, item.duration
  end

  test "playlist YouTube: preenche a 1ª e enfileira as demais (EnqueueYoutubeTracksJob)" do
    item = provisional(YT_PLAYLIST)
    assert_enqueued_with(
      job: EnqueueYoutubeTracksJob, queue: "playlists",
      args: [ GUILD, CHANNEL, "alex", YT_URLS.drop(1), 0 ]
    ) do
      stub_resolution(yt_urls: YT_URLS) do
        ResolvePrimaryTrackJob.perform_now(item.id, YT_PLAYLIST, "alex", true)
      end
    end
    refute_empty item.reload.stream_candidates
  end

  test "Spotify: preenche a 1ª e enfileira as demais (EnqueueSpotifyTracksJob)" do
    item = provisional(SPOTIFY_URL)
    assert_enqueued_with(
      job: EnqueueSpotifyTracksJob, queue: "playlists",
      args: [ GUILD, CHANNEL, "alex", SPOTIFY_TERMS.drop(1), 0 ]
    ) do
      stub_resolution(spotify_terms: SPOTIFY_TERMS) do
        ResolvePrimaryTrackJob.perform_now(item.id, SPOTIFY_URL, "alex", true)
      end
    end
  end

  test "faixa única de playlist (1 faixa) NÃO enfileira job de demais" do
    item = provisional(YT_PLAYLIST)
    assert_no_enqueued_jobs only: [ EnqueueYoutubeTracksJob, EnqueueSpotifyTracksJob ] do
      stub_resolution(yt_urls: YT_URLS.first(1)) do
        ResolvePrimaryTrackJob.perform_now(item.id, YT_PLAYLIST, "alex", true)
      end
    end
  end

  test "nada resolve: o item provisório é removido da fila" do
    item = provisional("query inválida")
    stub_resolution(fail: [ "query inválida" ]) do
      ResolvePrimaryTrackJob.perform_now(item.id, "query inválida", "alex", true)
    end
    assert_nil PlayQueueItem.find_by(id: item.id), "item provisório sem resolução some da fila"
  end
end

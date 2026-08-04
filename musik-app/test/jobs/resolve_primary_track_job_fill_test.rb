require "test_helper"

# /play com URL de PLAYLIST do YouTube cria um item provisório (título = a URL
# crua). O ResolvePrimaryTrackJob deve RESOLVER e PREENCHER esse item (título real
# + candidates) — que o bot lê no próximo poll de /queue — e enfileirar as DEMAIS
# faixas no MESMO canal.
class ResolvePrimaryTrackJobFillTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  GUILD = "guild-fill".freeze
  CHANNEL = "chan-fill".freeze

  PLAYLIST_URL = "https://www.youtube.com/watch?v=Z6qpE2GtcZs&list=PL0174F94AF8EC89C2".freeze
  TRACK_URLS = %w[
    https://www.youtube.com/watch?v=Z6qpE2GtcZs
    https://www.youtube.com/watch?v=bbbbbbbbbbb
    https://www.youtube.com/watch?v=ccccccccccc
  ].freeze

  def teardown
    PlayQueueItem.where(discord_guild_id: GUILD).delete_all
  end

  # Stuba a resolução (track_urls + resolve_all). resolve_all dá um candidato com
  # título "real" por URL — pra distinguir do título placeholder (a query crua).
  def stub_resolution
    yps = YoutubePlaylistService.singleton_class
    ps  = ProviderService.singleton_class
    yps.send(:alias_method, :__o_purl, :playlist_url?)
    yps.send(:alias_method, :__o_turls, :track_urls)
    ps.send(:alias_method, :__o_ra, :resolve_all)

    YoutubePlaylistService.define_singleton_method(:playlist_url?) { |q| q.to_s.include?("list=") }
    YoutubePlaylistService.define_singleton_method(:track_urls) { |_q| TRACK_URLS }
    ProviderService.define_singleton_method(:resolve_all) do |url|
      id = url[/v=([\w-]{11})/, 1]
      [ { provider: :youtube, canonical_url: url, title: "Faixa real #{id}", artist: "Artista", duration: 200 } ]
    end
    yield
  ensure
    YoutubePlaylistService.define_singleton_method(:playlist_url?, YoutubePlaylistService.method(:__o_purl).unbind)
    YoutubePlaylistService.define_singleton_method(:track_urls, YoutubePlaylistService.method(:__o_turls).unbind)
    ProviderService.define_singleton_method(:resolve_all, ProviderService.method(:__o_ra).unbind)
    yps.send(:remove_method, :__o_purl); yps.send(:remove_method, :__o_turls)
    ps.send(:remove_method, :__o_ra)
  end

  # Cria o provisório como o /play faz e devolve-o já como current (started_now).
  # O enqueue agenda o ResolvePrimaryTrackJob, mas no adapter :test ele não roda
  # sozinho — então temos o item provisório current, sem resolver ainda.
  def provisional_current
    PlayQueueService.new(GUILD, CHANNEL).enqueue(PLAYLIST_URL, requested_by: "alex")[:item]
  end

  test "fill troca a URL crua pelo título real no item current" do
    item = provisional_current
    assert_equal PLAYLIST_URL, item.title, "começa com a URL crua (placeholder)"

    stub_resolution do
      ResolvePrimaryTrackJob.perform_now(item.id, PLAYLIST_URL, "alex", true)
    end

    item.reload
    assert_equal "Faixa real Z6qpE2GtcZs", item.title, "título real após o resolve"
    assert_equal "current", item.status, "segue sendo o current"
    refute_empty item.stream_candidates, "candidates preenchidos pro bot tocar"
  end

  test "as demais faixas entram na fila do MESMO canal" do
    item = provisional_current

    stub_resolution do
      perform_enqueued_jobs(only: EnqueueYoutubeTracksJob) do
        ResolvePrimaryTrackJob.perform_now(item.id, PLAYLIST_URL, "alex", true)
      end
    end

    queued = PlayQueueItem.for_channel(GUILD, CHANNEL).where(status: "queued").order(:position)
    assert_equal TRACK_URLS.size - 1, queued.count, "as faixas 2..N entram na fila (a 1ª virou current)"
    assert_equal TRACK_URLS.drop(1), queued.map(&:provider_url), "no canal certo, na ordem"
  end
end

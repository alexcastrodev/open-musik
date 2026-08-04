require "test_helper"

# Valida o /play assíncrono: PlayQueueService#enqueue NÃO resolve mais no provider
# (o resolve yt-dlp foi pro worker — o serviço extractor foi removido). Ele cria um
# item PROVISÓRIO (título = query) e agenda o ResolvePrimaryTrackJob, que resolve no
# worker e — se for playlist — enfileira as demais faixas. A resolução em si é
# coberta em test/jobs/resolve_primary_track_job_test.rb.
class PlayQueueServicePlaylistTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  GUILD = "guild-test-playlist".freeze
  CHANNEL = "chan-test-playlist".freeze

  def teardown
    PlayQueueItem.where(discord_guild_id: GUILD).delete_all
  end

  test "enqueue cria item provisório SEM resolver e agenda o ResolvePrimaryTrackJob" do
    query = "https://music.youtube.com/playlist?list=PLtest"
    result = nil
    assert_enqueued_with(job: ResolvePrimaryTrackJob, queue: "playlists") do
      result = PlayQueueService.new(GUILD, CHANNEL).enqueue(query, requested_by: "alex")
    end

    refute_nil result
    item = result[:item]
    assert_equal query, item.title, "título placeholder = a própria query até o worker resolver"
    assert_equal query, item.provider_url, "guarda a query crua pro job resolver"
    assert_empty item.stream_candidates, "ainda não resolvido"
    assert_equal "pending", item.cache_status
  end

  test "1ª faixa da sessão: item vira current e o playable leva a source_query" do
    query = "Avenged Sevenfold Hail to the King"
    result = PlayQueueService.new(GUILD, CHANNEL).enqueue(query, requested_by: "alex")

    assert result[:started_now], "fila vazia → começa já"
    assert_equal "current", result[:item].status
    # Sem candidates resolvidos: o bot resolve da própria query (yt-dlp local).
    assert_nil result[:playable][:cached_url]
    assert_empty result[:playable][:candidates]
    assert_equal query, result[:playable][:source_query]
  end

  test "o ResolvePrimaryTrackJob recebe o id do item, a query e started_now" do
    query = "alguma música"
    item = nil
    perform_enqueued_jobs(only: ->(_) { false }) do
      item = PlayQueueService.new(GUILD, CHANNEL).enqueue(query, requested_by: "alex")[:item]
    end
    job = enqueued_jobs.find { |j| j[:job] == ResolvePrimaryTrackJob }
    refute_nil job
    assert_equal item.id, job[:args][0]
    assert_equal query, job[:args][1]
    assert_equal "alex", job[:args][2]
    assert_equal true, job[:args][3], "started_now"
  end

  test "2ª faixa (já tem current): item provisório entra queued, não current" do
    svc = PlayQueueService.new(GUILD, CHANNEL)
    svc.enqueue("primeira", requested_by: "alex")   # vira current
    result = svc.enqueue("segunda", requested_by: "alex")

    refute result[:started_now]
    assert_equal "queued", result[:item].status
    assert_nil result[:playable], "só a 1ª da sessão tem playable imediato"
  end
end

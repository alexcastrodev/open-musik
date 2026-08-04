require "test_helper"

# Espelho do EnqueueYoutubeTracksJobTest pro caminho Spotify: o job recebe TERMOS
# de busca ("artista nome"), UM POR JOB — resolve, cria o item e encadeia o próprio
# job pro resto. Garante que, drenada a cadeia, os itens entram na fila do canal
# certo na ordem, e que um termo que não resolve não para a cadeia.
# Stuba ProviderService.resolve_all — sem yt-dlp.
class EnqueueSpotifyTracksJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  TERMS = [ "A1 - F1", "A2 - F2", "A3 - F3", "A4 - F4" ].freeze

  # Canal único por teste: a época vive no Valkey (estado compartilhado entre testes
  # do mesmo processo). Nomes únicos garantem que o bump de um teste (stop/limpar)
  # nunca vaze pro próximo, em qualquer ordem de execução.
  def guild   = @guild ||= "guild-test-spjob-#{SecureRandom.hex(4)}"
  def channel = @channel ||= "chan-test-spjob-#{SecureRandom.hex(4)}"

  def teardown
    PlayQueueItem.where(discord_guild_id: guild).delete_all
    BOT_POOL_REDIS.del("#{EnqueueEpochService::PREFIX}:#{guild}:#{channel}")
  end

  # resolve_all do termo → 1 candidato com a URL "resolvida" no YouTube (ou [] pros
  # termos em `fail_terms`, simulando termo sem resultado).
  def stub_resolve_all(fail_terms: [])
    ps = ProviderService.singleton_class
    ps.send(:alias_method, :__orig_resolve_all, :resolve_all)
    ProviderService.define_singleton_method(:resolve_all) do |term|
      next [] if fail_terms.include?(term)
      slug = term.gsub(/[^\w]/, "")
      [ { provider: :youtube, canonical_url: "https://www.youtube.com/watch?v=#{slug[0, 11].ljust(11, 'x')}",
          title: term, artist: "Artista", duration: 180 } ]
    end
    yield
  ensure
    ProviderService.define_singleton_method(:resolve_all, ProviderService.method(:__orig_resolve_all).unbind)
    ps.send(:remove_method, :__orig_resolve_all)
  end

  def queued_items
    PlayQueueItem.for_channel(guild, channel).where(status: "queued").order(:position)
  end

  test "um perform cria UM termo e encadeia o próprio job pro resto" do
    assert_enqueued_with(
      job: EnqueueSpotifyTracksJob, queue: "playlists",
      args: [ guild, channel, "alex", TERMS.drop(1), 0 ]
    ) do
      stub_resolve_all do
        EnqueueSpotifyTracksJob.perform_now(guild, channel, "alex", TERMS)
      end
    end
    assert_equal 1, queued_items.count
    assert_equal TERMS.first, queued_items.first.title
  end

  test "drenada a cadeia: todos os termos entram na fila, na ordem" do
    stub_resolve_all do
      perform_enqueued_jobs(only: EnqueueSpotifyTracksJob) do
        EnqueueSpotifyTracksJob.perform_now(guild, channel, "alex", TERMS)
      end
    end

    items = queued_items.to_a
    assert_equal TERMS.size, items.size
    assert_equal TERMS, items.map(&:title), "metadata do termo, na ordem"
    assert items.all? { |i| i.requested_by == "alex" }
  end

  test "termo que não resolve é pulado, a cadeia segue" do
    stub_resolve_all(fail_terms: [ TERMS[2] ]) do
      perform_enqueued_jobs(only: EnqueueSpotifyTracksJob) do
        EnqueueSpotifyTracksJob.perform_now(guild, channel, "alex", TERMS)
      end
    end

    items = queued_items.to_a
    assert_equal TERMS.size - 1, items.size
    refute_includes items.map(&:title), TERMS[2]
    assert_includes items.map(&:title), TERMS.last, "a cadeia não parou no termo que falhou"
  end

  # O BUG do "parar"/"limpar fila": dar /stop ou /limpar_fila bumpa a época do canal;
  # um job nascido numa época anterior não cria item NEM encadeia o próximo.
  test "stop (bump de época) antes do job: não enfileira termo nem encadeia o próximo" do
    born = PlayQueueService.new(guild, channel).enqueue_epoch
    PlayQueueService.new(guild, channel).stop # bumpa a época: cancela

    assert_no_enqueued_jobs only: EnqueueSpotifyTracksJob do
      stub_resolve_all do
        EnqueueSpotifyTracksJob.perform_now(guild, channel, "alex", TERMS, born)
      end
    end
    assert_equal 0, queued_items.count, "cadeia cancelada não recebe faixas"
  end
end

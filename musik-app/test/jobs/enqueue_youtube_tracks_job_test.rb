require "test_helper"

# Coração do bug "a 1ª faixa toca mas o resto da playlist não entra na fila": este
# job cria os PlayQueueItems das faixas RESTANTES de uma playlist do YouTube, UMA
# FAIXA POR JOB (resolve → cria item → agenda o próprio job pro resto). Garante que
# cada perform cria UM item e encadeia o próximo, e que drenada a cadeia todas
# aparecem na fila do canal certo, na ordem. Stuba ProviderService.resolve_all.
class EnqueueYoutubeTracksJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  IDS = %w[aaaaaaaaaaa bbbbbbbbbbb ccccccccccc ddddddddddd].freeze
  URLS = IDS.map { |id| "https://www.youtube.com/watch?v=#{id}" }.freeze

  # Canal único por teste: a época vive no Valkey (estado compartilhado entre testes
  # do mesmo processo). Nomes únicos garantem que o bump de um teste (stop/limpar)
  # nunca vaze pro próximo, em qualquer ordem de execução.
  def guild   = @guild ||= "guild-test-ytjob-#{SecureRandom.hex(4)}"
  def channel = @channel ||= "chan-test-ytjob-#{SecureRandom.hex(4)}"

  def teardown
    PlayQueueItem.where(discord_guild_id: guild).delete_all
    BOT_POOL_REDIS.del("#{EnqueueEpochService::PREFIX}:#{guild}:#{channel}")
  end

  # resolve_all → 1 candidato por URL (ou [] pras URLs em `fail_urls`, simulando
  # vídeo indisponível / YouTube barrado).
  def stub_resolve_all(fail_urls: [])
    ps = ProviderService.singleton_class
    ps.send(:alias_method, :__orig_resolve_all, :resolve_all)
    ProviderService.define_singleton_method(:resolve_all) do |url|
      next [] if fail_urls.include?(url)
      id = url[/v=([\w-]{11})/, 1]
      [ { provider: :youtube, canonical_url: url, title: "Faixa #{id}", artist: "Artista", duration: 180 } ]
    end
    yield
  ensure
    ProviderService.define_singleton_method(:resolve_all, ProviderService.method(:__orig_resolve_all).unbind)
    ps.send(:remove_method, :__orig_resolve_all)
  end

  def queued_items
    PlayQueueItem.for_channel(guild, channel).where(status: "queued").order(:position)
  end

  test "um perform cria UMA faixa e encadeia o próprio job pro resto" do
    assert_enqueued_with(
      job: EnqueueYoutubeTracksJob, queue: "playlists",
      args: [ guild, channel, "alex", URLS.drop(1), 0 ]
    ) do
      stub_resolve_all do
        EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", URLS)
      end
    end
    assert_equal 1, queued_items.count, "só a 1ª faixa neste perform"
    assert_equal URLS.first, queued_items.first.provider_url
  end

  test "última faixa: não encadeia mais nada" do
    assert_no_enqueued_jobs only: EnqueueYoutubeTracksJob do
      stub_resolve_all do
        EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", [ URLS.last ])
      end
    end
    assert_equal 1, queued_items.count
  end

  test "drenada a cadeia: todas as faixas entram na fila, na ordem, no canal certo" do
    stub_resolve_all do
      perform_enqueued_jobs(only: EnqueueYoutubeTracksJob) do
        EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", URLS)
      end
    end

    items = queued_items.to_a
    assert_equal URLS.size, items.size, "toda faixa resolvida vira um item na fila"
    assert_equal URLS, items.map(&:provider_url), "na ordem da playlist"
    assert_equal items.map(&:position).sort, items.map(&:position), "positions crescentes"
    assert items.all? { |i| i.requested_by == "alex" }
  end

  test "URL que não resolve é pulada, a cadeia segue pras demais" do
    stub_resolve_all(fail_urls: [ URLS[1] ]) do
      perform_enqueued_jobs(only: EnqueueYoutubeTracksJob) do
        EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", URLS)
      end
    end

    items = queued_items.to_a
    assert_equal URLS.size - 1, items.size
    refute_includes items.map(&:provider_url), URLS[1]
    assert_includes items.map(&:provider_url), URLS.last, "a cadeia não parou na faixa que falhou"
  end

  # Cenário dos logs "tá processando mas nada aparece no bot": uma playlist em que
  # TODAS as faixas estão indisponíveis ("video is not available"). resolve_all
  # devolve [] pra cada URL → nenhum item entra na fila, mas a cadeia AINDA percorre
  # a playlist inteira (um job por faixa, ~5s cada) e TERMINA — não é loop infinito,
  # só uma playlist longa toda quebrada. Documenta que "nada na fila" é o esperado aqui.
  test "playlist toda indisponível: zero itens, mas a cadeia drena e termina" do
    stub_resolve_all(fail_urls: URLS) do
      perform_enqueued_jobs(only: EnqueueYoutubeTracksJob) do
        EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", URLS)
      end
    end

    assert_equal 0, queued_items.count, "nenhuma faixa resolveu → fila vazia"
  end

  # O encadeamento PARA quando a lista esvazia: a última faixa (mesmo falhando) não
  # re-enfileira o job. Guarda contra o loop infinito de jobs visto nos logs.
  test "faixa que falha sem resto NÃO re-enfileira o job" do
    assert_no_enqueued_jobs only: EnqueueYoutubeTracksJob do
      stub_resolve_all(fail_urls: [ URLS.last ]) do
        EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", [ URLS.last ])
      end
    end
    assert_equal 0, queued_items.count
  end

  # O BUG do "parar": dar /stop (ou /limpar_fila) esvazia a fila, mas a cadeia de jobs
  # já agendada continuava criando itens — a fila voltava a se encher sozinha. O
  # parar BUMPA a época do canal (EnqueueEpochService); um job nascido numa época
  # anterior vê que foi cancelado e não cria item NEM encadeia o próximo.
  test "stop (bump de época) antes do job: não enfileira faixa nem encadeia o próximo" do
    born = PlayQueueService.new(guild, channel).enqueue_epoch # época da cadeia (0)
    PlayQueueService.new(guild, channel).stop                  # bumpa pra 1: cancela

    assert_no_enqueued_jobs only: EnqueueYoutubeTracksJob do
      stub_resolve_all do
        EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", URLS, born)
      end
    end
    assert_equal 0, queued_items.count, "cadeia cancelada não recebe faixas"
  end

  # limpar_fila também cancela: mantém a `current` tocando, mas a cadeia de playlist
  # em voo não pode re-encher o que foi limpo (bug "limpar fila tbm deveria parar os
  # jobs"). É o mesmo bump de época do stop.
  test "limpar_fila (clear_upcoming) cancela a cadeia de enfileiramento" do
    born = PlayQueueService.new(guild, channel).enqueue_epoch
    PlayQueueService.new(guild, channel).clear_upcoming # bumpa a época

    assert_no_enqueued_jobs only: EnqueueYoutubeTracksJob do
      stub_resolve_all do
        EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", URLS, born)
      end
    end
    assert_equal 0, queued_items.count
  end

  # Stop no MEIO da cadeia: o usuário aperta parar enquanto a playlist ainda está
  # sendo preenchida. O stop esvazia a fila (delete_all) E bumpa a época, então os
  # jobs restantes da cadeia (nascidos na época anterior) não voltam a enfileirar.
  test "stop no meio da cadeia interrompe o preenchimento das faixas restantes" do
    born = PlayQueueService.new(guild, channel).enqueue_epoch
    stub_resolve_all do
      # 1º job da cadeia roda normal (época ainda válida): cria 1 faixa e encadeia.
      EnqueueYoutubeTracksJob.perform_now(guild, channel, "alex", URLS, born)
      assert_equal 1, queued_items.count, "a 1ª faixa entrou antes do stop"

      PlayQueueService.new(guild, channel).stop # esvazia a fila e bumpa a época

      # Drena o restante da cadeia já agendada (nasceu na época `born`): nenhum job
      # seguinte volta a encher a fila.
      perform_enqueued_jobs(only: EnqueueYoutubeTracksJob)
    end

    assert_equal 0, queued_items.count, "stop esvaziou a fila e a cadeia parou"
  end

end

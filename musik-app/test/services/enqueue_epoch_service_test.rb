require "test_helper"

# Época de enfileiramento por canal — o sinal de cancelamento que faz o parar /
# limpar fila realmente PARAREM os jobs que preenchem a fila (ver
# EnqueueEpochService e os jobs Enqueue*TracksJob/EnqueuePlaylistJob).
class EnqueueEpochServiceTest < ActiveSupport::TestCase
  # Canal único por teste: a época vive no Valkey (estado compartilhado entre testes
  # do mesmo processo) — nomes únicos isolam cada teste do bump dos demais.
  def guild   = @guild ||= "guild-test-epoch-#{SecureRandom.hex(4)}"
  def channel = @channel ||= "chan-test-epoch-#{SecureRandom.hex(4)}"

  def teardown
    BOT_POOL_REDIS.del("#{EnqueueEpochService::PREFIX}:#{guild}:#{channel}")
  end

  test "canal sem bump começa na época 0" do
    assert_equal 0, EnqueueEpochService.current(guild, channel)
  end

  test "bump! incrementa a época monotonicamente" do
    assert_equal 1, EnqueueEpochService.bump!(guild, channel)
    assert_equal 2, EnqueueEpochService.bump!(guild, channel)
    assert_equal 2, EnqueueEpochService.current(guild, channel)
  end

  test "stale?: cadeia nascida ANTES de um bump está obsoleta" do
    born = EnqueueEpochService.current(guild, channel) # 0
    EnqueueEpochService.bump!(guild, channel)          # parar/limpar → 1
    assert EnqueueEpochService.stale?(guild, channel, born), "cadeia foi cancelada"
  end

  test "stale?: cadeia nascida na época corrente NÃO está obsoleta" do
    EnqueueEpochService.bump!(guild, channel) # 1
    born = EnqueueEpochService.current(guild, channel) # 1
    refute EnqueueEpochService.stale?(guild, channel, born), "playlist nova segue válida"
  end

  test "stale?: sem bump nenhum, cadeia na época 0 segue válida" do
    refute EnqueueEpochService.stale?(guild, channel, 0)
  end
end

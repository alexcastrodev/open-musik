require "test_helper"

# Manipulação fina da fila (Épico 3): shuffle/remove/move operam só nas faixas
# "queued" (upcoming), sem tocar na atual. Ver PlayQueueService.
class PlayQueueManipulationTest < ActiveSupport::TestCase
  GUILD = "g-manip".freeze
  CHAN  = "c-manip".freeze

  def service = @service ||= PlayQueueService.new(GUILD, CHAN)

  def item!(title:, status:, position:)
    PlayQueueItem.create!(
      discord_guild_id: GUILD, voice_channel_id: CHAN,
      title: title, status: status, position: position,
      stream_candidates: [], cache_status: "pending"
    )
  end

  def upcoming_titles
    service.list[:upcoming].map(&:display_title)
  end

  setup do
    item!(title: "Atual", status: "current", position: 0)
    item!(title: "A", status: "queued", position: 1)
    item!(title: "B", status: "queued", position: 2)
    item!(title: "C", status: "queued", position: 3)
  end

  test "remove_at tira a faixa na posição 1-based e renumera" do
    removed = service.remove_at(2) # "B"
    assert_equal "B", removed.display_title
    assert_equal %w[A C], upcoming_titles
  end

  test "remove_at fora do range devolve nil e não mexe" do
    assert_nil service.remove_at(99)
    assert_nil service.remove_at(0)
    assert_equal %w[A B C], upcoming_titles
  end

  test "remove_at não mexe na faixa atual" do
    service.remove_at(1)
    assert_equal "Atual", service.current.display_title
  end

  test "move leva a faixa de uma posição pra outra" do
    moved = service.move(1, 3) # A pro fim
    assert_equal "A", moved.display_title
    assert_equal %w[B C A], upcoming_titles
  end

  test "move pra trás também funciona" do
    service.move(3, 1) # C pro início
    assert_equal %w[C A B], upcoming_titles
  end

  test "move com posição inválida devolve nil" do
    assert_nil service.move(1, 99)
    assert_nil service.move(0, 1)
    assert_equal %w[A B C], upcoming_titles
  end

  test "shuffle mantém o mesmo conjunto de faixas" do
    n = service.shuffle_queue
    assert_equal 3, n
    assert_equal %w[A B C], upcoming_titles.sort
  end

  test "shuffle com menos de 2 faixas é no-op" do
    service.remove_at(1)
    service.remove_at(1) # sobra só "C"
    assert_equal 0, service.shuffle_queue
  end
end

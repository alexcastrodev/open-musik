require "test_helper"

# GenerateWrappedJob gera um ServerWrapped por servidor com plays no período,
# de forma idempotente. Ver app/jobs/generate_wrapped_job.rb.
class GenerateWrappedJobTest < ActiveJob::TestCase
  def play(guild:, at:, user: "alice", title: "A")
    ServerLog.create!(
      discord_guild_id: guild, kind: "play",
      song_title: title, requested_by: user, created_at: at, metadata: {}
    )
  end

  test "gera wrapped do mês anterior por servidor com plays" do
    last_month = Date.current.prev_month
    play(guild: "g1", at: last_month.beginning_of_month + 5.days)
    play(guild: "g2", at: last_month.beginning_of_month + 6.days)

    assert_difference -> { ServerWrapped.count }, 2 do
      GenerateWrappedJob.perform_now("month")
    end
    w = ServerWrapped.find_by(discord_guild_id: "g1", period_kind: "month")
    assert_equal "pending", w.status
    assert w.message.present?
    assert_equal last_month.beginning_of_month, w.period_start
  end

  test "idempotente: rodar de novo não duplica" do
    play(guild: "g1", at: Date.current.prev_month.beginning_of_month + 2.days)
    GenerateWrappedJob.perform_now("month")
    assert_no_difference -> { ServerWrapped.count } do
      GenerateWrappedJob.perform_now("month")
    end
  end

  test "ignora servidores sem plays no período" do
    play(guild: "g1", at: Date.current.beginning_of_month + 1.day) # mês ATUAL, fora da janela
    assert_no_difference -> { ServerWrapped.count } do
      GenerateWrappedJob.perform_now("month")
    end
  end

  test "ref_date explícito força um período de backfill" do
    play(guild: "g1", at: Time.zone.local(2026, 3, 10, 12))
    assert_difference -> { ServerWrapped.count }, 1 do
      GenerateWrappedJob.perform_now("month", "2026-03-15")
    end
    assert ServerWrapped.exists?(discord_guild_id: "g1", period_start: Date.new(2026, 3, 1))
  end
end

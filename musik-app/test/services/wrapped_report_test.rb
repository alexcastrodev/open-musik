require "test_helper"

# Wrapped do servidor (Épico 2, item 8). WrappedReport monta a retrospectiva do
# período a partir dos eventos "play" do ServerLog. Ver app/services/wrapped_report.rb.
class WrappedReportTest < ActiveSupport::TestCase
  JUNE = Date.new(2026, 6, 15).freeze

  def play(guild: "g1", user: "alice", title: "A", at: Time.zone.local(2026, 6, 10, 12))
    ServerLog.create!(
      discord_guild_id: guild, kind: "play",
      song_title: title, requested_by: user, created_at: at, metadata: {}
    )
  end

  test "conta só plays dentro da janela do mês" do
    play(at: Time.zone.local(2026, 6, 1, 0))       # dentro
    play(at: Time.zone.local(2026, 6, 30, 23))     # dentro
    play(at: Time.zone.local(2026, 5, 31, 23))     # mês anterior
    play(at: Time.zone.local(2026, 7, 1, 0))       # mês seguinte

    report = WrappedReport.build(guild_id: "g1", kind: "month", ref_date: JUNE)
    assert_equal 2, report["total_plays"]
    assert_equal "2026-06-01", report["period_start"]
    assert_equal "2026-06-30", report["period_end"]
    assert_equal "junho de 2026", report["period_label"]
  end

  test "escopa por servidor" do
    play(guild: "g1")
    play(guild: "g2")
    assert_equal 1, WrappedReport.build(guild_id: "g1", kind: "month", ref_date: JUNE)["total_plays"]
  end

  test "horas ouvidas somam duração × plays via Song" do
    Song.create!(title: "Longa", duration: 1800) # 30 min
    2.times { play(title: "Longa") }              # 60 min = 1.0h
    report = WrappedReport.build(guild_id: "g1", kind: "month", ref_date: JUNE)
    assert_in_delta 1.0, report["hours_listened"], 0.01
  end

  test "top músicas, artistas e requester" do
    Song.create!(title: "Hit", artist: "Banda")
    3.times { play(title: "Hit", user: "alice") }
    play(title: "Outra", user: "bob")

    report = WrappedReport.build(guild_id: "g1", kind: "month", ref_date: JUNE)
    assert_equal "Hit", report["top_songs"].first["title"]
    assert_equal "Banda", report["top_artists"].first["artist"]
    assert_equal "alice", report["top_requester"]["requested_by"]
  end

  test "período anual cobre o ano inteiro" do
    play(at: Time.zone.local(2026, 1, 5, 12))
    play(at: Time.zone.local(2026, 12, 20, 12))
    play(at: Time.zone.local(2025, 12, 31, 12)) # ano anterior

    report = WrappedReport.build(guild_id: "g1", kind: "year", ref_date: Date.new(2026, 6, 1))
    assert_equal 2, report["total_plays"]
    assert_equal "2026", report["period_label"]
  end

  test "message inclui período, totais e tops" do
    Song.create!(title: "Hit", artist: "Banda", duration: 600)
    2.times { play(title: "Hit", user: "alice") }

    report = WrappedReport.build(guild_id: "g1", kind: "month", ref_date: JUNE)
    msg = WrappedReport.message(report, guild_name: "Meu Server")
    assert_includes msg, "junho de 2026"
    assert_includes msg, "Meu Server"
    assert_includes msg, "Hit"
    assert_includes msg, "alice"
  end
end

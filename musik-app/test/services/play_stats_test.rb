require "test_helper"

# Estatísticas de plays (Épico 2, item 6). PlayStats agrega SÓ os eventos "play"
# do ServerLog — skip/stop/advance/etc são ações, não reproduções. Ver
# app/services/play_stats.rb.
class PlayStatsTest < ActiveSupport::TestCase
  def play(guild:, user:, title:, at: Time.current)
    ServerLog.create!(
      discord_guild_id: guild, kind: "play",
      song_title: title, requested_by: user, created_at: at, metadata: {}
    )
  end

  test "só eventos play contam como reprodução" do
    play(guild: "g1", user: "alice", title: "A")
    ServerLog.create!(discord_guild_id: "g1", kind: "skip", song_title: "A", requested_by: "alice", metadata: {})
    ServerLog.create!(discord_guild_id: "g1", kind: "stop", metadata: {})

    assert_equal 1, PlayStats.global[:total_plays]
  end

  test "top_songs ordena por nº de plays desc" do
    3.times { play(guild: "g1", user: "alice", title: "Hit") }
    1.times { play(guild: "g1", user: "bob", title: "Flop") }

    top = PlayStats.global[:top_songs]
    assert_equal({ title: "Hit", plays: 3 }, top.first.slice(:title, :plays))
    assert_equal "Flop", top.second[:title]
  end

  test "top_songs enriquece com capa/artista da Song quando o título casa" do
    Song.create!(title: "Hit", artist: "Banda", cover_url: "http://x/c.jpg")
    play(guild: "g1", user: "alice", title: "Hit")

    song = PlayStats.global[:top_songs].first
    assert_equal "Banda", song[:artist]
    assert_equal "http://x/c.jpg", song[:cover_url]
  end

  test "top_requesters conta faixas pedidas por usuário" do
    2.times { play(guild: "g1", user: "alice", title: "A") }
    play(guild: "g1", user: "bob", title: "B")

    top = PlayStats.global[:top_requesters]
    assert_equal({ requested_by: "alice", plays: 2 }, top.first.slice(:requested_by, :plays))
  end

  test "for_guild escopa por servidor" do
    play(guild: "g1", user: "alice", title: "A")
    play(guild: "g2", user: "alice", title: "B")

    assert_equal 1, PlayStats.for_guild("g1")[:total_plays]
    assert_equal "A", PlayStats.for_guild("g1")[:top_songs].first[:title]
  end

  test "for_user escopa por quem pediu" do
    2.times { play(guild: "g1", user: "alice", title: "A") }
    play(guild: "g1", user: "bob", title: "B")

    stats = PlayStats.for_user("alice")
    assert_equal 2, stats[:total_plays]
    assert_equal "A", stats[:top_songs].first[:title]
  end

  test "janela de período (since) filtra plays antigos" do
    play(guild: "g1", user: "alice", title: "Velha", at: 40.days.ago)
    play(guild: "g1", user: "alice", title: "Nova",  at: 1.day.ago)

    assert_equal 2, PlayStats.global[:total_plays]
    assert_equal 1, PlayStats.global(since: 30.days.ago)[:total_plays]
    assert_equal "Nova", PlayStats.global(since: 30.days.ago)[:top_songs].first[:title]
  end

  test "known_users lista quem já pediu, mais recentes primeiro" do
    play(guild: "g1", user: "alice", title: "A", at: 2.hours.ago)
    play(guild: "g1", user: "bob",   title: "B", at: 1.hour.ago)

    assert_equal %w[bob alice], PlayStats.known_users
  end

  test "unique_songs e unique_users contam distintos" do
    play(guild: "g1", user: "alice", title: "A")
    play(guild: "g1", user: "alice", title: "A")
    play(guild: "g1", user: "bob", title: "B")

    g = PlayStats.global
    assert_equal 2, g[:unique_songs]
    assert_equal 2, g[:unique_users]
  end

  # ── Perfil de escuta (item 7) ──────────────────────────────────────────
  test "top_artists soma plays por artista via Song (por título)" do
    Song.create!(title: "A1", artist: "Banda X")
    Song.create!(title: "A2", artist: "Banda X")
    Song.create!(title: "B1", artist: "Banda Y")
    2.times { play(guild: "g1", user: "alice", title: "A1") }
    play(guild: "g1", user: "alice", title: "A2")
    play(guild: "g1", user: "alice", title: "B1")

    top = PlayStats.top_artists(PlayStats.base)
    assert_equal({ artist: "Banda X", plays: 3 }, top.first)
    assert_equal "Banda Y", top.second[:artist]
  end

  test "top_artists ignora plays sem Song correspondente" do
    play(guild: "g1", user: "alice", title: "Fantasma")
    assert_empty PlayStats.top_artists(PlayStats.base)
  end

  test "recent_plays lista do mais novo pro mais antigo com nome do guild" do
    BotGuild.create!(discord_guild_id: "g1", bot_client_id: "b1", name: "Meu Server", last_seen_at: Time.current)
    play(guild: "g1", user: "alice", title: "Velha", at: 2.hours.ago)
    play(guild: "g1", user: "alice", title: "Nova",  at: 1.minute.ago)

    recent = PlayStats.recent_plays(PlayStats.base.where(requested_by: "alice"))
    assert_equal "Nova", recent.first[:title]
    assert_equal "Meu Server", recent.first[:guild_name]
  end

  test "profile reúne total, tops, histórico e janela de atividade" do
    Song.create!(title: "Hit", artist: "Banda")
    play(guild: "g1", user: "alice", title: "Hit", at: 3.days.ago)
    play(guild: "g1", user: "alice", title: "Hit", at: 1.day.ago)
    play(guild: "g1", user: "bob",   title: "Outra")

    prof = PlayStats.profile("alice")
    assert_equal 2, prof[:total_plays]
    assert_equal "Hit", prof[:top_songs].first[:title]
    assert_equal "Banda", prof[:top_artists].first[:artist]
    assert_equal 2, prof[:recent].size
    assert prof[:first_play_at] < prof[:last_play_at]
  end
end

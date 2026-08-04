require "test_helper"

module Api
  # Ranking de plays pro comando /top do bot (Épico 3, item 1). Ver
  # Api::StatsController — reusa PlayStats sobre os eventos "play" do ServerLog.
  class StatsTest < ActionDispatch::IntegrationTest
    setup { host! "musik.kurz.fyi" }

    def play(guild:, user:, title:, at: Time.current)
      ServerLog.create!(
        discord_guild_id: guild, kind: "play",
        song_title: title, requested_by: user, created_at: at, metadata: {}
      )
    end

    test "escopo global: top de todos os servidores" do
      3.times { play(guild: "g1", user: "alice", title: "Hit") }
      play(guild: "g2", user: "bob", title: "Flop")

      get "/api/stats/top", params: { scope: "global" }
      assert_response :ok
      body = JSON.parse(response.body)
      assert_equal "global", body["scope"]
      assert_equal "Hit", body["songs"].first["title"]
      assert_equal 3, body["songs"].first["plays"]
      assert_equal 1, body["songs"].first["rank"]
    end

    test "escopo guild: escopado por servidor" do
      play(guild: "g1", user: "alice", title: "DoG1")
      play(guild: "g2", user: "bob", title: "DoG2")

      get "/api/stats/top", params: { scope: "guild", guild_id: "g1" }
      titles = JSON.parse(response.body)["songs"].map { |s| s["title"] }
      assert_equal [ "DoG1" ], titles
    end

    test "escopo user: escopado por quem pediu (requested_by)" do
      2.times { play(guild: "g1", user: "alice", title: "Minha") }
      play(guild: "g1", user: "bob", title: "Dele")

      get "/api/stats/top", params: { scope: "user", user: "alice" }
      titles = JSON.parse(response.body)["songs"].map { |s| s["title"] }
      assert_equal [ "Minha" ], titles
    end

    test "period=week filtra plays antigos" do
      play(guild: "g1", user: "alice", title: "Velha", at: 10.days.ago)
      play(guild: "g1", user: "alice", title: "Nova", at: 1.day.ago)

      get "/api/stats/top", params: { scope: "global", period: "week" }
      titles = JSON.parse(response.body)["songs"].map { |s| s["title"] }
      assert_equal [ "Nova" ], titles
    end

    test "limit respeita o teto e o default" do
      30.times { |i| play(guild: "g1", user: "alice", title: "S#{i}") }

      get "/api/stats/top", params: { scope: "global" }
      assert_equal 10, JSON.parse(response.body)["songs"].size

      get "/api/stats/top", params: { scope: "global", limit: 999 }
      assert_equal 25, JSON.parse(response.body)["songs"].size
    end

    test "escopo inválido cai pro global" do
      play(guild: "g1", user: "alice", title: "X")
      get "/api/stats/top", params: { scope: "hack" }
      assert_response :ok
      assert_equal "global", JSON.parse(response.body)["scope"]
    end
  end
end

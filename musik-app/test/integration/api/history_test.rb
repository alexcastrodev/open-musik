require "test_helper"

module Api
  # Histórico do servidor pro /historico e /replay (Épico 3). Ver
  # Api::GuildsController#history — deduplica por título e devolve a `query` que
  # o /replay reenfileira.
  class HistoryTest < ActionDispatch::IntegrationTest
    setup { host! "musik.kurz.fyi" }

    def play(title:, at:, song: nil, user: "alice")
      ServerLog.create!(
        discord_guild_id: "g1", kind: "play", song_title: title,
        requested_by: user, song: song, created_at: at, metadata: {}
      )
    end

    test "lista as últimas tocadas, mais recentes primeiro" do
      play(title: "Velha", at: 3.hours.ago)
      play(title: "Nova", at: 1.minute.ago)

      get "/api/guilds/g1/history"
      assert_response :ok
      hist = JSON.parse(response.body)["history"]
      assert_equal %w[Nova Velha], hist.map { |h| h["title"] }
      assert_equal [ 1, 2 ], hist.map { |h| h["position"] }
    end

    test "deduplica por título mantendo a ocorrência mais recente" do
      play(title: "Repetida", at: 2.hours.ago)
      play(title: "Outra", at: 1.hour.ago)
      play(title: "Repetida", at: 1.minute.ago)

      hist = (get "/api/guilds/g1/history"; JSON.parse(response.body)["history"])
      assert_equal %w[Repetida Outra], hist.map { |h| h["title"] }
    end

    test "query é a URL /songs/:uuid quando a Song está no S3, senão o título" do
      cached = Song.create!(title: "Cacheada", s3_key: "k.opus", s3_url: "https://s3/k.opus")
      play(title: "Cacheada", at: 2.minutes.ago, song: cached)
      play(title: "Sem cache", at: 1.minute.ago)

      hist = (get "/api/guilds/g1/history"; JSON.parse(response.body)["history"]).index_by { |h| h["title"] }
      assert_equal "/songs/#{cached.uuid}", hist["Cacheada"]["query"]
      assert_equal "Sem cache", hist["Sem cache"]["query"]
    end

    test "só conta eventos play deste guild" do
      play(title: "DoG1", at: 1.minute.ago)
      ServerLog.create!(discord_guild_id: "g2", kind: "play", song_title: "DoG2", created_at: 1.minute.ago, metadata: {})
      ServerLog.create!(discord_guild_id: "g1", kind: "skip", song_title: "Pulada", created_at: 1.minute.ago, metadata: {})

      hist = (get "/api/guilds/g1/history"; JSON.parse(response.body)["history"])
      assert_equal %w[DoG1], hist.map { |h| h["title"] }
    end

    test "limit respeita o teto" do
      30.times { |i| play(title: "S#{i}", at: (30 - i).minutes.ago) }
      get "/api/guilds/g1/history", params: { limit: 999 }
      assert_equal 25, JSON.parse(response.body)["history"].size
    end
  end
end

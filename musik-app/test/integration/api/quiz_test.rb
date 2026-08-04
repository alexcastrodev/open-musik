require "test_helper"

module Api
  # Music quiz (Épico 3): sorteio de faixa do histórico + placar da temporada.
  # Ver Api::QuizController / QuizScore.
  class QuizTest < ActionDispatch::IntegrationTest
    setup { host! "musik.kurz.fyi" }

    def played!(song, guild: "g1")
      ServerLog.create!(discord_guild_id: guild, kind: "play", song_title: song.title,
                        song: song, created_at: 1.minute.ago, metadata: {})
    end

    test "track sorteia uma faixa tocável do histórico com a resposta" do
      s = Song.create!(title: "Faixa X", artist: "Banda", s3_key: "k.opus", s3_url: "https://s3/k")
      played!(s)

      get "/api/guilds/g1/quiz/track"
      assert_response :ok
      body = JSON.parse(response.body)
      assert_equal "Faixa X", body["title"]
      assert_equal "Banda", body["artist"]
      assert_equal "/songs/#{s.uuid}", body["query"]
    end

    test "track usa youtube_url quando não há S3" do
      s = Song.create!(title: "YT", youtube_url: "https://youtu.be/abc")
      played!(s)
      get "/api/guilds/g1/quiz/track"
      assert_equal "https://youtu.be/abc", JSON.parse(response.body)["query"]
    end

    test "track sem histórico devolve 404" do
      get "/api/guilds/g1/quiz/track"
      assert_response :not_found
    end

    test "track ignora músicas de outros servidores" do
      s = Song.create!(title: "Alheia", s3_url: "u", s3_key: "k")
      played!(s, guild: "outro")
      get "/api/guilds/g1/quiz/track"
      assert_response :not_found
    end

    test "score soma pontos e devolve o total" do
      post "/api/guilds/g1/quiz/score", params: { discord_user_id: "u1", username: "Ana", season: "2026-07" }
      assert_equal 1, JSON.parse(response.body)["points"]
      post "/api/guilds/g1/quiz/score", params: { discord_user_id: "u1", username: "Ana", season: "2026-07" }
      assert_equal 2, JSON.parse(response.body)["points"]
    end

    test "score sem temporada usa o mês corrente" do
      post "/api/guilds/g1/quiz/score", params: { discord_user_id: "u1", username: "Ana" }
      assert_equal QuizScore.current_season, JSON.parse(response.body)["season"]
    end

    test "scoreboard ordena por pontos desc" do
      QuizScore.award!(guild_id: "g1", user_id: "u1", username: "Ana", season: "2026-07", points: 3)
      QuizScore.award!(guild_id: "g1", user_id: "u2", username: "Bia", season: "2026-07", points: 5)

      get "/api/guilds/g1/quiz/scoreboard", params: { season: "2026-07" }
      scores = JSON.parse(response.body)["scores"]
      assert_equal %w[Bia Ana], scores.map { |s| s["username"] }
      assert_equal [ 1, 2 ], scores.map { |s| s["rank"] }
    end

    test "scoreboard separa por temporada" do
      QuizScore.award!(guild_id: "g1", user_id: "u1", username: "Ana", season: "2026-06", points: 9)
      get "/api/guilds/g1/quiz/scoreboard", params: { season: "2026-07" }
      assert_empty JSON.parse(response.body)["scores"]
    end
  end
end

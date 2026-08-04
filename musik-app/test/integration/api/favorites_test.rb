require "test_helper"

module Api
  # Favoritos por usuário (Épico 3). Ver Api::FavoritesController / Favorite.
  class FavoritesTest < ActionDispatch::IntegrationTest
    setup { host! "musik.kurz.fyi" }

    def current!(title:, guild: "g1", chan: "c1", song: nil, provider_url: nil)
      PlayQueueItem.create!(
        discord_guild_id: guild, voice_channel_id: chan, title: title,
        status: "current", position: 0, stream_candidates: [], cache_status: "pending",
        song: song, provider_url: provider_url
      )
    end

    test "favorita a faixa tocando no canal" do
      current!(title: "Atual", provider_url: "https://youtu.be/x")
      assert_difference -> { Favorite.count }, 1 do
        post "/api/favorites", params: { discord_user_id: "u1", guild_id: "g1", channel_id: "c1" }
      end
      assert_response :created
      fav = JSON.parse(response.body)["favorite"]
      assert_equal "Atual", fav["title"]
      assert_equal "https://youtu.be/x", fav["query"]
    end

    test "query é /songs/:uuid quando a faixa tem Song no S3" do
      song = Song.create!(title: "Cache", s3_key: "k.opus", s3_url: "https://s3/k")
      current!(title: "Cache", song: song)
      post "/api/favorites", params: { discord_user_id: "u1", guild_id: "g1", channel_id: "c1" }
      assert_equal "/songs/#{song.uuid}", JSON.parse(response.body)["favorite"]["query"]
    end

    test "favoritar de novo é idempotente (mesma query)" do
      current!(title: "Atual", provider_url: "https://youtu.be/x")
      post "/api/favorites", params: { discord_user_id: "u1", guild_id: "g1", channel_id: "c1" }
      assert_no_difference -> { Favorite.count } do
        post "/api/favorites", params: { discord_user_id: "u1", guild_id: "g1", channel_id: "c1" }
      end
    end

    test "sem nada tocando devolve 404" do
      post "/api/favorites", params: { discord_user_id: "u1", guild_id: "g1", channel_id: "c1" }
      assert_response :not_found
    end

    test "index lista os favoritos do usuário com posição" do
      Favorite.create!(discord_user_id: "u1", query: "q1", title: "Um")
      Favorite.create!(discord_user_id: "u1", query: "q2", title: "Dois")
      Favorite.create!(discord_user_id: "outro", query: "q3", title: "Alheio")

      get "/api/favorites", params: { discord_user_id: "u1" }
      favs = JSON.parse(response.body)["favorites"]
      assert_equal 2, favs.size
      assert_equal [ 1, 2 ], favs.map { |f| f["position"] }
    end

    test "destroy remove só do próprio usuário" do
      fav = Favorite.create!(discord_user_id: "u1", query: "q1", title: "Um")
      assert_difference -> { Favorite.count }, -1 do
        delete "/api/favorites/#{fav.id}", params: { discord_user_id: "u1" }
      end
      assert_response :ok
    end

    test "destroy de favorito de outro usuário devolve 404" do
      fav = Favorite.create!(discord_user_id: "u1", query: "q1", title: "Um")
      delete "/api/favorites/#{fav.id}", params: { discord_user_id: "outro" }
      assert_response :not_found
      assert Favorite.exists?(fav.id)
    end
  end
end

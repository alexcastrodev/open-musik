require "test_helper"

module Api
  # Salvar a fila como playlist (Épico 3). Ver Api::GuildsController#save_playlist.
  class SavePlaylistTest < ActionDispatch::IntegrationTest
    setup { host! "musik.kurz.fyi" }

    def item!(status:, position:, song: nil)
      PlayQueueItem.create!(
        discord_guild_id: "g1", voice_channel_id: "c1", title: "T#{position}",
        status: status, position: position, stream_candidates: [], cache_status: "pending",
        song: song
      )
    end

    test "salva current + upcoming com Song como playlist" do
      s1 = Song.create!(title: "A", s3_url: "u", s3_key: "a")
      s2 = Song.create!(title: "B", s3_url: "u", s3_key: "b")
      item!(status: "current", position: 0, song: s1)
      item!(status: "queued", position: 1, song: s2)

      assert_difference -> { Playlist.count }, 1 do
        post "/api/guilds/g1/channels/c1/save_playlist", params: { name: "Minha Fila", discord_user_id: "u1" }
      end
      assert_response :created
      body = JSON.parse(response.body)
      assert_equal "Minha Fila", body["playlist"]["name"]
      assert_equal 2, body["saved"]

      pl = Playlist.find(body["playlist"]["id"])
      assert_equal %w[A B], pl.songs.map(&:title)
      assert_equal "u1", pl.discord_user_id
    end

    test "ignora itens provisórios (sem Song)" do
      s1 = Song.create!(title: "A", s3_url: "u", s3_key: "a")
      item!(status: "current", position: 0, song: s1)
      item!(status: "queued", position: 1, song: nil) # provisório

      post "/api/guilds/g1/channels/c1/save_playlist", params: { name: "P", discord_user_id: "u1" }
      assert_equal 1, JSON.parse(response.body)["saved"]
    end

    test "fila só com provisórios devolve 422" do
      item!(status: "current", position: 0, song: nil)
      post "/api/guilds/g1/channels/c1/save_playlist", params: { name: "P", discord_user_id: "u1" }
      assert_response :unprocessable_entity
    end

    test "nome em branco devolve 422" do
      s1 = Song.create!(title: "A", s3_url: "u", s3_key: "a")
      item!(status: "current", position: 0, song: s1)
      post "/api/guilds/g1/channels/c1/save_playlist", params: { name: "  ", discord_user_id: "u1" }
      assert_response :unprocessable_entity
    end

    test "dedupe da mesma Song aparecendo em vários itens" do
      s1 = Song.create!(title: "A", s3_url: "u", s3_key: "a")
      item!(status: "current", position: 0, song: s1)
      item!(status: "queued", position: 1, song: s1)

      post "/api/guilds/g1/channels/c1/save_playlist", params: { name: "P", discord_user_id: "u1" }
      assert_equal 1, JSON.parse(response.body)["saved"]
    end
  end
end

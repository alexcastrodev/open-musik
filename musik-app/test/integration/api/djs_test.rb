require "test_helper"

module Api
  # DJs do servidor (Épico 3). Ver Api::DjsController / Dj. Gerir a lista é gated:
  # bootstrap aberto pro 1º DJ; depois só admin ou um DJ existente.
  class DjsTest < ActionDispatch::IntegrationTest
    setup { host! "musik.kurz.fyi" }

    test "index lista DJs e o modo restrito" do
      Dj.create!(discord_guild_id: "g1", discord_user_id: "u1", username: "DJ Um")
      get "/api/guilds/g1/djs"
      assert_response :ok
      body = JSON.parse(response.body)
      assert_equal true, body["restricted"]
      assert_equal [ "u1" ], body["djs"].map { |d| d["discord_user_id"] }
    end

    test "bootstrap: qualquer um adiciona o 1º DJ" do
      assert_difference -> { Dj.count }, 1 do
        post "/api/guilds/g1/djs", params: { discord_user_id: "u1", username: "Um", actor_id: "rando" }
      end
      assert_response :created
    end

    test "restrito: não-DJ e não-admin é barrado (403)" do
      Dj.create!(discord_guild_id: "g1", discord_user_id: "dj1")
      assert_no_difference -> { Dj.count } do
        post "/api/guilds/g1/djs", params: { discord_user_id: "u2", actor_id: "rando", is_admin: "false" }
      end
      assert_response :forbidden
    end

    test "restrito: admin do servidor pode adicionar" do
      Dj.create!(discord_guild_id: "g1", discord_user_id: "dj1")
      assert_difference -> { Dj.count }, 1 do
        post "/api/guilds/g1/djs", params: { discord_user_id: "u2", actor_id: "admin", is_admin: "true" }
      end
      assert_response :created
    end

    test "restrito: um DJ existente pode adicionar" do
      Dj.create!(discord_guild_id: "g1", discord_user_id: "dj1")
      assert_difference -> { Dj.count }, 1 do
        post "/api/guilds/g1/djs", params: { discord_user_id: "u2", actor_id: "dj1", is_admin: "false" }
      end
    end

    test "add é idempotente (mesmo usuário)" do
      post "/api/guilds/g1/djs", params: { discord_user_id: "u1", actor_id: "u1" }
      assert_no_difference -> { Dj.count } do
        post "/api/guilds/g1/djs", params: { discord_user_id: "u1", actor_id: "u1", is_admin: "true" }
      end
    end

    test "remove: DJ existente remove outro" do
      Dj.create!(discord_guild_id: "g1", discord_user_id: "dj1")
      Dj.create!(discord_guild_id: "g1", discord_user_id: "u2")
      assert_difference -> { Dj.count }, -1 do
        delete "/api/guilds/g1/djs/u2", params: { actor_id: "dj1" }
      end
      assert_response :ok
    end

    test "remove de não-DJ e não-admin é barrado" do
      Dj.create!(discord_guild_id: "g1", discord_user_id: "dj1")
      delete "/api/guilds/g1/djs/dj1", params: { actor_id: "rando", is_admin: "false" }
      assert_response :forbidden
      assert Dj.dj?("g1", "dj1")
    end

    test "remove de quem não é DJ devolve 404" do
      Dj.create!(discord_guild_id: "g1", discord_user_id: "dj1")
      delete "/api/guilds/g1/djs/naoexiste", params: { actor_id: "dj1" }
      assert_response :not_found
    end
  end
end

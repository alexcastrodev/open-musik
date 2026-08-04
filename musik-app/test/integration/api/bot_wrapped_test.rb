require "test_helper"

module Api
  # Entrega do Wrapped pelo bot (Épico 2, item 8): o heartbeat devolve os
  # wrappeds pendentes dos guilds do bot (claim atômico, um bot só), e o ack
  # marca entregue. Ver Api::BotController#heartbeat / #wrapped_delivered.
  class BotWrappedTest < ActionDispatch::IntegrationTest
    setup { host! "musik.kurz.fyi" }

    def wrapped!(guild: "g1")
      ServerWrapped.create!(
        discord_guild_id: guild, period_kind: "month",
        period_start: Date.new(2026, 6, 1), period_end: Date.new(2026, 6, 30),
        payload: { "period_label" => "junho de 2026" }, message: "🎉 Wrapped", status: "pending"
      )
    end

    def heartbeat(client_id:, guild: "g1")
      post "/api/bot/heartbeat", params: {
        bot_client_id: client_id,
        guilds: [ { id: guild, name: "Server", voice_state: "idle" } ]
      }
      JSON.parse(response.body)
    end

    test "heartbeat devolve wrapped pendente do guild do bot e reivindica" do
      w = wrapped!
      body = heartbeat(client_id: "b1")

      assert_response :ok
      assert_equal 1, body["wrapped"].size
      assert_equal w.id, body["wrapped"].first["id"]
      assert_equal "b1", w.reload.claimed_by
    end

    test "wrapped já reivindicado não vai pro segundo bot (sem duplicar)" do
      wrapped!
      heartbeat(client_id: "b1", guild: "g1") # b1 reivindica
      # b2 também está no guild, mas o claim de b1 está vivo
      body = heartbeat(client_id: "b2", guild: "g1")
      assert_empty body["wrapped"]
    end

    test "não devolve wrapped de guild onde o bot não está" do
      wrapped!(guild: "outro")
      body = heartbeat(client_id: "b1", guild: "g1")
      assert_empty body["wrapped"]
    end

    test "ack marca entregue e não reenvia" do
      w = wrapped!
      heartbeat(client_id: "b1")

      post "/api/bot/wrapped/#{w.id}/delivered", params: { bot_client_id: "b1" }
      assert_response :ok
      assert_equal "delivered", w.reload.status
      assert_equal "b1", w.delivered_by

      # Depois de entregue, nem com claim expirado volta a aparecer.
      w.update!(claimed_at: 10.minutes.ago)
      assert_empty heartbeat(client_id: "b2")["wrapped"]
    end

    test "ack de wrapped inexistente responde 404" do
      post "/api/bot/wrapped/999999/delivered", params: { bot_client_id: "b1" }
      assert_response :not_found
    end
  end
end

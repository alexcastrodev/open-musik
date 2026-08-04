require "test_helper"

module Api
  class ActionsTest < ActionDispatch::IntegrationTest
    include ActiveJob::TestHelper

    # O projeto restringe config.hosts (application.rb), então o IntegrationTest
    # precisa usar um host permitido.
    setup { host! "musik.kurz.fyi" }

    test "enfileira play na fila discord com prioridade 10" do
      assert_enqueued_with(job: BotActionJob, queue: "discord", priority: 10) do
        post "/api/actions", params: {
          kind: "play", idempotency_key: "t-play-1",
          discord_user_id: "u1", discord_guild_id: "g1"
        }
      end
      assert_response :created
      assert JSON.parse(response.body)["enqueued"]
    end

    test "skip tem prioridade 0 (passa à frente do play)" do
      assert_enqueued_with(job: BotActionJob, queue: "discord", priority: 0) do
        post "/api/actions", params: {
          kind: "skip", idempotency_key: "t-skip-1", discord_user_id: "u1"
        }
      end
    end

    test "idempotência: mesma key não reenfileira" do
      post "/api/actions", params: { kind: "play", idempotency_key: "t-idem", discord_user_id: "u1" }
      assert_no_enqueued_jobs(only: BotActionJob) do
        post "/api/actions", params: { kind: "play", idempotency_key: "t-idem", discord_user_id: "u1" }
      end
      refute JSON.parse(response.body)["enqueued"]
    end

    test "kind inválido retorna 422" do
      post "/api/actions", params: { kind: "hack", idempotency_key: "t-bad" }
      assert_response :unprocessable_entity
    end

    test "rate-limit por usuário retorna 429 após o teto" do
      BotAction::RATE_MAX.times do |i|
        post "/api/actions", params: { kind: "play", idempotency_key: "t-rl-#{i}", discord_user_id: "flood" }
      end
      post "/api/actions", params: { kind: "play", idempotency_key: "t-rl-over", discord_user_id: "flood" }
      assert_response :too_many_requests
    end
  end
end

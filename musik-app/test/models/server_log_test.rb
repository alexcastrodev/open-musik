# == Schema Information
#
# Table name: server_logs
#
#  id                 :bigint           not null, primary key
#  actor              :string
#  detail             :string
#  guild_name         :string
#  kind               :string           not null
#  metadata           :jsonb            not null
#  requested_by       :string
#  song_title         :string
#  voice_channel_name :string
#  created_at         :datetime         not null
#  bot_client_id      :string
#  discord_guild_id   :string           not null
#  song_id            :bigint
#  voice_channel_id   :string
#
# Indexes
#
#  index_server_logs_on_discord_guild_id_and_created_at  (discord_guild_id,created_at)
#  index_server_logs_on_song_id                          (song_id)
#
# Foreign Keys
#
#  fk_rails_...  (song_id => songs.id) ON DELETE => nullify
#
require "test_helper"

class ServerLogTest < ActiveSupport::TestCase
  # Regressão: previous/repeat/clear/clear_upcoming JÁ eram chamados via
  # Api::GuildsController#log_event, mas KINDS não os incluía — a validation
  # de inclusion rejeitava e o rescue interno de .record engolia o erro
  # (Rails.logger.warn, sem levantar). Esses 4 tipos de evento nunca
  # persistiam. Ver app/models/server_log.rb.
  test "todos os KINDS usados pelo GuildsController são aceitos" do
    ServerLog::KINDS.each do |kind|
      log = ServerLog.record(kind, guild_id: "g-#{kind}")
      assert_not_nil log, "ServerLog.record não deveria falhar para kind=#{kind}"
      assert log.persisted?, "kind=#{kind} deveria persistir"
      assert_equal kind, log.kind
    end
  end

  test "kind fora de KINDS não persiste e .record devolve nil sem levantar" do
    assert_nil ServerLog.record("inexistente", guild_id: "g1")
    assert_equal 0, ServerLog.where(discord_guild_id: "g1").count
  end

  test "discord_guild_id ausente não persiste" do
    assert_nil ServerLog.record("play", guild_id: nil)
  end

  test "previous/repeat/clear/clear_upcoming especificamente (a regressão)" do
    %w[previous repeat clear clear_upcoming].each do |kind|
      log = ServerLog.record(kind, guild_id: "g-regressao", detail: "teste")
      assert_not_nil log, "#{kind} deveria persistir (era o bug: KINDS não incluía)"
    end
    assert_equal 4, ServerLog.where(discord_guild_id: "g-regressao").count
  end
end

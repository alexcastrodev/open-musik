# == Schema Information
#
# Table name: bot_guilds
#
#  id                 :bigint           not null, primary key
#  current_title      :string
#  icon_url           :string
#  last_seen_at       :datetime         not null
#  member_count       :integer
#  name               :string
#  voice_channel_name :string
#  voice_state        :string           default("idle"), not null
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#  bot_client_id      :string           not null
#  discord_guild_id   :string           not null
#  voice_channel_id   :string
#
# Indexes
#
#  index_bot_guilds_on_guild_and_client  (discord_guild_id,bot_client_id) UNIQUE
#
require "test_helper"

class BotGuildTest < ActiveSupport::TestCase
  def build_guild(voice_state: "idle", last_seen_at: Time.current)
    BotGuild.new(
      discord_guild_id: "g1",
      bot_client_id: "bot-a",
      name: "Guild 1",
      voice_state: voice_state,
      last_seen_at: last_seen_at
    )
  end

  test "status é offline sem last_seen_at" do
    guild = build_guild(last_seen_at: nil)
    assert_equal "offline", guild.status
  end

  test "status é offline quando o último heartbeat passou da janela fresca" do
    guild = build_guild(voice_state: "active", last_seen_at: BotGuild::FRESH_WINDOW.ago - 1.second)
    assert_equal "offline", guild.status
  end

  test "status é active quando heartbeat fresco e voice_state active" do
    guild = build_guild(voice_state: "active", last_seen_at: Time.current)
    assert_equal "active", guild.status
  end

  test "status é idle quando heartbeat fresco mas voice_state não é active" do
    guild = build_guild(voice_state: "idle", last_seen_at: Time.current)
    assert_equal "idle", guild.status
  end

  test "status é idle quando voice_state está em branco (heartbeat antigo/sem bot)" do
    guild = build_guild(voice_state: nil, last_seen_at: Time.current)
    assert_equal "idle", guild.status
  end

  test "bot_name usa BOT_NAMES quando conhecido, senão o próprio id" do
    known = build_guild.tap { |g| g.bot_client_id = "1510060643804254248" }
    unknown = build_guild.tap { |g| g.bot_client_id = "999999" }
    assert_equal "Nexa Angel", known.bot_name
    assert_equal "999999", unknown.bot_name
  end

  test ".active_in devolve o bot com status active no guild, se houver" do
    BotGuild.create!(discord_guild_id: "g-active", bot_client_id: "bot-a", name: "G",
                      voice_state: "idle", last_seen_at: Time.current)
    active = BotGuild.create!(discord_guild_id: "g-active", bot_client_id: "bot-b", name: "G",
                               voice_state: "active", last_seen_at: Time.current)

    assert_equal active.id, BotGuild.active_in("g-active").id
  end

  test ".active_in devolve nil quando nenhum bot está active no guild" do
    BotGuild.create!(discord_guild_id: "g-idle", bot_client_id: "bot-a", name: "G",
                      voice_state: "idle", last_seen_at: Time.current)

    assert_nil BotGuild.active_in("g-idle")
  end
end

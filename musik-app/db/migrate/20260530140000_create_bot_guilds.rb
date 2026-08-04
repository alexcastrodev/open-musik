class CreateBotGuilds < ActiveRecord::Migration[8.1]
  def change
    # Estado do bot por guild (servidor Discord), alimentado por heartbeat. O bot
    # reporta periodicamente (ver bot/src/heartbeat.js) em que guilds está e o
    # estado de voz de cada um; o /manage lê daqui. `last_seen_at` deriva
    # online/offline: heartbeat parado por > FRESH_WINDOW = bot fora do ar.
    create_table :bot_guilds do |t|
      t.string   :discord_guild_id, null: false
      t.string   :name
      t.string   :icon_url
      t.integer  :member_count
      t.string   :voice_state, null: false, default: "idle" # active | idle
      t.string   :voice_channel_name
      t.string   :current_title
      t.datetime :last_seen_at, null: false

      t.timestamps
    end

    add_index :bot_guilds, :discord_guild_id, unique: true
  end
end

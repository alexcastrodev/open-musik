# A disponibilidade do pool (onde cada bot está, livre/ocupado, assignment) migra
# pro Valkey (ver BotPoolService). bot_guilds deixa de carregar esse estado e fica
# só com metadados do guild (nome/ícone/contagem) + heartbeat, ainda úteis como
# fallback de nome no ServerLog. O estado de voz e a disputa agora vivem no Valkey.
class RemoveAssignmentFromBotGuilds < ActiveRecord::Migration[8.1]
  def change
    remove_index :bot_guilds, column: %i[discord_guild_id assignment_status],
                              name: "index_bot_guilds_on_discord_guild_id_and_assignment_status",
                              if_exists: true

    remove_column :bot_guilds, :assignment_status, :string, default: "free", null: false
    remove_column :bot_guilds, :voice_channel_id, :string
    remove_column :bot_guilds, :voice_channel_name, :string
    remove_column :bot_guilds, :voice_state, :string, default: "idle", null: false
    remove_column :bot_guilds, :current_title, :string
    remove_column :bot_guilds, :assigned_channel_id, :string
    remove_column :bot_guilds, :assigned_item_id, :bigint
    remove_column :bot_guilds, :assigned_at, :datetime
  end
end

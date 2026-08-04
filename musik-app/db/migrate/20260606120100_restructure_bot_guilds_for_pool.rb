class RestructureBotGuildsForPool < ActiveRecord::Migration[8.1]
  # Com o pool, há N bots por guild (um por DISCORD_CLIENT_ID). bot_guilds deixa
  # de ser "1 por guild" e passa a ser "1 por (guild, bot)". Ganha também o
  # estado de ASSIGNMENT: um trabalho (/play num canal sem bot) atribuído a um
  # bot livre que ele ainda não confirmou. Ver BotDispatchService / PoolController.
  def up
    add_column :bot_guilds, :bot_client_id,       :string
    add_column :bot_guilds, :voice_channel_id,    :string   # canal onde toca agora; nil = livre
    add_column :bot_guilds, :assignment_status,   :string, null: false, default: "free" # free | assigned | busy
    add_column :bot_guilds, :assigned_channel_id, :string   # canal-alvo de um assignment pendente
    add_column :bot_guilds, :assigned_item_id,    :bigint   # item da fila que disparou o assignment
    add_column :bot_guilds, :assigned_at,         :datetime # pra expirar assignment não confirmado

    # Registros legados não têm bot_client_id; o bot repovoa no próximo heartbeat.
    BotGuild.delete_all
    change_column_null :bot_guilds, :bot_client_id, false

    # A unicidade vira (guild, bot): vários bots no mesmo guild são linhas distintas.
    remove_index :bot_guilds, :discord_guild_id
    add_index :bot_guilds, [ :discord_guild_id, :bot_client_id ], unique: true,
              name: "index_bot_guilds_on_guild_and_client"
    # Varredura rápida de bots livres por guild (ver BotGuild.free_in_guild).
    add_index :bot_guilds, [ :discord_guild_id, :assignment_status ]
  end

  def down
    BotGuild.delete_all
    remove_index :bot_guilds, name: "index_bot_guilds_on_guild_and_client"
    remove_index :bot_guilds, column: [ :discord_guild_id, :assignment_status ]
    add_index :bot_guilds, :discord_guild_id, unique: true

    remove_column :bot_guilds, :bot_client_id
    remove_column :bot_guilds, :voice_channel_id
    remove_column :bot_guilds, :assignment_status
    remove_column :bot_guilds, :assigned_channel_id
    remove_column :bot_guilds, :assigned_item_id
    remove_column :bot_guilds, :assigned_at
  end
end

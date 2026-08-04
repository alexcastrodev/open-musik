class AddVoiceChannelIdToPlayQueueItems < ActiveRecord::Migration[8.1]
  # A fila deixa de ser por guild e passa a ser por (guild, canal de voz): com o
  # pool de bots, dois bots tocam em canais diferentes do MESMO guild ao mesmo
  # tempo, cada um com sua fila. Ver PlayQueueService / BotDispatchService.
  def up
    add_column :play_queue_items, :voice_channel_id, :string

    # Itens legados eram chaveados só por guild — sem canal não há como atribuí-los
    # a uma das novas filas. A feature é nova; o caminho limpo é zerar a fila
    # (o bot repovoa no próximo /play). Evita um NOT NULL impossível de satisfazer.
    PlayQueueItem.delete_all

    change_column_null :play_queue_items, :voice_channel_id, false

    # Os índices por (guild, canal) substituem os antigos só-por-guild: toda query
    # da fila agora filtra pelos dois (ver PlayQueueService#items).
    add_index :play_queue_items, [ :discord_guild_id, :voice_channel_id, :position ]
    add_index :play_queue_items, [ :discord_guild_id, :voice_channel_id, :status ]
    remove_index :play_queue_items, column: [ :discord_guild_id, :position ]
    remove_index :play_queue_items, column: [ :discord_guild_id, :status ]
  end

  def down
    add_index :play_queue_items, [ :discord_guild_id, :position ]
    add_index :play_queue_items, [ :discord_guild_id, :status ]
    remove_index :play_queue_items, column: [ :discord_guild_id, :voice_channel_id, :position ]
    remove_index :play_queue_items, column: [ :discord_guild_id, :voice_channel_id, :status ]
    remove_column :play_queue_items, :voice_channel_id
  end
end

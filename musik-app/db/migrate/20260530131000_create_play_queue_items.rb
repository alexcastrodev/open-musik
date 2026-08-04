class CreatePlayQueueItems < ActiveRecord::Migration[8.1]
  def change
    # Fila de reprodução por guild (servidor Discord), agora dona do Rails em vez
    # de viver na memória do bot. O bot vira um player "burro": pede a próxima
    # faixa e toca o `playable` que o Rails resolve (s3_url cacheado ou stream
    # direto do YouTube). O Rails faz prefetch da próxima faixa pro S3.
    create_table :play_queue_items do |t|
      t.string  :discord_guild_id, null: false
      t.bigint  :song_id                      # setado quando a faixa está em cache (Song)
      t.string  :provider_url                 # canonical YouTube URL (antes de ter Song)
      t.string  :title
      t.string  :artist
      t.integer :duration
      t.string  :requested_by                 # discord user tag
      t.integer :position, null: false, default: 0
      t.string  :status, null: false, default: "queued"        # queued | current | played
      t.string  :cache_status, null: false, default: "pending" # pending | caching | cached | stream_only

      t.timestamps
    end

    add_index :play_queue_items, [ :discord_guild_id, :position ]
    add_index :play_queue_items, [ :discord_guild_id, :status ]
  end
end

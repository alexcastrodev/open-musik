class CreateBotActions < ActiveRecord::Migration[8.1]
  def change
    create_table :bot_actions do |t|
      # Tipo da ação vinda do bot Discord: "play", "skip", "stop", etc.
      t.string :kind, null: false
      # Quem disparou e onde (para auditoria, rate-limit e fairness).
      t.string :discord_user_id
      t.string :discord_guild_id
      # Alvo opcional (ex: song_id no caso de play).
      t.bigint :song_id
      # Payload livre com detalhes da ação.
      t.jsonb :payload, null: false, default: {}
      # Idempotência: o bot envia uma chave única por ação; reenvios não duplicam.
      t.string :idempotency_key, null: false
      # Estado de processamento do job.
      t.string :status, null: false, default: "pending"
      t.string :error_message

      t.timestamps
    end

    add_index :bot_actions, :idempotency_key, unique: true
    add_index :bot_actions, :status
    add_index :bot_actions, [:discord_guild_id, :created_at]
    add_index :bot_actions, [:discord_user_id, :created_at]
  end
end

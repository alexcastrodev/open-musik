# Histórico de eventos do player por servidor (guild). Gravado pelo Rails nos
# endpoints da API do bot (play/skip/stop/advance) e exibido no /logs, filtrado
# por discord_guild_id. É um log append-only — sem updates depois de criado.
class CreateServerLogs < ActiveRecord::Migration[8.1]
  def change
    create_table :server_logs do |t|
      t.string  :discord_guild_id, null: false
      t.string  :guild_name             # nome do servidor no momento (cache, p/ exibir)
      t.string  :voice_channel_id
      t.string  :voice_channel_name
      t.string  :kind,             null: false # play | skip | stop | advance | queue_empty
      t.string  :song_title                    # faixa envolvida, se houver
      t.string  :requested_by                  # quem pediu (tag do Discord)
      t.string  :detail                         # texto livre opcional
      t.jsonb   :metadata,         null: false, default: {}
      t.references :song, null: true, foreign_key: { on_delete: :nullify }

      t.datetime :created_at, null: false
    end

    # Listagem do /logs: por servidor, mais recentes primeiro.
    add_index :server_logs, [:discord_guild_id, :created_at]
  end
end

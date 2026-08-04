class AddUuidToSongs < ActiveRecord::Migration[8.1]
  def up
    # Token público da música, usado na URL /songs/:uuid (provider próprio do
    # bot). Não-adivinhável e estável; o id interno (bigint) e as FKs continuam
    # intactos. gen_random_uuid() é nativo do Postgres >= 13 (sem pgcrypto).
    add_column :songs, :uuid, :uuid, default: -> { "gen_random_uuid()" }, null: false
    add_index  :songs, :uuid, unique: true
  end

  def down
    remove_column :songs, :uuid
  end
end

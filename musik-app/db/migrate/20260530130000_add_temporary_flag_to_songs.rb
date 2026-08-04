class AddTemporaryFlagToSongs < ActiveRecord::Migration[8.1]
  def change
    # Faixas resolvidas pelo provider (YouTube) via bot são temporárias: ficam em
    # cache no S3 por 7 dias contados a partir do último play, e depois são
    # limpas por PurgeTemporarySongsJob.
    add_column :songs, :is_temporary, :boolean, default: false, null: false
    add_column :songs, :last_played_at, :datetime

    add_index :songs, [ :is_temporary, :last_played_at ]
  end
end

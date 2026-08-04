class CreatePlaylistSongs < ActiveRecord::Migration[8.1]
  def change
    create_table :playlist_songs do |t|
      t.references :playlist, null: false, foreign_key: true, type: :uuid
      t.references :song, null: false, foreign_key: true, type: :uuid
      t.integer :position, default: 0

      t.timestamps
    end

    add_index :playlist_songs, [ :playlist_id, :song_id ], unique: true
  end
end

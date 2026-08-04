class AddMainSongToSongGroups < ActiveRecord::Migration[8.1]
  def change
    add_column :song_groups, :main_song_id, :bigint
    add_foreign_key :song_groups, :songs, column: :main_song_id
    add_index :song_groups, :main_song_id
  end
end

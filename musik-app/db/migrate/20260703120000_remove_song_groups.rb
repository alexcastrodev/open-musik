class RemoveSongGroups < ActiveRecord::Migration[8.1]
  def change
    remove_foreign_key :songs, :song_groups
    remove_foreign_key :song_groups, :songs, column: :main_song_id
    remove_index :songs, :song_group_id
    remove_column :songs, :song_group_id, :integer
    drop_table :song_groups do |t|
      t.string :name, null: false
      t.datetime :created_at, null: false
      t.datetime :updated_at, null: false
      t.bigint :main_song_id
      t.index :main_song_id
    end
  end
end

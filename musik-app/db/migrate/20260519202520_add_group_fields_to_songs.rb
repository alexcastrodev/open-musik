class AddGroupFieldsToSongs < ActiveRecord::Migration[8.1]
  def change
    add_column :songs, :song_group_id, :integer
    add_column :songs, :version_label, :string
    add_index :songs, :song_group_id
    add_foreign_key :songs, :song_groups
  end
end

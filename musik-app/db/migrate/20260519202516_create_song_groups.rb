class CreateSongGroups < ActiveRecord::Migration[8.1]
  def change
    create_table :song_groups do |t|
      t.string :name, null: false
      t.timestamps
    end
  end
end

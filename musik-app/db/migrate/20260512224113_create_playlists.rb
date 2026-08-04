class CreatePlaylists < ActiveRecord::Migration[8.1]
  def change
    create_table :playlists, id: :uuid, default: -> { "uuidv7()" } do |t|
      t.string :name
      t.string :description

      t.timestamps
    end
  end
end

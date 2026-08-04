class CreateSongs < ActiveRecord::Migration[8.1]
  def change
    create_table :songs, id: :uuid, default: -> { "uuidv7()" } do |t|
      t.string :title
      t.string :artist
      t.string :album
      t.integer :duration
      t.string :cover_url
      t.string :s3_key, null: false
      t.string :s3_url, null: false
      t.integer :play_count, default: 0

      t.timestamps
    end

    add_index :songs, :s3_key, unique: true
  end
end

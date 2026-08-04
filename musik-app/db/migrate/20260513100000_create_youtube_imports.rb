class CreateYoutubeImports < ActiveRecord::Migration[8.0]
  def change
    create_table :youtube_imports do |t|
      t.string :import_id, null: false
      t.string :youtube_url, null: false
      t.string :status, null: false, default: "processing"
      t.string :message
      t.references :song, foreign_key: true

      t.timestamps
    end

    add_index :youtube_imports, :import_id, unique: true
    add_index :youtube_imports, :status
  end
end

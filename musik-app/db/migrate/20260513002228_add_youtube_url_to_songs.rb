class AddYoutubeUrlToSongs < ActiveRecord::Migration[8.1]
  def change
    add_column :songs, :youtube_url, :string
  end
end

class AddOriginalFilenameAndFileSizeToSongs < ActiveRecord::Migration[8.1]
  def change
    add_column :songs, :original_filename, :string
    add_column :songs, :file_size, :bigint
  end
end

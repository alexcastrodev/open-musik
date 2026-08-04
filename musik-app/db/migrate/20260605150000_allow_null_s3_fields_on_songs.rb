class AllowNullS3FieldsOnSongs < ActiveRecord::Migration[8.1]
  def change
    change_column_null :songs, :s3_key, true
    change_column_null :songs, :s3_url, true
  end
end

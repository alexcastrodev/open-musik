class AddAudioFingerprintToSongs < ActiveRecord::Migration[8.1]
  def change
    add_column :songs, :audio_fingerprint, :string
    add_index :songs, :audio_fingerprint
  end
end

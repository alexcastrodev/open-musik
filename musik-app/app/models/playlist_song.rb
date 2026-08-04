# == Schema Information
#
# Table name: playlist_songs
#
#  id          :bigint           not null, primary key
#  position    :integer          default(0)
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#  playlist_id :integer          not null
#  song_id     :integer          not null
#
# Indexes
#
#  index_playlist_songs_on_playlist_id              (playlist_id)
#  index_playlist_songs_on_playlist_id_and_song_id  (playlist_id,song_id) UNIQUE
#  index_playlist_songs_on_song_id                  (song_id)
#
# Foreign Keys
#
#  fk_rails_...  (playlist_id => playlists.id)
#  fk_rails_...  (song_id => songs.id)
#
class PlaylistSong < ApplicationRecord
  belongs_to :playlist
  belongs_to :song

  before_create :set_position

  private

  def set_position
    self.position ||= (playlist.playlist_songs.maximum(:position) || -1) + 1
  end
end

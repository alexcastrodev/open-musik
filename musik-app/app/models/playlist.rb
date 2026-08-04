# == Schema Information
#
# Table name: playlists
#
#  id              :bigint           not null, primary key
#  build_status    :string           default("ready"), not null
#  description     :string
#  name            :string
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  discord_user_id :string
#
# Indexes
#
#  index_playlists_on_discord_user_id  (discord_user_id)
#
class Playlist < ApplicationRecord
  self.implicit_order_column = "created_at"
  has_many :playlist_songs, -> { order(:position) }, dependent: :destroy
  has_many :songs, through: :playlist_songs

  validates :name, presence: true

  # Playlists criadas pelo bot do Discord (têm discord_user_id). As da UI web
  # ficam com discord_user_id NULL — ver Api::PlaylistsController.
  scope :for_discord_user, ->(uid) { where(discord_user_id: uid.to_s) }

  # Ainda resolvendo faixas no YouTube em background (BuildPlaylistJob)? O
  # /playlist usa isto pra avisar "ainda montando" em vez de tocar pela metade.
  def building?
    build_status == "building"
  end

  def cover
    songs.first&.display_cover || "/default_cover.svg"
  end
end

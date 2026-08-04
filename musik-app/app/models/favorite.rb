# Favorito de um usuário do Discord (Épico 3). Faixa marcada pra tocar depois
# com /play favs. Ver Api::FavoritesController.
# == Schema Information
#
# Table name: favorites
#
#  id              :bigint           not null, primary key
#  artist          :string
#  query           :string           not null
#  title           :string
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  discord_user_id :string           not null
#  song_id         :bigint
#
# Indexes
#
#  index_favorites_on_discord_user_id_and_created_at  (discord_user_id,created_at)
#  index_favorites_on_discord_user_id_and_query       (discord_user_id,query) UNIQUE
#  index_favorites_on_song_id                         (song_id)
#
# Foreign Keys
#
#  fk_rails_...  (song_id => songs.id) ON DELETE => nullify
#
class Favorite < ApplicationRecord
  belongs_to :song, optional: true

  validates :discord_user_id, :query, presence: true

  scope :for_user, ->(uid) { where(discord_user_id: uid) }
  scope :recent,   -> { order(created_at: :desc) }

  # Cria (ou reusa) um favorito a partir do item que está tocando. `query` é o que
  # o /play favs reenfileira: URL /songs/:uuid quando a Song está no S3 (replay
  # instantâneo), senão o link canônico do provider ou o título.
  def self.capture(discord_user_id:, item:)
    song = item.song
    query =
      if song&.s3_url.present? && song.uuid
        "/songs/#{song.uuid}"
      else
        item.provider_url.presence || item.display_title
      end

    find_or_create_by(discord_user_id: discord_user_id, query: query) do |f|
      f.song   = song
      f.title  = item.display_title
      f.artist = item.display_artist
    end
  end
end

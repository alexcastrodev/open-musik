# == Schema Information
#
# Table name: youtube_imports
#
#  id          :bigint           not null, primary key
#  message     :string
#  status      :string           default("processing"), not null
#  youtube_url :string           not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#  import_id   :string           not null
#  song_id     :bigint
#
# Indexes
#
#  index_youtube_imports_on_import_id  (import_id) UNIQUE
#  index_youtube_imports_on_song_id    (song_id)
#  index_youtube_imports_on_status     (status)
#
# Foreign Keys
#
#  fk_rails_...  (song_id => songs.id)
#
class YoutubeImport < ApplicationRecord
  belongs_to :song, optional: true

  STATUSES = %w[processing done error duplicate].freeze

  validates :import_id, presence: true, uniqueness: true
  validates :youtube_url, presence: true
  validates :status, inclusion: { in: STATUSES }

  scope :recent, -> { order(created_at: :desc).limit(20) }

  def terminal?
    status.in?(%w[done error duplicate])
  end
end

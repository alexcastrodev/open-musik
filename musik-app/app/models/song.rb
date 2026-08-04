# == Schema Information
#
# Table name: songs
#
#  id                :bigint           not null, primary key
#  album             :string
#  artist            :string
#  audio_fingerprint :string
#  cover_url         :string
#  duration          :integer
#  file_size         :bigint
#  is_temporary      :boolean          default(FALSE), not null
#  last_played_at    :datetime
#  original_filename :string
#  play_count        :integer          default(0)
#  s3_key            :string
#  s3_url            :string
#  source_provider   :string
#  source_url        :string
#  title             :string
#  uuid              :uuid             not null
#  version_label     :string
#  youtube_url       :string
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#
# Indexes
#
#  index_songs_on_audio_fingerprint                (audio_fingerprint)
#  index_songs_on_is_temporary_and_last_played_at  (is_temporary,last_played_at)
#  index_songs_on_s3_key                           (s3_key) UNIQUE
#  index_songs_on_source_url                       (source_url)
#  index_songs_on_uuid                             (uuid) UNIQUE
#
class Song < ApplicationRecord
  self.implicit_order_column = "created_at"
  has_many :playlist_songs, dependent: :destroy
  has_many :playlists, through: :playlist_songs
  has_many :youtube_imports, dependent: :nullify

  validates :s3_key, uniqueness: { allow_nil: true }
  validates :s3_url, presence: true, allow_nil: true
  validates :youtube_url, uniqueness: { allow_blank: true }

  # ==========
  # Scopes
  # ==========
  # Com arquivo no S3 (toca direto). As "purgadas" (s3_key nil) ficam de fora —
  # ver #purge_audio!: o registro e os playlist_songs continuam, mas o áudio foi
  # liberado do S3 e será rebaixado ao tocar.
  scope :actives,     -> { where.not(s3_key: nil) }
  scope :unavailable, -> { where(s3_key: nil) }

  # URLs públicas (/songs/:identifier) usam o uuid, não o id interno: token
  # estável e não-adivinhável que vira a "fonte" quando o musik é usado como
  # provider pelo bot. Ver ProviderService.resolve / SongsController#show.
  def to_param
    uuid
  end

  def self.find_by_param!(identifier)
    find_by!(uuid: identifier)
  end

  def formatted_duration
    return "--:--" unless duration
    minutes = duration / 60
    seconds = duration % 60
    format("%d:%02d", minutes, seconds)
  end

  def display_title
    title.presence ||
      (original_filename.presence && File.basename(original_filename, ".*")) ||
      (s3_key.present? ? File.basename(s3_key, ".*") : "(indisponível)")
  end

  # Formato do áudio no S3, derivado da extensão do s3_key ("opus", "mp3"...).
  # O bot usa isto pra decidir o caminho de playback: "opus" toca em
  # pass-through (StreamType.OggOpus, sem decode/encode); qualquer outro valor
  # (ou nil) cai no caminho ffmpeg. Por isso só a extensão .opus conta — um
  # .ogg pode carregar Vorbis e quebraria o demuxer OggOpus.
  def audio_format
    File.extname(s3_key.to_s).delete_prefix(".").downcase.presence
  end

  # Áudio liberado do S3 (s3_key/s3_url zerados via #purge_audio!), mas o registro
  # e os playlist_songs continuam — será rebaixado ao tocar.
  def unavailable?
    s3_key.blank?
  end

  # Tem fonte canônica pra rebaixar? Uploads manuais (só s3_key/s3_url) não têm.
  def reacquirable?
    source_url.present? || youtube_url.present?
  end

  # Libera o objeto no S3 e zera as referências, mantendo a linha e os
  # playlist_songs. NÃO toca em source_url/youtube_url (precisa pra rebaixar).
  def purge_audio!
    S3BrowserService.new.delete_object(s3_key) if s3_key.present?
    update_columns(s3_key: nil, s3_url: nil)
  end

  def formatted_file_size
    return nil unless file_size
    if file_size >= 1_073_741_824
      format("%.1f GB", file_size.to_f / 1_073_741_824)
    elsif file_size >= 1_048_576
      format("%.1f MB", file_size.to_f / 1_048_576)
    else
      format("%.0f KB", file_size.to_f / 1_024)
    end
  end

  def display_artist
    artist.presence || "Artista desconhecido"
  end

  def display_cover
    cover_url.presence || "/default_cover.svg"
  end
end

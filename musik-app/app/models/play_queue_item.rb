# == Schema Information
#
# Table name: play_queue_items
#
#  id                :bigint           not null, primary key
#  artist            :string
#  cache_status      :string           default("pending"), not null
#  duration          :integer
#  played_at         :datetime
#  position          :integer          default(0), not null
#  provider_url      :string
#  repeat_mode       :string           default("none"), not null
#  requested_by      :string
#  status            :string           default("queued"), not null
#  stream_candidates :jsonb            not null
#  title             :string
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  discord_guild_id  :string           not null
#  playlist_id       :bigint
#  song_id           :bigint
#  voice_channel_id  :string           not null
#
# Indexes
#
#  idx_on_discord_guild_id_voice_channel_id_position_cbf7b1ce70  (discord_guild_id,voice_channel_id,position)
#  idx_on_discord_guild_id_voice_channel_id_status_b6a301101c    (discord_guild_id,voice_channel_id,status)
#  idx_pqi_on_guild_channel_played_at                            (discord_guild_id,voice_channel_id,played_at)
#  index_play_queue_items_on_playlist_id                         (playlist_id)
#
# Foreign Keys
#
#  fk_rails_...  (playlist_id => playlists.id) ON DELETE => nullify
#
class PlayQueueItem < ApplicationRecord
  self.implicit_order_column = "position"

  belongs_to :song, optional: true
  # A playlist que enfileirou este item (/playlist). Opcional: /play avulso e
  # Spotify não têm playlist. Permite o add_track achar os guilds tocando a
  # playlist e enfileirar a faixa nova (ver PlayQueueService.channels_playing).
  belongs_to :playlist, optional: true

  STATUSES       = %w[queued current played].freeze
  CACHE_STATUSES = %w[pending caching cached stream_only].freeze
  # Loop da faixa atual: "none" = fluxo normal; "track" = #advance reativa a
  # própria current (ver PlayQueueService#advance). Botão "Repetir" do painel.
  REPEAT_MODES   = %w[none track].freeze

  validates :discord_guild_id, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :cache_status, inclusion: { in: CACHE_STATUSES }
  validates :repeat_mode, inclusion: { in: REPEAT_MODES }

  scope :for_guild,   ->(gid) { where(discord_guild_id: gid) }
  # Fila de um canal específico: a chave da fila virou (guild, canal de voz) com
  # o pool de bots (ver PlayQueueService#items). `for_guild` segue existindo pro
  # add_track achar todos os canais tocando uma playlist (channels_playing).
  scope :for_channel, ->(gid, cid) { where(discord_guild_id: gid, voice_channel_id: cid) }
  scope :queued,      -> { where(status: "queued").order(:position) }

  # Metadata de exibição: prefere a Song cacheada, cai pros campos próprios
  # (preenchidos na resolução do provider antes de existir uma Song).
  def display_title
    song&.display_title || title.presence || "música"
  end

  def display_artist
    song&.display_artist || artist.presence || "Artista desconhecido"
  end

  def display_duration
    d = song&.duration || duration
    return "--:--" unless d
    format("%d:%02d", d / 60, d % 60)
  end
end

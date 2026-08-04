# Evento do player de UM servidor (guild). Append-only: o Rails grava nos
# endpoints da API do bot (ver Api::GuildsController) e o /logs lista por
# servidor. Não confundir com BotAction (idempotência/rate-limit das ações do
# bot) — ServerLog é o histórico legível por humanos, por guild.
# == Schema Information
#
# Table name: server_logs
#
#  id                 :bigint           not null, primary key
#  actor              :string
#  detail             :string
#  guild_name         :string
#  kind               :string           not null
#  metadata           :jsonb            not null
#  requested_by       :string
#  song_title         :string
#  voice_channel_name :string
#  created_at         :datetime         not null
#  bot_client_id      :string
#  discord_guild_id   :string           not null
#  song_id            :bigint
#  voice_channel_id   :string
#
# Indexes
#
#  index_server_logs_on_discord_guild_id_and_created_at  (discord_guild_id,created_at)
#  index_server_logs_on_song_id                          (song_id)
#
# Foreign Keys
#
#  fk_rails_...  (song_id => songs.id) ON DELETE => nullify
#
class ServerLog < ApplicationRecord
  self.implicit_order_column = "created_at"

  belongs_to :song, optional: true

  # Cobre TODAS as ações do player que o bot dispara via Api::GuildsController
  # (ver #log_event lá). Historicamente só tinha 5 kinds — previous/repeat/
  # clear/clear_upcoming JÁ eram chamados com ServerLog.record, mas a
  # validation de inclusion rejeitava e o rescue interno engolia o erro:
  # esses 4 tipos de ação nunca chegavam a persistir (silenciosamente).
  KINDS = %w[play skip stop advance queue_empty previous repeat clear clear_upcoming shuffle remove move].freeze

  # Nome amigável de cada bot do pool por bot_client_id (Discord application id).
  # Não há nome guardado no banco — esses ids são fixos por instância do bot.
  BOT_NAMES = {
    "1510060643804254248" => "Nexa Angel",
    "1512548698092081203" => "Nexa Demon"
  }.freeze

  validates :discord_guild_id, presence: true
  validates :kind, presence: true, inclusion: { in: KINDS }

  # Nome amigável do bot que estava na call, ou o próprio id se desconhecido.
  def bot_name
    return nil if bot_client_id.blank?

    BOT_NAMES[bot_client_id] || bot_client_id
  end

  scope :recent,      -> { order(created_at: :desc) }
  scope :for_guild,   ->(gid) { where(discord_guild_id: gid) }

  # Atalho usado pelos controllers da API pra registrar um evento sem montar o
  # hash inteiro na mão. `item` (PlayQueueItem) preenche título/requester/canal
  # e a Song vinculada, quando houver. Nunca derruba o request: um log que falha
  # não pode quebrar o play/skip — por isso o rescue.
  # `actor` = quem EXECUTOU a ação (tag do Discord de quem deu /skip, /stop ou
  # clicou em "Próxima"). Distinto de requested_by (quem PEDIU a faixa). Ações
  # automáticas (advance no fim da faixa) deixam actor nil.
  def self.record(kind, guild_id:, item: nil, guild_name: nil, channel_id: nil,
                  channel_name: nil, detail: nil, actor: nil, bot_client_id: nil,
                  metadata: {})
    create!(
      discord_guild_id:   guild_id,
      guild_name:         guild_name,
      voice_channel_id:   channel_id || item&.voice_channel_id,
      voice_channel_name: channel_name,
      kind:               kind.to_s,
      song_title:         item&.display_title,
      requested_by:       item&.requested_by,
      actor:              actor.presence,
      bot_client_id:      bot_client_id.presence,
      song_id:            item&.song_id,
      detail:             detail,
      metadata:           metadata
    )
  rescue => e
    Rails.logger.warn("[ServerLog] falha ao gravar #{kind} em #{guild_id}: #{e.message}")
    nil
  end

  # Lista de servidores conhecidos (pro seletor do /logs): distintos por guild,
  # com o nome mais recente visto. Prefere o BotGuild (tem nome/icone atualizado);
  # cai pro próprio log se o guild não tiver mais um BotGuild ativo.
  def self.known_guilds
    names = BotGuild.order(updated_at: :desc).pluck(:discord_guild_id, :name).to_h
    distinct.pluck(:discord_guild_id).map do |gid|
      { discord_guild_id: gid, name: names[gid].presence || gid }
    end
  end
end

# Retrospectiva "Wrapped" de um servidor num período (Épico 2, item 8). Gerada
# das estatísticas (WrappedReport/PlayStats) e entregue ao Discord pelo bot: o
# Rails não fala com o Discord (princípio 5), então o wrapped nasce "pending",
# o bot busca no heartbeat (Api::BotController#heartbeat), posta no canal e
# confirma (status → "delivered").
# == Schema Information
#
# Table name: server_wrappeds
#
#  id               :bigint           not null, primary key
#  claimed_at       :datetime
#  claimed_by       :string
#  delivered_at     :datetime
#  delivered_by     :string
#  message          :text
#  payload          :jsonb            not null
#  period_end       :date             not null
#  period_kind      :string           not null
#  period_start     :date             not null
#  status           :string           default("pending"), not null
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  discord_guild_id :string           not null
#
# Indexes
#
#  index_server_wrappeds_on_guild_and_period       (discord_guild_id,period_kind,period_start) UNIQUE
#  index_server_wrappeds_on_status_and_claimed_at  (status,claimed_at)
#
class ServerWrapped < ApplicationRecord
  self.implicit_order_column = "created_at"

  KINDS    = %w[month year].freeze
  STATUSES = %w[pending delivered].freeze
  # Janela do claim de entrega: se o bot que reivindicou não confirmar dentro
  # disso, o claim expira e outro bot pode reassumir (evita wrapped preso se o
  # bot cair entre buscar e postar).
  CLAIM_TTL = 5.minutes

  validates :discord_guild_id, :period_start, :period_end, presence: true
  validates :period_kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }

  scope :pending,   -> { where(status: "pending") }
  scope :recent,    -> { order(period_start: :desc, created_at: :desc) }
  # Pronto pra um bot pegar: pendente e sem claim vivo (nunca reivindicado ou
  # claim expirado). O claim em si é atômico no controller (UPDATE guardado).
  scope :deliverable, -> {
    pending.where("claimed_at IS NULL OR claimed_at < ?", CLAIM_TTL.ago)
  }

  def bot_name
    ServerLog::BOT_NAMES[delivered_by] || delivered_by
  end
end

# == Schema Information
#
# Table name: bot_actions
#
#  id               :bigint           not null, primary key
#  error_message    :string
#  idempotency_key  :string           not null
#  kind             :string           not null
#  payload          :jsonb            not null
#  status           :string           default("pending"), not null
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  discord_guild_id :string
#  discord_user_id  :string
#  song_id          :bigint
#
# Indexes
#
#  index_bot_actions_on_discord_guild_id_and_created_at  (discord_guild_id,created_at)
#  index_bot_actions_on_discord_user_id_and_created_at   (discord_user_id,created_at)
#  index_bot_actions_on_idempotency_key                  (idempotency_key) UNIQUE
#  index_bot_actions_on_status                           (status)
#
class BotAction < ApplicationRecord
  self.implicit_order_column = "created_at"

  belongs_to :song, optional: true

  KINDS = %w[play skip stop nowplaying].freeze
  STATUSES = %w[pending processing done failed].freeze

  validates :kind, presence: true, inclusion: { in: KINDS }
  validates :idempotency_key, presence: true, uniqueness: true
  validates :status, inclusion: { in: STATUSES }

  scope :recent, -> { order(created_at: :desc) }

  # Janela e limite usados no rate-limit por usuário (ver Api::ActionsController).
  RATE_WINDOW = 10.seconds
  RATE_MAX    = 5

  def self.recent_count_for(discord_user_id, window: RATE_WINDOW)
    return 0 if discord_user_id.blank?
    where(discord_user_id: discord_user_id)
      .where("created_at > ?", window.ago)
      .count
  end

  # Prioridade lógica do job por tipo de ação (menor = mais urgente). skip/stop
  # são controles de transporte e devem passar à frente de play. No Sidekiq a
  # latência vem da fila :discord ter prioridade no config/sidekiq.yml; este
  # valor segue exposto via .set(priority:) por portabilidade do Active Job.
  def job_priority
    case kind
    when "skip", "stop" then 0
    when "play"         then 10
    else 20
    end
  end
end

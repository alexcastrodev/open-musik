# == Schema Information
#
# Table name: bot_guilds
#
#  id                 :bigint           not null, primary key
#  current_title      :string
#  icon_url           :string
#  last_seen_at       :datetime         not null
#  member_count       :integer
#  name               :string
#  voice_channel_name :string
#  voice_state        :string           default("idle"), not null
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#  bot_client_id      :string           not null
#  discord_guild_id   :string           not null
#  voice_channel_id   :string
#
# Indexes
#
#  index_bot_guilds_on_guild_and_client  (discord_guild_id,bot_client_id) UNIQUE
#
# Metadados do guild por bot (nome/ícone/contagem) + estado de voz (o que está
# tocando agora, em qual canal) + último heartbeat. O POOL (disponibilidade,
# disputa de trabalho) NÃO vive aqui nem no Rails — continua só no bot-cache
# (ver bot/src/pool/BotPool.js). `voice_state`/`voice_channel_*`/`current_title`
# são só INFORMATIVOS pro admin (Épico 2, item 3: "servidores conectados") — o
# Rails não enxerga o Valkey do swarm (princípio 5), então este heartbeat
# periódico é o ÚNICO jeito de saber o que cada bot está tocando agora.
class BotGuild < ApplicationRecord
  FRESH_WINDOW = 90.seconds

  # Há N bots por guild (um por bot_client_id): a unicidade é por par.
  validates :discord_guild_id, presence: true, uniqueness: { scope: :bot_client_id }
  validates :bot_client_id, presence: true

  scope :fresh, -> { where("last_seen_at > ?", FRESH_WINDOW.ago) }

  # "offline": sem heartbeat recente (bot fora do ar ou removido do guild).
  # "active": heartbeat fresco e tocando algo agora.
  # "idle": heartbeat fresco mas sem nada tocando (instalado, sem call ativa).
  def status
    return "offline" unless last_seen_at && last_seen_at > FRESH_WINDOW.ago
    voice_state == "active" ? "active" : "idle"
  end

  # Nome amigável do bot (ver ServerLog::BOT_NAMES — mesma tabela, id fixo por
  # instância do bot; não vale duplicar aqui).
  def bot_name
    ServerLog::BOT_NAMES[bot_client_id] || bot_client_id
  end

  # Bot ativo (status "active") num guild, se houver — usado pro "tocando
  # agora" do /logs (Épico 2, item 4). Até 2 bots por guild, só um toca por
  # vez; se nenhum estiver active (guild parado/offline), devolve nil.
  def self.active_in(guild_id)
    where(discord_guild_id: guild_id).find { |g| g.status == "active" }
  end
end

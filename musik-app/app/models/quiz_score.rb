# Placar do music quiz (Épico 3). Ver Api::QuizController. Pontos por
# (guild, temporada, usuário); a temporada default é o mês corrente.
class QuizScore < ApplicationRecord
  validates :discord_guild_id, :discord_user_id, :season, presence: true

  scope :for_guild,  ->(gid) { where(discord_guild_id: gid.to_s) }
  scope :for_season, ->(s) { where(season: s.to_s) }

  # Temporada padrão: mês corrente (ex.: "2026-07").
  def self.current_season(now = Time.current)
    now.strftime("%Y-%m")
  end

  # Soma +points ao placar do usuário na temporada (cria a linha se preciso) e
  # devolve o total atualizado. Atômico via UPDATE incremental.
  def self.award!(guild_id:, user_id:, username:, season:, points: 1)
    row = find_or_create_by!(discord_guild_id: guild_id.to_s, discord_user_id: user_id.to_s, season: season.to_s) do |r|
      r.username = username
      r.points = 0
    end
    row.update!(points: row.points + points, username: username.presence || row.username)
    row.points
  end

  # Top N da temporada (default mês corrente), do maior pro menor.
  def self.scoreboard(guild_id, season: nil, limit: 10)
    season ||= current_season
    for_guild(guild_id).for_season(season).order(points: :desc, updated_at: :asc).limit(limit)
  end
end

# Placar do music quiz por temporada (Épico 3). Pontos acumulados por usuário
# num servidor, agrupados por `season` (ex.: "2026-07"). A rodada em si é
# efêmera e vive no bot; só o placar da temporada persiste aqui.
class CreateQuizScores < ActiveRecord::Migration[8.1]
  def change
    create_table :quiz_scores do |t|
      t.string  :discord_guild_id, null: false
      t.string  :discord_user_id,  null: false
      t.string  :username
      t.string  :season, null: false
      t.integer :points, null: false, default: 0

      t.timestamps
    end

    add_index :quiz_scores, %i[discord_guild_id season discord_user_id], unique: true,
              name: "index_quiz_scores_on_guild_season_user"
    add_index :quiz_scores, %i[discord_guild_id season points]
  end
end

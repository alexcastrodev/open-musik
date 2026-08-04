# Favoritos por usuário (Épico 3). Cada favorito é uma faixa que um usuário do
# Discord (discord_user_id) marcou — pra tocar depois com /play favs. `query` é o
# que o /play favs reenfileira (URL /songs/:uuid do cache quando dá, senão o link
# canônico ou o título). Guarda título/artista pra listar sem depender da Song
# (que pode ser purgada). Sem FK obrigatória: favoritos de faixas provisórias
# (Spotify/YouTube) podem não ter Song.
class CreateFavorites < ActiveRecord::Migration[8.1]
  def change
    create_table :favorites do |t|
      t.string     :discord_user_id, null: false
      t.references :song, foreign_key: { on_delete: :nullify }
      t.string     :title
      t.string     :artist
      t.string     :query, null: false

      t.timestamps
    end

    # Um favorito por (usuário, query) — favoritar de novo é no-op idempotente.
    add_index :favorites, %i[discord_user_id query], unique: true
    add_index :favorites, %i[discord_user_id created_at]
  end
end

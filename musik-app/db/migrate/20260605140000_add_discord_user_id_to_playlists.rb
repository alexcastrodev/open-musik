class AddDiscordUserIdToPlaylists < ActiveRecord::Migration[8.1]
  def change
    # Playlists criadas pelo bot pertencem a um usuário do Discord (sem FK pra
    # users — guardamos só o id cru, como nas demais tabelas do bot). As
    # playlists da UI web ficam com discord_user_id NULL.
    add_column :playlists, :discord_user_id, :string

    # build_status acompanha a resolução em background das faixas (BuildPlaylistJob):
    # 'building' enquanto resolve no YouTube, 'ready' quando termina.
    add_column :playlists, :build_status, :string, null: false, default: "ready"

    add_index :playlists, :discord_user_id
  end
end

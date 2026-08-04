# Feature DJ (Épico 3): usuários com permissão de controlar a reprodução/fila
# num servidor. Modo aberto por padrão (sem DJ = todo mundo controla); com ≥1 DJ
# o modo vira restrito. Guarda o username pra listar sem depender do Discord.
class CreateDjs < ActiveRecord::Migration[8.1]
  def change
    create_table :djs do |t|
      t.string :discord_guild_id, null: false
      t.string :discord_user_id,  null: false
      t.string :username
      t.string :added_by

      t.timestamps
    end

    add_index :djs, %i[discord_guild_id discord_user_id], unique: true
  end
end

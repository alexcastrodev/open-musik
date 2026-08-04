# Suporte aos botões "Anterior" e "Repetir essa música" do painel do bot.
#
# `played_at`: carimba QUANDO o item virou "played" (em #advance/#skip). Antes,
# itens tocados ficavam na fila sem ordem temporal — o "Anterior" usa este campo
# pra achar a ÚLTIMA faixa tocada do canal (order(played_at: :desc)).
#
# `repeat_mode`: loop da faixa atual. "none" = fluxo normal; "track" = #advance
# reativa a própria current em vez de avançar. Por (guild, canal), no item
# current.
class AddHistoryAndRepeatToPlayQueueItems < ActiveRecord::Migration[8.1]
  def change
    add_column :play_queue_items, :played_at, :datetime
    add_column :play_queue_items, :repeat_mode, :string, default: "none", null: false
    # Acha a última faixa tocada do canal rápido (Anterior).
    add_index :play_queue_items,
      [ :discord_guild_id, :voice_channel_id, :played_at ],
      name: "idx_pqi_on_guild_channel_played_at"
  end
end

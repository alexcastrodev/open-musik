class AddPlaylistIdToPlayQueueItems < ActiveRecord::Migration[8.0]
  # Vincula um item da fila à playlist que o enfileirou (/playlist). Nullable: o
  # /play avulso e o Spotify não têm playlist. Permite que o add_track/
  # BuildPlaylistJob descubra em quais guilds a playlist ainda está tocando
  # (item current/queued) e enfileire ali a faixa nova.
  def change
    add_reference :play_queue_items, :playlist, null: true, foreign_key: { on_delete: :nullify }
  end
end

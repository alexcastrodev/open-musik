# Quem EXECUTOU a ação (tag do Discord de quem deu /skip, /stop, ou clicou no
# botão "Próxima"). Distinto de requested_by, que é quem PEDIU a faixa (/play).
# Ações sem usuário (advance automático no fim da faixa) ficam com actor nulo.
class AddActorToServerLogs < ActiveRecord::Migration[8.1]
  def change
    add_column :server_logs, :actor, :string
  end
end

# Qual bot do pool estava na call quando o evento ocorreu (bot_client_id do
# BotGuild que ocupava o canal). Não há nome amigável de bot guardado — o
# client_id é a identidade do bot no pool (ver BotGuild). Fica nulo quando
# nenhum bot estava no canal no momento (ex.: queue_empty após sair).
class AddBotClientIdToServerLogs < ActiveRecord::Migration[8.1]
  def change
    add_column :server_logs, :bot_client_id, :string
  end
end

# Wrapped mensal/anual do servidor (Épico 2, item 8): retrospectiva gerada das
# estatísticas de plays (PlayStats/ServerLog) e ENTREGUE ao Discord pelo bot. O
# Rails não fala com o gateway do Discord nem faz push pro bot (princípio 5,
# tudo é poll/heartbeat), então cada wrapped fica PENDENTE aqui até um bot
# buscá-lo no heartbeat, postar no canal e dar o ack (status → delivered).
#
# `claimed_by`/`claimed_at`: claim atômico na entrega — evita os 2 bots do guild
# postarem o mesmo wrapped. Se o bot que reivindicou não confirmar dentro do
# TTL, o claim expira e outro bot reassume.
class CreateServerWrappeds < ActiveRecord::Migration[8.1]
  def change
    create_table :server_wrappeds do |t|
      t.string   :discord_guild_id, null: false
      t.string   :period_kind,      null: false            # "month" | "year"
      t.date     :period_start,     null: false
      t.date     :period_end,       null: false
      t.jsonb    :payload,          null: false, default: {}
      t.text     :message
      t.string   :status,           null: false, default: "pending" # pending | delivered
      t.string   :claimed_by
      t.datetime :claimed_at
      t.string   :delivered_by
      t.datetime :delivered_at

      t.timestamps
    end

    # Um wrapped por (guild, período) — a geração é idempotente.
    add_index :server_wrappeds, %i[discord_guild_id period_kind period_start],
              unique: true, name: "index_server_wrappeds_on_guild_and_period"
    add_index :server_wrappeds, %i[status claimed_at]
  end
end

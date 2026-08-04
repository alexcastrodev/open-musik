# Reintroduz o estado de voz por guild em bot_guilds — removido em
# 20260611130000 quando o pool migrou pro Valkey (bot-cache), mas o próprio
# heartbeat do bot (bot/src/heartbeat.js) NUNCA parou de mandar esses campos
# (voice_state, voice_channel_id, voice_channel_name, current_title); o Rails
# só não tinha mais onde persistir. Sem eles não dá pra montar "servidores
# conectados" (Épico 2, item 3) — o Rails não enxerga o Valkey do swarm
# (princípio 5), então esse é o ÚNICO jeito de saber o que cada bot está
# tocando: via evento bot → API.
class AddVoiceStateToBotGuilds < ActiveRecord::Migration[8.1]
  def change
    add_column :bot_guilds, :voice_state, :string, null: false, default: "idle" # active | idle
    add_column :bot_guilds, :voice_channel_id, :string
    add_column :bot_guilds, :voice_channel_name, :string
    add_column :bot_guilds, :current_title, :string
  end
end

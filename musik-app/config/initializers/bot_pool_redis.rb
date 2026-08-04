# Cliente Valkey/Redis do POOL DE BOTS. O pool (presença + disputa de trabalho)
# vive aqui, separado do Sidekiq (db 0) e do Action Cable/cache (db 1): por
# padrão usa o db 2 do mesmo Valkey. Aceita um POOL_REDIS_URL dedicado e cai no
# REDIS_URL trocando o database — mesmo padrão de config/initializers/sidekiq.rb.
#
# Fonte de verdade da DISPONIBILIDADE do pool (substitui as colunas de assignment
# de bot_guilds): o bot reporta via heartbeat HTTP, o Rails grava aqui e só
# CONSULTA na hora do /play. Ver app/services/bot_pool_service.rb.
require "redis"

pool_redis_url = ENV.fetch("POOL_REDIS_URL") do
  base = ENV.fetch("REDIS_URL", "redis://localhost:6379/0")
  base.sub(%r{/\d+$}, "/2").then { |u| u == base ? "#{base}/2" : u }
end

# Um cliente compartilhado e thread-safe (redis-rb 5 usa um pool interno). O
# acesso é encapsulado por BotPoolService — nada fora dele fala com este cliente.
BOT_POOL_REDIS = Redis.new(url: pool_redis_url, reconnect_attempts: 1)

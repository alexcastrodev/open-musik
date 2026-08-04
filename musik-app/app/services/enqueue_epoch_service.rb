# Época de enfileiramento por canal — o sinal de cancelamento que faz o "parar" e o
# "limpar fila" realmente PARAREM os jobs que preenchem a fila em background.
#
# Problema: /stop, /clear e /limpar_fila apagam itens da fila, mas a cadeia de jobs
# já agendada (EnqueueYoutube/Spotify/PlaylistJob) continuava criando itens — a fila
# voltava a se encher sozinha. Não dá pra inferir isso do estado da fila: uma fila
# vazia pode ser "parei de propósito" OU "os jobs ainda não enfileiraram".
#
# Solução: um contador monotônico por (guild, canal) no Valkey. stop/clear/
# clear_upcoming INCREMENTAM a época (cancela tudo que está em voo). Cada cadeia de
# jobs nasce carregando a época corrente (PlayQueueService#enqueue_epoch, gravada no
# /play); ao rodar, o job confere: se a época do canal AVANÇOU desde que a cadeia
# nasceu, ele para — não cria item nem encadeia o próximo. Uma playlist nova
# iniciada depois pega a nova época e segue normalmente.
#
# Vive no mesmo Valkey do pool de bots (BOT_POOL_REDIS, db 2) — fora do Sidekiq.
class EnqueueEpochService
  PREFIX = "enqueue_epoch".freeze
  # TTL defensivo: um canal inativo não acumula chave pra sempre. Qualquer cadeia de
  # jobs vive muito menos que isto; se a chave expirar entre o /play e o job, current
  # vira 0 e a época da cadeia (>= 1) será "do futuro" — então tratamos ausência como
  # "não cancele" (ver stale?).
  TTL = 24.hours.to_i

  class << self
    # Época corrente do canal (0 se nunca houve bump). Gravada na cadeia de jobs no
    # momento em que ela é agendada.
    def current(guild_id, channel_id)
      redis.get(key(guild_id, channel_id)).to_i
    end

    # Incrementa a época: cancela toda cadeia de jobs nascida numa época anterior.
    # Chamado pelo stop/clear/clear_upcoming. Renova o TTL.
    def bump!(guild_id, channel_id)
      k = key(guild_id, channel_id)
      redis.incr(k).tap { redis.expire(k, TTL) }
    end

    # Uma cadeia nascida em `born_epoch` está obsoleta? True quando a época do canal
    # avançou (houve stop/clear/clear_upcoming depois que a cadeia foi agendada).
    # Ausência de chave / época menor que a da cadeia → NÃO obsoleta (a chave pode ter
    # expirado; no normal a corrente é igual à da cadeia).
    def stale?(guild_id, channel_id, born_epoch)
      current(guild_id, channel_id) > born_epoch.to_i
    end

    private

    def key(guild_id, channel_id)
      "#{PREFIX}:#{guild_id}:#{channel_id}"
    end

    def redis
      BOT_POOL_REDIS
    end
  end
end

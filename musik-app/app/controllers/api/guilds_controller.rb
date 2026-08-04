module Api
  # Fila de reprodução por (guild, canal de voz), consumida pelo bot.
  # O bot é um player "burro": chama estes endpoints e toca o `playable`
  # retornado (s3_url cacheado ou stream direto do YouTube). A fila e o provider
  # (yt-dlp) vivem aqui no Rails. Ver PlayQueueService.
  #
  # O POOL (quem toca, disponibilidade, disputa) NÃO vive mais aqui — migrou pro
  # bot-cache, gerido pelos próprios bots (ver bot/src/pool/BotPool.js). O Rails só
  # cuida do CATÁLOGO: enqueue cria/ativa o item; advance/skip/stop/queue/
  # item_status são chamados pelo bot que JÁ está num canal (canal na rota).
  class GuildsController < ApiController
    HISTORY_DEFAULT = 10
    HISTORY_MAX     = 25
    # Quantos logs varrer pra deduplicar por título antes de cortar no limite.
    HISTORY_SCAN    = 200
    # POST /api/guilds/:guild_id/channels/:channel_id/enqueue
    # body: { q:, requested_by? }
    # SÓ CATÁLOGO: cria/ativa o item na fila do canal e devolve o playable/item.
    # NÃO decide pool — quem decide qual bot toca é o BOT (pool no bot-cache). O bot
    # já escolheu o canal (vem na rota) antes de chamar isto.
    def enqueue
      # queue_only (discover/autoplay): só enfileira, NUNCA ativa a faixa — o bot
      # já está tocando e só alimenta a fila com a sugerida (ver PlayQueueService).
      queue_only = ActiveModel::Type::Boolean.new.cast(params[:queue_only])
      result = service.enqueue(params[:q], requested_by: params[:requested_by].to_s, queue_only: queue_only)
      return render_error("Nada encontrado para a busca.", :not_found) if result.nil?

      log_event("play", item: result[:item], channel_id: params[:channel_id],
        channel_name: params[:channel_name].to_s, actor: params[:requested_by].to_s,
        bot_client_id: params[:client_id].to_s,
        detail: result[:started_now] ? "começou a tocar" : "entrou na fila")

      render json: {
        playable: result[:playable],
        started_now: result[:started_now],
        position: result[:position],
        item: item_json(result[:item])
      }, status: :created
    rescue PlayQueueService::TrackTooLongError => e
      render_error(e.message, :unprocessable_entity)
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/advance → próxima faixa
    def advance
      nxt = service.advance
      if nxt.nil?
        log_event("queue_empty", detail: "fila terminou")
        return render json: { playable: nil, item: nil }
      end

      log_event("advance", item: nxt[:item], detail: "faixa trocada (fim da anterior)")
      render json: { playable: nxt[:playable], item: item_json(nxt[:item]) }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/skip
    # service.skip devolve nil (nada tocando), false (tocando mas fila vazia: não
    # pula) ou um Hash com a próxima faixa. `skipped` só é true quando a atual foi
    # de fato trocada — é o sinal que o bot usa pra reagir (ver applySkip).
    def skip
      nxt = service.skip
      advanced = nxt.is_a?(Hash)
      log_event("skip", item: advanced ? nxt[:item] : nil, actor: params[:actor].to_s,
        channel_name: params[:channel_name].to_s,
        detail: advanced ? "pulou para a próxima" : "skip sem efeito (fila vazia)") if advanced
      render json: {
        skipped: advanced,
        has_current: !nxt.nil?,
        playable: advanced ? nxt[:playable] : nil,
        item: advanced ? item_json(nxt[:item]) : nil
      }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/previous
    # Botão "Anterior": volta pra última faixa tocada do canal. service.previous
    # devolve nil (sem histórico) ou um Hash com a faixa anterior reativada.
    # `moved` é o sinal que o bot usa pra reagir (ver applyPrevious).
    def previous
      prev = service.previous
      moved = prev.is_a?(Hash)
      log_event("previous", item: moved ? prev[:item] : nil, actor: params[:actor].to_s,
        channel_name: params[:channel_name].to_s,
        detail: moved ? "voltou para a anterior" : "previous sem efeito (sem histórico)") if moved
      render json: {
        moved: moved,
        playable: moved ? prev[:playable] : nil,
        item: moved ? item_json(prev[:item]) : nil
      }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/repeat
    # Botão "Repetir essa música": alterna o loop da faixa atual. service.toggle_repeat
    # devolve o novo modo ("none"/"track") ou nil (nada tocando).
    def repeat
      mode = service.toggle_repeat
      log_event("repeat", actor: params[:actor].to_s, channel_name: params[:channel_name].to_s,
        detail: "repeat → #{mode}") if mode
      render json: { repeat_mode: mode }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/clear
    # Botão "Parar": esvazia a fila do canal (igual ao /stop) MAS o bot fica na
    # sala — NÃO libera o bot no pool. Ele segue ocupado no canal e sai sozinho
    # depois do idle (ver GuildPlayer#stopKeep / IDLE_DISCONNECT_MS).
    def clear
      service.stop
      log_event("clear", channel_id: params[:channel_id], actor: params[:actor].to_s,
        channel_name: params[:channel_name].to_s, detail: "parou e limpou a fila (ficou na sala)")
      render json: { stopped: true, kept_in_channel: true }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/stop
    # Esvazia a fila do canal (só catálogo). A liberação do slot no pool é feita
    # pelo PRÓPRIO bot no bot-cache ao sair da call (ver GuildPlayer.stopAndDisconnect
    # → BotPool.releaseMe) — o Rails não mexe mais no pool.
    def stop
      service.stop
      log_event("stop", channel_id: params[:channel_id], actor: params[:actor].to_s,
        channel_name: params[:channel_name].to_s, detail: "parou e limpou a fila")
      render json: { stopped: true }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/clear_upcoming
    # Limpa as faixas que ainda vão tocar (status "queued"), mantendo a atual
    # tocando — diferente do /stop, que esvazia tudo e libera o bot. Não mexe no
    # pool: o bot segue na call tocando a faixa atual.
    def clear_upcoming
      removed = service.clear_upcoming
      log_event("clear_upcoming", channel_id: params[:channel_id], actor: params[:actor].to_s,
        channel_name: params[:channel_name].to_s,
        detail: "limpou #{removed} da fila (manteve a atual)")
      render json: { cleared: removed }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/shuffle
    # Embaralha as faixas que ainda vão tocar (não mexe na atual). Devolve quantas
    # foram embaralhadas. O painel se atualiza no próximo poll de /queue.
    def shuffle
      count = service.shuffle_queue
      log_event("shuffle", channel_id: params[:channel_id], actor: params[:actor].to_s,
        channel_name: params[:channel_name].to_s, detail: "embaralhou #{count} faixas")
      render json: { shuffled: count }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/remove { position }
    # Remove a faixa na posição 1-based da fila de upcoming.
    def remove
      item = service.remove_at(params[:position])
      return render_error("Posição inválida.", :unprocessable_entity) if item.nil?

      log_event("remove", item: item, channel_id: params[:channel_id], actor: params[:actor].to_s,
        channel_name: params[:channel_name].to_s, detail: "removeu da fila")
      render json: { removed: item_json(item) }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/move { from, to }
    # Move a faixa de `from` pra `to` (posições 1-based na fila de upcoming).
    def move
      item = service.move(params[:from], params[:to])
      return render_error("Posição inválida.", :unprocessable_entity) if item.nil?

      log_event("move", item: item, channel_id: params[:channel_id], actor: params[:actor].to_s,
        channel_name: params[:channel_name].to_s, detail: "moveu #{params[:from]} → #{params[:to]}")
      render json: { moved: item_json(item), from: params[:from].to_i, to: params[:to].to_i }
    end

    # GET /api/guilds/:guild_id/channels/:channel_id/items/:id
    # Status de cache de um item. O bot pollla isto quando nenhum stream
    # imediato funciona, esperando o CacheProviderSongJob terminar pra tocar do
    # S3. `cached_url` vem preenchido quando a Song já está no S3.
    def item_status
      item = service.find_item(params[:id])
      return render_error("Item não encontrado.", :not_found) if item.nil?

      render json: {
        cache_status: item.cache_status,
        cached_url: item.song&.s3_url,
        audio_format: item.song&.audio_format,
        item: item_json(item)
      }
    end

    # GET /api/guilds/:guild_id/channels/:channel_id/queue
    # Sempre renderiza o estado fresco da fila — o bot polla a cada ~500ms e
    # redesenha o painel. Sem ETag/304 (a antiga complexidade de cache condicional
    # foi removida junto com o push via WebSocket; ver PlayQueueService).
    def queue
      data = service.list
      render json: {
        current: data[:current] && item_json(data[:current]),
        upcoming: data[:upcoming].map { |i| item_json(i) }
      }
    end

    # POST /api/guilds/:guild_id/channels/:channel_id/save_playlist { name, discord_user_id }
    # Salva a fila atual (current + upcoming) como uma playlist do usuário (Épico
    # 3). Só entram itens com Song resolvida (playlist_songs exige song_id); os
    # provisórios (ainda resolvendo) ficam de fora.
    def save_playlist
      name = params[:name].to_s.strip
      return render_error("Dá um nome pra playlist.", :unprocessable_entity) if name.blank?

      data = service.list
      items = ([ data[:current] ] + data[:upcoming]).compact
      song_ids = items.filter_map(&:song_id).uniq
      if song_ids.empty?
        return render_error("A fila não tem faixas salváveis ainda (ainda resolvendo).", :unprocessable_entity)
      end

      playlist = Playlist.create!(name: name, discord_user_id: params[:discord_user_id].presence)
      song_ids.each { |sid| playlist.playlist_songs.create!(song_id: sid) }

      render json: {
        playlist: { id: playlist.id, name: playlist.name },
        saved: song_ids.size,
        total: items.size
      }, status: :created
    end

    # GET /api/guilds/:guild_id/channels/:channel_id/lyrics
    # Letra da faixa que está tocando agora (Épico 3), via lrclib.net
    # (LyricsService). Lê a `current` do canal e busca por título/artista.
    def lyrics
      item = service.current
      return render_error("Nada tocando pra buscar a letra.", :not_found) if item.nil?

      title  = item.song&.title.presence || item.title
      artist = item.song&.artist.presence || item.artist.presence
      result = LyricsService.fetch(title: title, artist: artist, duration: item.song&.duration || item.duration)
      return render_error("Não achei a letra dessa faixa.", :not_found) if result.nil?

      render json: result
    end

    # GET /api/guilds/:guild_id/history?limit=N
    # Últimas faixas tocadas no servidor (Épico 3: histórico + /replay), do
    # ServerLog (eventos "play"), deduplicadas por título (mantém a mais recente).
    # `query` é o que o /replay reenfileira: a URL /songs/:uuid quando a Song está
    # no S3 (replay instantâneo do cache) ou o próprio título (o bot re-resolve).
    def history
      limit = params[:limit].to_i
      limit = HISTORY_DEFAULT if limit <= 0
      limit = limit.clamp(1, HISTORY_MAX)

      seen = {}
      entries = []
      ServerLog.for_guild(params[:guild_id]).where(kind: "play").recent
               .limit(HISTORY_SCAN).includes(:song).each do |log|
        key = log.song_title.to_s.downcase.strip
        next if key.blank? || seen[key]

        seen[key] = true
        song = log.song
        query = song&.s3_url.present? && song.uuid ? "/songs/#{song.uuid}" : log.song_title
        entries << {
          position: entries.size + 1,
          title: log.song_title,
          artist: song&.display_artist,
          requested_by: log.requested_by,
          played_at: log.created_at,
          query: query
        }
        break if entries.size >= limit
      end

      render json: { history: entries }
    end

    private

    def service
      @service ||= PlayQueueService.new(params[:guild_id], params[:channel_id])
    end

    def render_error(message, status)
      render json: { error: message }, status: status
    end

    # Grava um evento no histórico do servidor (ver ServerLog / página /logs). O
    # pool saiu do Rails, então não há mais presença no Valkey pra consultar: o
    # bot SEMPRE manda o channel_name e o client_id (client_id em todo POST), e o
    # nome do guild vem da linha de metadados de bot_guilds (heartbeat). Nunca
    # propaga erro: o ServerLog.record já faz rescue interno.
    def log_event(kind, item: nil, channel_id: nil, channel_name: nil, detail: nil,
                  actor: nil, bot_client_id: nil, metadata: {})
      cid = channel_id || item&.voice_channel_id
      guild_name = BotGuild.where(discord_guild_id: params[:guild_id])
        .order(updated_at: :desc).limit(1).pick(:name)
      ServerLog.record(
        kind,
        guild_id: params[:guild_id].to_s,
        guild_name: guild_name,
        channel_id: cid,
        channel_name: channel_name.presence,
        item: item,
        detail: detail,
        actor: actor,
        # O bot manda o client_id em todo POST (params[:client_id]); o bot_client_id
        # explícito (quando passado) ganha.
        bot_client_id: bot_client_id.presence || params[:client_id].to_s.presence,
        metadata: metadata
      )
    end
  end
end

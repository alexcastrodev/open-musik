# Fonte da verdade da fila de reprodução por guild. O bot é um player "burro":
# pede o `playable` e toca. Aqui decidimos:
#   - se a faixa está em cache (Song válida) → manda o s3_url pronto (cached_url);
#   - se não → manda os `candidates` (URLs canônicas) pro bot resolver o stream
#     no próprio IP, E agenda o download
#     pro S3 (CacheProviderSongJob). Se nenhum candidate tocar, o bot espera o
#     cache ficar pronto (ver Api::GuildsController#item_status) e toca do S3.
#   - prefetch: ao enfileirar/avançar, pré-baixamos a PRÓXIMA faixa (lookahead 1).
#
# Faixas resolvidas pelo provider viram Songs temporárias (is_temporary), com
# cache de 7 dias a partir do último play (PurgeTemporarySongsJob).
class PlayQueueService
  # Faixa pedida no /play passou do limite de duração — não enfileira nem baixa.
  class TrackTooLongError < StandardError; end

  # Limite de duração da faixa. Acima disso o /play é recusado (não enfileira nem
  # dispara download). Sobrescreve com MAX_TRACK_DURATION_SECONDS; <= 0 desliga.
  MAX_DURATION_SECONDS = (ENV["MAX_TRACK_DURATION_SECONDS"] || 20 * 60).to_i

  def initialize(guild_id, voice_channel_id)
    @guild_id = guild_id.to_s
    @voice_channel_id = voice_channel_id.to_s
  end

  # Canais onde a playlist ainda está "tocando": têm ao menos um item dela
  # current/queued na fila. Usado pelo BuildPlaylistJob pra enfileirar a faixa
  # nova (add_track) só onde ela ainda faz sentido — playlist já terminada
  # (tudo `played`) ou parada (/stop apaga os itens) não recebe. Com o pool, a
  # fila é por (guild, canal), então devolve PARES [guild_id, voice_channel_id].
  def self.channels_playing(playlist_id)
    PlayQueueItem
      .where(playlist_id: playlist_id, status: %w[current queued])
      .distinct
      .pluck(:discord_guild_id, :voice_channel_id)
  end

  # /play: cria um item PROVISÓRIO já e devolve o que tocar, SEM resolver no
  # provider (o resolve via yt-dlp é pesado e foi pro worker — o serviço extractor
  # foi removido). Retorna { item:, playable:, song:, started_now:, position: }.
  #
  # A 1ª faixa o BOT resolve da fonte pela própria query (yt-dlp local no bot), por
  # isso o playable carrega `source_query` em vez de candidates já resolvidos. Em
  # paralelo, o ResolvePrimaryTrackJob resolve a query no worker, preenche o item
  # (título/artista/duração/stream_candidates) e — se for playlist/álbum — agenda as
  # DEMAIS faixas (EnqueueYoutube/SpotifyTracksJob). O painel se atualiza via
  # broadcast quando o resolve termina. NÃO levanta TrackTooLongError aqui (sem
  # duração ainda); o limite é aplicado no job, ao resolver.
  # queue_only: NUNCA ativa a faixa (não vira `current`), mesmo com a fila vazia —
  # só a enfileira. Usado pelo DISCOVER (autoplay sugerido): o bot já está tocando
  # localmente e só quer alimentar a fila com a próxima; ativar aqui faria a
  # sugestão virar `current` e o sync do bot trocaria a faixa no meio (parando a
  # atual). Com queue_only, o avanço natural promove a sugestão quando a atual
  # acabar — sem interferir no que toca agora.
  def enqueue(query, requested_by:, queue_only: false)
    # URL do próprio musik (/songs/:uuid): a Song já está no S3, resolução é LOCAL e
    # instantânea (sem yt-dlp) — não vale adiar pro worker. Resolve aqui e toca
    # direto do cache, como antes.
    if ProviderService.musik_url?(query)
      candidates = ProviderService.resolve_all(query)
      return nil if candidates.empty?
      return enqueue_resolved(candidates, requested_by, queue_only: queue_only)
    end

    item = create_provisional_item(query, requested_by)

    # 1ª faixa da sessão (fila vazia): vira current já, pra o bot tocar da fonte.
    # Sem cache nem candidates resolvidos: o playable leva a source_query.
    # queue_only (discover) NUNCA ativa: a sugestão só entra na fila.
    started_now = !queue_only && current.nil?
    playable = activate(item, first_track: true) if started_now

    # Resolve no worker: preenche o item provisório e enfileira as demais faixas de
    # uma playlist/álbum. started_now diz ao job se deve pular o transcode da 1ª.
    # enqueue_epoch carimba a cadeia: se um stop/clear/limpar_fila bumpar a época
    # antes do job rodar, ele para de preencher a fila (ver EnqueueEpochService).
    ResolvePrimaryTrackJob.perform_later(item.id, query, requested_by, started_now, enqueue_epoch)

    {
      item: item,
      playable: playable,
      song: item.song,
      started_now: started_now,
      position: queued_count
    }
  end

  # Enfileira candidatos JÁ resolvidos (URL do musik, resolução instantânea) e
  # devolve o Hash do /play. Mesmo shape do #enqueue_song: cria o item, ativa a 1ª
  # da sessão e dispara o prefetch. Não há "demais faixas" aqui (URL única).
  def enqueue_resolved(candidates, requested_by, queue_only: false)
    enforce_duration_limit!(candidates.first)
    item = create_queued_item(candidates, requested_by)
    # queue_only (discover): nunca ativa — só enfileira (ver #enqueue).
    started_now = !queue_only && current.nil?
    playable = activate(item, first_track: true) if started_now
    prefetch_next
    { item: item, playable: playable, song: item.song, started_now: started_now, position: queued_count }
  end

  # Item provisório do /play: guarda a query crua (em provider_url, que vira a URL
  # canônica após o resolve) e usa a própria query como título placeholder. Sem
  # stream_candidates ainda — o ResolvePrimaryTrackJob preenche. cache_status
  # "pending": ninguém baixou nada.
  def create_provisional_item(query, requested_by)
    PlayQueueItem.create!(
      discord_guild_id: @guild_id,
      voice_channel_id: @voice_channel_id,
      provider_url: query,
      stream_candidates: [],
      title: query,
      requested_by: requested_by,
      position: next_position,
      status: "queued",
      cache_status: "pending"
    )
  end

  # Preenche um item provisório com os candidatos resolvidos (título/artista/
  # duração/stream_candidates/Song vinculada) e agenda o cache S3. Chamado pelo
  # ResolvePrimaryTrackJob após resolver a query no worker. O painel troca o título
  # placeholder pelo real no próximo poll de /queue (~500ms).
  # skip_transcode: a 1ª faixa da sessão sobe no formato nativo (mais rápida).
  def fill_provisional_item(item, candidates, skip_transcode: false)
    primary = candidates.first
    linked_song = linked_song_for(candidates)

    is_live = primary[:is_live] == true

    item.update!(
      song_id: linked_song&.id,
      provider_url: primary[:canonical_url],
      stream_candidates: candidates.map { |c| { provider: c[:provider].to_s, url: c[:canonical_url] } },
      title: primary[:title],
      artist: primary[:artist],
      duration: primary[:duration],
      cache_status: is_live ? "live" : (linked_song&.s3_url.present? ? "cached" : "pending")
    )

    # O update troca o título placeholder (a URL crua) pela faixa real e dá os
    # candidates pro bot tocar; o painel pega isso no próximo poll (~500ms).

    # Sem cache pronto: agenda o download pro S3 (o activate não agendou, pois o
    # item nasceu sem candidates). Já cacheado (Song vinculada): nada a baixar.
    # Live streams nunca são cacheados (não têm fim — o download não terminaria).
    CacheProviderSongJob.perform_later(item.id, skip_transcode: skip_transcode) if !is_live && linked_song&.s3_url.blank?
    prefetch_next
  end

  # Remove um item da fila (provisório que não resolveu, ou faixa longa demais).
  # Bumpa o ETag explicitamente: o destroy dispara o callback, mas mantemos
  # simétrico com os demais delete diretos.
  def discard_item(item)
    item.destroy
  end

  # Enfileira uma Song já cacheada (S3) — usado pelo /playlist, que toca faixas
  # que o BuildPlaylistJob já resolveu e baixou. Diferente do #enqueue (que vai
  # ao provider), aqui a Song existe: montamos os candidatos a partir dela e
  # reusamos create_queued_item/activate. Retorna o mesmo Hash do #enqueue, ou
  # nil se a Song não tiver s3_url.
  def enqueue_song(song, requested_by:, playlist_id: nil)
    return nil if song.nil?
    # Song purgada (s3_url zerado): ainda enfileira se dá pra rebaixar pela fonte;
    # o item entra `pending`, o CacheProviderSongJob rebaixa e o bot espera o cache.
    return nil if song.s3_url.blank? && !song.reacquirable?

    candidates = [ {
      provider:      :musik,
      canonical_url: song.source_url.presence || song.youtube_url.presence || song.s3_url,
      song_id:       song.id,
      title:         song.display_title,
      artist:        song.display_artist,
      duration:      song.duration.to_i
    } ]

    item = create_queued_item(candidates, requested_by, playlist_id: playlist_id)
    started_now = current.nil?
    # 1ª faixa da sessão: sobe no formato nativo (sem transcode) pra começar mais
    # rápido — ver activate / #enqueue.
    playable = activate(item, first_track: true) if started_now
    prefetch_next
    {
      item: item,
      playable: playable,
      song: item.song,
      started_now: started_now,
      position: queued_count
    }
  end

  # Cria um item `queued` a partir de candidatos já resolvidos pelo provider.
  # Compartilhado entre #enqueue (1ª faixa) e EnqueueSpotifyTracksJob (demais
  # faixas de uma playlist do Spotify). Liga a Song cacheada, se houver.
  def create_queued_item(candidates, requested_by, playlist_id: nil)
    primary = candidates.first
    linked_song = linked_song_for(candidates)

    PlayQueueItem.create!(
      discord_guild_id: @guild_id,
      voice_channel_id: @voice_channel_id,
      playlist_id: playlist_id,
      song_id: linked_song&.id,
      provider_url: primary[:canonical_url],
      stream_candidates: candidates.map { |c| { provider: c[:provider].to_s, url: c[:canonical_url] } },
      title: primary[:title],
      artist: primary[:artist],
      duration: primary[:duration],
      requested_by: requested_by,
      position: next_position,
      status: "queued",
      # Só conta como cacheado se o áudio está mesmo no S3; uma Song purgada
      # (vinculada mas sem s3_url) entra `pending` pro job rebaixar.
      cache_status: linked_song&.s3_url.present? ? "cached" : "pending"
    )
  end

  # Limite de duração público pro job pular faixas longas sem derrubar o lote.
  def within_duration_limit?(candidate)
    enforce_duration_limit!(candidate)
    true
  rescue TrackTooLongError
    false
  end

  # Pré-baixa a próxima faixa da fila pro S3 (lookahead 1), se ainda não cacheada.
  # Público: o EnqueueSpotifyTracksJob chama após inserir itens em background, pra
  # a próxima começar a baixar mesmo quando o /play original já tinha rodado o
  # prefetch com a fila vazia (sem "próxima" ainda).
  def prefetch_next
    nxt = items.where(status: "queued").order(:position).first
    return if nxt.nil?
    return if nxt.cache_status == "cached" || nxt.cache_status == "caching"
    return if nxt.song&.s3_url.present?

    CacheProviderSongJob.perform_later(nxt.id)
  end

  # Player ficou idle: marca a atual como tocada e promove a próxima.
  # Retorna { item:, playable:, song: } da próxima, ou nil se a fila acabou.
  #
  # Repeat ("track"): a faixa atual está em loop — reativa ela mesma (re-resolve o
  # playable, renova o TTL/play_count) em vez de avançar. Não marca played nem
  # mexe na fila, então o "Anterior" não enxerga repetições como histórico.
  def advance
    cur = current
    if cur&.repeat_mode == "track"
      playable = activate(cur)
      return { item: cur, playable: playable, song: cur.song }
    end

    cur&.update!(status: "played", played_at: Time.current)
    nxt = items.where(status: "queued").order(:position).first
    return nil if nxt.nil?

    playable = activate(nxt)
    prefetch_next
    { item: nxt, playable: playable, song: nxt.song }
  end

  # Botão "Anterior": volta pra ÚLTIMA faixa tocada do canal. Devolve a current de
  # volta pra fila (na frente das próximas, pra retomar a sequência depois) e
  # reativa a anterior. Retorna { item:, playable:, song: } da faixa anterior, ou
  # nil se não há histórico (nada tocado antes neste canal).
  def previous
    prev = items.where(status: "played").where.not(played_at: nil)
      .order(played_at: :desc).first
    return nil if prev.nil?

    cur = current
    # A current vira a "próxima" imediata: posição à frente das demais queued, pra
    # voltar a tocar logo após a anterior. Mantém repeat_mode? Não — o loop é da
    # faixa, mas ao voltar manualmente o usuário quer ouvir a anterior; preservamos
    # o repeat_mode da current como estava (ele só age quando ela for current de novo).
    if cur
      front = (items.where(status: "queued").minimum(:position) || cur.position) - 1
      cur.update!(status: "queued", position: front)
    end

    # Reativa a anterior: volta a current e limpa o carimbo de tocada (saiu do
    # histórico — está tocando agora).
    prev.update!(played_at: nil)
    playable = activate(prev)
    { item: prev, playable: playable, song: prev.song }
  end

  # Botão "Repetir essa música": alterna o loop da faixa atual entre none/track.
  # Retorna o novo repeat_mode ("none"/"track"), ou nil se nada está tocando.
  def toggle_repeat
    cur = current
    return nil if cur.nil?
    cur.update!(repeat_mode: cur.repeat_mode == "track" ? "none" : "track")
    cur.repeat_mode
  end

  # /skip (e botão "Próxima") = avançar pra próxima SE houver.
  # Sem próxima na fila, NÃO mexe na atual: `advance` marcaria a `current` como
  # "played" (zerando o current) antes de descobrir que a fila acabou — e o bot,
  # que só reage quando `skipped` é verdadeiro, continuaria tocando a faixa.
  # Esse descompasso fazia o /play seguinte achar a fila vazia e tocar por cima
  # da música atual em vez de enfileirar. Retorna:
  #   nil   → nada tocando (sem current)
  #   false → tocando, mas fila vazia: mantém a atual (nada a pular)
  #   Hash  → { item:, playable:, song: } da próxima faixa promovida
  def skip
    return nil if current.nil?
    return false unless items.where(status: "queued").exists?
    advance
  end

  # /stop: esvazia a fila do guild. O bot vê pelo próximo poll de /queue (~500ms).
  # Bumpa a época: cancela a cadeia de jobs de playlist em voo, pra a fila não voltar
  # a se encher sozinha enquanto a cadeia drena (ver EnqueueEpochService).
  def stop
    EnqueueEpochService.bump!(@guild_id, @voice_channel_id)
    items.delete_all
    true
  end

  # /limpar_fila: apaga as faixas que AINDA vão tocar (status "queued"), mantendo a
  # atual ("current") tocando. Diferente do #stop, que esvazia tudo e libera o bot.
  # Retorna quantas faixas foram removidas. Cancela o prefetch implicitamente: a
  # próxima a baixar some da fila (o CacheProviderSongJob já agendado, se houver,
  # vira no-op — o item não existe mais).
  #
  # Bumpa a época também: como mantém a `current`, não dá pra inferir "limpei de
  # propósito" só pelo estado da fila — a cadeia de jobs de playlist que estivesse
  # enfileirando faixas re-encheria o que acabou de ser limpo. O bump cancela essa
  # cadeia (ver EnqueueEpochService); a faixa atual segue tocando.
  def clear_upcoming
    EnqueueEpochService.bump!(@guild_id, @voice_channel_id)
    items.where(status: "queued").delete_all
  end

  def current
    items.find_by(status: "current")
  end

  # Época de enfileiramento corrente do canal — o "carimbo" que a cadeia de jobs de
  # playlist carrega pra saber se foi cancelada (ver EnqueueEpochService). O /play
  # grava isto na cadeia que dispara; o stop/clear/clear_upcoming faz bump.
  def enqueue_epoch
    EnqueueEpochService.current(@guild_id, @voice_channel_id)
  end

  # A cadeia nascida em `born_epoch` foi cancelada por um stop/clear/clear_upcoming
  # posterior? Os jobs de enfileiramento checam isto antes de criar item / encadear.
  def enqueue_cancelled?(born_epoch)
    EnqueueEpochService.stale?(@guild_id, @voice_channel_id, born_epoch)
  end

  # Item da fila deste guild por id (pro bot pollar o status de cache).
  def find_item(id)
    items.find_by(id: id)
  end

  def list
    {
      current: current,
      upcoming: items.where(status: "queued").order(:position).to_a
    }
  end

  # Manipulação fina da fila (Épico 3): opera SÓ nas faixas que ainda vão tocar
  # (status "queued"), sem tocar na `current`. Posições expostas ao usuário são
  # 1-based sobre a lista de upcoming (a mesma ordem que o /queue mostra).

  # /shuffle: embaralha a ordem das faixas da fila. Renumera as positions logo
  # após a atual. Devolve quantas faixas foram embaralhadas (0/1 = nada a fazer).
  def shuffle_queue
    queued = items.where(status: "queued").order(:position).to_a
    return 0 if queued.size < 2

    renumber(queued.shuffle)
    queued.size
  end

  # /remove <posição>: remove a faixa na posição 1-based da fila de upcoming.
  # Devolve o item removido (pro log/reply) ou nil se a posição está fora do range.
  def remove_at(position)
    queued = items.where(status: "queued").order(:position).to_a
    idx = position.to_i - 1
    return nil if idx.negative? || idx >= queued.size

    item = queued.delete_at(idx)
    item.destroy!
    renumber(queued)
    item
  end

  # /move <de> <para>: move a faixa da posição `from` pra `to` (ambas 1-based na
  # fila de upcoming). Devolve o item movido ou nil se alguma posição é inválida.
  def move(from, to)
    queued = items.where(status: "queued").order(:position).to_a
    fi = from.to_i - 1
    ti = to.to_i - 1
    return nil if fi.negative? || fi >= queued.size || ti.negative? || ti >= queued.size

    item = queued.delete_at(fi)
    queued.insert(ti, item)
    renumber(queued)
    item
  end

  private

  # Reatribui positions contíguas às faixas de upcoming, logo após a atual (ou 0
  # se nada toca). played < current < queued, então nunca colide.
  def renumber(ordered)
    base = current&.position || 0
    PlayQueueItem.transaction do
      ordered.each_with_index { |it, i| it.update_column(:position, base + 1 + i) }
    end
  end

  def items
    PlayQueueItem.for_channel(@guild_id, @voice_channel_id)
  end

  def next_position
    (items.maximum(:position) || 0) + 1
  end

  def queued_count
    items.where(status: "queued").count
  end

  # Recusa faixas acima do limite ANTES de criar o item/agendar download — uma
  # faixa de ~1h ficaria baixando por minutos e enchendo o S3 à toa.
  def enforce_duration_limit!(candidate)
    return unless MAX_DURATION_SECONDS.positive?
    duration = candidate[:duration].to_i
    return if duration <= 0 || duration <= MAX_DURATION_SECONDS

    limit_min = MAX_DURATION_SECONDS / 60
    track_min = duration / 60
    raise TrackTooLongError,
          "Faixa muito longa (#{track_min} min). O limite é #{limit_min} min."
  end

  # Song existente pra alguma das URLs candidatas, para vincular ao item — esteja
  # ela cacheada (s3_url presente, toca direto e renova o TTL em #activate) ou
  # PURGADA (s3_url nil: vincula mesmo assim pro CacheProviderSongJob rebaixar e
  # repovoar a MESMA linha). Casa por source_url (fonte real do cache) ou
  # youtube_url (legado/imports da UI).
  #
  # Candidato do provider "musik" (URL /songs/:uuid) já traz o `song_id`
  # resolvido — usa-o direto, sem casar por URL.
  def linked_song_for(candidates)
    if (song_id = candidates.find { |c| c[:song_id] }&.dig(:song_id))
      return Song.find_by(id: song_id)
    end

    urls = candidates.map { |c| c[:canonical_url] }.compact
    return nil if urls.empty?
    Song.where(source_url: urls).or(Song.where(youtube_url: urls)).first
  end

  # Promove o item a `current` e devolve o `playable`.
  # Em cache: { item_id:, cached_url: s3_url, audio_format:, candidates: [] } —
  # toca direto (audio_format "opus" → pass-through no bot), e renova o TTL.
  # Sem cache: { item_id:, cached_url: nil, candidates: [...] } — o BOT tenta os
  # candidates com yt-dlp no próprio IP; se nenhum tocar, espera este cache S3
  # (agendado aqui) e toca o s3_url. Não resolvemos a
  # URL de stream aqui: ela ficaria travada no IP do Rails (assinatura por `ip=`)
  # e o ffmpeg do bot, em outro host, tomaria 403.
  # first_track: a faixa começa a tocar JÁ (fila estava vazia). Quando ela não tem
  # cache, agendamos o download SEM transcode pra opus (skip_transcode) — sobe no
  # formato nativo da fonte e o bot toca via ffmpeg, mas o áudio fica pronto mais
  # cedo. Só a 1ª faixa da sessão; as demais convertem pra opus (pass-through).
  def activate(item, first_track: false)
    item.update!(status: "current")

    if item.song&.s3_url.present?
      song = item.song
      song.update_columns(last_played_at: Time.current, play_count: song.play_count.to_i + 1)
      { item_id: item.id, cached_url: song.s3_url, audio_format: song.audio_format, candidates: [], source_query: nil }
    elsif item.stream_candidates.blank? && item.provider_url.present?
      # Item PROVISÓRIO (/play): ainda não resolvido. NÃO agenda o download aqui (sem
      # candidates pra baixar) — o ResolvePrimaryTrackJob resolve, preenche e agenda
      # o cache. O bot toca da fonte pela source_query (yt-dlp local).
      { item_id: item.id, cached_url: nil, audio_format: nil, candidates: [], source_query: item.provider_url }
    elsif item.cache_status == "live"
      # Live stream: nunca cacheia (o download não terminaria). O bot toca direto
      # da fonte via yt-dlp. Sem source_query (os candidates já estão resolvidos).
      # is_live: o bot desativa player_skip=js (live exige o player.js do YouTube).
      { item_id: item.id, cached_url: nil, audio_format: nil, candidates: item.stream_candidates, source_query: nil, is_live: true }
    else
      # Item já resolvido (candidates presentes): agenda o download e manda os
      # candidates pro bot.
      CacheProviderSongJob.perform_later(item.id, skip_transcode: first_track)
      { item_id: item.id, cached_url: nil, audio_format: nil, candidates: item.stream_candidates, source_query: nil }
    end
  end
end

class CacheProviderSongJob < ApplicationJob
  queue_as :default

  retry_on ProviderService::ResolveError, wait: :polynomially_longer, attempts: 3
  discard_on ActiveJob::DeserializationError

  # Baixa um item da fila pro S3, em background, e o liga a uma Song temporária —
  # pra quando chegar a vez dele tocar do cache, ou pro bot esperar o cache
  # quando nenhum stream imediato funcionar. Tenta os candidates em ordem e
  # cacheia o primeiro que baixar. Idempotente: não rebaixa item já cacheado.
  # skip_transcode: a 1ª faixa da sessão (fila estava vazia no /play) sobe o áudio
  # no formato NATIVO da fonte, sem transcode pra opus — começa a tocar mais rápido
  # (ver PlayQueueService#activate). As demais convertem pra opus (pass-through).
  def perform(play_queue_item_id, skip_transcode: false)
    item = PlayQueueItem.find_by(id: play_queue_item_id)
    return if item.nil?
    return if item.cache_status == "cached" && item.song_id.present?
    return if item.cache_status == "live" # live stream: nunca cacheia

    candidates = candidate_urls(item)
    return if candidates.empty?

    item.update!(cache_status: "caching")

    # Dedup: se a faixa já virou Song (import, cache anterior, ou item já
    # vinculado) por qualquer uma das URLs candidatas / pelo song_id, reusa.
    urls = candidates.map { |c| c[:url] }
    song = Song.find_by(id: item.song_id) ||
           Song.where(source_url: urls).or(Song.where(youtube_url: urls)).first

    # Song existente mas PURGADA (s3_url liberado do S3): rebaixa e repovoa a
    # MESMA linha — não cria duplicata nem deixa o item "cached" sem áudio.
    song = repopulate_or_download(song, candidates, item, skip_transcode)

    item.update!(song_id: song.id, cache_status: "cached")
  rescue => e
    item&.update(cache_status: "pending")
    Rails.logger.error("[CacheProviderSongJob] #{e.class}: #{e.message}")
    raise
  end

  private

  # [{ provider:, url: }] normalizadas, na ordem. Cai pro provider_url legado se
  # o item não tiver stream_candidates (faixas enfileiradas antes desta versão).
  def candidate_urls(item)
    list = Array(item.stream_candidates).map do |c|
      { provider: c["provider"], url: ProviderService.normalize_url(c["url"]) }
    end
    if list.empty? && item.provider_url.present?
      list = [ {
        provider: ProviderService.provider_from_url(item.provider_url).to_s,
        url:      ProviderService.normalize_url(item.provider_url)
      } ]
    end
    list.reject { |c| c[:url].blank? }
  end

  # Tenta baixar cada candidato em ordem; o primeiro que funcionar vira Song.
  # Se todos falharem, propaga o último erro (dispara o retry_on).
  def download_first_available(candidates, item, skip_transcode = false)
    last_error = nil
    candidates.each do |cand|
      song = try_download(cand, item, skip_transcode)
      return song if song
    rescue ProviderService::ResolveError => e
      last_error = e
      Rails.logger.warn("[CacheProviderSongJob] #{cand[:provider]} falhou: #{e.message}")
    end
    raise(last_error || ProviderService::ResolveError.new("nenhum provedor baixou (item ##{item.id})"))
  end

  # Vincula o item a uma Song com áudio no S3. Se `song` já existe e tem s3_url,
  # reusa. Se existe mas está PURGADA, rebaixa e repovoa a MESMA linha. Se não
  # existe, baixa e cria (ou dedup por fingerprint).
  def repopulate_or_download(song, candidates, item, skip_transcode = false)
    return song if song&.s3_url.present?
    return download_first_available(candidates, item, skip_transcode) if song.nil?

    # song purgada: baixa pela 1ª fonte que funcionar e repovoa a própria linha.
    last_error = nil
    candidates.each do |cand|
      result = ProviderService.download_to_s3(cand[:url], title: item.title.to_s, skip_transcode: skip_transcode)
      return repopulate!(song, result, cand) if result
    rescue ProviderService::ResolveError => e
      last_error = e
      Rails.logger.warn("[CacheProviderSongJob] repovoar ##{song.id} via #{cand[:provider]} falhou: #{e.message}")
    end
    raise(last_error || ProviderService::ResolveError.new("nenhum provedor rebaixou a song ##{song.id}"))
  end

  # Repovoa a Song purgada com o áudio recém-baixado, mantendo a mesma linha.
  def repopulate!(song, result, cand)
    song.update_columns(
      s3_key:         result[:s3_key],
      s3_url:         result[:s3_url],
      last_played_at: Time.current
    )
    song
  end

  def try_download(cand, item, skip_transcode = false)
    result = ProviderService.download_to_s3(cand[:url], title: item.title.to_s, skip_transcode: skip_transcode)

    Song.create!(
      s3_key:          result[:s3_key],
      s3_url:          result[:s3_url],
      source_provider: cand[:provider],
      source_url:      cand[:url],
      youtube_url:     (cand[:url] if cand[:provider] == "youtube"),
      title:           item.title,
      artist:          item.artist,
      duration:        item.duration,
      is_temporary:    true,
      last_played_at:  Time.current
    )
  end
end

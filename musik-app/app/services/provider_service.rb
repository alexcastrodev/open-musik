require "aws-sdk-s3"
require "open3"
require "json"

# Provider de áudio do YouTube. Resolve termos/URLs em metadata + URL canônica
# via yt-dlp, e baixa/sobe o áudio pro S3 (cache real). A busca por termo usa o
# prefixo ytsearch1: do yt-dlp.
#
# NÃO resolve a URL de stream direto (googlevideo etc.): ela fica travada no IP
# de quem baixa, então quem faz isso é o BOT, no próprio host, na hora de tocar
# (ver bot player.js). Aqui só damos a URL canônica (pro bot resolver o stream)
# e o cache S3 (download definitivo).
#
# Usado por:
#   - PlayQueueService / Api::GuildsController (fila do bot: metadata + cache)
#   - CacheProviderSongJob (download em background)
#   - ImportYoutubeJob (import permanente pela UI web)
class ProviderService
  YT_URL_RE = %r{(?:youtube\.com/|youtu\.be/)}i

  # URL do PRÓPRIO musik usada como provider: /songs/:uuid. Quando o bot recebe
  # uma dessas no /play, não vamos ao yt-dlp — a faixa já está no nosso S3.
  # Casa http(s)://<host>/songs/<uuid>, extraindo o uuid (group 1).
  MUSIK_SONG_URL_RE = %r{/songs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b}i

  # URL pertence a este musik? (qualquer host — confiamos no path /songs/:uuid).
  def self.musik_url?(query)
    query.to_s.match?(MUSIK_SONG_URL_RE)
  end

  # Prefixo de busca do yt-dlp (1 resultado). Sintaxe fixa do yt-dlp.
  SEARCH_PREFIX = { youtube: "ytsearch1:" }.freeze

  # Content-type do S3 por extensão do áudio. O download_audio entrega sempre
  # .opus hoje, mas o acervo antigo (e uploads manuais) tem outros formatos;
  # o content-type certo importa pro player web (<audio> HTML5) tocar.
  CONTENT_TYPES = {
    ".mp3"  => "audio/mpeg",
    ".m4a"  => "audio/mp4",
    ".aac"  => "audio/aac",
    ".opus" => "audio/opus",
    ".ogg"  => "audio/ogg",
    ".webm" => "audio/webm",
    ".flac" => "audio/flac",
    ".wav"  => "audio/wav"
  }.freeze

  # Único provedor. Mantido como lista pra resolve_all preservar o formato (lista
  # de candidatos) esperado pelos callers.
  PROVIDERS = %i[youtube].freeze

  class ResolveError < StandardError; end

  # Timeout do download (via utilitário `timeout` do coreutils — mais seguro que
  # Timeout.timeout, que não mata o processo filho). Sem isso, um yt-dlp pendurado
  # segura um worker do Sidekiq pra sempre. As LEITURAS (resolve/metadata/
  # flat-playlist) voltaram a rodar AQUI, local no worker (o serviço extractor foi
  # removido) — ver run_ytdlp_json; o download_audio sempre usou run_ytdlp local.
  RESOLVE_TIMEOUT_S  = ENV.fetch("YTDLP_RESOLVE_TIMEOUT", "30")
  DOWNLOAD_TIMEOUT_S = ENV.fetch("YTDLP_DOWNLOAD_TIMEOUT", "600")

  # Runtime JS que o yt-dlp usa pra decifrar o player do YouTube (exigido desde a
  # deprecação 2025). A imagem do musik-app traz o Deno (ver Dockerfile); o
  # extractor usava quickjs (mais leve), mas mantemos o Deno aqui pra não instalar
  # mais um runtime. Vazio desliga a flag (cai no default do yt-dlp).
  YTDLP_JS_RUNTIME = ENV.fetch("YTDLP_JS_RUNTIME", "deno")

  # Roda yt-dlp com timeout. `timeout` sai com 124 quando estoura; o caller só
  # vê status de falha e levanta ResolveError. Usado pelo download_audio E pelas
  # leituras (run_ytdlp_json).
  def self.run_ytdlp(*args, timeout: DOWNLOAD_TIMEOUT_S)
    out, err, status = Open3.capture3("timeout", timeout.to_s, "yt-dlp", *args)
    err = "timed out after #{timeout}s" if !status.success? && status.exitstatus == 124 && err.strip.empty?
    [ out, err, status ]
  end

  # Roda uma LEITURA do yt-dlp (resolve/metadata/flat-playlist) e devolve o JSON
  # parseado do stdout. Local no worker — substitui o ExtractorClient (serviço
  # removido). Prefixa o runtime JS (YTDLP_JS_RUNTIME). Levanta ResolveError em
  # falha de status, timeout ou JSON inválido — o mesmo erro que os callers já
  # tratam (antes vinha do ExtractorClient::ExtractorError). `timeout` curto
  # (RESOLVE_TIMEOUT_S): leitura não baixa nada.
  def self.run_ytdlp_json(*args)
    runtime = YTDLP_JS_RUNTIME.to_s.strip.empty? ? [] : [ "--js-runtimes", YTDLP_JS_RUNTIME ]
    out, err, status = run_ytdlp(*runtime, *args, timeout: RESOLVE_TIMEOUT_S)
    raise ResolveError, "yt-dlp falhou: #{err.strip}" unless status.success?
    JSON.parse(out)
  rescue JSON::ParserError => e
    raise ResolveError, "yt-dlp devolveu JSON inválido: #{e.message}"
  end

  # Resolve um termo livre OU uma URL em metadata + URL canônica, sem baixar nada
  # (rápido). Termo → primeiro resultado da busca no `provider`. URL → resolve a
  # própria URL (o provedor é inferido pela URL, não pelo argumento).
  # Retorna { provider:, canonical_url:, title:, artist:, duration: } ou nil.
  def self.resolve(url_or_term, provider: :youtube)
    input = url_or_term.to_s.strip
    return nil if input.empty?

    is_url = input.match?(YT_URL_RE)
    target = is_url ? input : "#{SEARCH_PREFIX.fetch(provider)}#{input}"

    # Resolve local no worker (yt-dlp + Deno), espelhando os args que o extractor
    # usava (--dump-single-json --no-playlist --skip-download). run_ytdlp_json já
    # levanta ResolveError em falha/timeout/JSON inválido.
    meta = run_ytdlp_json("--dump-single-json", "--no-playlist", "--skip-download", target)
    # ytsearch retorna um objeto de playlist com `entries`; pega o primeiro
    # não-nulo (provedor bloqueado pode devolver [null]).
    meta = meta["entries"].compact.first if meta["entries"].is_a?(Array)
    return nil if meta.nil?

    {
      provider:      is_url ? provider_from_url(input) : provider,
      canonical_url: normalize_url(meta["webpage_url"] || meta["original_url"] || input),
      title:         meta["title"].to_s.strip,
      artist:        meta["uploader"].to_s.strip,
      duration:      meta["duration"].to_i,
      is_live:       meta["is_live"] == true
    }
  end

  # Resolve a query em todos os PROVIDERS (na ordem) e devolve a lista dos que
  # responderam, na mesma ordem. Vazia se ninguém achou. Um provedor que falha
  # (ex.: YouTube barrado) não derruba os outros.
  #
  # URL do Spotify: o yt-dlp não baixa de lá (DRM), então traduzimos a 1ª faixa
  # em termo de busca (via SpotifyService) e resolvemos esse termo no YouTube.
  # As demais faixas (playlist/album) ficam pro EnqueueSpotifyTracksJob — ver
  # spotify_terms e PlayQueueService#enqueue.
  def self.resolve_all(query)
    # URL do próprio musik: a faixa já está no nosso S3. Resolve local, sem
    # yt-dlp. UUID inexistente → [] (o caller responde "nada encontrado"); não
    # cai pros outros providers (uma URL do musik é sempre tratada como local).
    return resolve_musik(query) if musik_url?(query)

    if SpotifyService.spotify_url?(query)
      first_term = spotify_terms(query).first
      return [] if first_term.nil?
      return resolve_all(first_term)
    end

    PROVIDERS.filter_map do |provider|
      begin
        resolve(query, provider: provider)
      rescue ResolveError => e
        Rails.logger.warn("[ProviderService] #{provider} resolve falhou: #{e.message}")
        nil
      end
    end
  end

  # Resolve uma URL /songs/:uuid do musik na Song local correspondente. Devolve
  # um único candidato no MESMO formato dos outros providers, mais `song_id` —
  # que o PlayQueueService usa pra ligar a Song cacheada direto (sem casar por
  # URL). [] se o uuid não existe (faixa apagada/purgada).
  def self.resolve_musik(query)
    uuid = query.to_s[MUSIK_SONG_URL_RE, 1]
    return [] if uuid.nil?

    song = Song.find_by(uuid: uuid)
    return [] if song.nil? || song.s3_url.blank?

    [ {
      provider:      :musik,
      canonical_url: query.to_s.strip,
      song_id:       song.id,
      title:         song.display_title,
      artist:        song.display_artist,
      duration:      song.duration.to_i
    } ]
  end

  # Termos de busca ("artista nome") das faixas de uma URL do Spotify, na ordem.
  # [] se não for Spotify, sem credenciais, ou em falha de API. Track → 1 termo;
  # playlist/album → N termos.
  def self.spotify_terms(query)
    return [] unless SpotifyService.spotify_url?(query)
    SpotifyService.tracks(query)
  end

  # Resolve um termo/URL no provider e GARANTE uma Song cacheada no S3 — usado
  # quando precisamos da faixa pronta de uma vez (ex.: montar uma playlist do
  # bot, ver BuildPlaylistJob), e não só enfileirada com cache lookahead.
  #
  # Reusa a Song existente se a URL/fingerprint já bate (dedup), senão baixa e
  # cria uma Song temporária. Retorna a Song, ou nil se nada resolver.
  def self.resolve_and_cache(term)
    candidate = resolve_all(term).first
    return nil if candidate.nil?

    url = candidate[:canonical_url]

    # Reusa a Song existente (por song_id do provider musik, ou por URL) se ela
    # ainda tem áudio no S3. Se estiver PURGADA, segue pro download e repovoa a
    # MESMA linha abaixo — sem criar duplicata.
    existing = if candidate[:song_id]
      Song.find_by(id: candidate[:song_id])
    else
      Song.where(source_url: url).or(Song.where(youtube_url: url)).first
    end
    return existing if existing&.s3_url.present?

    result = download_to_s3(url, title: candidate[:title].to_s)

    # Repovoa a linha purgada (achada por URL/song_id) em vez de criar duplicata.
    if existing&.unavailable? && result
      existing.update_columns(
        s3_key:         result[:s3_key],
        s3_url:         result[:s3_url],
        last_played_at: Time.current
      )
      return existing
    end

    Song.create!(
      s3_key:          result[:s3_key],
      s3_url:          result[:s3_url],
      source_provider: candidate[:provider].to_s,
      source_url:      url,
      youtube_url:     (url if candidate[:provider] == :youtube),
      title:           candidate[:title],
      artist:          candidate[:artist],
      duration:        candidate[:duration],
      is_temporary:    true,
      last_played_at:  Time.current
    )
  end

  # Baixa o áudio (codec da fonte, sem re-encode) e sobe pro S3. Retorna
  # { s3_key:, s3_url: }. O dedup acontece ANTES do download, por URL/song_id
  # (ver resolve_and_cache e CacheProviderSongJob).
  # skip_transcode: pula a extração pra .opus e sobe o áudio no formato NATIVO da
  # fonte (m4a/webm/...). Usado pela 1ª faixa da sessão (ver PlayQueueService),
  # que começa a tocar JÁ: evitar o transcode encurta o tempo até o som sair. As
  # demais faixas convertem pra opus normalmente (pass-through no bot).
  def self.download_to_s3(canonical_url, title:, skip_transcode: false)
    Dir.mktmpdir("provider_") do |tmpdir|
      audio_path = download_audio(canonical_url, tmpdir, skip_transcode: skip_transcode)
      s3_key, s3_url = upload_to_s3(audio_path, title)
      { s3_key: s3_key, s3_url: s3_url }
    end
  end

  # Provedor a partir da URL canônica (pra rotular a Song cacheada).
  def self.provider_from_url(url)
    return :youtube if url.to_s.match?(YT_URL_RE)
    :unknown
  end

  # Normaliza a URL do YouTube pra forma canônica (dedup via diferentes formas de
  # URL). URLs que não casam voltam como estão.
  def self.normalize_url(url)
    if (match = url.to_s.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/))
      "https://www.youtube.com/watch?v=#{match[1]}"
    else
      url.to_s.strip
    end
  end

  # Metadata de uma URL (sem resolver busca). Local no worker, args do extractor
  # (--dump-json --no-playlist). Levanta ResolveError em falha (via run_ytdlp_json).
  def self.fetch_metadata(url)
    run_ytdlp_json("--dump-json", "--no-playlist", url.to_s)
  end

  # Lista flat de uma playlist (só os ids das faixas, sem resolver cada vídeo).
  # Local no worker, args do extractor (--flat-playlist --dump-single-json
  # --skip-download). Usado pelo YoutubePlaylistService. Levanta ResolveError em
  # falha (via run_ytdlp_json).
  def self.flat_playlist(url)
    run_ytdlp_json("--flat-playlist", "--dump-single-json", "--skip-download", url.to_s)
  end

  # Seletor de formato do yt-dlp: o melhor stream SÓ-de-áudio, ou o melhor geral
  # se a fonte não separar áudio (bestaudio/best). Sobrescreve com YTDLP_FORMAT.
  FORMAT = ENV.fetch("YTDLP_FORMAT", "bestaudio/best")

  # Ordem de preferência ENTRE os formatos que casam com FORMAT (yt-dlp -S):
  # primeiro garante que tem áudio (hasaud), depois prefere codec Opus na origem
  # (acodec:opus — com --audio-format opus abaixo, vira remux sem transcode),
  # depois maior bitrate (abr) e sample rate (asr). O YouTube não oferece
  # lossless (teto Opus ~160k), mas o sort garante o stream de maior qualidade
  # disponível. Sobrescreve com YTDLP_FORMAT_SORT.
  FORMAT_SORT = ENV.fetch("YTDLP_FORMAT_SORT", "hasaud,acodec:opus,abr,asr")

  # Baixa o áudio e entrega SEMPRE .opus (container Ogg): é o formato que o
  # Discord aceita nativo, então o bot toca em pass-through (sem decode/encode
  # por play — ver bot/src/player/GuildPlayer.js). Quando a fonte já é Opus
  # (caso típico do YouTube, reforçado pelo acodec:opus do FORMAT_SORT) o
  # yt-dlp REMUXA com -c:a copy — lossless, sem geração extra de perda; só
  # fontes m4a/aac sofrem um transcode, uma única vez aqui no worker. Quem sobe
  # (upload_to_s3) deriva extensão e content-type do arquivo; o player web
  # depende do content-type certo (ver CONTENT_TYPES).
  # Teto de download: /tmp é tmpfs de 512M no worker (ver .ci/stack.yml) e o
  # fallback `best` do FORMAT pode trazer vídeo completo. 450M deixa margem pra
  # extração do opus e falha com mensagem clara em vez de ENOSPC no meio.
  MAX_FILESIZE = ENV.fetch("YTDLP_MAX_FILESIZE", "450M")

  # skip_transcode: omite --extract-audio/--audio-format opus, então o yt-dlp
  # entrega o stream de áudio no container nativo (m4a/webm/...) sem transcode —
  # zero conversão, download mais curto. upload_to_s3 deriva extensão/content-type
  # do arquivo e Song#audio_format vira != "opus", caindo no caminho ffmpeg do bot.
  def self.download_audio(url, tmpdir, skip_transcode: false)
    output_template = File.join(tmpdir, "%(id)s.%(ext)s")
    extract_args = skip_transcode ? [] : [ "--extract-audio", "--audio-format", "opus" ]
    out, err, status = run_ytdlp(
      "--no-playlist",
      "--format", FORMAT,
      "--format-sort", FORMAT_SORT,
      "--max-filesize", MAX_FILESIZE,
      *extract_args,
      "--output", output_template,
      url,
      timeout: DOWNLOAD_TIMEOUT_S
    )
    raise ResolveError, "yt-dlp download failed: #{err.strip}" unless status.success?

    audio = Dir.glob(File.join(tmpdir, "*")).find { |f| File.file?(f) }
    unless audio
      # --max-filesize "pula" o download e sai com status 0; sem este check o
      # estouro do teto viraria o erro genérico de arquivo não encontrado.
      if "#{out}#{err}".include?("max-filesize")
        raise ResolveError, "Download exceeds #{MAX_FILESIZE} (YTDLP_MAX_FILESIZE)"
      end
      raise ResolveError, "Audio file not found after download"
    end
    audio
  end

  def self.upload_to_s3(audio_path, title)
    s3 = Aws::S3::Client.new(
      access_key_id:     ENV["S3_ACCESS_KEY_ID"],
      secret_access_key: ENV["S3_SECRET_ACCESS_KEY"],
      region:            ENV.fetch("AWS_REGION", "us-east-1"),
      endpoint:          ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"],
      force_path_style:  true
    )

    bucket       = ENV["S3_BUCKET"]
    public_base  = (ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"]).to_s.chomp("/")
    ext          = File.extname(audio_path).downcase
    content_type = CONTENT_TYPES.fetch(ext, "application/octet-stream")
    filename     = "#{SecureRandom.hex(8)}_#{sanitize_filename(title)}#{ext}"
    s3_key       = "tracks/#{filename}"

    File.open(audio_path, "rb") do |file|
      s3.put_object(bucket: bucket, key: s3_key, body: file, content_type: content_type)
    end

    s3_url = "#{public_base}/#{bucket}/#{s3_key}"
    [ s3_key, s3_url ]
  end

  def self.sanitize_filename(name)
    name.to_s.gsub(/[^\w\-]/, "_").gsub(/__+/, "_").slice(0, 60)
  end
end

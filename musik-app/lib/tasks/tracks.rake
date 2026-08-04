namespace :tracks do
  desc "Import MP3 files from tmp/tracks/ to S3 and save to database"
  task import: :environment do
    ImportLocalTracksJob.perform_now
  end

  desc "Upload local files from tmp/tracks/ to S3, then sync S3 → database"
  task sync: :environment do
    # 1. Upload arquivos locais de tmp/tracks/ que ainda não estão no S3/DB
    tracks_dir = Rails.root.join("tmp", "tracks")
    mp3_files  = Dir.glob(tracks_dir.join("**", "*.{mp3,flac,ogg,wav,m4a,aac}"))

    uploaded = 0
    if mp3_files.any?
      require "aws-sdk-s3"
      s3          = build_s3_client
      bucket      = ENV["S3_BUCKET"]
      public_base = (ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"]).to_s.chomp("/")

      mp3_files.each do |path|
        filename = File.basename(path)
        s3_key   = "tracks/#{filename}"

        if Song.exists?(s3_key: s3_key)
          puts "  skip (already in db): #{filename}"
          next
        end

        # verifica se já está no S3
        begin
          s3.head_object(bucket: bucket, key: s3_key)
          puts "  skip (already in s3): #{filename}"
        rescue Aws::S3::Errors::NotFound
          print "  uploading #{filename}... "
          File.open(path, "rb") do |file|
            s3.put_object(bucket: bucket, key: s3_key, body: file)
          end
          puts "done"
          uploaded += 1
        end
      rescue => e
        puts "  ERROR #{filename}: #{e.message}"
      end
    end

    puts "Uploaded #{uploaded} file(s) from tmp/tracks/."

    # 2. Sync S3 → banco: adiciona qualquer áudio no S3 que não está no DB
    synced = S3BrowserService.new.sync_songs!
    puts "Synced #{synced.size} new song(s) from S3."

    # 3. Enrich metadata para todos os novos
    new_songs = synced
    new_songs.each { |song| EnrichSongMetadataJob.perform_later(song.id) }
    puts "Enqueued metadata enrichment for #{new_songs.size} song(s)."
  end

  desc "Migra o acervo S3 para .opus (pass-through no bot). DRY_RUN=1 só lista; LIMIT=n processa n faixas"
  task to_opus: :environment do
    require "open3"
    require "tmpdir"

    scope = Song.actives.where.not("s3_key LIKE ?", "%.opus")
    scope = scope.limit(Integer(ENV["LIMIT"])) if ENV["LIMIT"].present?
    total = scope.count

    if ENV["DRY_RUN"].present?
      scope.each { |s| puts "  #{s.id}  #{s.s3_key}" }
      puts "DRY_RUN: #{total} faixa(s) seriam migradas para .opus."
      next
    end

    s3 = S3BrowserService.new
    migrated = { remux: 0, transcode: 0 }
    failed = 0

    scope.find_each do |song|
      old_key = song.s3_key
      new_key = old_key.sub(/\.[^.]+\z/, ".opus")

      Dir.mktmpdir("to_opus_") do |tmpdir|
        src = File.join(tmpdir, "in#{File.extname(old_key)}")
        dst = File.join(tmpdir, "out.opus")
        s3.download_object(old_key, src)

        # Fonte já em Opus (webm/ogg do YouTube) → só troca o container, sem
        # re-encode (lossless). Qualquer outro codec → um transcode, único na
        # vida da faixa, em vez de um decode a cada play no bot.
        codec, = Open3.capture3("ffprobe", "-v", "error", "-select_streams", "a:0",
                                "-show_entries", "stream=codec_name",
                                "-of", "default=nw=1:nk=1", src)
        kind = codec.strip == "opus" ? :remux : :transcode
        args = kind == :remux ? [ "-c:a", "copy" ] : [ "-c:a", "libopus", "-b:a", "128k", "-vbr", "on" ]
        _out, err, status = Open3.capture3("ffmpeg", "-y", "-nostdin", "-i", src, "-vn", *args, dst)
        raise "ffmpeg: #{err.strip.lines.last}" unless status.success? && File.size?(dst)

        s3.put_object(new_key, dst, ".opus")
        # audio_fingerprint fica intocado: é chromaprint acústico da gravação,
        # recomputar após transcode poderia quebrar o dedup futuro.
        song.update!(s3_key: new_key, s3_url: s3.public_url_for(new_key))
        s3.delete_object(old_key)

        migrated[kind] += 1
        puts "  ok (#{kind}): #{old_key} → #{new_key}"
      end
    rescue => e
      failed += 1
      puts "  ERROR song #{song.id} (#{old_key}): #{e.message}"
    end

    puts "Migradas #{migrated[:remux] + migrated[:transcode]}/#{total} (#{migrated[:remux]} remux, #{migrated[:transcode]} transcode), #{failed} falha(s)."
  end

  desc "Limpa faixas temporárias expiradas (TTL de cache) — apaga S3 + registro"
  task purge_temporary: :environment do
    PurgeTemporarySongsJob.perform_now
    puts "Purge concluído (faixas temporárias além do TTL de #{PurgeTemporarySongsJob::CACHE_TTL.inspect})."
  end

  desc "Limpa TODAS as faixas temporárias, ignorando o TTL — apaga S3 + registro"
  task purge_temporary_all: :environment do
    s3      = S3BrowserService.new
    scope   = Song.where(is_temporary: true)
    total   = scope.count
    removed = 0

    scope.find_each do |song|
      s3.delete_object(song.s3_key)
      song.destroy!
      removed += 1
    rescue => e
      puts "  ERROR song #{song.id}: #{e.message}"
    end

    puts "Removidas #{removed}/#{total} faixa(s) temporária(s)."
  end
end

def build_s3_client
  require "aws-sdk-s3"
  Aws::S3::Client.new(
    access_key_id:     ENV["S3_ACCESS_KEY_ID"],
    secret_access_key: ENV["S3_SECRET_ACCESS_KEY"],
    region:            ENV.fetch("AWS_REGION", "us-east-1"),
    endpoint:          ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"],
    force_path_style:  true
  )
end

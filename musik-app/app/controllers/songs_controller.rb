class SongsController < ApplicationController
  def index
    top_songs = Song.actives.where("play_count > 0").order(play_count: :desc).limit(20)

    render inertia: "Songs/Index", props: {
      display_items: SongDisplayService.display_items(query: params[:q]),
      top_songs: top_songs.map { |s| SongDisplayService.song_json(s) },
      query: params[:q].to_s
    }
  end

  # GET /songs/:identifier  (identifier = Song#uuid)
  # Página pública da música: serve para copiar a URL canônica que o bot
  # reconhece como provider próprio (ver ProviderService.resolve_all).
  def show
    song = Song.find_by_param!(params[:id])

    render inertia: "Songs/Show", props: {
      song: SongDisplayService.song_json(song),
      public_url: song_url(song)
    }
  rescue ActiveRecord::RecordNotFound
    render inertia: "Songs/NotFound", props: {}, status: :not_found
  end

  def import_youtube
    url = params[:youtube_url].to_s.strip

    if url.blank?
      render json: { error: "URL não informada" }, status: :unprocessable_entity
      return
    end

    canonical = normalize_youtube_url(url)
    if Song.exists?(youtube_url: canonical)
      render json: { error: "Essa música já foi importada." }, status: :unprocessable_entity
      return
    end

    import_id = SecureRandom.hex(8)
    YoutubeImport.create!(import_id: import_id, youtube_url: canonical, status: "processing", message: "Na fila...")
    ImportYoutubeJob.perform_later(url, import_id)

    render json: { import_id: import_id }
  end

  def imports
    imports = YoutubeImport.recent
    render json: imports.map { |i| import_json(i) }
  end

  def retry_import
    imp = YoutubeImport.find_by(import_id: params[:import_id])
    return render json: { error: "Import não encontrado" }, status: :not_found unless imp
    return render json: { error: "Apenas imports com erro podem ser refeitos" }, status: :unprocessable_entity unless imp.status == "error"

    imp.update!(status: "processing", message: "Na fila...")
    ImportYoutubeJob.perform_later(imp.youtube_url, imp.import_id)

    render json: { import_id: imp.import_id }
  end

  def upload
    files = Array(params[:files])
    return render json: { error: "Nenhum ficheiro enviado" }, status: :unprocessable_entity if files.empty?

    queued = AudioUploadService.new.enqueue(files)
    render json: { queued: queued }
  end

  def sync
    synced = S3BrowserService.new.sync_songs!
    synced.each { |song| EnrichSongMetadataJob.perform_later(song.id) }
    render json: { synced: synced.size }
  end

  def play
    song = Song.find(params[:id])
    song.increment!(:play_count)
    render json: SongDisplayService.song_json(song)
  end

  def update
    song = Song.find(params[:id])
    song.update!(song_params)
    render json: { ok: true }
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  # Libera o arquivo do S3 mas MANTÉM a Song e os playlist_songs: a música
  # continua nas playlists e é rebaixada (source_url/youtube_url) ao tocar.
  # Recusa uploads manuais (sem fonte pra rebaixar) — esses só via #destroy.
  def purge
    song = Song.find(params[:id])
    unless song.reacquirable?
      return render json: { error: "Música enviada manualmente: sem fonte para rebaixar. Use \"Excluir de vez\"." },
                    status: :unprocessable_entity
    end
    song.purge_audio!
    render json: { ok: true, unavailable: true }
  end

  # Exclui DE VEZ: apaga o arquivo do S3 e o registro da Song. Os playlist_songs
  # caem junto (dependent: :destroy) — a música some de todas as playlists.
  def destroy
    song = Song.find(params[:id])
    S3BrowserService.new.delete_object(song.s3_key) if song.s3_key.present?
    song.destroy!
    render json: { ok: true }
  end

  private

  def import_json(imp)
    {
      import_id: imp.import_id,
      youtube_url: imp.youtube_url,
      status: imp.status,
      message: imp.message,
      created_at: imp.created_at
    }
  end

  def song_params
    params.require(:song).permit(:title, :artist, :album, :version_label)
  end

  def normalize_youtube_url(url)
    if (match = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/))
      "https://www.youtube.com/watch?v=#{match[1]}"
    else
      url.strip
    end
  end
end

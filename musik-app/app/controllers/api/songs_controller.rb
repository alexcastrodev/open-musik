module Api
  # API JSON consumida pelo bot do Discord (rede interna, ver bot/).
  class SongsController < ApiController
    # GET /api/songs?q=...&limit=25
    # Lista plana de músicas para busca/autocomplete.
    def index
      limit = params[:limit].to_i
      limit = 25 if limit <= 0 || limit > 50
      songs = SongDisplayService.search(query: params[:q], limit: limit)
      render json: { songs: songs }
    end

    # GET /api/songs/:id
    def show
      song = Song.find_by(id: params[:id])
      return render json: { error: "not found" }, status: :not_found unless song

      render json: { song: SongDisplayService.song_json(song) }
    end

    # POST /api/songs/:id/play
    # Atalho legado: enfileira o efeito de play via BotActionJob (fila :discord)
    # em vez de incrementar síncrono. O caminho canônico do bot é POST /api/actions.
    def play
      song = Song.find_by(id: params[:id])
      return render json: { error: "not found" }, status: :not_found unless song

      action = BotAction.create!(
        kind: "play",
        song_id: song.id,
        payload: { "song_id" => song.id },
        idempotency_key: "play-#{song.id}-#{SecureRandom.hex(8)}"
      )
      BotActionJob.set(priority: action.job_priority).perform_later(action.id)

      render json: { song: SongDisplayService.song_json(song), enqueued: true }
    end
  end
end

module Api
  # Music quiz (Épico 3): sorteia uma faixa do histórico do servidor pro bot
  # tocar ~15s (blind test), registra pontos e serve o placar da temporada. A
  # rodada em si (resposta, quem já acertou) é efêmera e vive no bot; aqui só o
  # sorteio da faixa e o placar persistente.
  class QuizController < ApiController
    # GET /api/guilds/:guild_id/quiz/track → { query, title, artist }
    # Faixa aleatória que já tocou no servidor e é tocável (S3 ou YouTube). `query`
    # é o que o bot toca; title/artist são a RESPOSTA (o bot guarda, não mostra).
    def track
      guild = params[:guild_id].to_s
      song_ids = ServerLog.for_guild(guild).where(kind: "play")
                          .where.not(song_id: nil).distinct.pluck(:song_id)

      song = Song.where(id: song_ids)
                 .where("s3_url IS NOT NULL OR youtube_url IS NOT NULL")
                 .order(Arel.sql("RANDOM()")).first
      if song.nil?
        return render_error("Sem histórico suficiente pra um quiz. Toquem algumas músicas primeiro!", :not_found)
      end

      query = song.s3_url.present? ? "/songs/#{song.uuid}" : song.youtube_url
      render json: { query: query, title: song.title, artist: song.artist }
    end

    # POST /api/guilds/:guild_id/quiz/score { discord_user_id, username, season, points }
    def score
      uid = params[:discord_user_id].to_s
      return render_error("discord_user_id é obrigatório.", :unprocessable_entity) if uid.blank?

      season = params[:season].presence || QuizScore.current_season
      points = params[:points].present? ? params[:points].to_i : 1
      total = QuizScore.award!(
        guild_id: params[:guild_id], user_id: uid, username: params[:username], season: season, points: points
      )
      render json: { points: total, season: season }
    end

    # GET /api/guilds/:guild_id/quiz/scoreboard?season=
    def scoreboard
      season = params[:season].presence || QuizScore.current_season
      rows = QuizScore.scoreboard(params[:guild_id], season: season)
      render json: {
        season: season,
        scores: rows.each_with_index.map do |r, i|
          { rank: i + 1, discord_user_id: r.discord_user_id, username: r.username, points: r.points }
        end
      }
    end

    private

    def render_error(message, status)
      render json: { error: message }, status: status
    end
  end
end

module Api
  # Playlists do bot do Discord (criadas via /criar_playlist, tocadas via
  # /playlist). Pertencem a um discord_user_id; ver Playlist#for_discord_user.
  # As faixas são resolvidas no YouTube em background (BuildPlaylistJob) e
  # tocadas reusando a fila do guild (PlayQueueService). Rede interna, sem auth
  # (ver ApiController).
  class PlaylistsController < ApiController
    # GET /api/playlists?discord_user_id=...&q=...&limit=25
    # Autocomplete: playlists do usuário, filtradas por nome (q). Sem q, lista
    # as mais recentes. Devolve o necessário pro autocomplete do bot (id, name).
    def index
      uid = params[:discord_user_id].to_s
      return render json: { playlists: [] } if uid.empty?

      limit = params[:limit].to_i
      limit = 25 if limit <= 0 || limit > 25

      scope = Playlist.for_discord_user(uid)
      if params[:q].present?
        scope = scope.where("name ILIKE ?", "%#{Playlist.sanitize_sql_like(params[:q])}%")
      end

      playlists = scope.order(created_at: :desc).limit(limit).map { |p| playlist_json(p) }
      render json: { playlists: playlists }
    end

    # POST /api/playlists  body: { source:, name:, discord_user_id: }
    # `source` = URL de playlist/album/track do Spotify OU um título/artista
    # avulso. Cria a playlist já (resposta rápida) e resolve as faixas no
    # YouTube em background (BuildPlaylistJob). Track única do Spotify ou termo
    # avulso → 1 faixa; playlist/album do Spotify → N faixas.
    def create
      uid  = params[:discord_user_id].to_s
      name = params[:name].to_s.strip
      source = params[:source].to_s.strip
      return render_error("Informe o nome da playlist.", :unprocessable_entity) if name.empty?
      return render_error("Informe uma música ou playlist.", :unprocessable_entity) if source.empty?

      # Spotify (DRM): vira N termos "artista nome". Qualquer outra coisa (texto
      # ou URL do YouTube) é um termo só que o BuildPlaylistJob resolve direto.
      terms = ProviderService.spotify_terms(source)
      terms = [ source ] if terms.empty?

      playlist = Playlist.create!(
        name: name,
        discord_user_id: uid,
        build_status: "building"
      )
      BuildPlaylistJob.perform_later(playlist.id, terms)

      render json: {
        playlist: playlist_json(playlist),
        track_count: terms.size
      }, status: :created
    end

    # POST /api/playlists/:id/channels/:channel_id/enqueue
    # body: { guild_id:, requested_by?, voice_channel_name? }
    # SÓ CATÁLOGO: ativa a 1ª faixa na fila do canal (devolve `playable`) e agenda o
    # resto em background (EnqueuePlaylistJob) na MESMA fila. NÃO decide pool — quem
    # escolhe qual bot toca é o BOT (pool no bot-cache); ele já escolheu o canal
    # (vai na rota) antes de chamar. Espelha o guilds#enqueue do /play.
    def enqueue
      playlist = Playlist.find_by(id: params[:id])
      return render_error("Playlist não encontrada.", :not_found) if playlist.nil?

      guild_id = params[:guild_id].to_s
      channel_id = params[:channel_id].to_s
      return render_error("guild_id é obrigatório.", :unprocessable_entity) if guild_id.empty?

      song_ids = playlist.playlist_songs.pluck(:song_id)
      if song_ids.empty?
        msg = playlist.building? ? "A playlist ainda está sendo montada." : "A playlist está vazia."
        return render_error(msg, :unprocessable_entity)
      end

      requested_by = params[:requested_by].to_s
      rest = song_ids.drop(1)
      svc = PlayQueueService.new(guild_id, channel_id)

      result = svc.enqueue_song(Song.find_by(id: song_ids.first), requested_by: requested_by, playlist_id: playlist.id)
      return render_error("Não foi possível tocar a playlist.", :unprocessable_entity) if result.nil?
      # As demais entram em background na fila do mesmo canal-alvo. Carimba a época
      # corrente: um parar/limpar posterior cancela este job (ver EnqueueEpochService).
      EnqueuePlaylistJob.perform_later(guild_id, channel_id, requested_by, rest, playlist.id, svc.enqueue_epoch) if rest.any?

      bg = BotGuild.where(discord_guild_id: guild_id).order(updated_at: :desc).first
      ServerLog.record("play", guild_id: guild_id, guild_name: bg&.name,
        channel_id: channel_id, channel_name: params[:voice_channel_name].to_s.presence,
        item: result[:item], actor: requested_by, bot_client_id: params[:client_id].to_s,
        detail: "playlist \"#{playlist.name}\" (#{song_ids.size} faixa(s))")

      render json: {
        playable: result[:playable],
        started_now: result[:started_now],
        position: result[:position],
        item: item_json(result[:item]),
        enqueued: song_ids.size,
        building: playlist.building?
      }, status: :created
    end

    # POST /api/playlists/:id/add_track  body: { source: }
    # Adiciona faixa(s) a uma playlist existente. `source` segue a mesma regra do
    # #create: URL do Spotify (1 ou N faixas), link do YouTube ou nome/artista
    # avulso. As faixas são resolvidas no YouTube em background (BuildPlaylistJob,
    # que faz find_or_create e respeita a UNIQUE [playlist_id, song_id] — não
    # duplica). Marca a playlist como "building" enquanto resolve.
    def add_track
      playlist = Playlist.find_by(id: params[:id])
      return render_error("Playlist não encontrada.", :not_found) if playlist.nil?

      source = params[:source].to_s.strip
      return render_error("Informe uma música ou playlist.", :unprocessable_entity) if source.empty?

      terms = ProviderService.spotify_terms(source)
      terms = [ source ] if terms.empty?

      playlist.update!(build_status: "building")
      BuildPlaylistJob.perform_later(playlist.id, terms)

      render json: {
        playlist: playlist_json(playlist),
        track_count: terms.size
      }, status: :accepted
    end

    private

    def playlist_json(playlist)
      {
        id: playlist.id,
        name: playlist.name,
        build_status: playlist.build_status,
        track_count: playlist.playlist_songs.count
      }
    end


    def render_error(message, status)
      render json: { error: message }, status: status
    end
  end
end

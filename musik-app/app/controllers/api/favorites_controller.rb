module Api
  # Favoritos por usuário (Épico 3). O bot favorita a faixa que está tocando
  # (create lê a `current` do canal), lista (index) e remove (destroy). O
  # /play favs enfileira as `query` de cada favorito. Rede interna, sem auth.
  class FavoritesController < ApiController
    # GET /api/favorites?discord_user_id=
    def index
      favs = Favorite.for_user(params[:discord_user_id].to_s).recent.limit(100)
      render json: {
        favorites: favs.each_with_index.map { |f, i| fav_json(f, i + 1) }
      }
    end

    # POST /api/favorites { discord_user_id, guild_id, channel_id }
    # Favorita a faixa que está tocando no canal. Idempotente (Favorite.capture).
    def create
      uid = params[:discord_user_id].to_s
      return render_error("discord_user_id é obrigatório.", :unprocessable_entity) if uid.blank?

      item = PlayQueueService.new(params[:guild_id], params[:channel_id]).current
      return render_error("Nada tocando pra favoritar.", :not_found) if item.nil?

      fav = Favorite.capture(discord_user_id: uid, item: item)
      render json: { favorite: fav_json(fav) }, status: :created
    end

    # DELETE /api/favorites/:id?discord_user_id=
    def destroy
      fav = Favorite.for_user(params[:discord_user_id].to_s).find_by(id: params[:id])
      return render_error("Favorito não encontrado.", :not_found) if fav.nil?

      fav.destroy!
      render json: { ok: true, removed: fav_json(fav) }
    end

    private

    def fav_json(fav, position = nil)
      {
        id: fav.id,
        position: position,
        title: fav.title,
        artist: fav.artist,
        query: fav.query
      }
    end

    def render_error(message, status)
      render json: { error: message }, status: status
    end
  end
end

module Api
  # DJs de um servidor (Épico 3). Lista/adiciona/remove DJs; a checagem de
  # "quem pode controlar" o bot faz do lado dele com a lista (index) + o
  # is_admin do Discord. Gerir a lista de DJs é gated aqui: admin do servidor ou
  # um DJ existente; o 1º DJ pode ser adicionado por qualquer um (bootstrap).
  class DjsController < ApiController
    # GET /api/guilds/:guild_id/djs → { djs: [...], restricted: bool }
    def index
      guild = params[:guild_id].to_s
      render json: {
        djs: Dj.for_guild(guild).order(:created_at).map { |d| dj_json(d) },
        restricted: Dj.restricted?(guild)
      }
    end

    # POST /api/guilds/:guild_id/djs { discord_user_id, username, actor_id, is_admin }
    def create
      guild = params[:guild_id].to_s
      return forbid unless can_manage?(guild)

      uid = params[:discord_user_id].to_s
      return render_error("Informe o usuário.", :unprocessable_entity) if uid.blank?

      dj = Dj.find_or_create_by(discord_guild_id: guild, discord_user_id: uid) do |d|
        d.username = params[:username]
        d.added_by = params[:actor_id].presence
      end
      render json: { dj: dj_json(dj) }, status: :created
    end

    # DELETE /api/guilds/:guild_id/djs/:id  (id = discord_user_id)
    def destroy
      guild = params[:guild_id].to_s
      return forbid unless can_manage?(guild)

      dj = Dj.for_guild(guild).find_by(discord_user_id: params[:id].to_s)
      return render_error("Esse usuário não é DJ.", :not_found) if dj.nil?

      dj.destroy!
      render json: { ok: true, dj: dj_json(dj) }
    end

    private

    # Pode gerir a lista de DJs? Bootstrap: sem DJs ainda, qualquer um adiciona o
    # 1º. Com DJs, só admin do servidor ou um DJ existente.
    def can_manage?(guild)
      return true unless Dj.restricted?(guild)

      is_admin = ActiveModel::Type::Boolean.new.cast(params[:is_admin])
      is_admin || Dj.dj?(guild, params[:actor_id].to_s)
    end

    def forbid
      render_error("Só um DJ ou admin do servidor pode gerenciar DJs.", :forbidden)
    end

    def dj_json(dj)
      { discord_user_id: dj.discord_user_id, username: dj.username, added_by: dj.added_by }
    end

    def render_error(message, status)
      render json: { error: message }, status: status
    end
  end
end

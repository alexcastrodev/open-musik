module Api
  # Ranking de plays consumido pelo bot (comando /top — Épico 3, item 1). Reusa o
  # PlayStats (Épico 2, item 6) sobre os eventos "play" do ServerLog. Fora do hot
  # path de reprodução (é só consulta), então pode passar pelo Rails. Rede
  # interna, sem auth (ver Api::ApiController).
  class StatsController < Api::ApiController
    DEFAULT_LIMIT = 10
    MAX_LIMIT     = 25
    # Rótulo → dias da janela. Ausente/"all" = desde sempre.
    PERIOD_DAYS = { "week" => 7, "month" => 30 }.freeze

    # GET /api/stats/top?scope=user|guild|global&guild_id=&user=&period=&limit=
    def top
      limit = params[:limit].to_i
      limit = DEFAULT_LIMIT if limit <= 0
      limit = limit.clamp(1, MAX_LIMIT)

      days  = PERIOD_DAYS[params[:period].to_s]
      base  = PlayStats.base(since: days&.days&.ago)

      scope = params[:scope].to_s
      relation =
        case scope
        when "user"  then base.where(requested_by: params[:user].to_s)
        when "guild" then base.where(discord_guild_id: params[:guild_id].to_s)
        else
          scope = "global"
          base
        end

      songs = PlayStats.top_songs(relation, limit:).each_with_index.map do |s, i|
        { rank: i + 1, title: s[:title], artist: s[:artist], plays: s[:plays] }
      end

      render json: { scope: scope, songs: songs }
    end
  end
end

class JobsController < ApplicationController
  def index
    authorize :job
    imports = YoutubeImport.recent.map do |i|
      {
        import_id: i.import_id,
        youtube_url: i.youtube_url,
        status: i.status,
        message: i.message,
        created_at: i.created_at
      }
    end
    bot_actions = BotAction.recent.includes(:song).limit(50).map do |a|
      {
        id: a.id,
        kind: a.kind,
        status: a.status,
        discord_guild_id: a.discord_guild_id,
        discord_user_id: a.discord_user_id,
        song_title: a.song&.display_title,
        error_message: a.error_message,
        created_at: a.created_at
      }
    end
    render inertia: "Jobs/Index", props: { imports: imports, bot_actions: bot_actions }
  end
end

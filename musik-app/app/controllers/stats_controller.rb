# Estatísticas de plays (Épico 2, item 6): global, por servidor e por usuário.
# Tudo vem dos eventos "play" do ServerLog via PlayStats. Admin-only. O período
# (?period=) limita a janela; o servidor (?server=) e o usuário (?user=)
# selecionam as visões por dimensão.
class StatsController < ApplicationController
  # Rótulo → janela de tempo. `nil` = desde sempre.
  PERIODS = {
    "all" => nil,
    "30d" => 30,
    "7d"  => 7
  }.freeze

  def index
    authorize :stat

    period = PERIODS.key?(params[:period]) ? params[:period] : "all"
    days   = PERIODS[period]
    since  = days && days.days.ago

    guilds = ServerLog.known_guilds
    users  = PlayStats.known_users(since:)

    selected_server = params[:server].presence
    selected_user   = params[:user].presence

    render inertia: "Stats/Index", props: {
      period: period,
      global: PlayStats.global(since:),
      guilds: guilds,
      selected_server: selected_server,
      server_stats: selected_server && PlayStats.for_guild(selected_server, since:),
      users: users,
      selected_user: selected_user,
      user_stats: selected_user && PlayStats.for_user(selected_user, since:)
    }
  end
end

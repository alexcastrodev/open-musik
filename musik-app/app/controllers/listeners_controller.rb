# Perfil de escuta por usuário (Épico 2, item 7). "Scrobbling" absorvido no
# Rails: quem pediu a faixa (requested_by no ServerLog) é o ouvinte. Lista os
# ouvintes conhecidos e, com ?user= selecionado, mostra o perfil completo
# (top artistas/faixas, histórico recente, janela de atividade). Admin-only,
# sem integração externa. Período via ?period=.
class ListenersController < ApplicationController
  def index
    authorize :listener

    period = StatsController::PERIODS.key?(params[:period]) ? params[:period] : "all"
    days   = StatsController::PERIODS[period]
    since  = days && days.days.ago

    users = PlayStats.top_requesters(PlayStats.base(since:), limit: 100)
    selected = params[:user].presence

    render inertia: "Listeners/Index", props: {
      period: period,
      users: users,
      selected_user: selected,
      profile: selected && PlayStats.profile(selected, since:)
    }
  end
end

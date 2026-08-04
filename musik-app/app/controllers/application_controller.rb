class ApplicationController < ActionController::Base
  include Pundit::Authorization

  allow_browser versions: :modern

  layout "inertia"

  before_action :require_login
  before_action :share_inertia_data

  rescue_from Pundit::NotAuthorizedError, with: :unauthorized

  private

  def current_user
    @current_user ||= User.find_by(id: session[:user_id]) if session[:user_id]
  end

  def require_login
    if session[:authenticated] && session[:user_id].nil?
      session.delete(:authenticated)
    end
    redirect_to login_path unless session[:authenticated]
  end

  def share_inertia_data
    inertia_share(
      playlists: Playlist.order(:name).map { |p| { id: p.id, name: p.name } },
      flash: { notice: flash[:notice], alert: flash[:alert] },
      current_user: current_user && {
        id: current_user.id,
        username: current_user.username,
        avatar_url: current_user.avatar_url,
        role: current_user.role
      }
    )
  end

  def unauthorized
    redirect_to root_path, alert: "Acesso não autorizado"
  end
end

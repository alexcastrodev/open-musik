class SessionsController < ApplicationController
  skip_before_action :require_login
  skip_before_action :share_inertia_data
  skip_before_action :verify_authenticity_token, only: %i[discord_callback]

  def new
    redirect_to root_path if session[:authenticated]
    render inertia: "Sessions/Login", props: {
      error: flash[:alert].presence
    }
  end

  def destroy
    session.delete(:authenticated)
    session.delete(:user_id)
    redirect_to login_path
  end

  def discord_callback
    auth = request.env["omniauth.auth"]
    if auth&.uid.present?
      user = User.from_discord(auth)
      session[:authenticated] = true
      session[:user_id] = user.id
      redirect_to root_path
    else
      redirect_to login_path, alert: "Falha ao autenticar com Discord"
    end
  end

  def oauth_failure
    redirect_to login_path, alert: "Autenticação cancelada"
  end
end

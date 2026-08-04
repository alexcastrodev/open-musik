if ENV["DISCORD_CLIENT_ID"].present? && ENV["DISCORD_CLIENT_SECRET"].present?
  Rails.application.config.middleware.use OmniAuth::Builder do
    provider :discord,
      ENV["DISCORD_CLIENT_ID"],
      ENV["DISCORD_CLIENT_SECRET"],
      scope: "identify"
  end
end

OmniAuth.config.allowed_request_methods = %i[post]
OmniAuth.config.silence_get_warning = true

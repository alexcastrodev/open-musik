# Sidekiq usa o mesmo Valkey/Redis do cache e do Action Cable. Aceita um
# SIDEKIQ_REDIS_URL dedicado (ex.: outro database lógico) e cai no REDIS_URL.
redis_url = ENV.fetch("SIDEKIQ_REDIS_URL") do
  ENV.fetch("REDIS_URL", "redis://localhost:6379/0")
end

Sidekiq.configure_server do |config|
  config.redis = { url: redis_url }

  # Carrega os jobs recorrentes (antes vindos do recurring.yml do Solid Queue).
  schedule_file = Rails.root.join("config/schedule.yml")
  if schedule_file.exist?
    require "sidekiq/cron/job"
    Sidekiq::Cron::Job.load_from_hash!(YAML.load_file(schedule_file))
  end
end

Sidekiq.configure_client do |config|
  config.redis = { url: redis_url }
end

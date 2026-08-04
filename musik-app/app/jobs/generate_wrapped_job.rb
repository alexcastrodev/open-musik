# Gera o Wrapped (Épico 2, item 8) de cada servidor que teve plays no período,
# de forma idempotente (índice único por guild+período). Agendado no
# schedule.yml: mensal (mês anterior) e anual (ano anterior). Cada wrapped nasce
# "pending" e é entregue depois pelo bot via heartbeat.
class GenerateWrappedJob < ApplicationJob
  queue_as :default

  # `kind` = "month" | "year". `ref_date_str` (ISO) opcional força um período
  # específico (backfill/manual); sem ele, usa o período ANTERIOR ao atual.
  def perform(kind = "month", ref_date_str = nil)
    ref = ref_date_str ? Date.parse(ref_date_str) : default_ref(kind)
    range = WrappedReport.period_range(kind, ref)

    guild_ids = ServerLog.where(kind: "play", created_at: range).distinct.pluck(:discord_guild_id)
    guild_ids.each do |gid|
      report = WrappedReport.build(guild_id: gid, kind:, ref_date: ref)
      next if report["total_plays"].to_i.zero?

      name = BotGuild.where(discord_guild_id: gid).order(updated_at: :desc).pick(:name)
      ServerWrapped.find_or_create_by(
        discord_guild_id: gid, period_kind: kind.to_s, period_start: Date.parse(report["period_start"])
      ) do |w|
        w.period_end = Date.parse(report["period_end"])
        w.payload    = report
        w.message    = WrappedReport.message(report, guild_name: name)
      end
    end
  end

  private

  def default_ref(kind)
    kind.to_s == "year" ? Date.current.prev_year : Date.current.prev_month
  end
end

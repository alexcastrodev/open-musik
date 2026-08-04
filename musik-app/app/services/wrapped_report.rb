# Monta a retrospectiva "Wrapped" de um servidor num período (Épico 2, item 8):
# top músicas, top requester, top artistas, horas ouvidas e totais — tudo dos
# eventos "play" do ServerLog, reutilizando os helpers do PlayStats sobre um
# escopo já limitado à janela (mês/ano). Também formata a mensagem que o bot
# posta no Discord.
class WrappedReport
  MONTH_NAMES = %w[
    janeiro fevereiro março abril maio junho julho
    agosto setembro outubro novembro dezembro
  ].freeze

  # `ref_date` = uma data DENTRO do período alvo (o job usa o mês/ano anterior).
  def self.build(guild_id:, kind:, ref_date: Date.current)
    range = period_range(kind, ref_date)
    scope = ServerLog.where(kind: "play", discord_guild_id: guild_id, created_at: range)

    {
      "period_kind"      => kind.to_s,
      "period_start"     => range.begin.to_date.iso8601,
      "period_end"       => (range.end.to_date - 1).iso8601,
      "period_label"     => period_label(kind, ref_date),
      "total_plays"      => scope.count,
      "unique_songs"     => scope.where.not(song_title: [ nil, "" ]).distinct.count(:song_title),
      "unique_listeners" => scope.where.not(requested_by: [ nil, "" ]).distinct.count(:requested_by),
      "hours_listened"   => hours_listened(scope),
      "top_songs"        => PlayStats.top_songs(scope, limit: 5).map { |s| s.transform_keys(&:to_s) },
      "top_artists"      => PlayStats.top_artists(scope, limit: 5).map { |a| a.transform_keys(&:to_s) },
      "top_requester"    => PlayStats.top_requesters(scope, limit: 1).first&.transform_keys(&:to_s)
    }
  end

  # Faixa [início, fim) do período que contém `ref_date`.
  def self.period_range(kind, ref_date)
    case kind.to_s
    when "month"
      ref_date.beginning_of_month.beginning_of_day...ref_date.beginning_of_month.next_month.beginning_of_day
    when "year"
      ref_date.beginning_of_year.beginning_of_day...ref_date.beginning_of_year.next_year.beginning_of_day
    else
      raise ArgumentError, "período inválido: #{kind}"
    end
  end

  def self.period_label(kind, ref_date)
    kind.to_s == "year" ? ref_date.year.to_s : "#{MONTH_NAMES[ref_date.month - 1]} de #{ref_date.year}"
  end

  # Horas ouvidas: o ServerLog não guarda duração; resolve pela Song (por título)
  # e soma duração × plays. Best-effort — plays sem Song correspondente contam 0.
  def self.hours_listened(scope)
    per_title = scope.where.not(song_title: [ nil, "" ]).group(:song_title).count
    dur_by_title = Song.where(title: per_title.keys).pluck(:title, :duration).to_h
    seconds = per_title.sum { |title, plays| (dur_by_title[title] || 0) * plays }
    (seconds / 3600.0).round(1)
  end

  # Mensagem postada no canal do Discord. Texto simples com emojis (o bot faz
  # channel.send). Nomes de usuário/faixa vêm do próprio log.
  def self.message(report, guild_name: nil)
    title = report["period_kind"] == "year" ? "Wrapped Anual" : "Wrapped"
    lines = []
    lines << "🎉 **#{title} — #{report['period_label']}**#{guild_name ? " · #{guild_name}" : ''}"
    lines << ""
    lines << "▶️ **#{report['total_plays']}** plays · 🎵 **#{report['unique_songs']}** músicas · 👥 **#{report['unique_listeners']}** ouvintes · ⏱️ **#{report['hours_listened']}h** ouvidas"

    if (songs = report["top_songs"]).present?
      lines << ""
      lines << "🏆 **Top músicas**"
      songs.each_with_index { |s, i| lines << "#{i + 1}. #{s['title']} — #{s['plays']} plays" }
    end

    if (artists = report["top_artists"]).present?
      lines << ""
      lines << "🎤 **Top artistas**"
      artists.each_with_index { |a, i| lines << "#{i + 1}. #{a['artist']} — #{a['plays']} plays" }
    end

    if (req = report["top_requester"]).present?
      lines << ""
      lines << "👑 **DJ do período:** #{req['requested_by']} (#{req['plays']} pedidos)"
    end

    lines.join("\n")
  end
end

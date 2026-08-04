# Estatísticas de reprodução (Épico 2, item 6). Fonte única: os eventos "play"
# do ServerLog (histórico append-only gravado pela Api::GuildsController). Só
# "play" conta como reprodução — skip/stop/advance/etc são ações, não plays.
#
# Dimensões: global, por servidor (discord_guild_id) e por usuário
# (requested_by, a tag de quem PEDIU a faixa). Alimenta o Épico 3 (comandos
# top-10), o perfil de escuta (item 7) e o Wrapped (item 8), por isso vive num
# serviço reutilizável em vez de espalhado nos controllers.
class PlayStats
  # Escopo base: só plays, opcionalmente desde uma data (janela de período).
  def self.base(since: nil)
    scope = ServerLog.where(kind: "play")
    scope = scope.where(created_at: since..) if since
    scope
  end

  def self.global(limit: 10, since: nil)
    scope = base(since:)
    {
      total_plays:    scope.count,
      unique_songs:   scope.where.not(song_title: [ nil, "" ]).distinct.count(:song_title),
      unique_users:   scope.where.not(requested_by: [ nil, "" ]).distinct.count(:requested_by),
      top_songs:      top_songs(scope, limit:),
      top_requesters: top_requesters(scope, limit:),
      top_guilds:     top_guilds(scope, limit:)
    }
  end

  def self.for_guild(guild_id, limit: 10, since: nil)
    scope = base(since:).where(discord_guild_id: guild_id)
    {
      total_plays:    scope.count,
      unique_songs:   scope.where.not(song_title: [ nil, "" ]).distinct.count(:song_title),
      top_songs:      top_songs(scope, limit:),
      top_requesters: top_requesters(scope, limit:)
    }
  end

  def self.for_user(requested_by, limit: 10, since: nil)
    scope = base(since:).where(requested_by:)
    {
      total_plays:  scope.count,
      unique_songs: scope.where.not(song_title: [ nil, "" ]).distinct.count(:song_title),
      top_songs:    top_songs(scope, limit:),
      top_guilds:   top_guilds(scope, limit:)
    }
  end

  # Perfil de escuta de um usuário (Épico 2, item 7). "Scrobbling" absorvido no
  # Rails: quem PEDIU a faixa (requested_by) é o ouvinte. Sem integração externa
  # — tudo sai do ServerLog. Estende for_user com top artistas, histórico
  # recente e a janela de atividade (primeira/última escuta).
  def self.profile(requested_by, limit: 10, since: nil)
    scope = base(since:).where(requested_by:)
    {
      total_plays:    scope.count,
      unique_songs:   scope.where.not(song_title: [ nil, "" ]).distinct.count(:song_title),
      top_artists:    top_artists(scope, limit:),
      top_songs:      top_songs(scope, limit:),
      top_guilds:     top_guilds(scope, limit:),
      recent:         recent_plays(scope, limit: 20),
      first_play_at:  scope.minimum(:created_at),
      last_play_at:   scope.maximum(:created_at)
    }
  end

  # Usuários conhecidos (pro seletor "por usuário"): tags distintas de quem já
  # pediu alguma faixa, mais recentes primeiro.
  def self.known_users(since: nil)
    base(since:)
      .where.not(requested_by: [ nil, "" ])
      .group(:requested_by)
      .order(Arel.sql("MAX(created_at) DESC"))
      .pluck(:requested_by)
  end

  # Top faixas por nº de plays. Agrupa por song_title (robusto pra faixas sem
  # Song — Spotify/YouTube provisórios). Enriquece com capa/artista da Song
  # quando o título casa, só pra exibição.
  def self.top_songs(scope, limit: 10)
    counts = scope.where.not(song_title: [ nil, "" ])
                  .group(:song_title)
                  .order(Arel.sql("COUNT(*) DESC"))
                  .limit(limit)
                  .count
    meta = Song.where(title: counts.keys)
               .pluck(:title, :cover_url, :artist)
               .each_with_object({}) { |(t, cover, artist), h| h[t] ||= { cover_url: cover, artist: artist } }
    counts.map do |title, plays|
      { title:, plays:, cover_url: meta.dig(title, :cover_url), artist: meta.dig(title, :artist) }
    end
  end

  # Top usuários por nº de faixas pedidas.
  def self.top_requesters(scope, limit: 10)
    scope.where.not(requested_by: [ nil, "" ])
         .group(:requested_by)
         .order(Arel.sql("COUNT(*) DESC"))
         .limit(limit)
         .count
         .map { |user, plays| { requested_by: user, plays: } }
  end

  # Top artistas. O ServerLog não guarda artista — resolve pela Song (por
  # título) e soma os plays por artista em Ruby (dataset pequeno). Best-effort:
  # plays sem Song correspondente (ex.: provisórios sem match) ficam de fora.
  def self.top_artists(scope, limit: 10)
    per_title = scope.where.not(song_title: [ nil, "" ]).group(:song_title).count
    artist_by_title = Song.where(title: per_title.keys).pluck(:title, :artist).to_h
    agg = Hash.new(0)
    per_title.each do |title, plays|
      artist = artist_by_title[title]
      agg[artist] += plays if artist.present?
    end
    agg.sort_by { |_, plays| -plays }.first(limit).map { |artist, plays| { artist:, plays: } }
  end

  # Histórico recente de escuta (Épico 2, item 7): últimos plays, do mais novo
  # pro mais antigo. Resolve o nome do guild pelo BotGuild.
  def self.recent_plays(scope, limit: 20)
    logs = scope.order(created_at: :desc).limit(limit)
    names = BotGuild.order(updated_at: :desc).pluck(:discord_guild_id, :name).to_h
    logs.map do |l|
      {
        title:      l.song_title,
        guild_name: names[l.discord_guild_id].presence || l.discord_guild_id,
        played_at:  l.created_at
      }
    end
  end

  # Top servidores por nº de plays. Resolve o nome pelo BotGuild (mais recente).
  def self.top_guilds(scope, limit: 10)
    counts = scope.group(:discord_guild_id)
                  .order(Arel.sql("COUNT(*) DESC"))
                  .limit(limit)
                  .count
    names = BotGuild.order(updated_at: :desc).pluck(:discord_guild_id, :name).to_h
    counts.map do |gid, plays|
      { discord_guild_id: gid, name: names[gid].presence || gid, plays: }
    end
  end
end

class SongDisplayService
  SONG_COLUMNS = <<~SQL.freeze
    s.id,
    s.uuid,
    s.title,
    s.artist,
    s.album,
    s.duration,
    s.cover_url,
    s.s3_url,
    s.play_count,
    s.version_label
  SQL

  # Returns an ordered list of display items for Songs/Index.
  # Each item is { type: "song", song: {...} }.
  # An optional search query filters across title, artist and album.
  def self.display_items(query: nil)
    q = query.to_s.strip
    binds = []

    # Esconde as purgadas (s3_key nil): áudio liberado do S3, só aparecem dentro
    # das playlists. Ver Song#purge_audio! / scope :actives.
    where_clause = "WHERE s.s3_key IS NOT NULL"
    if q.present?
      binds << "%#{q}%"
      where_clause += <<~SQL
        AND (
          s.title    ILIKE $1 OR
          s.artist   ILIKE $1 OR
          s.album    ILIKE $1
        )
      SQL
    end

    sql = <<~SQL
      SELECT #{SONG_COLUMNS}
      FROM songs s
      #{where_clause}
      ORDER BY s.artist ASC NULLS LAST, s.title ASC NULLS LAST
    SQL

    rows = ActiveRecord::Base.connection.exec_query(sql, "SongDisplayService", binds).to_a
    rows.map { |row| { type: "song", song: build_song(row) } }
  end

  # Flat search returning a list of song JSONs (no grouping).
  # Used by the Discord bot API for /play autocomplete and lookups.
  def self.search(query: nil, limit: 25)
    q = query.to_s.strip
    songs = Song.actives
    if q.present?
      like = "%#{q}%"
      songs = songs.where(
        "title ILIKE :like OR artist ILIKE :like OR album ILIKE :like",
        like: like
      )
    end
    songs.order(play_count: :desc, created_at: :desc).limit(limit).map { |s| song_json(s) }
  end

  def self.song_json(song)
    {
      id: song.id,
      uuid: song.uuid,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      cover_url: song.cover_url,
      s3_url: song.s3_url,
      display_title: song.display_title,
      display_artist: song.display_artist,
      display_cover: song.display_cover,
      formatted_duration: song.formatted_duration,
      play_count: song.play_count,
      version_label: song.version_label
    }
  end

  private

  def self.build_song(row)
    id       = row["id"]
    title    = row["title"]
    artist   = row["artist"]
    album    = row["album"]
    duration = row["duration"]

    display_title  = title.presence || "(sem título)"
    display_artist = artist.presence || "Artista desconhecido"
    display_cover  = row["cover_url"].presence || "/default_cover.svg"
    formatted_duration = begin
      d = duration&.to_i
      d ? format("%d:%02d", d / 60, d % 60) : "--:--"
    end

    {
      id: id,
      uuid: row["uuid"],
      title: title,
      artist: artist,
      album: album,
      duration: duration,
      cover_url: row["cover_url"],
      s3_url: row["s3_url"],
      display_title: display_title,
      display_artist: display_artist,
      display_cover: display_cover,
      formatted_duration: formatted_duration,
      play_count: row["play_count"],
      version_label: row["version_label"]
    }
  end
end

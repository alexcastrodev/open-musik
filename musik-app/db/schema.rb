# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_07_03_190000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "bot_actions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "discord_guild_id"
    t.string "discord_user_id"
    t.string "error_message"
    t.string "idempotency_key", null: false
    t.string "kind", null: false
    t.jsonb "payload", default: {}, null: false
    t.bigint "song_id"
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["discord_guild_id", "created_at"], name: "index_bot_actions_on_discord_guild_id_and_created_at"
    t.index ["discord_user_id", "created_at"], name: "index_bot_actions_on_discord_user_id_and_created_at"
    t.index ["idempotency_key"], name: "index_bot_actions_on_idempotency_key", unique: true
    t.index ["status"], name: "index_bot_actions_on_status"
  end

  create_table "bot_guilds", force: :cascade do |t|
    t.string "bot_client_id", null: false
    t.datetime "created_at", null: false
    t.string "current_title"
    t.string "discord_guild_id", null: false
    t.string "icon_url"
    t.datetime "last_seen_at", null: false
    t.integer "member_count"
    t.string "name"
    t.datetime "updated_at", null: false
    t.string "voice_channel_id"
    t.string "voice_channel_name"
    t.string "voice_state", default: "idle", null: false
    t.index ["discord_guild_id", "bot_client_id"], name: "index_bot_guilds_on_guild_and_client", unique: true
  end

  create_table "djs", force: :cascade do |t|
    t.string "added_by"
    t.datetime "created_at", null: false
    t.string "discord_guild_id", null: false
    t.string "discord_user_id", null: false
    t.datetime "updated_at", null: false
    t.string "username"
    t.index ["discord_guild_id", "discord_user_id"], name: "index_djs_on_discord_guild_id_and_discord_user_id", unique: true
  end

  create_table "favorites", force: :cascade do |t|
    t.string "artist"
    t.datetime "created_at", null: false
    t.string "discord_user_id", null: false
    t.string "query", null: false
    t.bigint "song_id"
    t.string "title"
    t.datetime "updated_at", null: false
    t.index ["discord_user_id", "created_at"], name: "index_favorites_on_discord_user_id_and_created_at"
    t.index ["discord_user_id", "query"], name: "index_favorites_on_discord_user_id_and_query", unique: true
    t.index ["song_id"], name: "index_favorites_on_song_id"
  end

  create_table "play_queue_items", force: :cascade do |t|
    t.string "artist"
    t.string "cache_status", default: "pending", null: false
    t.datetime "created_at", null: false
    t.string "discord_guild_id", null: false
    t.integer "duration"
    t.datetime "played_at"
    t.bigint "playlist_id"
    t.integer "position", default: 0, null: false
    t.string "provider_url"
    t.string "repeat_mode", default: "none", null: false
    t.string "requested_by"
    t.bigint "song_id"
    t.string "status", default: "queued", null: false
    t.jsonb "stream_candidates", default: [], null: false
    t.string "title"
    t.datetime "updated_at", null: false
    t.string "voice_channel_id", null: false
    t.index ["discord_guild_id", "voice_channel_id", "played_at"], name: "idx_pqi_on_guild_channel_played_at"
    t.index ["discord_guild_id", "voice_channel_id", "position"], name: "idx_on_discord_guild_id_voice_channel_id_position_cbf7b1ce70"
    t.index ["discord_guild_id", "voice_channel_id", "status"], name: "idx_on_discord_guild_id_voice_channel_id_status_b6a301101c"
    t.index ["playlist_id"], name: "index_play_queue_items_on_playlist_id"
  end

  create_table "playlist_songs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "playlist_id", null: false
    t.integer "position", default: 0
    t.integer "song_id", null: false
    t.datetime "updated_at", null: false
    t.index ["playlist_id", "song_id"], name: "index_playlist_songs_on_playlist_id_and_song_id", unique: true
    t.index ["playlist_id"], name: "index_playlist_songs_on_playlist_id"
    t.index ["song_id"], name: "index_playlist_songs_on_song_id"
  end

  create_table "playlists", force: :cascade do |t|
    t.string "build_status", default: "ready", null: false
    t.datetime "created_at", null: false
    t.string "description"
    t.string "discord_user_id"
    t.string "name"
    t.datetime "updated_at", null: false
    t.index ["discord_user_id"], name: "index_playlists_on_discord_user_id"
  end

  create_table "quiz_scores", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "discord_guild_id", null: false
    t.string "discord_user_id", null: false
    t.integer "points", default: 0, null: false
    t.string "season", null: false
    t.datetime "updated_at", null: false
    t.string "username"
    t.index ["discord_guild_id", "season", "discord_user_id"], name: "index_quiz_scores_on_guild_season_user", unique: true
    t.index ["discord_guild_id", "season", "points"], name: "index_quiz_scores_on_discord_guild_id_and_season_and_points"
  end

  create_table "server_logs", force: :cascade do |t|
    t.string "actor"
    t.string "bot_client_id"
    t.datetime "created_at", null: false
    t.string "detail"
    t.string "discord_guild_id", null: false
    t.string "guild_name"
    t.string "kind", null: false
    t.jsonb "metadata", default: {}, null: false
    t.string "requested_by"
    t.bigint "song_id"
    t.string "song_title"
    t.string "voice_channel_id"
    t.string "voice_channel_name"
    t.index ["discord_guild_id", "created_at"], name: "index_server_logs_on_discord_guild_id_and_created_at"
    t.index ["song_id"], name: "index_server_logs_on_song_id"
  end

  create_table "server_wrappeds", force: :cascade do |t|
    t.datetime "claimed_at"
    t.string "claimed_by"
    t.datetime "created_at", null: false
    t.datetime "delivered_at"
    t.string "delivered_by"
    t.string "discord_guild_id", null: false
    t.text "message"
    t.jsonb "payload", default: {}, null: false
    t.date "period_end", null: false
    t.string "period_kind", null: false
    t.date "period_start", null: false
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["discord_guild_id", "period_kind", "period_start"], name: "index_server_wrappeds_on_guild_and_period", unique: true
    t.index ["status", "claimed_at"], name: "index_server_wrappeds_on_status_and_claimed_at"
  end

  create_table "songs", force: :cascade do |t|
    t.string "album"
    t.string "artist"
    t.string "audio_fingerprint"
    t.string "cover_url"
    t.datetime "created_at", null: false
    t.integer "duration"
    t.bigint "file_size"
    t.boolean "is_temporary", default: false, null: false
    t.datetime "last_played_at"
    t.string "original_filename"
    t.integer "play_count", default: 0
    t.string "s3_key"
    t.string "s3_url"
    t.string "source_provider"
    t.string "source_url"
    t.string "title"
    t.datetime "updated_at", null: false
    t.uuid "uuid", default: -> { "gen_random_uuid()" }, null: false
    t.string "version_label"
    t.string "youtube_url"
    t.index ["audio_fingerprint"], name: "index_songs_on_audio_fingerprint"
    t.index ["is_temporary", "last_played_at"], name: "index_songs_on_is_temporary_and_last_played_at"
    t.index ["s3_key"], name: "index_songs_on_s3_key", unique: true
    t.index ["source_url"], name: "index_songs_on_source_url"
    t.index ["uuid"], name: "index_songs_on_uuid", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.string "avatar"
    t.datetime "created_at", null: false
    t.string "discord_user_id", null: false
    t.integer "role", default: 0, null: false
    t.datetime "updated_at", null: false
    t.string "username", null: false
    t.index ["discord_user_id"], name: "index_users_on_discord_user_id", unique: true
  end

  create_table "youtube_imports", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "import_id", null: false
    t.string "message"
    t.bigint "song_id"
    t.string "status", default: "processing", null: false
    t.datetime "updated_at", null: false
    t.string "youtube_url", null: false
    t.index ["import_id"], name: "index_youtube_imports_on_import_id", unique: true
    t.index ["song_id"], name: "index_youtube_imports_on_song_id"
    t.index ["status"], name: "index_youtube_imports_on_status"
  end

  add_foreign_key "favorites", "songs", on_delete: :nullify
  add_foreign_key "play_queue_items", "playlists", on_delete: :nullify
  add_foreign_key "playlist_songs", "playlists"
  add_foreign_key "playlist_songs", "songs"
  add_foreign_key "server_logs", "songs", on_delete: :nullify
  add_foreign_key "youtube_imports", "songs"
end

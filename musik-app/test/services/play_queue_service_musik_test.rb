require "test_helper"

# Valida que enfileirar uma URL do musik (/songs/:uuid) toca direto do S3:
# o `playable` traz cached_url e o item nasce com cache_status "cached" —
# sem yt-dlp, sem download em background.
class PlayQueueServiceMusikTest < ActiveSupport::TestCase
  GUILD = "guild-test-musik".freeze
  CHANNEL = "chan-test".freeze

  def setup
    @song = Song.create!(
      s3_key: "tracks/#{SecureRandom.hex(8)}.mp3",
      s3_url: "https://s3.example/tracks/test.mp3",
      title: "Cacheada",
      artist: "Artista",
      duration: 180
    )
    @url = "https://musik.kurz.fyi/songs/#{@song.uuid}"
  end

  def teardown
    PlayQueueItem.where(discord_guild_id: GUILD).delete_all
  end

  test "enqueue de URL do musik toca direto do S3" do
    result = PlayQueueService.new(GUILD, CHANNEL).enqueue(@url, requested_by: "alex")

    refute_nil result
    assert result[:started_now], "deveria iniciar de imediato (fila vazia)"
    assert_equal @song.s3_url, result[:playable][:cached_url]
    assert_empty result[:playable][:candidates]
    assert_equal "cached", result[:item].cache_status
    assert_equal @song.id, result[:item].song_id
  end

  # O bot decide o caminho de playback pelo audio_format do playable: "opus"
  # ativa o pass-through (StreamType.OggOpus); qualquer outro formato cai no
  # ffmpeg. Ver Song#audio_format e bot/src/player/GuildPlayer.js.
  test "playable traz audio_format derivado do s3_key" do
    result = PlayQueueService.new(GUILD, CHANNEL).enqueue(@url, requested_by: "alex")
    assert_equal "mp3", result[:playable][:audio_format]
  end

  test "playable de faixa .opus traz audio_format opus" do
    opus = Song.create!(
      s3_key: "tracks/#{SecureRandom.hex(8)}.opus",
      s3_url: "https://s3.example/tracks/test.opus",
      title: "Opus",
      duration: 120
    )
    url = "https://musik.kurz.fyi/songs/#{opus.uuid}"
    result = PlayQueueService.new(GUILD, CHANNEL).enqueue(url, requested_by: "alex")
    assert_equal "opus", result[:playable][:audio_format]
  end

  test "tocar do musik renova o play_count da song" do
    assert_equal 0, @song.play_count
    PlayQueueService.new(GUILD, CHANNEL).enqueue(@url, requested_by: "alex")
    assert_equal 1, @song.reload.play_count
  end

  test "uuid inexistente nao enfileira nada" do
    missing = "https://musik.kurz.fyi/songs/00000000-0000-0000-0000-000000000000"
    result = PlayQueueService.new(GUILD, CHANNEL).enqueue(missing, requested_by: "alex")

    assert_nil result
    assert_equal 0, PlayQueueItem.where(discord_guild_id: GUILD).count
  end
end

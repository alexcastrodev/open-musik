require "test_helper"

# Valida o fluxo de uma Song PURGADA (s3_key/s3_url nil, áudio liberado do S3
# via Manage#purge): ainda enfileira se dá pra rebaixar pela fonte, mantendo o
# vínculo com a linha existente pro CacheProviderSongJob repovoar.
class PlayQueueServicePurgedTest < ActiveSupport::TestCase
  GUILD = "guild-test-purged".freeze
  CHANNEL = "chan-test".freeze

  def teardown
    PlayQueueItem.where(discord_guild_id: GUILD).delete_all
  end

  def purged_song(**attrs)
    Song.create!({
      s3_key: nil, s3_url: nil,
      source_url: "https://www.youtube.com/watch?v=abc12345678",
      title: "Purgada", artist: "Artista", duration: 120
    }.merge(attrs))
  end

  test "enqueue_song de song purgada reacquirivel enfileira pending mantendo o vinculo" do
    song = purged_song
    result = PlayQueueService.new(GUILD, CHANNEL).enqueue_song(song, requested_by: "alex")

    refute_nil result, "deveria enfileirar (tem fonte pra rebaixar)"
    assert_equal song.id, result[:item].song_id, "deve preservar o vínculo com a linha"
    assert_equal "pending", result[:item].cache_status
    assert_nil result[:playable][:cached_url], "sem áudio no S3 ainda"
  end

  test "enqueue_song de song purgada sem fonte (upload manual) retorna nil" do
    song = purged_song(source_url: nil, youtube_url: nil)
    result = PlayQueueService.new(GUILD, CHANNEL).enqueue_song(song, requested_by: "alex")
    assert_nil result
  end
end

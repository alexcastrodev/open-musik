require "test_helper"

# Valida que, ao cachear um item vinculado a uma Song PURGADA (s3_url nil), o
# CacheProviderSongJob rebaixa e repovoa a MESMA linha — sem criar duplicata e
# sem deixar o item "cached" apontando pra uma Song sem áudio.
class CacheProviderSongJobPurgedTest < ActiveSupport::TestCase
  GUILD = "guild-test-job-purged".freeze
  YT_URL = "https://www.youtube.com/watch?v=abc12345678".freeze

  def teardown
    PlayQueueItem.where(discord_guild_id: GUILD).delete_all
  end

  # Stuba ProviderService.download_to_s3 pra não bater na rede/yt-dlp.
  def stub_download(result)
    ProviderService.singleton_class.send(:alias_method, :__orig_dl, :download_to_s3)
    ProviderService.define_singleton_method(:download_to_s3) { |_url, title:, skip_transcode: false| result }
    yield
  ensure
    ProviderService.define_singleton_method(:download_to_s3, ProviderService.method(:__orig_dl).unbind)
    ProviderService.singleton_class.send(:remove_method, :__orig_dl)
  end

  test "repovoa a mesma linha da song purgada (sem criar duplicata)" do
    song = Song.create!(
      s3_key: nil, s3_url: nil, source_url: YT_URL, youtube_url: YT_URL,
      title: "Purgada", artist: "Artista", duration: 120
    )
    item = PlayQueueItem.create!(
      discord_guild_id: GUILD, voice_channel_id: "chan-test", song_id: song.id, provider_url: YT_URL,
      stream_candidates: [ { provider: "youtube", url: YT_URL } ],
      title: "Purgada", artist: "Artista", duration: 120,
      position: 1, status: "current", cache_status: "pending"
    )

    result = {
      s3_key: "tracks/rebaixada.mp3",
      s3_url: "https://s3.example/tracks/rebaixada.mp3"
    }

    assert_no_difference -> { Song.count } do
      stub_download(result) { CacheProviderSongJob.perform_now(item.id) }
    end

    song.reload
    assert_equal result[:s3_key], song.s3_key
    assert_equal result[:s3_url], song.s3_url
    refute song.unavailable?

    item.reload
    assert_equal "cached", item.cache_status
    assert_equal song.id, item.song_id
  end
end

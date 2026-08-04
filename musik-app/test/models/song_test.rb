# == Schema Information
#
# Table name: songs
#
#  id                :bigint           not null, primary key
#  album             :string
#  artist            :string
#  audio_fingerprint :string
#  cover_url         :string
#  duration          :integer
#  file_size         :bigint
#  is_temporary      :boolean          default(FALSE), not null
#  last_played_at    :datetime
#  original_filename :string
#  play_count        :integer          default(0)
#  s3_key            :string
#  s3_url            :string
#  source_provider   :string
#  source_url        :string
#  title             :string
#  uuid              :uuid             not null
#  version_label     :string
#  youtube_url       :string
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#
# Indexes
#
#  index_songs_on_audio_fingerprint                (audio_fingerprint)
#  index_songs_on_is_temporary_and_last_played_at  (is_temporary,last_played_at)
#  index_songs_on_s3_key                           (s3_key) UNIQUE
#  index_songs_on_source_url                       (source_url)
#  index_songs_on_uuid                             (uuid) UNIQUE
#
require "test_helper"

class SongTest < ActiveSupport::TestCase
  def build_song(**attrs)
    Song.create!({
      s3_key: "tracks/#{SecureRandom.hex(8)}.mp3",
      s3_url: "https://s3.example/tracks/test.mp3"
    }.merge(attrs))
  end

  test "ganha um uuid ao ser criada" do
    song = build_song
    assert_match(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/, song.uuid)
  end

  test "to_param usa o uuid, nao o id" do
    song = build_song
    assert_equal song.uuid, song.to_param
    refute_equal song.id.to_s, song.to_param
  end

  test "find_by_param! acha pela uuid" do
    song = build_song
    assert_equal song, Song.find_by_param!(song.uuid)
  end

  test "find_by_param! levanta RecordNotFound pra uuid inexistente" do
    assert_raises(ActiveRecord::RecordNotFound) do
      Song.find_by_param!("00000000-0000-0000-0000-000000000000")
    end
  end

  # ── Scopes / disponibilidade ────────────────────────────────────────────────

  test "actives traz só songs com s3_key; unavailable só as purgadas" do
    com_audio = build_song
    purgada   = build_song(s3_key: nil, s3_url: nil, source_url: "https://youtu.be/abc")

    assert_includes Song.actives, com_audio
    refute_includes Song.actives, purgada
    assert_includes Song.unavailable, purgada
    refute_includes Song.unavailable, com_audio
  end

  test "unavailable? e reacquirable?" do
    com_audio = build_song(source_url: "https://youtu.be/x")
    refute com_audio.unavailable?

    purgada_yt = build_song(s3_key: nil, s3_url: nil, source_url: "https://youtu.be/x")
    assert purgada_yt.unavailable?
    assert purgada_yt.reacquirable?

    upload_manual = build_song(s3_key: nil, s3_url: nil)
    assert upload_manual.unavailable?
    refute upload_manual.reacquirable?
  end

  test "display_title nao quebra com s3_key nil" do
    song = build_song(s3_key: nil, s3_url: nil, title: nil, original_filename: nil)
    assert_equal "(indisponível)", song.display_title
  end

  test "duas songs purgadas coexistem sem violar a UNIQUE de s3_key" do
    build_song(s3_key: nil, s3_url: nil)
    assert_nothing_raised { build_song(s3_key: nil, s3_url: nil) }
  end

  # ── purge_audio! ────────────────────────────────────────────────────────────

  test "purge_audio! zera s3_key/s3_url, mantem a linha e os playlist_songs" do
    song = build_song(source_url: "https://youtu.be/keep")
    playlist = Playlist.create!(name: "Lista")
    PlaylistSong.create!(playlist: playlist, song: song)

    stub_s3_delete do
      song.purge_audio!
    end

    song.reload
    assert_nil song.s3_key
    assert_nil song.s3_url
    assert Song.exists?(song.id), "a linha da Song deve permanecer"
    assert_equal 1, PlaylistSong.where(song_id: song.id).count, "o playlist_song deve permanecer"
    assert_includes playlist.reload.songs, song
  end

  private

  # Stuba S3BrowserService.new pra não bater no S3 real durante purge_audio!.
  def stub_s3_delete
    fake = Object.new
    def fake.delete_object(_key) = true
    S3BrowserService.singleton_class.send(:alias_method, :__orig_new, :new)
    S3BrowserService.define_singleton_method(:new) { fake }
    yield
  ensure
    S3BrowserService.define_singleton_method(:new, S3BrowserService.method(:__orig_new).unbind)
    S3BrowserService.singleton_class.send(:remove_method, :__orig_new)
  end
end

class EnrichSongMetadataJob < ApplicationJob
  queue_as :default

  def perform(song_id)
    song = Song.find_by(id: song_id)
    return unless song

    MusicbrainzService.new.enrich_song!(song)
  end
end

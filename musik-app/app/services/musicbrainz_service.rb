require "net/http"
require "json"

class MusicbrainzService
  BASE_URL = "https://musicbrainz.org/ws/2"
  CAA_URL = "https://coverartarchive.org"
  USER_AGENT = "Musik/1.0 (musik-app)"

  def enrich_song!(song)
    return if song.title.blank? && song.artist.blank?

    title = song.display_title
    artist = song.display_artist

    recording = search_recording(title, artist)
    return unless recording

    song.title ||= recording.dig("title")
    song.artist ||= recording.dig("artist-credit", 0, "artist", "name")

    release = recording.dig("releases", 0)
    if release
      song.album ||= release["title"]
      song.duration ||= recording["length"]&.then { |ms| ms / 1000 }

      release_mbid = release["id"]
      song.cover_url ||= fetch_cover_art(release_mbid) if release_mbid
    end

    song.save!
  rescue => e
    Rails.logger.warn("MusicBrainz enrich failed for #{song.id}: #{e.message}")
  end

  private

  def search_recording(title, artist)
    query = URI.encode_www_form_component(%(recording:"#{title}" AND artist:"#{artist}"))
    uri = URI("#{BASE_URL}/recording?query=#{query}&limit=1&fmt=json&inc=releases+artist-credits")
    data = get_json(uri)
    data&.dig("recordings", 0)
  end

  def fetch_cover_art(release_mbid)
    uri = URI("#{CAA_URL}/release/#{release_mbid}/front-250")
    response = Net::HTTP.get_response(uri)
    response["location"] if response.is_a?(Net::HTTPRedirection)
  rescue
    nil
  end

  def get_json(uri)
    req = Net::HTTP::Get.new(uri)
    req["User-Agent"] = USER_AGENT
    req["Accept"] = "application/json"

    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|
      http.read_timeout = 5
      http.request(req)
    end

    JSON.parse(response.body) if response.is_a?(Net::HTTPOK)
  rescue => e
    Rails.logger.warn("MusicBrainz HTTP error: #{e.message}")
    nil
  end
end

require "test_helper"

module Api
  # Endpoint da letra da faixa atual (Épico 3). Sobrescreve LyricsService.fetch
  # (sem rede) via singleton com restauração. Ver Api::GuildsController#lyrics.
  class LyricsTest < ActionDispatch::IntegrationTest
    setup { host! "musik.kurz.fyi" }

    def current!(title:, artist: nil)
      PlayQueueItem.create!(
        discord_guild_id: "g1", voice_channel_id: "c1", title: title, artist: artist,
        status: "current", position: 0, stream_candidates: [], cache_status: "pending"
      )
    end

    # Troca LyricsService.fetch pelo `payload` durante o bloco e restaura depois.
    def with_lyrics(payload)
      original = LyricsService.method(:fetch)
      LyricsService.singleton_class.define_method(:fetch) { |**| payload }
      yield
    ensure
      LyricsService.singleton_class.define_method(:fetch, original)
    end

    test "devolve a letra da faixa tocando" do
      current!(title: "Minha Faixa", artist: "Banda")
      with_lyrics({ title: "Minha Faixa", artist: "Banda", plain: "a letra", synced: nil }) do
        get "/api/guilds/g1/channels/c1/lyrics"
      end
      assert_response :ok
      assert_equal "a letra", JSON.parse(response.body)["plain"]
    end

    test "404 quando não há faixa tocando" do
      get "/api/guilds/g1/channels/c1/lyrics"
      assert_response :not_found
    end

    test "404 quando o lrclib não acha a letra" do
      current!(title: "Instrumental")
      with_lyrics(nil) do
        get "/api/guilds/g1/channels/c1/lyrics"
      end
      assert_response :not_found
    end
  end
end

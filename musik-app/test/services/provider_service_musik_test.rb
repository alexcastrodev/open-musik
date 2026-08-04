require "test_helper"

# Cobre o musik como "provider próprio": URLs /songs/:uuid resolvem pra Song
# local (já no S3), sem yt-dlp. Ver ProviderService.resolve_all / resolve_musik.
class ProviderServiceMusikTest < ActiveSupport::TestCase
  def setup
    @song = Song.create!(
      s3_key: "tracks/#{SecureRandom.hex(8)}.mp3",
      s3_url: "https://s3.example/tracks/test.mp3",
      title: "Minha Faixa",
      artist: "Artista",
      duration: 200
    )
    @url = "https://musik.kurz.fyi/songs/#{@song.uuid}"
  end

  test "musik_url? reconhece URL /songs/:uuid de qualquer host" do
    assert ProviderService.musik_url?(@url)
    assert ProviderService.musik_url?("http://localhost:3000/songs/#{@song.uuid}")
    refute ProviderService.musik_url?("https://youtube.com/watch?v=abcdefghijk")
    refute ProviderService.musik_url?("texto livre de busca")
    refute ProviderService.musik_url?("https://musik.kurz.fyi/songs/nao-e-uuid")
  end

  test "resolve_all de URL do musik devolve candidato local com song_id" do
    candidates = ProviderService.resolve_all(@url)

    assert_equal 1, candidates.size
    c = candidates.first
    assert_equal :musik, c[:provider]
    assert_equal @song.id, c[:song_id]
    assert_equal "Minha Faixa", c[:title]
    assert_equal "Artista", c[:artist]
    assert_equal 200, c[:duration]
    assert_equal @url, c[:canonical_url]
  end

  test "uuid inexistente devolve vazio (nada encontrado, sem cair pro youtube)" do
    missing = "https://musik.kurz.fyi/songs/00000000-0000-0000-0000-000000000000"
    assert_equal [], ProviderService.resolve_all(missing)
  end

  test "song sem s3_url nao resolve" do
    @song.update_columns(s3_url: "")
    assert_equal [], ProviderService.resolve_all(@url)
  end
end

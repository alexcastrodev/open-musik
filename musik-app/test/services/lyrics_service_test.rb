require "test_helper"

# Letras via lrclib.net (Épico 3). Sobrescreve get_exact/search_first por
# instância (sem bater na rede) pra testar o fallback e o parsing. Ver
# app/services/lyrics_service.rb.
class LyricsServiceTest < ActiveSupport::TestCase
  def svc(get_exact:, search_first: nil)
    s = LyricsService.new
    s.define_singleton_method(:get_exact) { |**| get_exact }
    s.define_singleton_method(:search_first) { |**| search_first }
    s
  end

  test "fetch devolve plain/synced quando o get exato acha" do
    r = svc(get_exact: {
      "trackName" => "Título", "artistName" => "Artista",
      "plainLyrics" => "linha1\nlinha2", "syncedLyrics" => "[00:01.00]linha1"
    }).fetch(title: "T", artist: "A")

    assert_equal "linha1\nlinha2", r[:plain]
    assert_equal "[00:01.00]linha1", r[:synced]
    assert_equal "Título", r[:title]
    assert_equal "Artista", r[:artist]
  end

  test "cai na busca quando o get exato devolve nil" do
    r = svc(get_exact: nil, search_first: { "plainLyrics" => "achado na busca" }).fetch(title: "T")
    assert_equal "achado na busca", r[:plain]
  end

  test "nil quando nem get nem busca acham letra" do
    assert_nil svc(get_exact: nil, search_first: nil).fetch(title: "T")
  end

  test "nil quando o resultado não tem letra (só metadados)" do
    assert_nil svc(get_exact: { "trackName" => "T", "plainLyrics" => nil, "syncedLyrics" => nil }).fetch(title: "T")
  end

  test "título em branco nunca busca" do
    assert_nil LyricsService.new.fetch(title: "   ")
  end
end

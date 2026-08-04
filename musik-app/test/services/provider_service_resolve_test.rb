require "test_helper"

# Valida que as LEITURAS do yt-dlp (resolve/metadata/flat_playlist) rodam LOCAL no
# Rails via run_ytdlp (o serviço extractor foi removido), parseando o JSON como o
# extractor fazia. Stuba run_ytdlp pra não bater no yt-dlp/rede.
class ProviderServiceResolveTest < ActiveSupport::TestCase
  # Stuba ProviderService.run_ytdlp → [stdout, stderr, status]. `ok` controla o
  # status de saída (success?). Captura os args recebidos pra asserção.
  def stub_run_ytdlp(stdout:, ok: true)
    captured = []
    status = Struct.new(:success?, :exitstatus).new(ok, ok ? 0 : 1)
    ProviderService.singleton_class.send(:alias_method, :__orig_run, :run_ytdlp)
    ProviderService.define_singleton_method(:run_ytdlp) do |*args, **_|
      captured.replace(args)
      [ stdout, ok ? "" : "boom", status ]
    end
    yield captured
  ensure
    ProviderService.define_singleton_method(:run_ytdlp, ProviderService.method(:__orig_run).unbind)
    ProviderService.singleton_class.send(:remove_method, :__orig_run)
  end

  test "resolve de URL parseia o JSON do yt-dlp em metadata + URL canônica" do
    json = JSON.generate(
      "webpage_url" => "https://www.youtube.com/watch?v=abc12345678",
      "title" => "Minha Faixa", "uploader" => "Artista X", "duration" => 222
    )
    result = nil
    stub_run_ytdlp(stdout: json) do |args|
      result = ProviderService.resolve("https://www.youtube.com/watch?v=abc12345678")
      # Espelha os args do extractor (main.go): leitura sem download.
      assert_includes args, "--dump-single-json"
      assert_includes args, "--skip-download"
    end
    assert_equal "https://www.youtube.com/watch?v=abc12345678", result[:canonical_url]
    assert_equal "Minha Faixa", result[:title]
    assert_equal "Artista X", result[:artist]
    assert_equal 222, result[:duration]
  end

  test "resolve de termo usa ytsearch1: e pega a 1ª entry" do
    json = JSON.generate("entries" => [
      { "webpage_url" => "https://www.youtube.com/watch?v=res11111111", "title" => "Achada", "uploader" => "A", "duration" => 100 }
    ])
    result = nil
    stub_run_ytdlp(stdout: json) do |args|
      result = ProviderService.resolve("um termo qualquer")
      assert(args.any? { |a| a.to_s.start_with?("ytsearch1:") }, "termo vira ytsearch1:")
    end
    assert_equal "Achada", result[:title]
  end

  test "status de falha do yt-dlp vira ResolveError" do
    assert_raises(ProviderService::ResolveError) do
      stub_run_ytdlp(stdout: "", ok: false) do
        ProviderService.resolve("https://www.youtube.com/watch?v=abc12345678")
      end
    end
  end

  test "JSON inválido vira ResolveError" do
    assert_raises(ProviderService::ResolveError) do
      stub_run_ytdlp(stdout: "isto não é json") do
        ProviderService.fetch_metadata("https://www.youtube.com/watch?v=abc12345678")
      end
    end
  end

  test "flat_playlist parseia as entries da playlist" do
    json = JSON.generate("entries" => [ { "id" => "aaaaaaaaaaa" }, { "id" => "bbbbbbbbbbb" } ])
    result = nil
    stub_run_ytdlp(stdout: json) do |args|
      result = ProviderService.flat_playlist("https://www.youtube.com/playlist?list=PLx")
      assert_includes args, "--flat-playlist"
    end
    assert_equal 2, result["entries"].size
  end
end

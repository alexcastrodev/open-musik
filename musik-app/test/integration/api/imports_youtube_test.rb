require "test_helper"

# Import síncrono de YouTube pro bot (MusikDownloader): POST /api/imports/youtube
# devolve { file_url } direto. Reusa a Song se a URL já foi importada (file_url
# imediato), senão baixa/sobe e devolve a URL nova. Stuba a fronteira de rede
# (resolve/download) pra não bater no yt-dlp/S3.
class ApiImportsYoutubeTest < ActionDispatch::IntegrationTest
  YT_URL = "https://www.youtube.com/watch?v=abc12345678".freeze

  # O projeto restringe config.hosts (application.rb); o IntegrationTest precisa
  # usar um host permitido. Ver test/integration/api/actions_test.rb.
  setup { host! "musik.kurz.fyi" }

  # Stuba ProviderService.resolve (metadata, sem rede) e download_to_s3 (sem
  # yt-dlp/S3).
  def stub_provider(meta:, result:)
    sc = ProviderService.singleton_class
    sc.send(:alias_method, :__orig_resolve, :resolve)
    sc.send(:alias_method, :__orig_dl, :download_to_s3)
    ProviderService.define_singleton_method(:resolve) { |*, **| meta }
    ProviderService.define_singleton_method(:download_to_s3) { |_url, title:| result }
    yield
  ensure
    ProviderService.define_singleton_method(:resolve, ProviderService.method(:__orig_resolve).unbind)
    ProviderService.define_singleton_method(:download_to_s3, ProviderService.method(:__orig_dl).unbind)
    sc.send(:remove_method, :__orig_resolve)
    sc.send(:remove_method, :__orig_dl)
  end

  test "URL nova: baixa, cria a Song e devolve o file_url" do
    meta = { provider: :youtube, canonical_url: YT_URL, title: "Faixa", artist: "Artista", duration: 100 }
    result = { s3_key: "tracks/nova.mp3", s3_url: "https://s3.example/tracks/nova.mp3" }

    assert_difference -> { Song.count }, 1 do
      stub_provider(meta: meta, result: result) do
        post api_imports_youtube_path, params: { youtube_url: YT_URL }, as: :json
      end
    end

    assert_response :success
    assert_equal result[:s3_url], response.parsed_body["file_url"]
  end

  test "URL já importada: devolve o file_url imediato sem baixar" do
    song = Song.create!(
      s3_key: "tracks/existente.mp3", s3_url: "https://s3.example/tracks/existente.mp3",
      youtube_url: YT_URL, source_url: YT_URL, title: "Existente", artist: "Artista", duration: 100
    )
    meta = { provider: :youtube, canonical_url: YT_URL, title: "Existente", artist: "Artista", duration: 100 }

    # download_to_s3 nem deve ser chamado; passa result nil pra garantir que, se
    # for, o teste quebraria (mas não é, porque a Song já tem s3_url).
    assert_no_difference -> { Song.count } do
      stub_provider(meta: meta, result: nil) do
        post api_imports_youtube_path, params: { youtube_url: YT_URL }, as: :json
      end
    end

    assert_response :success
    assert_equal song.s3_url, response.parsed_body["file_url"]
  end

  test "youtube_url em branco: 422" do
    post api_imports_youtube_path, params: { youtube_url: "" }, as: :json
    assert_response :unprocessable_entity
    assert response.parsed_body["error"].present?
  end

  test "nada resolve: 422" do
    stub_provider(meta: nil, result: nil) do
      post api_imports_youtube_path, params: { youtube_url: "https://youtube.com/watch?v=zzz99999999" }, as: :json
    end
    assert_response :unprocessable_entity
  end
end

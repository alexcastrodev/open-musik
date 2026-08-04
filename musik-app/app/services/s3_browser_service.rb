require "aws-sdk-s3"

class S3BrowserService
  AUDIO_EXTENSIONS = %w[.mp3 .flac .ogg .wav .m4a .aac .opus .wma .aiff .aif].freeze
  CONTENT_TYPES = {
    ".mp3"  => "audio/mpeg",
    ".flac" => "audio/flac",
    ".wav"  => "audio/wav",
    ".aac"  => "audio/aac",
    ".ogg"  => "audio/ogg",
    ".opus" => "audio/opus",
    ".m4a"  => "audio/mp4",
    ".wma"  => "audio/x-ms-wma",
    ".aiff" => "audio/aiff",
    ".aif"  => "audio/aiff"
  }.freeze

  def initialize
    @client = Aws::S3::Client.new(
      access_key_id: ENV["S3_ACCESS_KEY_ID"],
      secret_access_key: ENV["S3_SECRET_ACCESS_KEY"],
      region: ENV.fetch("AWS_REGION", "us-east-1"),
      endpoint: ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"],
      force_path_style: true
    )
    @bucket = ENV["S3_BUCKET"]
    @public_url = (ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"]).to_s.chomp("/")
  end

  # Todo áudio vive sob este prefixo (ver ProviderService#upload_to_s3,
  # AudioUploadService, ImportLocalTracksJob) — listar com prefix evita varrer
  # o bucket inteiro (ex.: chaves do Active Storage no mesmo bucket).
  AUDIO_PREFIX = "tracks/".freeze

  def sync_songs!
    # Uma query só pra saber o que já existe, em vez de um
    # find_or_initialize_by por objeto do bucket.
    known_keys = Song.where.not(s3_key: nil).pluck(:s3_key).to_set
    synced = []
    list_audio_objects.each do |obj|
      next if known_keys.include?(obj.key)
      synced << Song.create!(s3_key: obj.key, s3_url: public_url_for(obj.key))
    end
    synced
  end

  def list_audio_objects
    objects = []
    @client.list_objects_v2(bucket: @bucket, prefix: AUDIO_PREFIX).each do |response|
      response.contents.each do |obj|
        ext = File.extname(obj.key).downcase
        objects << obj if AUDIO_EXTENSIONS.include?(ext)
      end
    end
    objects
  rescue Aws::S3::Errors::ServiceError => e
    Rails.logger.error("S3 error: #{e.message}")
    []
  end

  def download_object(key, local_path)
    @client.get_object(bucket: @bucket, key: key, response_target: local_path)
  end

  def put_object(key, local_path, ext)
    content_type = CONTENT_TYPES.fetch(ext.downcase, "application/octet-stream")
    File.open(local_path, "rb") do |file|
      @client.put_object(bucket: @bucket, key: key, body: file, content_type: content_type)
    end
  end

  def delete_object(key)
    @client.delete_object(bucket: @bucket, key: key)
  rescue Aws::S3::Errors::ServiceError => e
    Rails.logger.error("S3 delete error: #{e.message}")
  end

  def public_url_for(key)
    "#{@public_url}/#{@bucket}/#{key}"
  end
end

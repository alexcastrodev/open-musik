require "aws-sdk-s3"

class UploadAudioFileJob < ApplicationJob
  queue_as :default

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
    ".aif"  => "audio/aiff",
  }.freeze

  def perform(tmp_path, original_filename)
    unless File.exist?(tmp_path)
      Rails.logger.error("[UploadAudioFileJob] File not found: #{tmp_path}")
      return
    end

    ext = File.extname(original_filename).downcase
    safe_name = original_filename.gsub(/[^0-9A-Za-z.\-]/, "_")
    s3_key = "tracks/#{safe_name}"

    if Song.exists?(s3_key: s3_key)
      Rails.logger.info("[UploadAudioFileJob] Already exists: #{s3_key}")
      FileUtils.rm_f(tmp_path)
      return
    end

    s3 = build_s3_client
    bucket = ENV["S3_BUCKET"]
    public_base = (ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"]).to_s.chomp("/")
    content_type = CONTENT_TYPES.fetch(ext, "application/octet-stream")

    File.open(tmp_path, "rb") do |file|
      s3.put_object(
        bucket: bucket,
        key: s3_key,
        body: file,
        content_type: content_type
      )
    end

    s3_url = "#{public_base}/#{bucket}/#{s3_key}"
    song = Song.create!(s3_key: s3_key, s3_url: s3_url)
    EnrichSongMetadataJob.perform_later(song.id)

    Rails.logger.info("[UploadAudioFileJob] Imported: #{original_filename} → #{s3_url}")
  rescue => e
    Rails.logger.error("[UploadAudioFileJob] Failed #{original_filename}: #{e.message}")
  ensure
    FileUtils.rm_f(tmp_path)
  end

  private

  def build_s3_client
    Aws::S3::Client.new(
      access_key_id: ENV["S3_ACCESS_KEY_ID"],
      secret_access_key: ENV["S3_SECRET_ACCESS_KEY"],
      region: ENV.fetch("AWS_REGION", "us-east-1"),
      endpoint: ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"],
      force_path_style: true
    )
  end
end

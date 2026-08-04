require "aws-sdk-s3"

class ImportLocalTracksJob < ApplicationJob
  queue_as :default

  TRACKS_DIR = Rails.root.join("tmp", "tracks")

  def perform
    mp3_files = Dir.glob(TRACKS_DIR.join("*.mp3"))
    puts "[ImportLocalTracksJob] Found #{mp3_files.size} MP3 file(s) in #{TRACKS_DIR}"

    if mp3_files.empty?
      Rails.logger.info("[ImportLocalTracksJob] No MP3 files found in #{TRACKS_DIR}")
      return
    end

    s3 = build_s3_client
    bucket = ENV["S3_BUCKET"]
    public_base = (ENV["S3_PUBLIC_URL"].presence || ENV["S3_ENDPOINT"]).to_s.chomp("/")

    mp3_files.each do |path|
      filename = File.basename(path)
      s3_key = "tracks/#{filename}"

      if Song.exists?(s3_key: s3_key)
        Rails.logger.info("[ImportLocalTracksJob] Already imported: #{filename}")
        next
      end

      File.open(path, "rb") do |file|
        s3.put_object(
          bucket: bucket,
          key: s3_key,
          body: file,
          content_type: "audio/mpeg"
        )
      end

      s3_url = "#{public_base}/#{bucket}/#{s3_key}"
      Song.create!(s3_key: s3_key, s3_url: s3_url)

      Rails.logger.info("[ImportLocalTracksJob] Imported: #{filename} → #{s3_url}")
    rescue => e
      Rails.logger.error("[ImportLocalTracksJob] Failed to import #{filename}: #{e.message}")
    end
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

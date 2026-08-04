class AudioUploadService
  ALLOWED_EXTENSIONS = %w[.mp3 .flac .wav .aac .ogg .opus .m4a .wma .aiff .aif].freeze
  ALLOWED_AUDIO_TYPES = %w[
    audio/mpeg audio/mp3 audio/flac audio/x-flac audio/wav audio/x-wav
    audio/aac audio/ogg audio/vorbis audio/opus audio/mp4 audio/x-m4a
    audio/m4a audio/aiff audio/x-aiff audio/wma audio/x-ms-wma
  ].freeze

  def initialize
    @s3 = S3BrowserService.new
  end

  def enqueue(files)
    queued = 0
    Array(files).each do |file|
      next unless allowed?(file)

      s3_key = "tracks/#{sanitize(file.original_filename)}"
      next if Song.exists?(s3_key: s3_key)

      @s3.put_object(s3_key, file.tempfile.path, File.extname(file.original_filename).downcase)
      ProcessUploadedSongJob.perform_later(s3_key, file.original_filename, file.size)
      queued += 1
    end
    queued
  end

  private

  def allowed?(file)
    ext = File.extname(file.original_filename).downcase
    content_type = file.content_type.to_s.split(";").first.strip
    ALLOWED_EXTENSIONS.include?(ext) || ALLOWED_AUDIO_TYPES.include?(content_type)
  end

  def sanitize(filename)
    filename.gsub(/[^0-9A-Za-z.\-]/, "_")
  end
end

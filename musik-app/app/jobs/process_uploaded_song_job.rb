class ProcessUploadedSongJob < ApplicationJob
  queue_as :default

  def perform(s3_key, original_filename, file_size = nil)
    return if Song.exists?(s3_key: s3_key)

    s3 = S3BrowserService.new
    s3_url = s3.public_url_for(s3_key)

    begin
      song = Song.create!(s3_key: s3_key, s3_url: s3_url,
                          original_filename: original_filename, file_size: file_size)
      EnrichSongMetadataJob.perform_later(song.id)
      Rails.logger.info("[ProcessUploadedSongJob] Created song #{song.id} from #{original_filename}")
    rescue => e
      Rails.logger.error("[ProcessUploadedSongJob] Failed #{original_filename}: #{e.message}")
    end
  end
end

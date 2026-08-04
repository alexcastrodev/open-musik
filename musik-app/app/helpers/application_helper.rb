module ApplicationHelper
  def presigned_stream_url(song)
    song.s3_url
  end
end

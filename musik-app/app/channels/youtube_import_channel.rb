class YoutubeImportChannel < ActionCable::Channel::Base
  def subscribed
    stream_from "youtube_import_#{params[:import_id]}"
  end

  def unsubscribed
  end
end

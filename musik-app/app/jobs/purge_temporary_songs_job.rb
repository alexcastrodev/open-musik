class PurgeTemporarySongsJob < ApplicationJob
  queue_as :default

  CACHE_TTL = 7.days

  # Remove faixas temporárias (resolvidas pelo provider via bot) cujo último play
  # passou do TTL de cache. Apaga o objeto no S3 e o registro. Songs permanentes
  # (import pela UI web) nunca são tocadas aqui.
  def perform
    s3 = S3BrowserService.new

    Song.where(is_temporary: true)
        .where("last_played_at IS NULL OR last_played_at < ?", CACHE_TTL.ago)
        .find_each do |song|
      s3.delete_object(song.s3_key)
      song.destroy!
    rescue => e
      Rails.logger.error("[PurgeTemporarySongsJob] falhou ao remover song #{song.id}: #{e.message}")
    end
  end
end

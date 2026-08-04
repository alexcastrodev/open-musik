class AddMultiProviderFields < ActiveRecord::Migration[8.1]
  def change
    # Candidatos de stream ordenados que o bot tenta tocar antes de cair pro
    # cache S3: [{ "provider" => "soundcloud", "url" => "..." }, ...].
    # O bot resolve cada um com yt-dlp no próprio IP (ver bot player.js).
    add_column :play_queue_items, :stream_candidates, :jsonb, default: [], null: false

    # De onde a Song foi realmente cacheada. Antes só YouTube (youtube_url);
    # agora a fonte pode ser SoundCloud — dedup passa a usar source_url.
    add_column :songs, :source_provider, :string
    add_column :songs, :source_url, :string
    add_index  :songs, :source_url
  end
end

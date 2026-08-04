class PlaylistsController < ApplicationController
  before_action :set_playlist, only: %i[show update destroy add_song remove_song reorder]

  def index
    playlists = Playlist.all.map do |p|
      {
        id: p.id,
        name: p.name,
        description: p.description,
        songs_count: p.songs.count,
        cover: p.cover
      }
    end
    render inertia: "Playlists/Index", props: { playlists: playlists }
  end

  def show
    songs = @playlist.songs.map { |s| song_json(s) }
    render inertia: "Playlists/Show", props: {
      playlist: {
        id: @playlist.id,
        name: @playlist.name,
        description: @playlist.description,
        songs_count: songs.size,
        cover: @playlist.cover,
        songs: songs
      }
    }
  end

  def create
    playlist = Playlist.new(playlist_params)
    if playlist.save
      redirect_to playlists_path, notice: "Playlist criada."
    else
      redirect_to playlists_path, alert: playlist.errors.full_messages.to_sentence
    end
  end

  def update
    if @playlist.update(playlist_params)
      redirect_to playlist_path(@playlist), notice: "Playlist atualizada."
    else
      redirect_to playlist_path(@playlist), alert: @playlist.errors.full_messages.to_sentence
    end
  end

  def destroy
    @playlist.destroy
    redirect_to playlists_path, notice: "Playlist excluída."
  end

  def add_song
    song = Song.find(params[:song_id])
    @playlist.songs << song unless @playlist.songs.include?(song)
    redirect_back_or_to playlist_path(@playlist)
  end

  def reorder
    ids = params[:ids] || []
    ids.each_with_index do |song_id, position|
      @playlist.playlist_songs.where(song_id: song_id).update_all(position: position)
    end
    head :ok
  end

  def remove_song
    song = Song.find(params[:song_id])
    @playlist.songs.delete(song)
    redirect_to playlist_path(@playlist)
  end

  private

  def set_playlist
    @playlist = Playlist.find(params[:id])
  end

  def playlist_params
    params.require(:playlist).permit(:name, :description)
  end

  def song_json(song)
    {
      id: song.id,
      uuid: song.uuid,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      cover_url: song.cover_url,
      s3_url: song.s3_url,
      display_title: song.display_title,
      display_artist: song.display_artist,
      display_cover: song.display_cover,
      formatted_duration: song.formatted_duration,
      play_count: song.play_count
    }
  end
end

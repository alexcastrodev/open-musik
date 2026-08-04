class ManageController < ApplicationController
  # Página de administração da biblioteca. Busca + paginação server-side: antes
  # carregava TODAS as músicas (com 15 campos derivados cada) num único props do
  # Inertia — pesado e crescendo com a biblioteca. O frontend recarrega via
  # partial reload (ver pages/Manage/useManageFilter.js).
  PER_PAGE = 100

  def index
    authorize :manage

    q = params[:q].to_s.strip
    scope = Song.order(:artist, :title)
    if q.present?
      like = "%#{q}%"
      scope = scope.where(
        "title ILIKE :like OR artist ILIKE :like OR album ILIKE :like",
        like: like
      )
    end

    total = scope.count(:all)
    max_page = [ (total.to_f / PER_PAGE).ceil, 1 ].max
    page = params[:page].to_i.clamp(1, max_page)

    songs = scope.offset((page - 1) * PER_PAGE).limit(PER_PAGE).map { |s| song_row(s) }

    render inertia: "Manage/Index", props: {
      songs: songs,
      total: total,
      page: page,
      per_page: PER_PAGE,
      query: q
    }
  end

  private

  def song_row(s)
    {
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      duration: s.duration,
      cover_url: s.cover_url,
      s3_url: s.s3_url,
      unavailable: s.unavailable?,
      display_title: s.display_title,
      display_artist: s.display_artist,
      display_cover: s.display_cover,
      formatted_duration: s.formatted_duration,
      file_size: s.file_size,
      formatted_file_size: s.formatted_file_size,
      play_count: s.play_count,
      version_label: s.version_label
    }
  end
end

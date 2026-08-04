import React, { useState, useRef } from 'react'
import { usePage, router } from '@inertiajs/react'
import { usePlayerStore } from '../../stores/playerStore'

export default function PlaylistShow() {
  const { playlist } = usePage().props
  const loadQueue = usePlayerStore((s) => s.loadQueue)

  const [songs, setSongs] = useState(playlist.songs)
  const dragIndex = useRef(null)
  const dragOverIndex = useRef(null)

  function handlePlayAll() {
    if (songs.length === 0) return
    loadQueue(songs, 0)
  }

  function handleRowClick(index) {
    loadQueue(songs, index)
  }

  function handleRemoveSong(song) {
    if (!window.confirm(`Remover "${song.display_title}" da playlist?`)) return
    router.delete(`/playlists/${playlist.id}/remove_song?song_id=${song.id}`, {
      onSuccess: () => {
        setSongs((prev) => prev.filter((s) => s.id !== song.id))
      },
    })
  }

  // ── Drag-and-drop reorder ──────────────────────────────────────────────────

  function handleDragStart(index) {
    dragIndex.current = index
  }

  function handleDragOver(e, index) {
    e.preventDefault()
    dragOverIndex.current = index
  }

  function handleDrop() {
    if (dragIndex.current === null || dragOverIndex.current === null) return
    if (dragIndex.current === dragOverIndex.current) return

    const reordered = [...songs]
    const [moved] = reordered.splice(dragIndex.current, 1)
    reordered.splice(dragOverIndex.current, 0, moved)
    setSongs(reordered)
    dragIndex.current = null
    dragOverIndex.current = null

    router.patch(`/playlists/${playlist.id}/reorder`, {
      ids: reordered.map((s) => s.id),
    })
  }

  function handleDragEnd() {
    dragIndex.current = null
    dragOverIndex.current = null
  }

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Hero */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <img
          src={playlist.cover}
          alt={playlist.name}
          className="w-48 h-48 rounded-xl object-cover border border-zinc-800 shadow-xl flex-none"
          onError={(e) => {
            e.currentTarget.src = '/default_cover.svg'
          }}
        />
        <div className="flex flex-col gap-2 justify-end">
          <p className="text-zinc-500 text-xs uppercase tracking-widest">Playlist</p>
          <h1 className="text-zinc-100 text-3xl font-bold leading-tight">{playlist.name}</h1>
          {playlist.description && (
            <p className="text-zinc-400 text-sm max-w-md">{playlist.description}</p>
          )}
          <p className="text-zinc-500 text-sm">
            {songs.length} {songs.length === 1 ? 'música' : 'músicas'}
          </p>
          {songs.length > 0 && (
            <button
              onClick={handlePlayAll}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-sm transition-colors w-fit"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Tocar tudo
            </button>
          )}
        </div>
      </div>

      {/* Song table */}
      {songs.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p>Nenhuma música nesta playlist.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_3rem_1fr_1fr_4rem_2rem] gap-3 items-center px-3 py-2 border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
            <span className="text-center">#</span>
            <span />
            <span>Título</span>
            <span>Álbum</span>
            <span className="text-right">Duração</span>
            <span />
          </div>

          {/* Rows */}
          {songs.map((song, index) => (
            <div
              key={song.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onClick={() => handleRowClick(index)}
              className="group grid grid-cols-[2rem_3rem_1fr_1fr_4rem_2rem] gap-3 items-center px-3 py-2 rounded-lg hover:bg-zinc-800 cursor-pointer transition-colors"
            >
              {/* # */}
              <span className="text-zinc-500 text-sm text-center group-hover:hidden">
                {index + 1}
              </span>
              <span className="hidden group-hover:flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </span>

              {/* Cover */}
              <img
                src={song.display_cover}
                alt={song.display_title}
                className="w-10 h-10 rounded object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/default_cover.svg'
                }}
                loading="lazy"
              />

              {/* Title / Artist */}
              <div className="min-w-0">
                <p className="text-zinc-100 text-sm font-medium truncate">{song.display_title}</p>
                <p className="text-zinc-400 text-xs truncate">{song.display_artist}</p>
              </div>

              {/* Album */}
              <p className="text-zinc-500 text-xs truncate">{song.album ?? '—'}</p>

              {/* Duration */}
              <p className="text-zinc-500 text-xs text-right">{song.formatted_duration}</p>

              {/* Remove */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveSong(song)
                }}
                title="Remover da playlist"
                className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

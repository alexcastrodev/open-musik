import React, { useState } from 'react'
import { usePage, router, Link } from '@inertiajs/react'

export default function PlaylistsIndex() {
  const { playlists } = usePage().props
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    router.post(
      '/playlists',
      { playlist: { name: name.trim(), description: description.trim() || null } },
      {
        onFinish: () => {
          setSubmitting(false)
          setName('')
          setDescription('')
        },
      },
    )
  }

  function handleDelete(playlist) {
    if (!window.confirm(`Excluir playlist "${playlist.name}"?`)) return
    router.delete(`/playlists/${playlist.id}`)
  }

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Header */}
      <div>
        <h1 className="text-zinc-100 text-2xl font-bold">Playlists</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
        </p>
      </div>

      {/* Nova Playlist form */}
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3"
      >
        <h2 className="text-zinc-100 font-semibold text-base">Nova Playlist</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da playlist"
            required
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição (opcional)"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500 transition-colors"
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg text-sm transition-colors whitespace-nowrap"
          >
            Criar
          </button>
        </div>
      </form>

      {/* Grid */}
      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
          <svg
            className="w-16 h-16 mb-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
          </svg>
          <p className="text-lg">Nenhuma playlist ainda.</p>
          <p className="text-sm mt-1 text-zinc-600">Crie a primeira acima.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="group relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:bg-zinc-800 hover:border-zinc-700 transition-all">
              <Link href={`/playlists/${playlist.id}`} className="flex-1 flex flex-col min-w-0">
                {/* Cover */}
                <div className="aspect-square w-full overflow-hidden">
                  <img
                    src={playlist.cover}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/default_cover.svg'
                    }}
                    loading="lazy"
                  />
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="text-zinc-100 text-sm font-medium truncate">{playlist.name}</p>
                  <p className="text-zinc-400 text-xs mt-0.5">
                    {playlist.songs_count} {playlist.songs_count === 1 ? 'música' : 'músicas'}
                  </p>
                </div>
              </Link>

              {/* Delete button */}
              <button
                onClick={() => handleDelete(playlist)}
                title="Excluir playlist"
                className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

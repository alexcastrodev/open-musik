import React, { useState, useMemo, useCallback } from 'react'
import { usePage, router } from '@inertiajs/react' // router used in handleSearch
import SongCard from '../../components/SongCard'
import { usePlayerStore } from '../../stores/playerStore'

export default function SongsIndex() {
  const { display_items, top_songs, query: initialQuery } = usePage().props
  const loadQueue = usePlayerStore((s) => s.loadQueue)
  const [search, setSearch] = useState(initialQuery ?? '')

  const allSongs = useMemo(() =>
    display_items.map((item) => item.song),
  [display_items])

  const albumGroups = useMemo(() => {
    const map = new Map()
    allSongs.forEach((s) => {
      const key = s.album?.trim() || 'Sem álbum'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    })
    return Array.from(map.entries()).map(([name, songs]) => ({ name, songs }))
  }, [allSongs])

  const artistGroups = useMemo(() => {
    const map = new Map()
    allSongs.forEach((s) => {
      const key = s.display_artist?.trim() || 'Desconhecido'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(s)
    })
    return Array.from(map.entries()).map(([name, songs]) => ({ name, songs }))
  }, [allSongs])

  const handleSearch = useCallback((value) => {
    setSearch(value)
    router.reload({ data: { q: value || undefined }, only: ['display_items', 'query'], replace: true })
  }, [])

  const hasQuery = search.trim().length > 0

  if (display_items.length === 0 && !hasQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-500">
        <svg
          className="w-16 h-16 mb-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        >
          <circle cx="9" cy="18" r="3" />
          <circle cx="15" cy="15" r="3" />
          <line x1="12" y1="15" x2="12" y2="3" />
          <polyline points="12 3 20 3 20 11" />
        </svg>
        <p className="text-lg">Nenhuma música na biblioteca.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 pb-32">
      {/* Search bar */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar músicas, artistas, álbuns..."
          autoComplete="off"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        />
      </div>

      {/* Mais tocadas */}
      {!hasQuery && top_songs.length > 0 && (
        <section>
          <h2 className="text-zinc-100 text-lg font-semibold mb-3">Mais tocadas</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {top_songs.map((song, i) => (
              <div key={song.id} className="flex-none w-40">
                <SongCard song={song} queue={top_songs} index={i} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Músicas */}
      <section>
        <h2 className="text-zinc-100 text-lg font-semibold mb-3">Músicas</h2>
        {display_items.length === 0 ? (
          <p className="text-zinc-500 text-sm">Nenhum resultado para "{search}".</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {display_items.map((item) => (
              <SongCard key={item.song.id} song={item.song} queue={allSongs} index={allSongs.findIndex((s) => s.id === item.song.id)} />
            ))}
          </div>
        )}
      </section>

      {/* Álbuns */}
      {!hasQuery && albumGroups.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-zinc-100 text-lg font-semibold">Álbuns</h2>
            <span className="text-zinc-500 text-sm">{albumGroups.length} álbuns</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {albumGroups.map((group) => (
              <button
                key={group.name}
                onClick={() => loadQueue(group.songs, 0)}
                className="flex-none w-36 group cursor-pointer text-left focus:outline-none"
              >
                <div className="relative aspect-square w-36 rounded-xl overflow-hidden border border-zinc-800 group-hover:border-zinc-700 transition-all group-hover:scale-105">
                  <img
                    src={group.songs[0].display_cover}
                    alt={group.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.src = '/default_cover.svg' }}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  </div>
                </div>
                <p className="text-zinc-100 text-xs font-medium mt-2 truncate">{group.name}</p>
                <p className="text-zinc-400 text-xs truncate">{group.songs[0].display_artist}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Artistas */}
      {!hasQuery && artistGroups.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-zinc-100 text-lg font-semibold">Artistas</h2>
            <span className="text-zinc-500 text-sm">{artistGroups.length} artistas</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {artistGroups.map((group) => (
              <button
                key={group.name}
                onClick={() => loadQueue(group.songs, 0)}
                className="flex-none w-32 group cursor-pointer text-left focus:outline-none"
              >
                <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-zinc-800 group-hover:border-orange-500 transition-all group-hover:scale-105">
                  <img
                    src={group.songs[0].display_cover}
                    alt={group.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.src = '/default_cover.svg' }}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  </div>
                </div>
                <p className="text-zinc-100 text-xs font-medium mt-2 truncate text-center">{group.name}</p>
                <p className="text-zinc-500 text-xs truncate text-center">
                  {group.songs.length} {group.songs.length === 1 ? 'música' : 'músicas'}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

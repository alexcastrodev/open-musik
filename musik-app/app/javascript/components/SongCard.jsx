import React from 'react'
import { Link } from '@inertiajs/react'
import { usePlayerStore } from '../stores/playerStore'

export default function SongCard({ song, queue, index }) {
  const loadQueue = usePlayerStore((s) => s.loadQueue)

  function handlePlay(e) {
    e.preventDefault()
    loadQueue(queue, index)
  }

  return (
    <div
      className="group relative flex flex-col cursor-pointer bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:bg-zinc-800 transition-all duration-200 hover:scale-105 hover:border-zinc-700"
      onClick={handlePlay}
    >
      {/* Cover */}
      <div className="relative aspect-square w-full overflow-hidden">
        <img
          src={song.display_cover}
          alt={song.display_title}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = '/default_cover.svg'
          }}
          loading="lazy"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
            <svg
              className="w-5 h-5 text-white ml-0.5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        </div>
        {/* Link para a página da música (copiar URL do provider) — não toca */}
        <Link
          href={`/songs/${song.uuid}`}
          onClick={(e) => e.stopPropagation()}
          title="Abrir página / copiar URL"
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <svg
            className="w-4 h-4 text-zinc-100"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </Link>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-0.5 min-w-0">
        <p className="text-zinc-100 text-sm font-medium truncate leading-tight">
          {song.display_title}
        </p>
        <p className="text-zinc-400 text-xs truncate">{song.display_artist}</p>
        {song.album && (
          <p className="text-zinc-500 text-xs truncate">{song.album}</p>
        )}
        <p className="text-zinc-500 text-xs mt-1">{song.formatted_duration}</p>
      </div>
    </div>
  )
}

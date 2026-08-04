import React, { useRef } from 'react'
import { usePlayerStore, formatTime } from '../stores/playerStore'
import { useShareSong } from '../hooks/useShareSong'

export default function Player() {
  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const playing = usePlayerStore((s) => s.playing)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const loading = usePlayerStore((s) => s.loading)

  const { togglePlay, next, previous, seek, toggleShuffle, toggleRepeat } =
    usePlayerStore.getState()

  const progressRef = useRef(null)

  const song = queue[currentIndex]
  const { copied, share } = useShareSong(song)

  if (queue.length === 0) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  function handleProgressClick(e) {
    if (!progressRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seek(fraction * duration)
  }

  const repeatLabel =
    repeat === 'one' ? 'Repetir uma' : repeat === 'all' ? 'Repetir tudo' : 'Repetir'

  return (
    <div className="fixed bottom-[4.25rem] sm:bottom-0 left-0 right-0 z-40 bg-zinc-900 border-t border-zinc-800 px-4 pt-2 pb-2 select-none" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      {/* Progress bar */}
      <div
        ref={progressRef}
        className="w-full h-1 bg-zinc-700 rounded-full cursor-pointer mb-2 group"
        onClick={handleProgressClick}
        role="slider"
        aria-label="Progresso da música"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
      >
        <div
          className="h-full bg-orange-500 rounded-full relative transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Song info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <img
            src={song.display_cover || '/default_cover.svg'}
            alt={song.display_title}
            className="w-10 h-10 rounded object-cover flex-shrink-0"
            onError={(e) => { e.currentTarget.src = '/default_cover.svg' }}
          />
          <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-white text-sm font-medium truncate leading-tight">
                {song.display_title || '—'}
              </p>
            </div>
            <p className="text-zinc-400 text-xs truncate leading-none">
              {song.display_artist || ''}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          {/* Shuffle */}
          <button
            onClick={toggleShuffle}
            title="Aleatório"
            aria-pressed={shuffle}
            className={`hidden sm:block p-2 rounded-full transition-colors ${
              shuffle ? 'text-orange-500 hover:text-orange-400' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8"/>
              <line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/>
              <line x1="15" y1="15" x2="21" y2="21"/>
            </svg>
          </button>

          {/* Previous */}
          <button onClick={previous} title="Anterior" className="p-2 rounded-full text-zinc-400 hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="19 20 9 12 19 4 19 20"/>
              <line x1="5" y1="19" x2="5" y2="5"/>
            </svg>
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            title={playing ? 'Pausar' : 'Reproduzir'}
            className="w-10 h-10 rounded-full bg-orange-500 hover:bg-orange-400 text-white flex items-center justify-center transition-colors flex-shrink-0"
          >
            {loading ? (
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            ) : playing ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            )}
          </button>

          {/* Next */}
          <button onClick={next} title="Próxima" className="p-2 rounded-full text-zinc-400 hover:text-white transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 4 15 12 5 20 5 4"/>
              <line x1="19" y1="5" x2="19" y2="19"/>
            </svg>
          </button>

          {/* Repeat */}
          <button
            onClick={toggleRepeat}
            title={repeatLabel}
            aria-pressed={repeat !== 'none'}
            className={`hidden sm:block p-2 rounded-full transition-colors ${
              repeat !== 'none' ? 'text-orange-500 hover:text-orange-400' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {repeat === 'one' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                <line x1="12" y1="12" x2="12" y2="18"/>
                <line x1="9" y1="14" x2="12" y2="12"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            )}
          </button>

          {/* Share */}
          <button
            onClick={share}
            title={copied ? 'Link copiado!' : 'Compartilhar'}
            aria-label="Compartilhar"
            className={`p-2 rounded-full transition-colors ${
              copied ? 'text-orange-500' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            )}
          </button>
        </div>

        {/* Time display */}
        <div className="hidden sm:flex items-center gap-1 text-zinc-400 text-xs flex-shrink-0 tabular-nums w-20 justify-end">
          <span>{formatTime(currentTime)}</span>
          <span>/</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}

import React, { useState, useCallback } from 'react'
import { usePage } from '@inertiajs/react'
import { usePlayerStore } from '../../stores/playerStore'

export default function SongShow() {
  const { song, public_url } = usePage().props
  const loadQueue = usePlayerStore((s) => s.loadQueue)
  const [copied, setCopied] = useState(false)

  const handlePlay = useCallback(() => {
    loadQueue([song], 0)
  }, [loadQueue, song])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(public_url)
    } catch {
      // Fallback para contextos sem clipboard API (http/permissão negada).
      const input = document.getElementById('public-url-input')
      input?.select()
      document.execCommand('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [public_url])

  return (
    <div className="flex flex-col gap-8 pb-32 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-end">
        <img
          src={song.display_cover}
          alt={song.display_title}
          className="w-48 h-48 rounded-xl object-cover shadow-lg border border-zinc-800"
          onError={(e) => {
            e.currentTarget.src = '/default_cover.svg'
          }}
        />
        <div className="flex flex-col gap-2 min-w-0 text-center sm:text-left">
          <p className="text-zinc-500 text-xs uppercase tracking-wide">Música</p>
          <h1 className="text-3xl font-bold text-zinc-100 truncate">{song.display_title}</h1>
          <p className="text-zinc-400 truncate">{song.display_artist}</p>
          {song.album && <p className="text-zinc-500 text-sm truncate">{song.album}</p>}
          <p className="text-zinc-500 text-sm">{song.formatted_duration}</p>
          <button
            type="button"
            onClick={handlePlay}
            className="mt-3 self-center sm:self-start inline-flex items-center gap-2 rounded-full bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium px-5 py-2 transition-colors"
          >
            <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Tocar
          </button>
        </div>
      </div>

      {/* URL pública: cole no /play do bot para tocar esta faixa direto do S3. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="public-url-input" className="text-zinc-400 text-sm">
          URL para o bot
        </label>
        <div className="flex gap-2">
          <input
            id="public-url-input"
            type="text"
            readOnly
            value={public_url}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 font-mono"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium px-4 py-2 transition-colors"
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <p className="text-zinc-500 text-xs">
          Use <span className="font-mono">/play {public_url}</span> no Discord para tocar do cache.
        </p>
      </div>
    </div>
  )
}

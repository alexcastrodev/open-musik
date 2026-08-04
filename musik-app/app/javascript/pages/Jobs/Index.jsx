import React, { useState, useEffect, useRef } from 'react'
import { router } from '@inertiajs/react'
import HttpClient from '../../lib/httpClient'
import { useUploadStore } from '../../stores/uploadStore'

const STATUS_COLORS = {
  processing: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  completed: 'bg-green-900/40 text-green-300 border-green-700',
  error: 'bg-red-900/40 text-red-300 border-red-700',
  duplicate: 'bg-zinc-800 text-zinc-400 border-zinc-700',
}

const STATUS_LABELS = {
  processing: 'A processar...',
  completed: 'Concluído',
  error: 'Erro',
  duplicate: 'Duplicado',
}

const ACTION_STATUS_COLORS = {
  pending: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  processing: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  done: 'bg-green-900/40 text-green-300 border-green-700',
  failed: 'bg-red-900/40 text-red-300 border-red-700',
}

const ACTION_STATUS_LABELS = {
  pending: 'Na fila',
  processing: 'A processar...',
  done: 'Concluído',
  failed: 'Falhou',
}

const ACTION_KIND_LABELS = {
  play: 'Tocar',
  skip: 'Pular',
  stop: 'Parar',
  nowplaying: 'A tocar',
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
}

export default function JobsIndex({ imports: initialImports, bot_actions: botActions = [] }) {
  const [imports, setImports] = useState(initialImports)
  const [retrying, setRetrying] = useState({})
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const upload = useUploadStore((s) => s.upload)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const hasProcessing = imports.some((i) => i.status === 'processing')
    if (!hasProcessing) return

    const interval = setInterval(() => {
      HttpClient.get('/songs/imports')
        .then((data) => setImports(data))
        .catch(() => {})
    }, 3000)

    return () => clearInterval(interval)
  }, [imports])

  // Comandos do bot resolvem em segundos: recarrega só essa prop via Inertia.
  useEffect(() => {
    const interval = setInterval(() => {
      router.reload({ only: ['bot_actions'] })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setSubmitting(true)
    setSubmitError(null)

    HttpClient.post('/songs/import_youtube', { youtube_url: trimmed })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Erro ao importar')
        setUrl('')
        HttpClient.get('/songs/imports')
          .then(setImports)
          .catch(() => {})
      })
      .catch((err) => setSubmitError(err.message))
      .finally(() => setSubmitting(false))
  }

  function handleUpload(e) {
    if (!e.target.files.length) return
    upload(e.target.files)
    fileInputRef.current.value = ''
  }

  function handleRetry(importId) {
    setRetrying((r) => ({ ...r, [importId]: true }))
    HttpClient.post(`/songs/${importId}/retry_import`)
      .then((r) => r.json())
      .then(() => {
        setRetrying((r) => ({ ...r, [importId]: false }))
        setImports((prev) =>
          prev.map((i) =>
            i.import_id === importId ? { ...i, status: 'processing', message: 'Na fila...' } : i,
          ),
        )
      })
      .catch(() => setRetrying((r) => ({ ...r, [importId]: false })))
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Importar música</h1>
        <p className="text-zinc-500 text-sm mb-6">Importa do YouTube ou envia ficheiros do teu computador.</p>

        <h2 className="text-base font-semibold text-zinc-300 mb-3">Do computador</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.flac,.wav,.mp3,.aac,.ogg,.m4a,.opus,.wma,.aiff,.aif"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
          </svg>
          Selecionar ficheiros
        </button>
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-300 mb-3">Do YouTube</h2>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setSubmitError(null) }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
          />
          <button
            type="submit"
            disabled={submitting || !url.trim()}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0 flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            {submitting ? 'A importar...' : 'Importar'}
          </button>
        </form>
        {submitError && <p className="text-red-400 text-xs mt-2">{submitError}</p>}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Histórico de importações</h2>
        {imports.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <p>Nenhuma importação ainda.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {imports.map((imp) => (
              <div
                key={imp.import_id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">{imp.youtube_url}</p>
                  <p className="text-xs text-zinc-500 mt-1">{imp.message}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {imp.status === 'processing' && (
                    <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span
                    className={`text-xs px-2 py-1 rounded border ${
                      STATUS_COLORS[imp.status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {STATUS_LABELS[imp.status] || imp.status}
                  </span>
                  {imp.status === 'error' && (
                    <button
                      onClick={() => handleRetry(imp.import_id)}
                      disabled={retrying[imp.import_id]}
                      className="text-xs px-3 py-1 rounded bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50"
                    >
                      {retrying[imp.import_id] ? 'A tentar...' : 'Retry'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Comandos do bot</h2>
        {botActions.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <p>Nenhum comando do bot ainda.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {botActions.map((a) => (
              <div
                key={a.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4"
              >
                <span className="text-xs px-2 py-1 rounded border bg-zinc-800 text-zinc-300 border-zinc-700 flex-shrink-0">
                  {ACTION_KIND_LABELS[a.kind] || a.kind}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">
                    {a.song_title || (a.kind === 'play' ? 'A pesquisar...' : '—')}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 truncate">
                    {a.error_message ||
                      `guild ${a.discord_guild_id || '?'} · user ${a.discord_user_id || '?'} · ${formatTime(a.created_at)}`}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded border flex-shrink-0 ${
                    ACTION_STATUS_COLORS[a.status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}
                >
                  {ACTION_STATUS_LABELS[a.status] || a.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

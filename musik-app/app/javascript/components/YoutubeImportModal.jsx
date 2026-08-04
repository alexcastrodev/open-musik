import React, { useState, useRef, useEffect } from 'react'
import HttpClient from '../lib/httpClient'

const STATUS_COLORS = {
  processing: 'text-yellow-400',
  completed: 'text-green-400',
  error: 'text-red-400',
}

const STATUS_LABELS = {
  processing: 'A processar...',
  completed: 'Concluído',
  error: 'Erro',
}

export default function YoutubeImportModal({ onClose }) {
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [imports, setImports] = useState([])
  const [retrying, setRetrying] = useState({})
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    fetchImports()
  }, [])

  useEffect(() => {
    const hasProcessing = imports.some((i) => i.status === 'processing')
    if (!hasProcessing) return
    const timer = setInterval(fetchImports, 3000)
    return () => clearInterval(timer)
  }, [imports])

  function fetchImports() {
    HttpClient.get('/songs/imports').then(setImports).catch(() => {})
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setSubmitting(true)
    setError(null)

    HttpClient.post('/songs/import_youtube', { youtube_url: trimmed })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Erro ao importar')
        setUrl('')
        fetchImports()
      })
      .catch((err) => setError(err.message))
      .finally(() => setSubmitting(false))
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

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <h2 className="text-white font-semibold">Importar do YouTube</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 border-b border-zinc-800">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null) }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            <button
              type="submit"
              disabled={submitting || !url.trim()}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
            >
              {submitting ? 'A importar...' : 'Importar'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </form>

        {/* Imports list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {imports.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">Nenhuma importação ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {imports.map((imp) => (
                <div
                  key={imp.import_id}
                  className="bg-zinc-800 rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300 truncate">{imp.youtube_url}</p>
                    <p className={`text-xs mt-0.5 ${STATUS_COLORS[imp.status] || 'text-zinc-500'}`}>
                      {STATUS_LABELS[imp.status] || imp.status}
                      {imp.message && imp.status !== 'processing' ? ` — ${imp.message}` : ''}
                    </p>
                  </div>
                  {imp.status === 'processing' && (
                    <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                  {imp.status === 'error' && (
                    <button
                      onClick={() => handleRetry(imp.import_id)}
                      disabled={retrying[imp.import_id]}
                      className="text-xs px-2.5 py-1 rounded bg-orange-500 hover:bg-orange-400 text-white transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {retrying[imp.import_id] ? '...' : 'Retry'}
                    </button>
                  )}
                  {imp.status === 'completed' && (
                    <svg className="w-4 h-4 text-green-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

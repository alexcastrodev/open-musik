import React from 'react'
import { useUploadStore } from '../stores/uploadStore'

const STATUS_ICON = {
  pending: (
    <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-600" />
  ),
  uploading: (
    <div className="w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
  ),
  done: (
    <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
}

export default function UploadQueue() {
  const { files, dismiss } = useUploadStore()
  if (files.length === 0) return null

  const done = files.filter((f) => f.status === 'done').length
  const hasActive = files.some((f) => f.status === 'uploading' || f.status === 'pending')
  const allDone = !hasActive

  return (
    <div className="fixed bottom-24 sm:bottom-6 right-4 z-50 w-72 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-100">
          {allDone ? `${done} ficheiro${done !== 1 ? 's' : ''} enviado${done !== 1 ? 's' : ''}` : `A enviar… ${done}/${files.length}`}
        </span>
        {allDone && (
          <button onClick={dismiss} className="text-zinc-500 hover:text-zinc-200 transition-colors ml-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <ul className="max-h-60 overflow-y-auto divide-y divide-zinc-800/50">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex-shrink-0">{STATUS_ICON[f.status]}</span>
            <span className="text-xs text-zinc-300 truncate flex-1">{f.name}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

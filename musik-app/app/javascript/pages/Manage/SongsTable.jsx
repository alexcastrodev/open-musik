import React from 'react'
import CellContent from './CellContent'

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

function CloudOffIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function SongsTable({ songs, cellProps, onPurge, onDelete }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-left text-sm text-zinc-300 border-collapse">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900">
            <th className="px-4 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider w-1/4">Título</th>
            <th className="px-4 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider w-1/5">Artista</th>
            <th className="px-4 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider w-1/5">Álbum</th>
            <th className="px-4 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider w-1/6">Versão</th>
            <th className="px-4 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider w-20">Duração</th>
            <th className="px-4 py-3 text-zinc-500 font-medium text-xs uppercase tracking-wider w-20">Tamanho</th>
            <th className="px-4 py-3 w-10" />
            <th className="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody>
          {songs.map((song) => {
            return (
              <tr
                key={song.id}
                className="border-b border-zinc-800/50 hover:bg-zinc-900 transition-colors group"
              >
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <CellContent song={song} field="title" displayValue={song.title ?? ''} placeholder={song.display_title} {...cellProps} />
                    {song.unavailable && (
                      <span
                        title="Áudio liberado do S3 — será rebaixado ao tocar"
                        className="shrink-0 text-[10px] uppercase tracking-wider text-amber-400/80 border border-amber-500/30 rounded px-1.5 py-0.5"
                      >
                        sem cache
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <CellContent song={song} field="artist" displayValue={song.artist ?? ''} {...cellProps} />
                </td>
                <td className="px-2 py-1.5">
                  <CellContent song={song} field="album" displayValue={song.album ?? ''} {...cellProps} />
                </td>
                <td className="px-2 py-1.5">
                  <CellContent song={song} field="version_label" displayValue={song.version_label ?? ''} {...cellProps} />
                </td>
                <td className="px-4 py-1.5 text-zinc-500 text-xs whitespace-nowrap">
                  {song.formatted_duration}
                </td>
                <td className="px-4 py-1.5 text-zinc-500 text-xs whitespace-nowrap">
                  {song.formatted_file_size ?? '—'}
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => onPurge(song)}
                    disabled={song.unavailable}
                    title={song.unavailable ? 'Áudio já liberado do S3' : 'Liberar S3 (mantém nas playlists, rebaixa ao tocar)'}
                    className="w-7 h-7 rounded flex items-center justify-center text-zinc-600 hover:text-amber-400 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30 disabled:hover:text-zinc-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    <CloudOffIcon />
                  </button>
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => onDelete(song)}
                    title="Excluir de vez (sai de todas as playlists)"
                    className="w-7 h-7 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            )
          })}
          {songs.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                Nenhuma música encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

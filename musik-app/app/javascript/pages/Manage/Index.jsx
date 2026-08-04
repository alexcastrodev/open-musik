import React, { useState, useRef, useEffect } from 'react'
import { usePage } from '@inertiajs/react'
import HttpClient from '../../lib/httpClient'
import SongsTable from './SongsTable'
import { useManageFilter } from './useManageFilter'

export default function ManageIndex() {
  const { songs: serverSongs, total, page, per_page: perPage, query } = usePage().props
  const { search, handleSearch, goToPage } = useManageFilter(query)
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const [songs, setSongs] = useState(serverSongs)
  const [editing, setEditing] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { setSongs(serverSongs) }, [serverSongs])

  function startEdit(song, field) {
    const value = song[field] ?? ''
    setEditing({ songId: song.id, field, value })
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commitEdit() {
    if (!editing) return
    const { songId, field, value } = editing
    setEditing(null)
    setSongs((prev) => prev.map((s) => (s.id === songId ? { ...s, [field]: value || null } : s)))
    HttpClient.patch(`/songs/${songId}`, { song: { [field]: value || null } })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') setEditing(null)
  }

  // Libera o S3 mas mantém a música nas playlists (rebaixa ao tocar).
  function handlePurge(song) {
    if (!window.confirm(`Liberar o arquivo S3 de "${song.display_title}"? A música continua nas playlists e será rebaixada ao tocar.`)) return
    HttpClient.delete(`/songs/${song.id}/purge`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => window.alert(e.error || 'Não foi possível liberar o S3.'))
        setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, s3_url: null, unavailable: true } : s)))
      })
  }

  // Exclui de vez: some de todas as playlists, sem volta.
  function handleDelete(song) {
    if (!window.confirm(`Excluir "${song.display_title}" DE VEZ? Sai de TODAS as playlists e não pode ser desfeito.`)) return
    HttpClient.delete(`/songs/${song.id}`)
      .then(() => setSongs((prev) => prev.filter((s) => s.id !== song.id)))
  }

  const cellProps = {
    editing,
    inputRef,
    onStartEdit: startEdit,
    onChange: (e) => setEditing((prev) => prev ? { ...prev, value: e.target.value } : null),
    onBlur: commitEdit,
    onKeyDown: handleKeyDown,
  }

  return (
    <div className="flex flex-col gap-6 pb-32">
      <div>
        <h1 className="text-zinc-100 text-2xl font-bold">Catálogo</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {total} música{total !== 1 ? 's' : ''} — clique em um campo para editar
        </p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Buscar por título, artista ou álbum…"
        className="w-full bg-zinc-900 border border-zinc-700 focus:border-zinc-500 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors"
      />

      <SongsTable
        songs={songs}
        cellProps={cellProps}
        onPurge={handlePurge}
        onDelete={handleDelete}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:hover:text-zinc-400 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            ‹ Anterior
          </button>
          <span className="text-xs text-zinc-400">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:hover:text-zinc-400 border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            Próxima ›
          </button>
        </div>
      )}
    </div>
  )
}

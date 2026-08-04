import React from 'react'

export default function CellContent({ song, field, displayValue, placeholder, editing, inputRef, onStartEdit, onChange, onBlur, onKeyDown }) {
  const isEditing = editing?.songId === song.id && editing?.field === field
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editing.value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="w-full bg-zinc-800 border border-orange-500 rounded px-2 py-1 text-zinc-100 text-sm focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      />
    )
  }
  return (
    <span
      onClick={() => onStartEdit(song, field)}
      title="Clique para editar"
      className="block w-full px-2 py-1 rounded cursor-text hover:bg-zinc-800 transition-colors text-sm truncate min-h-[1.75rem] leading-6"
    >
      {displayValue || (placeholder
        ? <span className="text-zinc-500 italic">{placeholder}</span>
        : <span className="text-zinc-600 italic">—</span>
      )}
    </span>
  )
}

import React from 'react'
import { Link } from '@inertiajs/react'

export default function SongNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-4">
      <p className="text-lg">Música não encontrada.</p>
      <Link href="/" className="text-orange-400 hover:text-orange-300 text-sm">
        Voltar à biblioteca
      </Link>
    </div>
  )
}

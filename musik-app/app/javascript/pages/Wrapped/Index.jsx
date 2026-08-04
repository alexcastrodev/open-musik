import React from 'react'

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS = {
  delivered: { label: 'Entregue', badge: 'bg-green-900/40 text-green-300 border-green-700' },
  pending: { label: 'Pendente', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700' },
}

function TopLine({ rank, label, plays }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-xs text-zinc-600 w-4 text-right flex-shrink-0">{rank}</span>
      <span className="text-zinc-300 truncate flex-1 min-w-0">{label}</span>
      <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">{plays}</span>
    </div>
  )
}

function WrappedCard({ w }) {
  const s = STATUS[w.status] || STATUS.pending
  const p = w.payload || {}
  const kindLabel = w.period_kind === 'year' ? 'Anual' : 'Mensal'
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate">
            🎉 {w.guild_name} · {p.period_label || w.period_label}
          </p>
          <p className="text-xs text-zinc-500">Wrapped {kindLabel}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded border flex-shrink-0 ${s.badge}`}>{s.label}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span>▶️ {p.total_plays ?? 0} plays</span>
        <span>🎵 {p.unique_songs ?? 0} músicas</span>
        <span>👥 {p.unique_listeners ?? 0} ouvintes</span>
        <span>⏱️ {p.hours_listened ?? 0}h</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-zinc-400 mb-1.5">🏆 Top músicas</p>
          {(p.top_songs || []).length === 0 ? (
            <p className="text-xs text-zinc-600">—</p>
          ) : (
            <div className="flex flex-col gap-1">
              {p.top_songs.map((song, i) => (
                <TopLine key={song.title} rank={i + 1} label={song.title} plays={song.plays} />
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-400 mb-1.5">🎤 Top artistas</p>
          {(p.top_artists || []).length === 0 ? (
            <p className="text-xs text-zinc-600">—</p>
          ) : (
            <div className="flex flex-col gap-1">
              {p.top_artists.map((a, i) => (
                <TopLine key={a.artist} rank={i + 1} label={a.artist} plays={a.plays} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-600 border-t border-zinc-800 pt-2">
        <span>
          👑 DJ: {p.top_requester ? `${p.top_requester.requested_by} (${p.top_requester.plays})` : '—'}
        </span>
        {w.status === 'delivered' && formatDate(w.delivered_at) && (
          <span>Postado {formatDate(w.delivered_at)}</span>
        )}
      </div>
    </div>
  )
}

export default function WrappedIndex({ wrappeds = [] }) {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Wrapped</h1>
        <p className="text-zinc-500 text-sm">
          Retrospectivas mensais e anuais por servidor, postadas no Discord pelo bot.
        </p>
      </div>

      {wrappeds.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p>Nenhum Wrapped gerado ainda. São criados no início de cada mês.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {wrappeds.map((w) => (
            <WrappedCard key={w.id} w={w} />
          ))}
        </div>
      )}
    </div>
  )
}

import React, { useEffect } from 'react'
import { router } from '@inertiajs/react'

const PERIODS = [
  { key: 'all', label: 'Sempre' },
  { key: '30d', label: '30 dias' },
  { key: '7d', label: '7 dias' },
]

function navigate(patch) {
  const params = new URLSearchParams(window.location.search)
  Object.entries(patch).forEach(([k, v]) => {
    if (v == null || v === '') params.delete(k)
    else params.set(k, v)
  })
  router.get(`/listeners?${params.toString()}`, {}, { preserveState: true, preserveScroll: true })
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT', { dateStyle: 'medium' })
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })
}

function StatCard({ label, value }) {
  return (
    <div className="flex-1 min-w-[110px] bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-100">{value ?? 0}</p>
    </div>
  )
}

function Bar({ rank, label, sublabel, cover, plays, max }) {
  const pct = max > 0 ? Math.max(4, Math.round((plays / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-600 w-5 text-right flex-shrink-0">{rank}</span>
      {cover !== undefined && (
        cover ? (
          <img src={cover} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded bg-zinc-800 flex-shrink-0" />
        )
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{label}</p>
        {sublabel && <p className="text-xs text-zinc-500 truncate">{sublabel}</p>}
        <div className="h-1.5 bg-zinc-800 rounded-full mt-1 overflow-hidden">
          <div className="h-full bg-orange-500/70 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-xs text-zinc-400 flex-shrink-0 tabular-nums">{plays}</span>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-3">{title}</h3>
      {children}
    </div>
  )
}

function TopList({ items = [], keyFn, labelFn, subFn, coverFn, empty }) {
  const max = items[0]?.plays ?? 0
  if (items.length === 0) return <p className="text-xs text-zinc-500 py-2">{empty}</p>
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <Bar
          key={keyFn(it)}
          rank={i + 1}
          label={labelFn(it)}
          sublabel={subFn ? subFn(it) : undefined}
          cover={coverFn ? coverFn(it) : undefined}
          plays={it.plays}
          max={max}
        />
      ))}
    </div>
  )
}

export default function ListenersIndex({
  period = 'all',
  users = [],
  selected_user: selectedUser = null,
  profile = null,
}) {
  useEffect(() => {
    const interval = setInterval(() => {
      router.reload({ only: ['users', 'profile'] })
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Ouvintes</h1>
          <p className="text-zinc-500 text-sm">Perfil de escuta por usuário — histórico e tops.</p>
        </div>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => navigate({ period: p.key })}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                period === p.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Lista de ouvintes */}
        <aside className="flex flex-col gap-1">
          {users.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhum ouvinte ainda.</p>
          ) : (
            users.map((u) => (
              <button
                key={u.requested_by}
                onClick={() => navigate({ user: u.requested_by })}
                className={`flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
                  u.requested_by === selectedUser
                    ? 'bg-zinc-800 text-white border-zinc-600 font-medium'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                }`}
              >
                <span className="truncate">{u.requested_by}</span>
                <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">{u.plays}</span>
              </button>
            ))
          )}
        </aside>

        {/* Perfil selecionado */}
        <div className="min-w-0">
          {!profile ? (
            <div className="text-center py-20 text-zinc-500">
              <p>Escolha um ouvinte para ver o perfil.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                <StatCard label="Plays" value={profile.total_plays} />
                <StatCard label="Músicas" value={profile.unique_songs} />
                <StatCard label="Artistas" value={profile.top_artists?.length ?? 0} />
              </div>

              <p className="text-xs text-zinc-500">
                Escuta de <span className="text-zinc-400">{formatDate(profile.first_play_at)}</span> até{' '}
                <span className="text-zinc-400">{formatDate(profile.last_play_at)}</span>
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Panel title="Top artistas">
                  <TopList
                    items={profile.top_artists}
                    keyFn={(a) => a.artist}
                    labelFn={(a) => a.artist}
                    empty="Sem artistas."
                  />
                </Panel>
                <Panel title="Top faixas">
                  <TopList
                    items={profile.top_songs}
                    keyFn={(s) => s.title}
                    labelFn={(s) => s.title}
                    subFn={(s) => s.artist}
                    coverFn={(s) => s.cover_url}
                    empty="Sem faixas."
                  />
                </Panel>
                <Panel title="Servidores">
                  <TopList
                    items={profile.top_guilds}
                    keyFn={(g) => g.discord_guild_id}
                    labelFn={(g) => g.name}
                    empty="Sem servidores."
                  />
                </Panel>
                <Panel title="Histórico recente">
                  {(!profile.recent || profile.recent.length === 0) ? (
                    <p className="text-xs text-zinc-500 py-2">Sem histórico.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {profile.recent.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="text-zinc-200 truncate flex-1 min-w-0">{r.title || '—'}</span>
                          <span className="text-xs text-zinc-600 flex-shrink-0">{r.guild_name}</span>
                          <span className="text-xs text-zinc-600 flex-shrink-0">{formatDateTime(r.played_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

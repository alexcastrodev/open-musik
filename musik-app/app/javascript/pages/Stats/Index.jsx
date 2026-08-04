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
  router.get(`/stats?${params.toString()}`, {}, { preserveState: true, preserveScroll: true })
}

function StatCard({ label, value }) {
  return (
    <div className="flex-1 min-w-[120px] bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
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
      {cover ? (
        <img src={cover} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded bg-zinc-800 flex-shrink-0" />
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

function TopSongs({ items = [] }) {
  const max = items[0]?.plays ?? 0
  if (items.length === 0) return <p className="text-xs text-zinc-500 py-2">Sem plays.</p>
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((s, i) => (
        <Bar key={s.title} rank={i + 1} label={s.title} sublabel={s.artist} cover={s.cover_url} plays={s.plays} max={max} />
      ))}
    </div>
  )
}

function TopRequesters({ items = [] }) {
  const max = items[0]?.plays ?? 0
  if (items.length === 0) return <p className="text-xs text-zinc-500 py-2">Sem plays.</p>
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((u, i) => (
        <Bar key={u.requested_by} rank={i + 1} label={u.requested_by} plays={u.plays} max={max} />
      ))}
    </div>
  )
}

function TopGuilds({ items = [] }) {
  const max = items[0]?.plays ?? 0
  if (items.length === 0) return <p className="text-xs text-zinc-500 py-2">Sem plays.</p>
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((g, i) => (
        <Bar key={g.discord_guild_id} rank={i + 1} label={g.name} plays={g.plays} max={max} />
      ))}
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

export default function StatsIndex({
  period = 'all',
  global = {},
  guilds = [],
  selected_server: selectedServer = null,
  server_stats: serverStats = null,
  users = [],
  selected_user: selectedUser = null,
  user_stats: userStats = null,
}) {
  // Atualiza periodicamente: novos plays chegam pelos eventos do bot.
  useEffect(() => {
    const interval = setInterval(() => {
      router.reload({ only: ['global', 'server_stats', 'user_stats', 'guilds', 'users'] })
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Estatísticas</h1>
          <p className="text-zinc-500 text-sm">Plays por música, usuário e servidor.</p>
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

      {/* ── Global ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <StatCard label="Plays" value={global.total_plays} />
          <StatCard label="Músicas" value={global.unique_songs} />
          <StatCard label="Ouvintes" value={global.unique_users} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel title="Top músicas"><TopSongs items={global.top_songs} /></Panel>
          <Panel title="Top usuários"><TopRequesters items={global.top_requesters} /></Panel>
          <Panel title="Top servidores"><TopGuilds items={global.top_guilds} /></Panel>
        </div>
      </section>

      {/* ── Por servidor ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-200">Por servidor</h2>
        {guilds.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhum servidor com plays ainda.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {guilds.map((g) => (
                <button
                  key={g.discord_guild_id}
                  onClick={() => navigate({ server: g.discord_guild_id })}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    g.discord_guild_id === selectedServer
                      ? 'bg-zinc-800 text-white border-zinc-600 font-medium'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
            {serverStats && (
              <>
                <div className="flex flex-wrap gap-3">
                  <StatCard label="Plays" value={serverStats.total_plays} />
                  <StatCard label="Músicas" value={serverStats.unique_songs} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Panel title="Top músicas"><TopSongs items={serverStats.top_songs} /></Panel>
                  <Panel title="Top usuários"><TopRequesters items={serverStats.top_requesters} /></Panel>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* ── Por usuário ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-200">Por usuário</h2>
        {users.length === 0 ? (
          <p className="text-xs text-zinc-500">Nenhum usuário com plays ainda.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {users.map((u) => (
                <button
                  key={u}
                  onClick={() => navigate({ user: u })}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    u === selectedUser
                      ? 'bg-zinc-800 text-white border-zinc-600 font-medium'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            {userStats && (
              <>
                <div className="flex flex-wrap gap-3">
                  <StatCard label="Plays" value={userStats.total_plays} />
                  <StatCard label="Músicas" value={userStats.unique_songs} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Panel title="Top músicas"><TopSongs items={userStats.top_songs} /></Panel>
                  <Panel title="Servidores"><TopGuilds items={userStats.top_guilds} /></Panel>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}

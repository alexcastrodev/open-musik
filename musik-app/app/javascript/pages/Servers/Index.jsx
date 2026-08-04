import React, { useEffect } from 'react'
import { Link, router } from '@inertiajs/react'

// O bot manda heartbeat a cada 30s (bot/src/heartbeat.js); reconsulta um pouco
// mais rápido pra "servidores conectados" não parecer travado, sem martelar o
// Rails. O Rails não vê o Valkey do swarm (princípio 5) — tudo aqui vem do
// heartbeat HTTP (BotGuild).
const POLL_MS = 15_000

const STATUS = {
  active: { label: 'Ativo', dot: 'bg-green-400', badge: 'bg-green-900/40 text-green-300 border-green-700' },
  idle: { label: 'Idle', dot: 'bg-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700' },
  offline: { label: 'Offline', dot: 'bg-zinc-500', badge: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
}

function relativeTime(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return `há ${secs}s`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `há ${mins}min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.round(hours / 24)}d`
}

function StatCard({ label, value, dot }) {
  return (
    <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100">{value}</p>
    </div>
  )
}

export default function ServersIndex({ servers = [], summary = {} }) {
  // Recarrega só os servidores + resumo periodicamente (não recarrega a página).
  useEffect(() => {
    const interval = setInterval(() => {
      router.reload({ only: ['servers', 'summary'] })
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Servidores</h1>
        <p className="text-zinc-500 text-sm">
          Servidores conectados aos bots e o que está tocando agora, via heartbeat.
        </p>
      </div>

      {/* Resumo */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Instalados" value={summary.installed ?? 0} />
        <StatCard label="Ativos" value={summary.active ?? 0} dot="bg-green-400" />
        <StatCard label="Idle" value={summary.idle ?? 0} dot="bg-yellow-400" />
        <StatCard label="Offline" value={summary.offline ?? 0} dot="bg-zinc-500" />
      </div>

      {/* Lista de servidores */}
      {servers.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p>Nenhum servidor reportado. O bot está offline ou ainda não enviou heartbeat.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map((g) => {
            const s = STATUS[g.status] || STATUS.offline
            return (
              <div
                key={g.discord_guild_id}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
              >
                {g.icon_url ? (
                  <img src={g.icon_url} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm flex-shrink-0">
                    {(g.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200 truncate">{g.name || g.discord_guild_id}</p>
                    <span className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border flex-shrink-0 ${s.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate mt-0.5">
                    {g.status === 'active' && g.current_title
                      ? `🎵 ${g.current_title}${g.voice_channel_name ? ` · ${g.voice_channel_name}` : ''}`
                      : `${g.member_count ?? '?'} membros`}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    {(g.bots || []).map((b) => {
                      const bs = STATUS[b.status] || STATUS.offline
                      return (
                        <span
                          key={b.bot_client_id}
                          title={`${b.bot_name} · ${bs.label}`}
                          className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border bg-zinc-800/60 border-zinc-700 text-zinc-300"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${bs.dot}`} />
                          {b.bot_name.replace(/^Nexa\s+/, '')}
                        </span>
                      )
                    })}
                    <span className="text-xs text-zinc-600">visto {relativeTime(g.last_seen_at)}</span>
                  </div>
                </div>

                <Link
                  href={`/logs?server=${g.discord_guild_id}`}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors flex-shrink-0"
                >
                  Logs
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

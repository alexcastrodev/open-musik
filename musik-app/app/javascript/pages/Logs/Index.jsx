import React, { useEffect } from 'react'
import { router } from '@inertiajs/react'

// Rótulos e cores por tipo de evento (ver ServerLog::KINDS no Rails).
const KIND_LABELS = {
  play: 'Tocar',
  skip: 'Pular',
  stop: 'Parar',
  advance: 'Trocou',
  queue_empty: 'Fila vazia',
  previous: 'Anterior',
  repeat: 'Repetir',
  clear: 'Parar (na sala)',
  clear_upcoming: 'Limpar fila',
  shuffle: 'Embaralhar',
  remove: 'Remover',
  move: 'Mover',
}

const KIND_COLORS = {
  play: 'bg-green-900/40 text-green-300 border-green-700',
  skip: 'bg-blue-900/40 text-blue-300 border-blue-700',
  stop: 'bg-red-900/40 text-red-300 border-red-700',
  advance: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  queue_empty: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  previous: 'bg-blue-900/40 text-blue-300 border-blue-700',
  repeat: 'bg-purple-900/40 text-purple-300 border-purple-700',
  clear: 'bg-amber-900/40 text-amber-300 border-amber-700',
  clear_upcoming: 'bg-amber-900/40 text-amber-300 border-amber-700',
  shuffle: 'bg-purple-900/40 text-purple-300 border-purple-700',
  remove: 'bg-amber-900/40 text-amber-300 border-amber-700',
  move: 'bg-zinc-800 text-zinc-300 border-zinc-700',
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'medium' })
}

export default function LogsIndex({ guilds = [], selected_server: selected, logs = [], now_playing: nowPlaying = null }) {
  // Recarrega logs + tocando agora periodicamente — eventos do player e o
  // heartbeat do bot chegam em segundos.
  useEffect(() => {
    const interval = setInterval(() => {
      router.reload({ only: ['logs', 'now_playing'] })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  function selectServer(guildId) {
    router.get('/logs', { server: guildId }, { preserveState: true, preserveScroll: true })
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Logs do servidor</h1>
        <p className="text-zinc-500 text-sm">Histórico de eventos do player, separado por servidor.</p>
      </div>

      {guilds.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          <p>Nenhum log ainda. Toque algo num servidor para começar.</p>
        </div>
      ) : (
        <>
          {/* Seletor de servidor */}
          <div className="flex flex-wrap gap-2">
            {guilds.map((g) => (
              <button
                key={g.discord_guild_id}
                onClick={() => selectServer(g.discord_guild_id)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  g.discord_guild_id === selected
                    ? 'bg-zinc-800 text-white border-zinc-600 font-medium'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {/* Tocando agora: lido do heartbeat do bot (BotGuild), não do histórico */}
          {nowPlaying && (
            <div className="bg-green-900/20 border border-green-800 rounded-xl p-3 flex items-center gap-3">
              <span className="text-xs px-2 py-1 rounded border bg-green-900/40 text-green-300 border-green-700 flex-shrink-0">
                Tocando agora
              </span>
              <p className="text-sm text-zinc-200 truncate flex-1 min-w-0">
                {nowPlaying.title || '—'}
              </p>
              <span className="text-xs text-zinc-500 flex-shrink-0">
                {[nowPlaying.voice_channel_name, nowPlaying.bot_name].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          {/* Cards de eventos: Ação · Quem fez · Quando · Canal de voz · Bot */}
          {logs.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <p>Sem eventos para este servidor.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2"
                >
                  {/* Linha 1: badge da ação + faixa/detalhe */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded border flex-shrink-0 ${
                        KIND_COLORS[log.kind] || 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {KIND_LABELS[log.kind] || log.kind}
                    </span>
                    <p className="text-sm text-zinc-300 truncate flex-1 min-w-0">
                      {log.song_title || log.detail || '—'}
                    </p>
                  </div>

                  {/* Linha 2: metadados — quem fez · quando · canal · bot */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>
                      <span className="text-zinc-600">Quem fez:</span>{' '}
                      {log.actor ? (
                        <span className="text-zinc-300">{log.actor}</span>
                      ) : (
                        <span className="text-zinc-400 italic">System</span>
                      )}
                    </span>
                    <span>
                      <span className="text-zinc-600">Quando:</span>{' '}
                      {formatTime(log.created_at) || '—'}
                    </span>
                    <span>
                      <span className="text-zinc-600">Canal:</span>{' '}
                      {log.voice_channel_name || '—'}
                    </span>
                    <span>
                      <span className="text-zinc-600">Bot:</span>{' '}
                      {log.bot_name || '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

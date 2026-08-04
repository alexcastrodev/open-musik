import React from 'react'
import { Link, router, usePage } from '@inertiajs/react'
import { usePlayerStore } from '../stores/playerStore'
import Player from './Player'
import UploadQueue from './UploadQueue'

export default function Layout({ children }) {
  const { props, url } = usePage()
  const { playlists = [], flash = {}, current_user } = props
  const stopAll = usePlayerStore((s) => s.stopAll)

  function handleLogout() {
    stopAll()
    router.delete('/logout')
  }

  const isActive = (path) => url === path || url.startsWith(path + '?')

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* ── Desktop Sidebar ───────────────────────────────────────────────── */}
      <nav className="hidden sm:flex flex-col fixed top-0 left-0 h-full w-56 bg-zinc-900 border-r border-zinc-800 z-40 overflow-y-auto">
        {/* Logo */}
        <div className="px-4 py-5 flex-shrink-0">
          <Link
            href="/songs"
            className="flex items-center gap-2 text-white hover:text-orange-400 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#ffe0c0" stopOpacity="0.85" />
                  </linearGradient>
                </defs>
                <circle cx="9" cy="18" r="3" fill="url(#logoGrad)" />
                <circle cx="15" cy="15" r="3" fill="url(#logoGrad)" />
                <line x1="12" y1="15" x2="12" y2="3" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" />
                <polyline points="12 3 20 3 20 11" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">Musik</span>
          </Link>
        </div>

        {/* Gestão (admin) — foco em administração dos bots */}
        {current_user?.role === 'admin' && (
          <div className="px-3 mb-2">
            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-2 mb-1">
              Gestão
            </p>
            <Link
              href="/servers"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive('/servers')
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
              Servidores
            </Link>
            <Link
              href="/stats"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive('/stats')
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Estatísticas
            </Link>
            <Link
              href="/listeners"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive('/listeners')
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Ouvintes
            </Link>
            <Link
              href="/wrapped"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive('/wrapped')
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Wrapped
            </Link>
            <Link
              href="/logs"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive('/logs')
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="16" y2="17" />
              </svg>
              Logs
            </Link>
            <Link
              href="/jobs"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive('/jobs')
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              Jobs
            </Link>
            <Link
              href="/manage"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive('/manage')
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              Catálogo
            </Link>
          </div>
        )}

        {/* Main nav */}
        <div className="px-3 mb-2">
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-2 mb-1">
            Menu
          </p>
          <Link
            href="/songs"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive('/songs') || url === '/'
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Início
          </Link>
          <Link
            href="/playlists"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive('/playlists')
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Playlists
          </Link>
        </div>

        <div className="mx-3 border-t border-zinc-800 my-2" />

        {/* Playlists */}
        <div className="px-3 flex-1 overflow-y-auto">
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-2 mb-1">
            Suas Playlists
          </p>
          {playlists.length === 0 ? (
            <p className="text-zinc-600 text-xs px-3 py-2">Nenhuma playlist</p>
          ) : (
            playlists.map((pl) => (
              <Link
                key={pl.id}
                href={`/playlists/${pl.id}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                  isActive(`/playlists/${pl.id}`)
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                <span className="truncate">{pl.name}</span>
              </Link>
            ))
          )}
        </div>

        {/* User + logout */}
        {current_user && (
          <div className="px-3 py-3 border-t border-zinc-800 flex-shrink-0 flex items-center gap-2">
            {current_user.avatar_url ? (
              <img src={current_user.avatar_url} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-700 flex-shrink-0" />
            )}
            <span className="text-zinc-300 text-xs truncate flex-1">{current_user.username}</span>
            <button
              onClick={handleLogout}
              title="Sair"
              className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}
      </nav>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="sm:ml-56 pb-48 sm:pb-24 min-h-screen" style={{ paddingBottom: 'max(12rem, calc(env(safe-area-inset-bottom) + 10rem))' }}>
        <div className="px-4 py-4">
          {flash.notice && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-green-900/40 border border-green-700 text-green-300 text-sm">
              {flash.notice}
            </div>
          )}
          {flash.alert && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
              {flash.alert}
            </div>
          )}
          {children}
        </div>
      </main>

      {/* ── Player (fixed bottom) ─────────────────────────────────────────── */}
      <Player />
      <UploadQueue />

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-800 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {current_user?.role === 'admin' && (
          <Link
            href="/servers"
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
              isActive('/servers')
                ? 'text-orange-500'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <span>Servidores</span>
          </Link>
        )}
        <Link
          href="/songs"
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
            isActive('/songs') || url === '/'
              ? 'text-orange-500'
              : 'text-zinc-500 hover:text-white'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span>Início</span>
        </Link>
        <Link
          href="/playlists"
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
            isActive('/playlists')
              ? 'text-orange-500'
              : 'text-zinc-500 hover:text-white'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
          </svg>
          <span>Playlists</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-xs text-zinc-500 hover:text-red-400 transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sair</span>
        </button>
      </nav>
    </div>
  )
}

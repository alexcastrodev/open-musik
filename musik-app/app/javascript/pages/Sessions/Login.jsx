import React from 'react'

Login.layout = null

export default function Login({ error }) {
  function handleDiscordLogin() {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/auth/discord'
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content
    if (csrf) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = 'authenticity_token'
      input.value = csrf
      form.appendChild(input)
    }
    document.body.appendChild(form)
    form.submit()
  }

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <defs>
                <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#ffe0c0" stopOpacity="0.85" />
                </linearGradient>
              </defs>
              <circle cx="9" cy="18" r="3" fill="url(#lg)" />
              <circle cx="15" cy="15" r="3" fill="url(#lg)" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="url(#lg)" strokeWidth="2" strokeLinecap="round" />
              <polyline points="12 3 20 3 20 11" stroke="url(#lg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">Musik</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-white mb-1">Entrar</h1>
          <p className="text-sm text-zinc-500 mb-6">Acesso restrito</p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-950/60 border border-red-800 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleDiscordLogin}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] active:bg-[#3c45a5] text-white font-semibold text-sm rounded-lg transition-colors"
          >
            <svg width="18" height="14" viewBox="0 0 24 18" fill="currentColor">
              <path d="M20.317 1.492a19.841 19.841 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 1.492a.07.07 0 0 0-.032.027C.533 6.093-.32 10.555.099 14.961a.08.08 0 0 0 .031.055 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.442a.061.061 0 0 0-.031-.028zM8.02 12.278c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Entrar com Discord
          </button>
        </div>
      </div>
    </div>
  )
}

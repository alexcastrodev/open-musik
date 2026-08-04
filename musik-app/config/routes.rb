require "sidekiq/web"
require "sidekiq/cron/web"

Rails.application.routes.draw do
  root "songs#index"

  # Painel do Sidekiq, restrito a admins (ver AdminSessionConstraint, mesma
  # checagem do JobPolicy). Sessão compartilhada com o app.
  constraints(AdminSessionConstraint) do
    mount Sidekiq::Web => "/sidekiq", as: :sidekiq_web
  end

  resources :songs, only: %i[index show destroy update] do
    collection do
      post :sync
      post :import_youtube
      get  :imports
      post :retry_import
      post :upload
    end
    member do
      post :play
      delete :purge   # libera o S3, mantém a Song + playlist_songs (rebaixa ao tocar)
    end
  end

  resources :playlists do
    member do
      post :add_song
      delete :remove_song
      patch :reorder
    end
  end

  # API JSON consumida pelo bot do Discord (rede interna).
  namespace :api do
    resources :songs, only: %i[index show] do
      member do
        post :play
      end
    end
    # Ações do bot processadas via Sidekiq (fila :discord).
    resources :actions, only: %i[create]

    # Import síncrono de YouTube: um POST devolve { file_url } direto, sem
    # polling. Faz o upload pro S3 se a URL ainda não existir; se já existir,
    # devolve o file_url imediato. Consumido pelo MusikDownloader (bot).
    post "imports/youtube", to: "imports#youtube"

    # Busca: resolve um termo livre em metadata + URL canônica do YouTube, sem
    # baixar nada (só yt-dlp resolve). GET /api/search?q=termo → { url, ... }.
    get "search", to: "search#index"

    # Ranking de plays pro comando /top do bot (Épico 3, item 1). Ver Api::StatsController.
    get "stats/top", to: "stats#top"

    # Favoritos por usuário (Épico 3): /fav add|list|remove e /play favs.
    resources :favorites, only: %i[index create destroy]

    # Playlists do bot (/criar_playlist, /playlist). index = autocomplete por
    # discord_user_id; play = enfileira na fila do guild. Ver Api::PlaylistsController.
    resources :playlists, only: %i[index create] do
      member do
        post :add_track
      end
    end
    # Playlist no canal: SÓ catálogo (ativa a 1ª faixa + agenda o resto). O BOT
    # decide o pool (bot-cache) e já escolheu o canal — vai na rota. Ver
    # Api::PlaylistsController#enqueue.
    post "playlists/:id/channels/:channel_id/enqueue", to: "playlists#enqueue"

    # Heartbeat do bot: metadados dos guilds pro fallback de nome no ServerLog.
    post "bot/heartbeat", to: "bot#heartbeat"

    # Ack do bot após postar o Wrapped no canal do Discord (Épico 2, item 8).
    post "bot/wrapped/:id/delivered", to: "bot#wrapped_delivered"

    # Fila de reprodução por (guild, canal de voz), fonte da verdade no Rails.
    # Chamados pelo bot que JÁ está num canal, então o canal vai na rota. O pool
    # (quem toca) é decidido pelos bots no bot-cache — o Rails só cuida do catálogo.
    # #enqueue: só catálogo (cria/ativa o item); o BOT decide o pool (bot-cache).
    post "guilds/:guild_id/channels/:channel_id/enqueue", to: "guilds#enqueue"
    post "guilds/:guild_id/channels/:channel_id/advance", to: "guilds#advance"
    post "guilds/:guild_id/channels/:channel_id/skip",    to: "guilds#skip"
    # Botão "Anterior": volta pra última faixa tocada do canal.
    post "guilds/:guild_id/channels/:channel_id/previous", to: "guilds#previous"
    # Botão "Repetir": alterna o loop da faixa atual.
    post "guilds/:guild_id/channels/:channel_id/repeat",  to: "guilds#repeat"
    # Botão "Parar": esvazia a fila mas o bot FICA na sala (diferente do /stop,
    # que também libera o bot no pool e sai).
    post "guilds/:guild_id/channels/:channel_id/clear",   to: "guilds#clear"
    post "guilds/:guild_id/channels/:channel_id/stop",    to: "guilds#stop"
    # Limpa só as faixas da fila (mantém a atual tocando), diferente do /stop.
    post "guilds/:guild_id/channels/:channel_id/clear_upcoming", to: "guilds#clear_upcoming"
    # Manipulação fina da fila (Épico 3): embaralhar, remover e mover faixas de upcoming.
    post "guilds/:guild_id/channels/:channel_id/shuffle", to: "guilds#shuffle"
    post "guilds/:guild_id/channels/:channel_id/remove",  to: "guilds#remove"
    post "guilds/:guild_id/channels/:channel_id/move",    to: "guilds#move"
    get  "guilds/:guild_id/channels/:channel_id/queue",   to: "guilds#queue"
    # Letra da faixa atual via lrclib.net (Épico 3).
    get  "guilds/:guild_id/channels/:channel_id/lyrics",  to: "guilds#lyrics"
    # Salvar a fila como playlist (Épico 3).
    post "guilds/:guild_id/channels/:channel_id/save_playlist", to: "guilds#save_playlist"
    # Histórico do servidor (últimas tocadas) pro /historico e /replay (Épico 3).
    get  "guilds/:guild_id/history", to: "guilds#history"
    # DJs do servidor (Épico 3): lista + adiciona/remove (gerência gated no controller).
    get    "guilds/:guild_id/djs",     to: "djs#index"
    post   "guilds/:guild_id/djs",     to: "djs#create"
    delete "guilds/:guild_id/djs/:id", to: "djs#destroy"
    # Music quiz (Épico 3): sorteio de faixa do histórico + placar da temporada.
    get  "guilds/:guild_id/quiz/track",      to: "quiz#track"
    post "guilds/:guild_id/quiz/score",      to: "quiz#score"
    get  "guilds/:guild_id/quiz/scoreboard", to: "quiz#scoreboard"
    # Status de cache de um item (bot pollla esperando o S3 ficar pronto).
    get  "guilds/:guild_id/channels/:channel_id/items/:id", to: "guilds#item_status"
  end

  get "/servers",   to: "servers#index",   as: :servers
  get "/stats",     to: "stats#index",     as: :stats
  get "/listeners", to: "listeners#index", as: :listeners
  get "/wrapped",   to: "wrapped#index",   as: :wrapped
  get "/jobs",      to: "jobs#index",      as: :jobs
  get "/manage",  to: "manage#index",  as: :manage
  get "/logs",    to: "logs#index",    as: :logs

  get  "/login",  to: "sessions#new",     as: :login
  delete "/logout", to: "sessions#destroy", as: :logout

  get  "/auth/discord/callback", to: "sessions#discord_callback"
  post "/auth/discord/callback", to: "sessions#discord_callback"
  get  "/auth/failure",          to: "sessions#oauth_failure"

  get "up" => "rails/health#show", as: :rails_health_check
end

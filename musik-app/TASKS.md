# Musik — Feature Backlog

## Player & Playback

- [ ] **Crossfade entre faixas** — transição suave com fade-out/fade-in configurável (0–10s) no `player_controller.js`
- [ ] **Equalizer simples** — Web Audio API com presets (Bass Boost, Vocal, Flat) no player
- [ ] **Velocidade de reprodução** — 0.75×, 1×, 1.25×, 1.5×, 2× via `audio.playbackRate`
- [ ] **Sleep timer** — parar reprodução após N minutos (15, 30, 60, fim da faixa)
- [ ] **Replay gain / normalização de volume** — ler `replaygain_track_gain` do ID3 e ajustar gain node
- [ ] **Letras sincronizadas (LRC)** — buscar letra via LRCLIB API e exibir com karaokê highlight no player expandido

## Biblioteca & Metadados

- [ ] **Edição em lote na tela Manage** — selecionar múltiplas músicas e editar artist/album de uma vez
- [ ] **Importar playlist do YouTube** — aceitar URL de playlist além de vídeo individual no `ImportYoutubeJob`
- [ ] **Detecção de duplicatas** — ao importar, comparar fingerprint de áudio (acoustid / chromaprint) antes de salvar
- [ ] **Tags customizadas** — adicionar tags livres às músicas (ex: "favorita", "treino", "anos 80") para filtros avançados
- [ ] **Rating de músicas** — sistema de 1–5 estrelas persistido no banco; filtrar biblioteca por rating

## Playlists

- [x] **Reordenar músicas por drag-and-drop** — HTML5 DnD na playlist show, PATCH `/playlists/:id/reorder`
- [ ] **Playlist colaborativa** — compartilhar link de playlist com permissão de adicionar músicas (token público)
- [ ] **Smart playlists** — regras automáticas (ex: "últimas 50 adicionadas", "top 20 mais tocadas", "artista = X")
- [ ] **Modo Party / Queue pública** — tela de TV com fila editável em tempo real via Action Cable

## Descoberta & Social

- [ ] **Rádio de artista** — ao terminar uma música, buscar artistas similares via Last.fm API e enfileirar automaticamente
- [ ] **Scrobbling para Last.fm** — enviar plays para Last.fm API com OAuth do usuário
- [ ] **Histórico de reprodução** — tela com plays registrados por data/hora; top músicas da semana/mês
- [ ] **Estatísticas da biblioteca** — dashboard: total de horas, artistas únicos, álbuns, gêneros, gráfico de plays por mês

## Busca & Navegação

- [ ] **Busca global com atalho** — `Cmd+K` abre spotlight-style com resultados de músicas, artistas, álbuns, playlists
- [ ] **Filtros avançados na biblioteca** — por gênero, ano, duração, rating, play count, data de adição
- [ ] **Vista de álbum** — página `/albums/:name` com capa grande, tracklist ordenada, botão "Play álbum"
- [ ] **Vista de artista** — página `/artists/:name` com discografia agrupada por álbum

## PWA & Mobile

- [x] **Cache offline com Service Worker** — armazenar as últimas 10 músicas tocadas no Cache API para ouvir sem internet
- [x] **Media Session API** — controles na tela de bloqueio e notificação do OS com artwork, seek e prev/next
- [x] **Shortcuts no manifesto PWA** — atalhos de "Adicionar do YouTube" e "Abrir fila" no ícone do app

## Infraestrutura & UX

- [ ] **Temas (dark/light/auto)** — toggle de tema persistido em cookie; respeitar `prefers-color-scheme`
- [ ] **Atalhos de teclado globais** — Space (play/pause), `←`/`→` (seek 10s), `N`/`P` (next/prev), `S` (shuffle), `L` (like)
- [ ] **Notificações de import** — Web Push quando um import do YouTube terminar (mesmo com o browser fechado)
- [ ] **Exportar/importar biblioteca** — JSON ou CSV com metadados; útil para backup ou migração
- [ ] **API REST pública** — endpoints autenticados por token para clientes de terceiros (apps mobile nativos)

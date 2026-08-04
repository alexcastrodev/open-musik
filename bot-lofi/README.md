# bot-lofi

Bot Discord **multi-servidor** que toca rádio lo-fi 24/7 numa sala de voz. Cada
servidor roda `/lofi-setup` uma vez pra fixar a sala e o painel; a partir daí o
bot fica na sala tocando em loop, com um painel de botões pra **trocar de
estação** ou **sair**.

O áudio vem do relay Icecast (ver [`../lofi-radio`](../lofi-radio)): 5 mounts
Ogg/Opus ao vivo, consumidos em **pass-through** (`StreamType.OggOpus`, sem
decode/re-encode). O encode acontece uma vez só, no relay, então a CPU do bot
fica baixíssima e todos os bots ficam sincronizados no mesmo ponto do stream.

## Estações

| Estação      | `value`  | Mount do relay   |
|--------------|----------|------------------|
| Lofi Tokyo   | `tokyo`  | `/tokyo.opus`    |
| Lofi Focus   | `focus`  | `/focus.opus`    |
| Lofi Anime   | `anime`  | `/anime.opus`    |
| Lofi Anime 2 | `anime2` | `/anime2.opus`   |
| Lofi Akita   | `akita`  | `/akita.opus`    |

Os `value` batem com os choices do slash command e com os mounts do relay
(`lofi-radio/supervisord.conf`). Estação padrão do `/lofi-setup`: **Lofi Tokyo**.

## Comando

- **`/lofi-setup`** (requer permissão *Gerenciar Servidor*)
  - `sala` (obrigatório): sala de voz onde a rádio toca.
  - `canal` (opcional): canal de texto do painel. Padrão: o chat da própria sala
    de voz.
  - `estacao` (opcional): estação inicial. Padrão: Lofi Tokyo.

O painel tem um botão por estação (menos a atual) e um **🚪 Sair da sala**.

## Configuração

Variáveis de ambiente (arquivo `.env` na raiz do pacote):

| Variável             | Obrigatória | Descrição                                                     |
|----------------------|-------------|---------------------------------------------------------------|
| `DISCORD_TOKEN`      | sim         | Token do bot (Discord Developer Portal).                      |
| `DISCORD_CLIENT_ID`  | sim         | Application ID — usado no registro dos slash commands.        |
| `LOFI_RELAY_URL`     | não         | Base do relay Icecast. Padrão: `https://lofi.kurz.fyi`.       |

A config **por servidor** (sala, painel, estação) é persistida em
`data/config.json`. No boot o bot relê o arquivo e **re-entra sozinho** em cada
sala configurada (rádio 24/7 sobrevive a reinícios).

## Rodar local

```sh
cd bot-lofi
yarn install
yarn register   # registra o /lofi-setup (global; até ~1h pra propagar)
yarn start      # sobe o bot
```

Scripts (`package.json`):

| Script          | O que faz                                            |
|-----------------|------------------------------------------------------|
| `yarn start`    | Sobe o bot (IPv4-first + `--env-file=.env`).         |
| `yarn dev`      | Igual ao start, com `--watch` (reinício no salvar).  |
| `yarn register` | Registra o `/lofi-setup` (global).                   |
| `yarn unregister` | Remove todos os slash commands globais do app.     |
| `yarn test`     | Suíte `node --test` (módulos puros).                 |

## Deploy (Docker)

`network_mode: host` (igual ao relay e ao bot principal): a voz do Discord usa
UDP e fecha melhor sem a rede do Docker; também permite puxar o relay por
`localhost:8000` se ele rodar no mesmo host (`LOFI_RELAY_URL=http://localhost:8000`).

```sh
cd bot-lofi
# 1) preencha o .env (DISCORD_TOKEN, DISCORD_CLIENT_ID, LOFI_RELAY_URL)
# 2) registre os comandos uma vez (fora do container ou num run pontual):
yarn register
# 3) suba o bot:
docker compose up -d --build
```

Volumes montados:

- `.env` → `/app/.env`: fonte única de env do container.
- `./data` → `/app/data`: persiste `config.json` (config por servidor) entre
  reinícios.

O `Dockerfile` é enxuto de propósito: só o toolchain nativo pra compilar
`@discordjs/opus` e `sodium-native`. **Sem ffmpeg/yt-dlp** — o pass-through Opus
não transcodifica nada.

## Arquitetura (`src/`)

| Arquivo                 | Papel                                                                 |
|-------------------------|-----------------------------------------------------------------------|
| `ipv4-only.js`          | Fixa o dispatcher undici em IPv4 (import **antes** do discord.js).     |
| `stations.js`           | Módulo puro: resolve `value` → `{ label, url }` do mount.              |
| `stream.js`             | `httpOpusStream(url)` → `{ stream, kill }` (pass-through OggOpus).     |
| `store.js`              | `ConfigStore`: config por guild em `data/config.json` (escrita atômica). |
| `panel.js`              | Render puro do painel (embed + botões) e parsing dos `customId`.      |
| `radio.js`              | `RadioSession` (join/play/switch/leave) + `RadioManager` (por guild). |
| `commands.js`           | Definição do `/lofi-setup`.                                           |
| `register-commands.js`  | Registra os slash commands (global).                                  |
| `unregister-commands.js`| Remove os slash commands globais.                                     |
| `index.js`              | Entry point: wiring, handlers de interação, re-entrada no boot, shutdown. |

O relay que serve os streams vive em [`../lofi-radio`](../lofi-radio).

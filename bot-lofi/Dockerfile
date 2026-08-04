FROM node:22-slim

# Toolchain nativo pra compilar @discordjs/opus (encoder/decoder Opus) e
# sodium-native (criptografia do protocolo de voz). NÃO precisa de ffmpeg nem
# yt-dlp: o bot lo-fi consome os mounts do relay Icecast em PASS-THROUGH
# (StreamType.OggOpus — só demuxa páginas Ogg, sem decode/re-encode), então o
# único custo de CPU é a criptografia de voz. ca-certificates pro HTTPS do relay.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock* ./

RUN yarn install --frozen-lockfile --production

COPY . .

# --dns-result-order=ipv4first reforça IPv4 na resolução (VPS dual-stack com IPv6
# quebrado; o src/ipv4-only.js fixa de vez o dispatcher undici). --env-file=.env:
# o Node carrega /app/.env (montado por volume) como fonte ÚNICA de env — define
# DISCORD_TOKEN, DISCORD_CLIENT_ID e LOFI_RELAY_URL do container.
CMD ["node", "--dns-result-order=ipv4first", "--env-file=.env", "src/index.js"]

FROM node:22-slim

# python3/make/g++/libc6-dev: toolchain pra compilar os módulos nativos
# (@discordjs/opus, sodium-native). ffmpeg: transcodifica o áudio pra PCM.
# yt-dlp voltou: na 1ª faixa da sessão o bot resolve e toca o stream direto da
# fonte (áudio em RAM → Discord) enquanto o Rails monta o cache S3 em paralelo —
# acaba o silêncio coberto por música de espera. As demais faixas seguem do cache
# S3 que o Rails monta (ver src/player/GuildPlayer.js / ytdlp.js). Aqui bot e Rails
# saem pelo MESMO IP (mesmo host), então a URL googlevideo assinada por IP não dá
# 403 no bot — por isso dá pra resolver o stream localmente.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    python3 \
    make \
    g++ \
    libc6-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp como binário estático oficial (zipapp Python; roda com o python3 acima).
# `latest` pra acompanhar as mudanças do YouTube — alinhado com o Dockerfile do
# Rails (musik-app/Dockerfile), que resolve/baixa com a mesma versão.
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --version

# Deno: runtime JS padrão do yt-dlp pra extração do YouTube (obrigatório desde a
# deprecação de 2025 da extração sem runtime JS). Mesmo binário estático que o
# Rails instala — sem ele o yt-dlp falha no YouTube e o bot cairia sempre no
# fallback (música de espera), anulando o ganho. uname -m casa a arch do Pi (ARM).
RUN curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-$(uname -m)-unknown-linux-gnu.zip -o /tmp/deno.zip && \
    apt-get update -qq && apt-get install --no-install-recommends -y unzip && \
    unzip /tmp/deno.zip -d /usr/local/bin && \
    chmod a+rx /usr/local/bin/deno && \
    rm /tmp/deno.zip && \
    apt-get purge -y unzip && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

WORKDIR /app

COPY package.json yarn.lock* ./

RUN yarn install --frozen-lockfile --production && yarn global add pm2

COPY . .

# --env-file=.env: o Node carrega /app/.env (montado por volume) — é a fonte
# ÚNICA de env, e define a identidade do container (o clone monta .env.clone.one
# em /app/.env). Sem isto o pm2-runtime sobe sem DISCORD_TOKEN. --dns-result-order
# força IPv4 na resolução do endpoint de voz (VPS dual-stack; ver src/index.js).
CMD ["pm2-runtime", "--node-args=--dns-result-order=ipv4first --env-file=.env", "src/index.js"]

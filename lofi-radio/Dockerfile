# Relay de streaming das estações lo-fi: Icecast2 + ffmpeg + supervisord numa
# imagem só. Um ffmpeg por estação faz loop em tempo real do .mp3 local e empurra
# Ogg/Opus pro Icecast, que os bots consomem em pass-through. Ver README.md.
FROM debian:bookworm-slim

# icecast2: servidor de stream. ffmpeg: gera o Opus em loop. supervisor: roda os
# 5 processos (1 Icecast + 4 ffmpeg). bash/netcat-openbsd: usados pelos scripts
# (o wait do start_ffmpeg.sh usa /dev/tcp do bash). DEBIAN_FRONTEND evita o
# prompt de config do icecast2 no apt.
RUN DEBIAN_FRONTEND=noninteractive apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    icecast2 \
    ffmpeg \
    supervisor \
    bash \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY icecast.xml /etc/icecast.xml
COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY start_ffmpeg.sh /usr/local/bin/start_ffmpeg.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/start_ffmpeg.sh

# Os .mp3 vêm por volume read-only em /lofi (ver bot/docker-compose.yml). LOFI_DIR
# aponta pra lá; sobrescreva se montar noutro caminho.
ENV LOFI_DIR=/lofi

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

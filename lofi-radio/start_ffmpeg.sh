#!/usr/bin/env bash
# Empurra UMA estação lo-fi pro Icecast, em loop infinito e em tempo real.
# Chamado pelo supervisord (um programa por estação). Args:
#   $1 = mount  (ex.: tokyo.opus)
#   $2 = arquivo dentro de LOFI_DIR (ex.: tokyo_lofi.mp3)
#
# Espera o Icecast aceitar conexões na 8000 antes de empurrar — senão o ffmpeg
# morreria com "Connection refused" num boot frio e o supervisord ficaria
# reiniciando. Depois disso, o ffmpeg roda pra sempre; se cair (arquivo somido,
# Icecast reiniciou), o supervisord o reinicia e o wait roda de novo.
set -uo pipefail

MOUNT="$1"
FILE="$2"
LOFI_DIR="${LOFI_DIR:-/lofi}"
SOURCE_PASS="${ICECAST_SOURCE_PASS:-hackme}"
BITRATE="${OPUS_BITRATE:-128k}"
INPUT="${LOFI_DIR}/${FILE}"

# Espera o Icecast: tenta abrir a porta 8000 em loop curto (até ~30s).
for _ in $(seq 1 60); do
  if (exec 3<>/dev/tcp/localhost/8000) 2>/dev/null; then
    exec 3>&- 3<&-
    break
  fi
  sleep 0.5
done

if [ ! -f "$INPUT" ]; then
  echo "[ffmpeg ${MOUNT}] arquivo não encontrado: ${INPUT}" >&2
  # Sai com erro pro supervisord reportar; reiniciar não adianta até o volume ter
  # o arquivo, mas deixa o estado visível em vez de empurrar silêncio.
  exit 1
fi

echo "[ffmpeg ${MOUNT}] empurrando ${INPUT} -> icecast://localhost:8000/${MOUNT} (${BITRATE})"

# -re: lê em tempo real (1x), pra ser uma rádio AO VIVO — sem -re o ffmpeg
#   despejaria o arquivo o mais rápido possível e não haveria sincronia.
# -stream_loop -1: repete o arquivo pra sempre.
# -c:a libopus -f ogg: Opus em Ogg, o que o bot consome em pass-through.
# -content_type application/ogg: header que o Icecast/clientes esperam pro mount.
exec ffmpeg -nostdin -hide_banner -loglevel warning \
  -re -stream_loop -1 -i "$INPUT" \
  -vn -c:a libopus -b:a "$BITRATE" -ar 48000 -ac 2 \
  -content_type application/ogg -f ogg \
  "icecast://source:${SOURCE_PASS}@localhost:8000/${MOUNT}"

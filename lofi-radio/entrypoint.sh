#!/usr/bin/env bash
# Entrypoint do relay lo-fi. Faz três coisas, nesta ordem:
#   1. Injeta as senhas (env -> icecast.xml) reescrevendo os placeholders.
#   2. Exporta as URLs de push dos ffmpeg (usadas pelo supervisord via env).
#   3. Entrega o controle ao supervisord, que sobe Icecast + os 4 ffmpeg.
#
# Os ffmpeg NÃO podem subir antes do Icecast aceitar conexões, senão morrem com
# "Connection refused" e o supervisord fica reiniciando à toa. O wait abaixo
# (start_ffmpeg.sh, chamado por cada programa de ffmpeg) cobre isso por estação;
# aqui só preparamos a config e delegamos.
set -euo pipefail

SOURCE_PASS="${ICECAST_SOURCE_PASS:-zedamanga}"
ADMIN_PASS="${ICECAST_ADMIN_PASS:-zedamanga}"

# Reescreve os placeholders da config do Icecast com as senhas reais. Usa | como
# separador do sed pra não colidir com caracteres das senhas.
sed -i "s|@SOURCE_PASS@|${SOURCE_PASS}|; s|@ADMIN_PASS@|${ADMIN_PASS}|" /etc/icecast.xml

# Garante os diretórios de log/pid que o Icecast espera. O <changeowner> do
# icecast.xml faz o processo dropar pra icecast2 depois de bindar a porta,
# então esse usuário precisa poder ler a config e escrever pid/log.
mkdir -p /var/log/icecast2
chown -R icecast2:icecast /var/log/icecast2 /etc/icecast.xml 2>/dev/null || true
touch /tmp/icecast.pid && chown icecast2:icecast /tmp/icecast.pid 2>/dev/null || true

exec supervisord -c /etc/supervisor/supervisord.conf

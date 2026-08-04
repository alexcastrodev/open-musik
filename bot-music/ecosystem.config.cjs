// Config do PM2 para produção no VPS.
//   pm2 start ecosystem.config.cjs
//   pm2 logs musik-bot
//   pm2 restart musik-bot
//   pm2 save && pm2 startup   # persistir entre reboots
//
// As variáveis de ambiente vêm do .env (carregado via --env-file no node) ou do
// ambiente do PM2. Aqui passamos --dns-result-order=ipv4first (ver index.js):
// garante IPv4 na resolução do endpoint de voz mesmo em VPS dual-stack.
// Pool de bots: um app por bot, cada um com seu --env-file (token/client_id
// distintos). instances: 1 em CADA — NUNCA cluster (instances > 1), que
// duplicaria o MESMO token e quebraria o gateway de voz. Registre os comandos só
// com o .env do front: `node --env-file=.env src/register-commands.js`.
// (Alternativa ao docker-compose.yml — use um OU outro, não os dois.)
module.exports = {
  apps: [
    {
      name: "musik-bot",
      script: "src/index.js",
      node_args: "--dns-result-order=ipv4first --env-file=.env",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      // Reinício com backoff se cair em loop de boot (ex.: API do Rails fora).
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "musik-bot-clone-1",
      script: "src/index.js",
      node_args: "--dns-result-order=ipv4first --env-file=.env.clone.one",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

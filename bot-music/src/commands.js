
import { SlashCommandBuilder } from "discord.js";
import { lofiChoices } from "./player/lofi.js";

export const commandData = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Toca uma música do YouTube, um link ou os teus favoritos")
    .addStringOption((opt) =>
      opt
        .setName("musica")
        .setDescription("Título, artista, link do YouTube/Spotify — ou 'favs' pros teus favoritos")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("lofi-radio")
    .setDescription("Toca uma estação de rádio lo-fi em loop no teu canal de voz")
    .addStringOption((opt) =>
      opt
        .setName("estacao")
        .setDescription("Escolha a estação")
        .setRequired(true)
        .addChoices(...lofiChoices())
    ),
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Mostra a fila de reprodução"),
  new SlashCommandBuilder()
    .setName("salvar_fila")
    .setDescription("Salva a fila atual como uma playlist tua")
    .addStringOption((opt) =>
      opt
        .setName("nome")
        .setDescription("Nome da playlist a criar")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Pula a música atual"),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Para tudo e tira o bot do canal de voz"),
  new SlashCommandBuilder()
    .setName("limpar_fila")
    .setDescription("Limpa as próximas músicas da fila (mantém a que toca agora)"),
  new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Embaralha as próximas músicas da fila"),
  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove uma música da fila pela posição")
    .addIntegerOption((opt) =>
      opt
        .setName("posicao")
        .setDescription("Posição na fila (1 = próxima)")
        .setRequired(true)
        .setMinValue(1)
    ),
  new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move uma música da fila para outra posição")
    .addIntegerOption((opt) =>
      opt
        .setName("de")
        .setDescription("Posição atual (1 = próxima)")
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("para")
        .setDescription("Nova posição")
        .setRequired(true)
        .setMinValue(1)
    ),
  new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Mostra a música tocando agora"),
  new SlashCommandBuilder()
    .setName("dj")
    .setDescription("Gerencia os DJs do servidor (quem pode controlar a reprodução)")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Torna alguém DJ")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Quem vira DJ").setRequired(true)))
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Lista os DJs do servidor"))
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um DJ")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Quem deixa de ser DJ").setRequired(true))),
  new SlashCommandBuilder()
    .setName("historico")
    .setDescription("Mostra as últimas músicas tocadas no servidor"),
  new SlashCommandBuilder()
    .setName("replay")
    .setDescription("Toca de novo uma música do histórico do servidor")
    .addIntegerOption((opt) =>
      opt
        .setName("posicao")
        .setDescription("Posição no histórico (1 = última tocada, padrão)")
        .setRequired(false)
        .setMinValue(1)
    ),
  new SlashCommandBuilder()
    .setName("fav")
    .setDescription("Gerencia teus favoritos")
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Favorita a música tocando agora"))
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Lista teus favoritos"))
    .addSubcommand((sub) =>
      sub.setName("play").setDescription("Toca teus favoritos no canal de voz"))
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um favorito pela posição")
        .addIntegerOption((opt) =>
          opt
            .setName("posicao")
            .setDescription("Posição na lista (ver /fav list)")
            .setRequired(true)
            .setMinValue(1)
        )),
  new SlashCommandBuilder()
    .setName("top")
    .setDescription("Ranking das músicas mais tocadas")
    .addStringOption((opt) =>
      opt
        .setName("escopo")
        .setDescription("De quem contar os plays")
        .setRequired(true)
        .addChoices(
          { name: "Minhas músicas", value: "user" },
          { name: "Do servidor", value: "guild" },
          { name: "Mais ouvidas (global)", value: "global" },
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("periodo")
        .setDescription("Janela de tempo (padrão: sempre)")
        .setRequired(false)
        .addChoices(
          { name: "Sempre", value: "all" },
          { name: "Este mês", value: "month" },
          { name: "Esta semana", value: "week" },
        )
    ),
  new SlashCommandBuilder()
    .setName("criar_playlist")
    .setDescription("Cria uma playlist a partir de uma música ou playlist do Spotify")
    .addStringOption((opt) =>
      opt
        .setName("fonte")
        .setDescription("Link do Spotify, link do YouTube ou nome da música")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("nome")
        .setDescription("Nome da playlist a criar")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Toca uma playlist que você criou")
    .addStringOption((opt) =>
      opt
        .setName("nome")
        .setDescription("Escolha uma das suas playlists")
        .setRequired(true)
        .setAutocomplete(true)
    ),
  new SlashCommandBuilder()
    .setName("add_playlist_track")
    .setDescription("Adiciona uma música a uma playlist que você criou")
    .addStringOption((opt) =>
      opt
        .setName("playlist")
        .setDescription("Escolha uma das suas playlists")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("musica")
        .setDescription("Link do Spotify, link do YouTube ou nome da música")
        .setRequired(true)
    ),
].map((c) => c.toJSON());

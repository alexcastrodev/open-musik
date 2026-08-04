import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from "discord.js";
import { lofiChoices } from "./stations.js";

export const commandData = [
  new SlashCommandBuilder()
    .setName("lofi-setup")
    .setDescription("Configura a rádio lo-fi 24/7 numa sala de voz deste servidor")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((opt) =>
      opt
        .setName("sala")
        .setDescription("Sala de voz onde a rádio vai tocar")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName("estacao")
        .setDescription("Estação inicial (padrão: Lofi Tokyo)")
        .addChoices(...lofiChoices())),
].map((c) => c.toJSON());

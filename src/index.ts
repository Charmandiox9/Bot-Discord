import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import { DISCORD_TOKEN } from "./config";
import { commands as musicCommands } from "./commands/music";
import { handleInteraction, handleModal } from "./interactions";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const allCommands = [...musicCommands];

client.once("ready", async () => {
  console.log(`Conectado como ${client.user?.tag}`);

  const commandData = allCommands.map((c) => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN!);

  try {
    console.log("🔄 Registrando comandos globales...");
    await rest.put(Routes.applicationCommands(client.user!.id), {
      body: commandData,
    });
    console.log("✅ Comandos registrados correctamente.");
  } catch (error) {
    console.error("❌ Error al registrar comandos:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = allCommands.find(
        (c) => c.data.name === interaction.commandName,
      );
      if (!command) return;

      if (["play", "join"].includes(interaction.commandName)) {
        await interaction.deferReply();
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await handleInteraction(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
  } catch (err: any) {
    console.error("Error en interacción:", err.message);
    const errorMsg = `Error: ${err.message || "Ocurrió un error inesperado al procesar tu solicitud."}`;

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: errorMsg, components: [] });
    } else {
      await interaction.reply({ content: errorMsg, flags: 64 });
    }
  }
});

client.login(DISCORD_TOKEN);

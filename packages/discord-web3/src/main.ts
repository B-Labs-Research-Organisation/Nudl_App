import dotenv from "dotenv";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Interaction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";

dotenv.config();

export function main(): void {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", async () => {
    console.log("Discord client is ready!");

    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_TOKEN as string,
    );

    const commands = [
      new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong!")
        .toJSON(),
      new SlashCommandBuilder()
        .setName("openmodal")
        .setDescription("Opens a modal to capture user input")
        .toJSON(),
    ];

    try {
      console.log("Started refreshing application (/) commands.");

      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID as string),
        { body: commands },
      );

      console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
      console.error("Error reloading application (/) commands:", error);
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction.isCommand()) {
      const { commandName } = interaction;

      if (commandName === "ping") {
        await interaction.reply("Pong!");
      } else if (commandName === "openmodal") {
        const modal = new ModalBuilder()
          .setCustomId("userInputModal")
          .setTitle("User Input Modal");

        const input = new TextInputBuilder()
          .setCustomId("userInput")
          .setLabel("Enter your input")
          .setStyle(TextInputStyle.Short);

        const actionRow =
          new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === "userInputModal") {
        const userInput = interaction.fields.getTextInputValue("userInput");
        await interaction.reply(`You entered: ${userInput}`);
      }
    }
  });

  client.login(process.env.DISCORD_TOKEN as string);
}

main();

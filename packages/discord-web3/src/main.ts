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
import { User } from "./models"; // Import the User function
import { Service } from "./express"; // Import the express service
import {Api} from './api'
import {RpcFactory} from './utils'
import {Service as RouterService} from './router'

dotenv.config();

export function main(): void {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const userStore = User(); // Initialize the user store

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
      new SlashCommandBuilder()
        .setName("set_address")
        .setDescription("Sets the address for a specific chainId")
        .addIntegerOption(option =>
          option.setName("chainid")
            .setDescription("The chain ID")
            .setRequired(true))
        .addStringOption(option =>
          option.setName("address")
            .setDescription("The address to set")
            .setRequired(true))
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
      } else if (commandName === "set_address") {
        if(interaction.isChatInputCommand()){
          const chainId = interaction.options.getInteger("chainid", true);
          const address = interaction.options.getString("address", true);
          const userId = interaction.user.id;
          userStore.setAddress(userId, chainId, address);
          await interaction.reply(`Address set for chainId ${chainId}: ${address}`);
        }
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === "userInputModal") {
        const userInput = interaction.fields.getTextInputValue("userInput");
        await interaction.reply(`You entered: ${userInput}`);
      }
    }
  });

  client.login(process.env.DISCORD_TOKEN as string);

  const api = Api();
  const apiRpc = RpcFactory(api as any)
  const apiRouter = RouterService(apiRpc)
  // Run the express app
  const app = Service({}, [{router:apiRouter,path:'/user'}]); // Assuming no routers are passed for now
  const PORT = process.env.PORT || 3008;
  app.listen(PORT, () => {
    console.log(`Express server is running on port ${PORT}`);
  });
}

main();

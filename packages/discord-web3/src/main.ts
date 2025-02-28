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
  PermissionsBitField,
} from "discord.js";
import { Users } from "./models"; // Import the User function
import { Service } from "./express"; // Import the express service
import { Api } from "./api";
import { RpcFactory, ChainsById, Chains } from "./utils";
import { Service as RouterService } from "./router";

dotenv.config();

export function main(): void {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const userStore = Users(); // Initialize the user store

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
        .addIntegerOption((option) =>
          option
            .setName("chainid")
            .setDescription("The chain ID")
            .setRequired(true)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              })),
            ),
        )
        .addStringOption((option) =>
          option
            .setName("address")
            .setDescription("The address to set")
            .setRequired(true)
            .setAutocomplete(true),
        ) // Enable autocomplete for the address field
        .toJSON(),
      new SlashCommandBuilder()
        .setName("list_addresses")
        .setDescription("Lists all addresses for the user")
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_list_addresses")
        .setDescription("Lists all addresses for a given chainId (Admin only)")
        .addIntegerOption((option) =>
          option
            .setName("chainid")
            .setDescription("The chain ID")
            .setRequired(true)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              })),
            ),
        )
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

      try {
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
          if (interaction.isChatInputCommand()) {
            const chainId = interaction.options.getInteger("chainid", true);
            const address = interaction.options.getString("address", true);
            const userId = interaction.user.id;
            await userStore.setAddress(userId, chainId, address);
            await interaction.reply({
              content: `Address set for chainId ${chainId}: ${address}`,
              ephemeral: true,
            });
          }
        } else if (commandName === "list_addresses") {
          const userId = interaction.user.id;
          const userAddresses = await userStore.getUser(userId);
          if (userAddresses.length === 0) {
            await interaction.reply("No addresses set for any chains.");
          } else {
            const addressList = userAddresses
              .map(({ chainId, address }) => {
                const chain = ChainsById[chainId];
                const name = chain ? chain.name : "Unknown Chain";
                return `${name} (${chainId}): ${address}`;
              })
              .join("\n");
            await interaction.reply({
              content: `Addresses set for chains:\n${addressList}`,
              ephemeral: true,
            });
          }
        } else if (commandName === "admin_list_addresses") {
          if (interaction.isChatInputCommand()) {
            if (
              !interaction.memberPermissions?.has(
                PermissionsBitField.Flags.Administrator,
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                ephemeral: true,
              });
              return;
            }
            const chainId = interaction.options.getInteger("chainid", true);
            const allAddresses = await userStore.getUsersByChain(chainId);
            if (allAddresses.length === 0) {
              await interaction.reply(
                `No addresses found for chainId ${chainId}.`,
              );
            } else {
              const userPromises = allAddresses.map(async (user) => {
                const discorduser = await client.users.fetch(user.userId);
                return {
                  userId: user.userId,
                  displayName: discorduser.username,
                  address: user.address,
                  chainId: user.chainId,
                };
              });

              const userAddressList = await Promise.all(userPromises);
              const addressList = userAddressList
                .map(({ userId, displayName, address }) => {
                  return `User ID: ${userId}, Display Name: ${displayName}, Chain ID: ${chainId}, Address: ${address}`;
                })
                .join("\n");
              await interaction.reply(
                `Addresses for chainId ${chainId}:\n${addressList}`,
              );
            }
          }
        }
      } catch (error) {
        console.error("Error handling command:", error);
        if (error instanceof Error) {
          await interaction.reply({
            content: error.message,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "An unknown error occurred.",
            ephemeral: true,
          });
        }
      }
    } else if (interaction.isAutocomplete()) {
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === "address") {
        const userId = interaction.user.id;
        const userAddresses = await userStore.getUser(userId);
        const choices = userAddresses.map(({ chainId, address }) => {
          const chain = ChainsById[chainId];
          const chainName = chain ? chain.name : "Unknown Chain";
          return {
            name: `${chainName} (${chainId}): ${address}`,
            value: address,
          };
        });
        await interaction.respond(choices);
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
  const apiRpc = RpcFactory(api as any);
  const apiRouter = RouterService(apiRpc);
  // Run the express app
  const app = Service({}, [{ router: apiRouter, path: "/user" }]); // Assuming no routers are passed for now
  const PORT = process.env.PORT || 3008;
  app.listen(PORT, () => {
    console.log(`Express server is running on port ${PORT}`);
  });
}

main();

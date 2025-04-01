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
import { Users, Store, RedisStore, MapStore } from "./models"; // Import the User function
import { Service } from "./express"; // Import the express service
import { Api } from "./api";
import { RpcFactory, ChainsById, Chains } from "./utils";
import { Service as RouterService } from "./router";
import { createClient } from "redis";

dotenv.config();

// TODO: instruction on how someone could get the current version to run on their computer/Discord server.
// TODO: allow filtering by role, include roles in exported data
// TODO: Export to csv file
// TODO: check ability to query addresses through API
// TODO: deploy prod and staging
// TODO: verify ownership of wallet addresses, guild or collabland?
// TODO: public facing docs, website
// TODO: docs for people to setup and test on their own
export function main(): void {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers, // Add this intent to fetch all members in a guild
    ],
  });

  let store: Store<string, string>;

  if (process.env.REDIS_URL) {
    const redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.connect();
    store = new RedisStore(redisClient, "discord-web3");
  } else {
    store = new MapStore();
  }

  const userStore = Users(store); // Initialize the user store

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
        .setName("remove_address")
        .setDescription("Removes the address for a specific chainId")
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
        .addStringOption(
          (option) =>
            option
              .setName("address")
              .setDescription("The address to remove")
              .setRequired(true)
              .setAutocomplete(true), // Enable autocomplete for the address field
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("list_addresses")
        .setDescription("Lists all addresses for the user")
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_list_missing_addresses")
        .setDescription(
          "Lists all missing addresses for a given chainId (Admin only)",
        )
        .addIntegerOption((option) =>
          option
            .setName("chainid")
            .setDescription("The chain ID")
            .setRequired(false)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              })),
            ),
        )
        .toJSON(),
      new SlashCommandBuilder()
        // TODO: filter by role
        .setName("admin_list_addresses")
        .setDescription("Lists all addresses for a given chainId (Admin only)")
        .addIntegerOption((option) =>
          option
            .setName("chainid")
            .setDescription("The chain ID")
            .setRequired(false)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              })),
            ),
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to search for addresses")
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The role to filter addresses by")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("export")
            .setDescription("Whether to export the addresses to a file")
            .setRequired(false),
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
        } else if (commandName === "remove_address") {
          if (interaction.isChatInputCommand()) {
            const chainId = interaction.options.getInteger("chainid", true);
            const userId = interaction.user.id;
            await userStore.deleteAddress(userId, chainId); // Assuming delete method exists
            await interaction.reply({
              content: `Address removed for chainId ${chainId}.`,
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
                return `${name}: ${address}`;
              })
              .join("\n");
            await interaction.reply({
              content: `Addresses set for chains:\n${addressList}`,
              ephemeral: true,
            });
          }
        } else if (commandName === "admin_list_missing_addresses") {
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
            const guild = interaction.guild;
            if (!guild) {
              await interaction.reply({
                content: "This command can only be used within a guild.",
                ephemeral: true,
              });
              return;
            }
            const allDiscordUsers = await guild.members.fetch();
            const allAddresses = await userStore.getUsersByChain(chainId);

            const usersWithAddresses = new Set(
              allAddresses.map((addr) => addr.userId),
            );
            const usersWithoutAddresses = Array.from(
              allDiscordUsers.values(),
            ).filter((user) => !usersWithAddresses.has(user.id));

            if (usersWithoutAddresses.length === 0) {
              await interaction.reply({
                content: `All users have addresses set for chainId ${chainId}.`,
                ephemeral: true,
              });
            } else {
              const missingAddressList = usersWithoutAddresses
                .map((user, index) => `${index + 1}. ${user.user.username}`)
                .join("\n");
              await interaction.reply({
                content: `Users without addresses for chainId ${chainId}:\n${missingAddressList}`,
                ephemeral: true,
              });
            }
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

            const chainId = interaction.options.getInteger("chainid");
            const user = interaction.options.getUser("user");
            const exportToFile =
              interaction.options.getBoolean("export") || false;

            let allAddresses = await userStore.getAllAddresses();
            if (chainId !== null) {
              allAddresses = await userStore.getUsersByChain(chainId);
            }

            const userAddresses = user
              ? allAddresses.filter((addr) => addr.userId === user.id)
              : allAddresses;

            if (user && userAddresses.length === 0) {
              await interaction.reply(
                `No addresses found for user ${user.username}${chainId ? ` on chainId ${chainId}` : ""}.`,
              );
              return;
            }

            const userPromises = userAddresses.map(async (addr) => {
              const discorduser = await client.users.fetch(addr.userId);
              return {
                userId: addr.userId,
                displayName: discorduser.username,
                address: addr.address,
                chainId: addr.chainId,
              };
            });

            // TODO: show role in list
            const userAddressList = await Promise.all(userPromises);
            const sortedUserAddressList = userAddressList.sort((a, b) =>
              a.displayName.localeCompare(b.displayName),
            );
            const addressList = sortedUserAddressList
              .map(({ userId, displayName, address, chainId }, index) => {
                const chain = ChainsById[chainId];
                const chainName = chain ? chain.name : "Unknown Chain";
                return `${index + 1},${displayName},${userId},${address},${chainName}`;
              })
              .join("\n");
            if (exportToFile) {
              const csvContent =
                "Index,Display Name,User ID,Address,Chain\n" + addressList;
              const buffer = Buffer.from(csvContent, "utf-8");
              await interaction.reply({
                content: `All addresses have been exported as a CSV file.`,
                files: [{ name: "all_addresses.csv", attachment: buffer }],
                ephemeral: true,
              });
            } else {
              await interaction.reply({
                content: user
                  ? `Addresses for user ${user.username}:\n${addressList}`
                  : `Addresses:\n${addressList}`,
                ephemeral: true,
              });
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
        // TODO: need to filter out other addresses if user input doesnt match
        const userInput = interaction.options.getString("filter", false) || "";
        const choices = userAddresses
          .filter(({ address }) => address.includes(userInput))
          .map(({ chainId, address }) => {
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

  const api = Api(userStore);
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

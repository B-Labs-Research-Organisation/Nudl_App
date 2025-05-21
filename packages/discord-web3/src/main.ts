// TODO: Generate safe transactions
// TODO: customize notification message?
// TODO: When listing addresses, make it look nicer
// TODO: add role that can manage addresses (other than admin)
// TODO: Add filter by user for missing address
// TODO: export missing adddress users option
// TODO: instruction on how someone could get the current version to run on their computer/Discord server.
// TODO: allow filtering by role, by channel, include roles in exported data for both list address and list missing
// TODO: Export to csv file
// TODO: check ability to query addresses through API
// TODO: deploy prod and staging
// TODO: verify ownership of wallet addresses, guild or collabland?
// TODO: public facing docs, website
// TODO: docs for people to setup and test on their own

// DONE: Import csv to generate safe tx
// DONE: Ability to send amounts per user
// DONE: Make addresses defined per guild
// DONE: improved missing address notification
// DONE: Remove redundant text for add address notification: https://discord.com/channels/1035162791302139935/1311408790083469343/1369228478120988733
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
  ChannelType,
  GuildTextBasedChannel,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import * as viem from "viem";
import { Users, Store, RedisStore, MapStore } from "./models"; // Import the User function
import { Service } from "./express"; // Import the express service
import { Api } from "./api";
import { RpcFactory, ChainsById, Chains, getId, getViemChain } from "./utils";
import { Service as RouterService } from "./router";
import { createClient } from "redis";
import assert from "assert";
import ERC20_ABI from "./erc20.abi";

dotenv.config();

const fakeEthAddresses = [
  {
    chainId: 1,
    address: "0x15566C4f33a9c279f9d3E1a5bb7589fc5A7158B1",
    userId: "743854752713932923",
  },
  {
    chainId: 137,
    address: "0x15566C4f33a9c279f9d3E1a5bb7589fc5A7158B1",
    userId: "743854752713932923",
  },
  {
    chainId: 42161,
    address: "0x15566C4f33a9c279f9d3E1a5bb7589fc5A7158B1",
    userId: "743854752713932923",
  },
  {
    chainId: 10,
    address: "0x15566C4f33a9c279f9d3E1a5bb7589fc5A7158B1",
    userId: "743854752713932923",
  },
  {
    chainId: 8453,
    address: "0x15566C4f33a9c279f9d3E1a5bb7589fc5A7158B1",
    userId: "743854752713932923",
  },
  {
    chainId: 1,
    address: "0x0A24193E3D1B7a0663FF124A1505A09E921C60C0",
    userId: "573155442226757653",
  },
  {
    chainId: 137,
    address: "0x0A24193E3D1B7a0663FF124A1505A09E921C60C0",
    userId: "573155442226757653",
  },
  {
    chainId: 42161,
    address: "0x0A24193E3D1B7a0663FF124A1505A09E921C60C0",
    userId: "573155442226757653",
  },
  {
    chainId: 10,
    address: "0x0A24193E3D1B7a0663FF124A1505A09E921C60C0",
    userId: "573155442226757653",
  },
  {
    chainId: 8453,
    address: "0x0A24193E3D1B7a0663FF124A1505A09E921C60C0",
    userId: "573155442226757653",
  },
  {
    chainId: 1,
    address: "0x4d13Da5658B5Fd536Cb2bFF5eAc624687de86fb6",
    userId: "198443430102302720",
  },
  {
    chainId: 137,
    address: "0x4d13Da5658B5Fd536Cb2bFF5eAc624687de86fb6",
    userId: "198443430102302720",
  },
  {
    chainId: 42161,
    address: "0x4d13Da5658B5Fd536Cb2bFF5eAc624687de86fb6",
    userId: "198443430102302720",
  },
  {
    chainId: 10,
    address: "0x4d13Da5658B5Fd536Cb2bFF5eAc624687de86fb6",
    userId: "198443430102302720",
  },
  {
    chainId: 8453,
    address: "0x4d13Da5658B5Fd536Cb2bFF5eAc624687de86fb6",
    userId: "198443430102302720",
  },
];

const safeGenerations:Record<string,{
  id: string,
  chainId:number,
  safeAddress:string,
  tokenAddress:string,
}> = {}

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
      process.env.DISCORD_TOKEN as string
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
        .setDescription("Sets the address for a specific network")
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network")
            .setRequired(true)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              }))
            )
        )
        .addStringOption((option) =>
          option
            .setName("address")
            .setDescription("The address to set")
            .setRequired(true)
            .setAutocomplete(true)
        ) // Enable autocomplete for the address field
        .toJSON(),
      new SlashCommandBuilder()
        .setName("remove_address")
        .setDescription("Removes the address for a specific network")
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network")
            .setRequired(true)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              }))
            )
        )
        .addStringOption(
          (option) =>
            option
              .setName("address")
              .setDescription("The address to remove")
              .setRequired(true)
              .setAutocomplete(true) // Enable autocomplete for the address field
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("list_addresses")
        .setDescription("Lists all addresses for the user")
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_list_missing_addresses")
        .setDescription(
          "Lists all missing addresses for a given network (Admin only)"
        )
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network")
            .setRequired(false)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              }))
            )
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The role to filter missing addresses by")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to filter missing addresses by")
            .setRequired(false)
        )
        .toJSON(),
      new SlashCommandBuilder()
        // TODO: filter by role
        .setName("admin_list_addresses")
        .setDescription("Lists all addresses for a given network (Admin only)")
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network")
            .setRequired(false)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              }))
            )
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to search for addresses")
            .setRequired(false)
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The role to filter addresses by")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to filter addresses by")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("export")
            .setDescription("Whether to export the addresses to a file")
            .setRequired(false)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_seed_addresses")
        .setDescription(
          "Seeds the user store with fake Ethereum addresses (Admin only)"
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_notify_missing_addresses")
        .setDescription(
          "Notifies users missing addresses for a given network (Admin only)"
        )
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network")
            .setRequired(true)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              }))
            )
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The role to filter missing addresses by")
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to filter missing addresses by")
            .setRequired(false)
        )
        .toJSON(),
      // New admin_safe_payout command
      new SlashCommandBuilder()
        .setName("admin_safe_payout")
        .setDescription("Prepare a Safe payout CSV for a given network and token (Admin only)")
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network to submit payout for")
            .setRequired(true)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              }))
            )
        )
        .addStringOption((option) =>
          option
            .setName("token_address")
            .setDescription("The token contract address to submit payout for")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("safe_address")
            .setDescription("The Safe address to payout from")
            .setRequired(true)
        )
        .toJSON(),
    ];

    try {
      console.log("Started refreshing application (/) commands.");

      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID as string),
        { body: commands }
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
            const network = interaction.options.getInteger("network", true);
            const address = interaction.options.getString("address", true);
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            await userStore.setAddress(userId, guildId, network, address);
            const chain = ChainsById[network];
            const chainName = chain ? chain.name : "Unknown Chain";
            await interaction.reply({
              content: `Address set for ${chainName} (${network}): ${address}`,
              ephemeral: true,
            });
          }
        } else if (commandName === "remove_address") {
          if (interaction.isChatInputCommand()) {
            const network = interaction.options.getInteger("network", true);
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const chain = ChainsById[network];
            const chainName = chain ? chain.name : "Unknown Chain";
            await userStore.deleteAddress(userId, guildId, network); // Assuming delete method exists
            await interaction.reply({
              content: `Address removed for ${chainName} (${network}).`,
              ephemeral: true,
            });
          }
        } else if (commandName === "list_addresses") {
          const userId = interaction.user.id;
          const guildId = interaction.guildId!;
          const userAddresses = await userStore.getUser(userId, guildId);
          if (userAddresses.length === 0) {
            await interaction.reply("No addresses set for any networks.");
          } else {
            const addressList = userAddresses
              .map(({ chainId, address }) => {
                const chain = ChainsById[chainId];
                const name = chain ? chain.name : "Unknown Chain";
                return `${name} (${chainId}): ${address}`;
              })
              .join("\n");
            await interaction.reply({
              content: `Addresses set for networks:\n${addressList}`,
              ephemeral: true,
            });
          }
        } else if (commandName === "admin_list_missing_addresses") {
          if (interaction.isChatInputCommand()) {
            if (
              !interaction.memberPermissions?.has(
                PermissionsBitField.Flags.Administrator
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                ephemeral: true,
              });
              return;
            }

            const network = interaction.options.getInteger("network", true);
            const role = interaction.options.getRole("role", false);
            const channel: GuildTextBasedChannel | null =
              interaction.options.getChannel("channel", false, [
                ChannelType.GuildText,
              ]);
            const guild = interaction.guild;
            if (!guild) {
              await interaction.reply({
                content: "This command can only be used within a guild.",
                ephemeral: true,
              });
              return;
            }
            const guildId = guild.id;
            const allDiscordUsers = await guild.members.fetch();
            const allAddresses = await userStore.getUsersByChain(network, guildId);

            const usersWithAddresses = new Set(
              allAddresses.map((addr) => addr.userId)
            );
            let usersWithoutAddresses = Array.from(
              allDiscordUsers.values()
            ).filter(
              (user) => !usersWithAddresses.has(user.id) && !user.user.bot
            );

            if (role) {
              await guild.roles.fetch();
              const roleMembers = guild.roles.cache.get(role.id)?.members;
              if (roleMembers && roleMembers.size > 0) {
                const roleMemberIds = new Set(
                  roleMembers.map((member) => member.id)
                );
                usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
                  roleMemberIds.has(user.id)
                );
              } else {
                usersWithoutAddresses = [];
              }
            }

            if (channel) {
              await channel.fetch();
              const channelMembers = await channel.members;
              usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
                channelMembers.has(user.id)
              );
            }

            if (usersWithoutAddresses.length === 0) {
              await interaction.reply({
                content: `All users${role ? ` with role ${role.name}` : ""}${channel ? ` in channel ${channel.name}` : ""} have addresses set for ${ChainsById[network].name} (${network}).`,
                ephemeral: true,
              });
            } else {
              const missingAddressList = usersWithoutAddresses
                .map(
                  (user, index) =>
                    `${index + 1}. ${user.displayName}(${user.user.username})`
                )
                .join("\n");
              const customIdParts = [
                `notifyMissing`,
                `chain:${network}`,
                role ? `role:${role.id}` : `role:none`,
                channel ? `channel:${channel.id}` : `channel:none`,
              ];
              const customId = customIdParts.join("_");
              const notifyButton =
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel("Announce to Missing Users")
                    .setStyle(ButtonStyle.Secondary)
                );
              await interaction.reply({
                content: `Users${role ? ` with role ${role.name}` : ""}${channel ? ` in channel ${channel.name}` : ""} without addresses for ${ChainsById[network].name} (${network}):\n${missingAddressList}`,
                components: [notifyButton],
                ephemeral: true,
              });
            }
          }
        } else if (commandName === "admin_notify_missing_addresses") {
          if (interaction.isChatInputCommand()) {
            if (
              !interaction.memberPermissions?.has(
                PermissionsBitField.Flags.Administrator
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                ephemeral: true,
              });
              return;
            }

            const network = interaction.options.getInteger("network", true);
            const role = interaction.options.getRole("role", false);
            const channel: GuildTextBasedChannel | null =
              interaction.options.getChannel("channel", false, [
                ChannelType.GuildText,
              ]);
            const guild = interaction.guild;
            if (!guild) {
              await interaction.reply({
                content: "This command can only be used within a guild.",
                ephemeral: true,
              });
              return;
            }
            const guildId = guild.id;
            const allDiscordUsers = await guild.members.fetch();
            const allAddresses = await userStore.getUsersByChain(network, guildId);

            const usersWithAddresses = new Set(
              allAddresses.map((addr) => addr.userId)
            );
            let usersWithoutAddresses = Array.from(
              allDiscordUsers.values()
            ).filter(
              (user) => !usersWithAddresses.has(user.id) && !user.user.bot
            );

            if (role) {
              await guild.roles.fetch();
              const roleMembers = guild.roles.cache.get(role.id)?.members;
              if (roleMembers && roleMembers.size > 0) {
                const roleMemberIds = new Set(
                  roleMembers.map((member) => member.id)
                );
                usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
                  roleMemberIds.has(user.id)
                );
              } else {
                usersWithoutAddresses = [];
              }
            }

            if (channel) {
              await channel.fetch();
              const channelMembers = await channel.members;
              usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
                channelMembers.has(user.id)
              );
            }

            if (usersWithoutAddresses.length === 0) {
              await interaction.reply({
                content: `All users${role ? ` with role ${role.name}` : ""}${channel ? ` in channel ${channel.name}` : ""} have addresses set for ${ChainsById[network].name} (${network}).`,
                ephemeral: true,
              });
            } else {
              const mentions = usersWithoutAddresses
                .map((user) => `<@${user.id}>`)
                .join(" ");
              const chainName = ChainsById[network]?.name || "Unknown Chain";
              const button =
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`addAddress_${network}`)
                    .setLabel(`📥 Add ${chainName} (${network}) address`)
                    .setStyle(ButtonStyle.Primary)
                );
              await interaction.reply({
                content: `🚨 __**Attention Required**__ 🚨\n\n${mentions}\n\n💸 *We need your wallet address!* 👛\n\n⚠️ Don’t miss out — get set up ASAP!\nNeed help? Just drop a message! 🆘`,
                components: [button],
                allowedMentions: {
                  users: usersWithoutAddresses.map((user) => user.id),
                },
              });
            }
          }
        } else if (commandName === "admin_list_addresses") {
          if (interaction.isChatInputCommand()) {
            if (
              !interaction.memberPermissions?.has(
                PermissionsBitField.Flags.Administrator
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                ephemeral: true,
              });
              return;
            }

            const guild = interaction.guild;
            if (!guild) {
              await interaction.reply({
                content: "This command can only be used within a guild.",
                ephemeral: true,
              });
              return;
            }

            const network = interaction.options.getInteger("network");
            const user = interaction.options.getUser("user");
            const role = interaction.options.getRole("role", false);
            const channel: GuildTextBasedChannel | null =
              interaction.options.getChannel("channel", false, [
                ChannelType.GuildText,
              ]);
            const exportToFile =
              interaction.options.getBoolean("export") || false;

            // Fetch all members of the server
            const allDiscordUsers = await guild.members.fetch();

            // Filter users based on optional filters
            let filteredUsers = Array.from(allDiscordUsers.values());

            if (user) {
              filteredUsers = filteredUsers.filter(
                (member) => member.id === user.id
              );
            }

            if (role) {
              const roleMembers = guild.roles.cache.get(role.id)?.members;
              if (roleMembers) {
                const roleMemberIds = new Set(
                  roleMembers.map((member) => member.id)
                );
                filteredUsers = filteredUsers.filter((member) =>
                  roleMemberIds.has(member.id)
                );
              } else {
                filteredUsers = [];
              }
            }

            if (channel) {
              await channel.fetch();
              const channelMembers = await channel.members;
              filteredUsers = filteredUsers.filter((member) =>
                channelMembers.has(member.id)
              );
            }

            // Lookup to see if they have addresses set
            const guildId = guild.id;
            const userAddresses = await Promise.all(
              filteredUsers.map(async (member) => {
                const addresses =
                  network !== null
                    ? await userStore.getUsersByChain(network, guildId)
                    : await userStore.getAllAddresses(guildId);
                return addresses.filter((addr) => addr.userId === member.id);
              })
            );

            const flatUserAddresses = userAddresses.flat();

            if (flatUserAddresses.length === 0) {
              await interaction.reply({
                content: user
                  ? `No addresses found for user ${user.username}${network ? ` on network ${network}` : ""}.`
                  : `No users with addresses found${network ? ` on network ${network}` : ""}.`,
                ephemeral: true,
              });
              return;
            }

            // Format the final results
            const userPromises = flatUserAddresses.map(async (addr) => {
              const discorduser = await client.users.fetch(addr.userId);
              return {
                userId: addr.userId,
                displayName: discorduser.displayName,
                username: discorduser.username,
                address: addr.address,
                chainId: addr.chainId,
              };
            });

            // TODO: show role in list
            const userAddressList = await Promise.all(userPromises);
            const sortedUserAddressList = userAddressList.sort((a, b) =>
              a.displayName.localeCompare(b.displayName)
            );
            const addressList = sortedUserAddressList
              .map(
                (
                  { userId, displayName, address, chainId, username },
                  index
                ) => {
                  const chain = ChainsById[chainId];
                  const chainName = chain ? chain.name : "Unknown Chain";
                  return `${index + 1}. ${displayName}(${username}) ${chainName}(${chainId}) ${address}`;
                }
              )
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
        } else if (commandName === "admin_seed_addresses") {
          if (interaction.isChatInputCommand()) {
            if (
              !interaction.memberPermissions?.has(
                PermissionsBitField.Flags.Administrator
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                ephemeral: true,
              });
              return;
            }

            const guildId = interaction.guildId!;
            for (const { userId, chainId, address } of fakeEthAddresses) {
              await userStore.setAddress(userId, guildId, chainId, address);
            }

            await interaction.reply({
              content: "Fake Ethereum addresses have been seeded successfully.",
              ephemeral: true,
            });
          }
        } else if (commandName === "admin_safe_payout") {
          // New command logic
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator
            )
          ) {
            await interaction.reply({
              content: "You do not have permission to use this command.",
              ephemeral: true,
            });
            return;
          }

          if (interaction.isChatInputCommand()) {

            const chainId = interaction.options.getInteger("network", true);
            const tokenAddress = interaction.options.getString("token_address", true);
            const safeAddress = interaction.options.getString("safe_address", true);
            const networkName = ChainsById[chainId]?.name || "Unknown Network";
            const viemChain = getViemChain(chainId);

            assert(viemChain, `Chain ${chainId} not found`)
            const erc20 = viem.getContract({
              address:viem.getAddress(tokenAddress),
              abi: ERC20_ABI,
              client: viem.createPublicClient({
                chain: viemChain,
                transport: viem.http(),
              }),
            })
            const [name, symbol, decimals] = await Promise.all([
              erc20.read.name(),
              erc20.read.symbol(),
              erc20.read.decimals(),
            ])
            console.log(commandName,{chainId,tokenAddress,safeAddress,networkName})
            // Show instructions and a button to open the modal
            const instructions = [
              `**Safe Payout Preparation**`,
              `Network: \`${networkName}\``,
              `Safe Address: \`${safeAddress}\``,
              `Token Address: \`${tokenAddress}\``,
              `Token Name: \`${name}\``,
              `Token Symbol: \`${symbol}\``,
              `Token Decimals: \`${decimals}\``,
              ``,
              `Please click the button below to paste your CSV data.`,
              `The CSV should be in the format:`,
              `\`discordid,amount\` (one per line)`,
              ``,
              `After submitting, you will receive a file to download.`
            ].join("\n");

            const safeId = getId(); 
            safeGenerations[safeId] = {
              id: safeId,
              chainId,
              safeAddress,
              tokenAddress,
            }
            const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `safePayoutModal_${safeId}`
                )
                .setLabel("Paste CSV Data")
                .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({
              content: instructions,
              components: [button],
            });
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
        const guildId = interaction.guildId!;
        const userAddresses = await userStore.getUser(userId, guildId);
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
      try {
        if (interaction.customId === "userInputModal") {
          const userInput = interaction.fields.getTextInputValue("userInput");
          await interaction.reply(`You entered: ${userInput}`);
        } else if (interaction.customId.startsWith("addAddress_")) {
          const network = parseInt(interaction.customId.split("_")[1], 10);
          const address = interaction.fields.getTextInputValue("addressInput");
          const userId = interaction.user.id;
          const guildId = interaction.guildId!;
          
          await userStore.setAddress(userId, guildId, network, address);
          const chain = ChainsById[network];
          const chainName = chain ? chain.name : "Unknown Chain";
          await interaction.reply({
            content: `Address set for ${chainName} (${network}): ${address}`,
            ephemeral: true,
          });
        } else if (interaction.customId.startsWith("safePayoutModal_")) {
          // Modal submit for admin_safe_payout
          const [_, safeId] = interaction.customId.split("_");
          const safeData = safeGenerations[safeId];
          if (!safeData) {
            await interaction.reply({
              content: "Safe data not found",
              ephemeral: true,
            })
            return;
          }
          const csvData = interaction.fields.getTextInputValue("csvInput");
          // For now, just return the file as the user pasted it
          const buffer = Buffer.from(csvData, "utf-8");
          await interaction.reply({
            content: "Here is your CSV file as submitted.",
            files: [{ name: "safe_payout.csv", attachment: buffer }],
            ephemeral: true,
          });
        }
      } catch (error) {
        console.error("Error handling modal submit:", error);
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
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith("addAddress_")) {
        const network = parseInt(interaction.customId.split("_")[1], 10);
        const chain = ChainsById[network];
        const chainName = chain ? chain.name : "Unknown Chain";
        const userId = interaction.user.id;
        const guildId = interaction.guildId!;
        // Check if the user already has an address set for this network
        const existingAddress = await userStore.getAddress(userId, guildId, network);
        console.log({userId, guildId, network, existingAddress})
        if (existingAddress) {
          await interaction.reply({
            content: `You already have an address set for this network: ${existingAddress}`,
            ephemeral: true,
          });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`addAddress_${network}`)
          .setTitle(`Add Address for ${chainName} (${network})`);

        const input = new TextInputBuilder()
          .setCustomId("addressInput")
          .setLabel("Enter your address")
          .setStyle(TextInputStyle.Short);

        const actionRow =
          new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      } else if (interaction.customId.startsWith("notifyMissing_")) {
        const [_, networkPart, rolePart, channelPart] =
          interaction.customId.split("_");
        const network = Number(networkPart.split("chain:")[1]);
        const roleId =
          rolePart !== "role:none" ? rolePart.split("role:")[1] : null;
        const channelId =
          channelPart !== "channel:none"
            ? channelPart.split("channel:")[1]
            : null;
        const guild = interaction.guild;
        if (!guild) {
          await interaction.reply({
            content: "This command can only be used within a guild.",
            ephemeral: true,
          });
          return;
        }
        const guildId = guild.id;
        const allDiscordUsers = await guild.members.fetch();
        const allAddresses = await userStore.getUsersByChain(network, guildId);

        const usersWithAddresses = new Set(
          allAddresses.map((addr) => addr.userId)
        );
        let usersWithoutAddresses = Array.from(allDiscordUsers.values()).filter(
          (user) => !usersWithAddresses.has(user.id) && !user.user.bot
        );

        if (roleId) {
          await guild.roles.fetch();
          const roleMembers = guild.roles.cache.get(roleId)?.members;
          if (roleMembers && roleMembers.size > 0) {
            const roleMemberIds = new Set(
              roleMembers.map((member) => member.id)
            );
            usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
              roleMemberIds.has(user.id)
            );
          } else {
            usersWithoutAddresses = [];
          }
        }

        if (channelId) {
          const channel = await guild.channels.fetch(channelId);
          assert(
            channel !== null && channel.isTextBased(),
            "Must be a text channel"
          );
          const channelMembers = (channel as TextChannel).members;
          usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
            channelMembers.has(user.id)
          );
        }

        if (usersWithoutAddresses.length === 0) {
          await interaction.reply({
            content: `All users have addresses set for ${ChainsById[network].name} (${network}).`,
            ephemeral: true,
          });
        } else {
          const mentions = usersWithoutAddresses
            .map((user) => `<@${user.id}>`)
            .join(" ");
          const chainName = ChainsById[network]?.name || "Unknown Chain";
          const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`addAddress_${network}`)
              .setLabel(`📥 Add ${chainName} (${network}) address`)
              .setStyle(ButtonStyle.Primary)
          );
          await interaction.reply({
            content: `🚨 __**Attention Required**__ 🚨\n\n${mentions}\n\n💸 *We need your wallet address!* 👛\n\n⚠️ Don’t miss out — get set up ASAP!\nNeed help? Just drop a message! 🆘`,
            components: [button],
            allowedMentions: {
              users: usersWithoutAddresses.map((user) => user.id),
            },
          });
        }
      } else if (interaction.customId.startsWith("safePayoutModal_")) {
        // Button click for admin_safe_payout: show modal to paste CSV
        // Extract the networkName, tokenAddress, safeAddress from the customId
        // Format: safePayoutModal_{networkName}_{tokenAddress}_{safeAddress}
        const [_, ...rest] = interaction.customId.split("_");
        const [networkNameEnc, tokenAddressEnc, safeAddressEnc] = rest;
        // Not used for now, but could be used for further processing
        // const networkName = decodeURIComponent(networkNameEnc);
        // const tokenAddress = decodeURIComponent(tokenAddressEnc);
        // const safeAddress = decodeURIComponent(safeAddressEnc);

        const modal = new ModalBuilder()
          .setCustomId(`safePayoutModal_${networkNameEnc}_${tokenAddressEnc}_${safeAddressEnc}`)
          .setTitle("Paste Safe Payout CSV");

        const input = new TextInputBuilder()
          .setCustomId("csvInput")
          .setLabel("Paste CSV (discordid,amount per line)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
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

// TODO: on filtering users see if we can add a button to do a payout, automoatically  populate form with user names
// TODO: add pagination to output for admin_list_addresses
// TODO: add admin search by address field to existing list addresse call
// TODO: finish csv airdrop 
// TODO: command to make missing address notification
// TODO: filter by channel name not working


// TODO: donation UI 
// TODO: use full token addresses in token manager

// DONE: Safe and token management within ui
// DONE: add network dropdown in token managment page
// DONE: fix search by address whichs reutrning must be 20000 fewer in length
// DONE: Warning if overriding a safe - add dynamic wording based on new/existing safe
// DONE: when listing your own addresses make sure formatting is the same as other lists
// DONE: Fix new safe address with prefix

import {
  User,
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
  GuildMember,
  StringSelectMenuBuilder,
  MessageFlags,
} from "discord.js";
import * as viem from "viem";
import { Service } from "./express"; // Import the express service
import { Api } from "./api";
import {
  RpcFactory,
  ChainsById,
  Chains,
  getId,
  getViemChain,
  resolveDiscordUser,
  generateSafeTransactionBatch,
  renderUser,
  renderUsers,
  ChainSummary,
  renderPayoutPrefill,
  dispersePayout,
  parseRecipientsCsvAndResolveAddresses,
  renderSafePayoutSetupRow,
  renderTokenSelectRowForPayout,
  Payouts,
  getAdminManageSafesDisplay,
  getAdminManageTokensDisplay,
  tokenSelectionDisplay,
  tokenRemovalSelectionDisplay,
  fetchErc20TokenInfo,
} from "./utils";
import { Service as RouterService } from "./router";
import assert from "assert";
import ERC20_ABI from "./erc20.abi";
import _, { chain } from "lodash";
import { createBot, start } from "./bot";
import {
  handleTokenAutocomplete,
  handleTokensButton,
  handleTokensCommand,
  handleTokensModalSubmit,
  handleTokensSelectMenu,
} from "./features/tokens/tokensFeature";
import {
  handleSafesButton,
  handleSafesCommand,
  handleSafesModalSubmit,
  handleSafesSelectMenu,
} from "./features/safes/safesFeature";
import {
  handlePayoutsButton,
  handlePayoutsModalSubmit,
  handlePayoutsSelectMenu,
} from "./features/payouts/payoutsFeature";


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
    chainId: 137,
    address: "0x0A24193E3D1B7a0663FF124A1505A09E921C60C0",
    userId: "1015930607638949888",
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

export async function main(): Promise<void> {
  const context = await createBot();
  const {
    client,
    rest,
    config,
    models: { users: userModel, safes: safeModel, tokens: tokenModel },
    stores: {
      manageSafes,
      safeGenerations,
      dispersePayouts,
      csvAirdropPayouts,
      payouts,
    },
  } = context;

  client.once("ready", async () => {
    console.log("Discord client is ready!");


    const commands = [
      new SlashCommandBuilder()
        .setName("set_address")
        .setDescription("Sets the address for a specific network")
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network")
            .setRequired(true)
            .addChoices(
              { 
                name:"Add to All Chains",
                value:0,
              },
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
        .setDescription("Removes the address for a specific network")
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
          "Lists all missing addresses for a given network (Admin only)",
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
              })),
            ),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The role to filter missing addresses by")
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to filter missing addresses by")
            .setRequired(false),
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
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to filter addresses by")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("export")
            .setDescription("Whether to export the addresses to a file")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("address")
            .setDescription("An address to search for")
            .setRequired(false),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_seed_addresses")
        .setDescription(
          "Seeds the user store with fake Ethereum addresses (Admin only)",
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_notify_missing_addresses")
        .setDescription(
          "Notifies users missing addresses for a given network (Admin only)",
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
              })),
            ),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The role to filter missing addresses by")
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to filter missing addresses by")
            .setRequired(false),
        )
        .toJSON(),
      // Updated admin_safe_payout command
      new SlashCommandBuilder()
        .setName("admin_safe_payout")
        .setDescription(
          "Prepare a Safe payout CSV for a given network and token (Admin only)",
        )
        .addStringOption(
          (option) =>
            option
              .setName("safe_address")
              .setDescription("The Safe address in network:address format")
              .setRequired(true)
              .setAutocomplete(true), // Enable autocomplete for the safe address field
        )
        .addStringOption((option) =>
          option
            .setName("token_address")
            .setDescription("The token contract address to submit payout for")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addNumberOption((option) =>
          option
            .setName("donate_amount")
            .setDescription(
              "Donate tokens to the Nudl project in this transaction using the same token.",
            )
            .setRequired(false),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_disperse_payout")
        .setDescription("Disperse a payout to users (Admin only)")
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network to disperse payout for")
            .setRequired(true)
            .addChoices(
              ...Chains.map((chain) => ({
                name: chain.name,
                value: chain.chainId,
              })),
            ),
        )
        .addNumberOption((option) =>
          option
            .setName("donate_amount")
            .setDescription(
              "Donate tokens to the Nudl project in this transaction using the same token.",
            )
            .setRequired(false),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_csv_airdrop_payout")
        .setDescription("CSV Airdrop payout file (Admin only)")
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network they payout for")
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
            .setName("token_address")
            .setDescription("The token contract address to submit payout for")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addNumberOption((option) =>
          option
            .setName("donate_amount")
            .setDescription(
              "Donate tokens to the Nudl project in this transaction using the same token.",
            )
            .setRequired(false),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_set_safe_address")
        .setDescription("Saves a Safe address for the current guild")
        .addStringOption((option) =>
          option
            .setName("safe_address")
            .setDescription("The Safe address in network:address format")
            .setRequired(true),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_remove_safe_address")
        .setDescription("Removes a Safe address for the current guild")
        .addStringOption((option) =>
          option
            .setName("safe_address")
            .setDescription(
              "The Safe address to remove in network:address format",
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .toJSON(),
      // New admin_manage_safes command
      new SlashCommandBuilder()
        .setName("admin_manage_safes")
        .setDescription("Show, add, or remove Safe addresses for this guild (Admin only)")
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_manage_tokens")
        .setDescription("Show, add, or remove token addresses for this guild (Admin only)")
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_set_token")
        .setDescription("Add a token for a specific network (Admin only)")
        .addIntegerOption((option) =>
          option
            .setName("network")
            .setDescription("The network")
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
            .setName("token_address")
            .setDescription("The token contract address to add")
            .setRequired(true),
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName("admin_remove_token")
        .setDescription("Removes a token for a specific network (Admin only)")
        .addStringOption((option) =>
          option
            .setName("token_address")
            .setDescription(
              "The token address to remove in network:address format",
            )
            .setRequired(true)
            .setAutocomplete(true),
        )
        .toJSON(),
    ];

    try {
      console.log("Started refreshing application (/) commands.");

      await rest.put(
        Routes.applicationCommands(config.clientId),
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
            const network = interaction.options.getInteger("network", true);
            const networkAddress = interaction.options.getString(
              "address",
              true,
            );
            let address = networkAddress;
            if (networkAddress.includes(":")) {
              address = networkAddress.split(":")[1];
            }
            assert(address, "Please provide an address");
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            if(network === 0){
              // handle setting all
              for(const chain of Chains){
                await userModel.setAddress(userId, guildId, chain.chainId, address);
              }
              return interaction.reply({
                content: `Address ${address} set for ALL supported chains.`,
                flags: MessageFlags.Ephemeral,
              });
            }
            await userModel.setAddress(userId, guildId, network, address);
            const chain = ChainsById[network];
            const chainName = chain ? chain.name : "Unknown Chain";
            await interaction.reply({
              content: `Address set for ${chainName} (${network}): ${address}`,
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "remove_address") {
          if (interaction.isChatInputCommand()) {
            const networkAddress = interaction.options.getString(
              "address",
              true,
            );
            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const [chainId, address] = networkAddress.split(":");
            assert(chainId, "Unable to find chain id");
            const chain = ChainsById[Number(chainId)];
            const chainName = chain ? chain.name : "Unknown Chain";
            await userModel.deleteAddress(userId, guildId, Number(chainId)); // Assuming delete method exists
            await interaction.reply({
              content: `Address ${address} removed for ${chainName} (${chainId}).`,
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "list_addresses") {
          const userId = interaction.user.id;
          const guildId = interaction.guildId!;
          const userAddresses = await userModel.getUser(userId, guildId);
          if (userAddresses.length === 0) {
            await interaction.reply("No addresses set for any networks.");
          } else {
            // Format user's addresses as [[GuildMember, [{chain, address}, ...]]] for renderUsers
            // Only one user: interaction.member
            const user = interaction.member;
            // Defensive fallback for GuildMember - in rare edge cases where interaction.member might not be set, refetch
            const guildMember = user;
            assert(
              guildMember && typeof guildMember.user === "object" && guildMember instanceof GuildMember,
              "Unable to find guild member"
            );
            // need userAddresses as [{chainId, address}], map to [{chain, address}]
            const addresses = userAddresses
              .map(({ chainId, address }) => {
                const chain = ChainsById[chainId];
                if (!chain) return null;
                return { chain, address };
              })
              .filter((addr): addr is { chain: ChainSummary; address: string } => addr !== null);

            assert(addresses.length > 0,"No addresses found!")
            const formattedResponse = renderUser(
              guildMember, addresses
            );
            
            await interaction.reply({
              content: formattedResponse,
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "admin_manage_tokens") {
          const handled = await handleTokensCommand(interaction, { tokenModel });
          if (handled) return;
        } else if (commandName === "admin_manage_safes") {
          const handled = await handleSafesCommand(interaction, { safeModel });
          if (handled) return;
        } else if (commandName === "admin_list_missing_addresses") {
          if (interaction.isChatInputCommand()) {
            if (
              !interaction.memberPermissions?.has(
                PermissionsBitField.Flags.Administrator,
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                flags: MessageFlags.Ephemeral,
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
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            const guildId = guild.id;
            const allDiscordUsers = await guild.members.fetch();
            const allAddresses = await userModel.getUsersByChain(
              network,
              guildId,
            );

            const usersWithAddresses = new Set(
              allAddresses.map((addr) => addr.userId),
            );
            let usersWithoutAddresses = Array.from(
              allDiscordUsers.values(),
            ).filter(
              (user) => !usersWithAddresses.has(user.id) && !user.user.bot,
            );

            if (role) {
              await guild.roles.fetch();
              const roleMembers = guild.roles.cache.get(role.id)?.members;
              if (roleMembers && roleMembers.size > 0) {
                const roleMemberIds = new Set(
                  roleMembers.map((member) => member.id),
                );
                usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
                  roleMemberIds.has(user.id),
                );
              } else {
                usersWithoutAddresses = [];
              }
            }

            if (channel) {
              await channel.fetch();
              const channelMembers = await channel.members;
              usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
                channelMembers.has(user.id),
              );
            }

            if (usersWithoutAddresses.length === 0) {
              await interaction.reply({
                content: `All users${role ? ` with role ${role.name}` : ""}${channel ? ` in channel ${channel.name}` : ""} have addresses set for ${ChainsById[network].name} (${network}).`,
                flags: MessageFlags.Ephemeral,
              });
            } else {
              const missingAddressList = usersWithoutAddresses
                .map(
                  (user, index) =>
                    `${index + 1}. ${user.displayName}(${user.user.username})`,
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
                    .setStyle(ButtonStyle.Secondary),
                );
              await interaction.reply({
                content: `Users${role ? ` with role ${role.name}` : ""}${channel ? ` in channel ${channel.name}` : ""} without addresses for ${ChainsById[network].name} (${network}):\n${missingAddressList}`,
                components: [notifyButton],
                flags: MessageFlags.Ephemeral,
              });
            }
          }
        } else if (commandName === "admin_notify_missing_addresses") {
          if (interaction.isChatInputCommand()) {
            if (
              !interaction.memberPermissions?.has(
                PermissionsBitField.Flags.Administrator,
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                flags: MessageFlags.Ephemeral,
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
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            const guildId = guild.id;
            const allDiscordUsers = await guild.members.fetch();
            const allAddresses = await userModel.getUsersByChain(
              network,
              guildId,
            );

            const usersWithAddresses = new Set(
              allAddresses.map((addr) => addr.userId),
            );
            let usersWithoutAddresses = Array.from(
              allDiscordUsers.values(),
            ).filter(
              (user) => !usersWithAddresses.has(user.id) && !user.user.bot,
            );

            if (role) {
              await guild.roles.fetch();
              const roleMembers = guild.roles.cache.get(role.id)?.members;
              if (roleMembers && roleMembers.size > 0) {
                const roleMemberIds = new Set(
                  roleMembers.map((member) => member.id),
                );
                usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
                  roleMemberIds.has(user.id),
                );
              } else {
                usersWithoutAddresses = [];
              }
            }

            if (channel) {
              await channel.fetch();
              const channelMembers = await channel.members;
              usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
                channelMembers.has(user.id),
              );
            }

            if (usersWithoutAddresses.length === 0) {
              await interaction.reply({
                content: `All users${role ? ` with role ${role.name}` : ""}${channel ? ` in channel ${channel.name}` : ""} have addresses set for ${ChainsById[network].name} (${network}).`,
                flags: MessageFlags.Ephemeral,
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
                    .setStyle(ButtonStyle.Primary),
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
                PermissionsBitField.Flags.Administrator,
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const guild = interaction.guild;
            if (!guild) {
              await interaction.reply({
                content: "This command can only be used within a guild.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const network = interaction.options.getInteger("network");
            const user = interaction.options.getUser("user");
            const role = interaction.options.getRole("role", false);
            const walletAddress = interaction.options.getString("address", false);

            // if(walletAddress){
            //   const usersWithAddress = await userModel.getUsersByAddress(
            //     guildId,
            //     walletAddress,
            //   );
            // }

            // if (usersWithAddress.length === 0) {
            //   await interaction.reply({
            //     content: `No users found for address: ${address}`,
            //     ephemeral: true,
            //   });
            //   return;
            // }

            // const userAddresses = await Promise.all(
            //   usersWithAddress.map(async ({ userId, chainId, address }) => {
            //     try {
            //       const chain = ChainsById[chainId];
            //       const user = await guild.members.fetch(userId);
            //       return { user, chain }; // Return an object with user and chain
            //     } catch (error) {
            //       console.error(
            //         `Error fetching user data for userId ${userId}:`,
            //         error,
            //       );
            //       return null; // Return null for filtering out errors
            //     }
            //   }),
            // ).then((results) => results.filter((result) => result !== null));


            const channel: GuildTextBasedChannel | null =
              interaction.options.getChannel("channel", false, [
                ChannelType.GuildText,
              ]);
            const exportToFile =
              interaction.options.getBoolean("export") || false;

            // Fetch all members of the server only if not already cached
            if (guild.members.cache.size === 0) {
              await guild.members.fetch();
            }
            const allDiscordUsers = guild.members.cache;
            

            // Filter users based on optional filters
            let filteredUsers = Array.from(allDiscordUsers.values());
            const allAddresses = await userModel.getAllAddresses(guild.id);

            if (user) {
              filteredUsers = filteredUsers.filter(
                (member) => member.id === user.id,
              );
            }

            if (role) {
              const roleMembers = guild.roles.cache.get(role.id)?.members;
              if (roleMembers) {
                const roleMemberIds = new Set(
                  roleMembers.map((member) => member.id),
                );
                filteredUsers = filteredUsers.filter((member) =>
                  roleMemberIds.has(member.id),
                );
              } else {
                filteredUsers = [];
              }
            }

            if (channel) {
              await channel.fetch();
              const channelMembers = await channel.members;
              filteredUsers = filteredUsers.filter((member) =>
                channelMembers.has(member.id),
              );
            }

            let filteredAddresses = allAddresses;
            if (network) {
              filteredAddresses = filteredAddresses.filter(
                ({ chainId }) => network === chainId,
              );
            }

            const finalList: [
              GuildMember,
              { chain: ChainSummary; address: string }[],
            ][] = filteredUsers
              .filter((user) => {
                return filteredAddresses.find(
                  (addr) => addr.userId === user.id,
                );
              })
              .map((user) => {
                return [
                  user,
                  filteredAddresses
                    .filter((addr) => addr.userId === user.id)
                    .map((address) => {
                      const chain = ChainsById[address.chainId];
                      return {
                        chain,
                        address: address.address,
                      };
                    })
                    .sort((a, b) => (a.chain.name < b.chain.name ? -1 : 1)),
                ];
              });

            finalList.sort(([a], [b]) => {
              return a.displayName.localeCompare(b.displayName);
            });

            const formattedResponse = renderUsers(finalList);

            const addressList = finalList
              .map(([user, data]) => {
                return data.map(({ chain, address }) => {
                  return {
                    userId: user.id,
                    displayName: user.displayName,
                    address: address,
                    chainId: chain.chainId,
                    chainName: chain.name,
                    username: user.user.tag,
                  };
                });
              })
              .flat()
              .map(
                (
                  {
                    userId,
                    displayName,
                    address,
                    chainId,
                    username,
                    chainName,
                  },
                  index,
                ) => {
                  return `${index + 1},${displayName},${username},${userId},${chainName},${chainId},${address}`;
                },
              )
              .join("\n")

            if (formattedResponse.length === 0) {
              return interaction.reply({
                content: `No addresses found!`,
                flags: MessageFlags.Ephemeral,
              });
            }
            if (exportToFile) {
              const csvContent =
                "Index,Display_Name,Unique_Name,UserID,Chain_Name,Chain_Id,Address,Value\n" +
                addressList;
              const buffer = Buffer.from(csvContent, "utf-8");
              await interaction.reply({
                content: `All addresses have been exported as a CSV file.`,
                files: [{ name: "all_addresses.csv", attachment: buffer }],
                flags: MessageFlags.Ephemeral,
              });
            } else {
              const payoutId = getId();
              // safeGenerations[safeId] = {
              //   id: safeId,
              //   chainId,
              //   safeAddress,
              //   tokenAddress,
              //   decimals,
              //   tokenName: name,
              //   tokenSymbol: symbol,
              //   donateAmount,
              // };
              // const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
              //   new ButtonBuilder()
              //     .setCustomId(`safePayoutModal_${safeId}`)
              //     .setLabel("Paste CSV Data")
              //     .setStyle(ButtonStyle.Primary),
              // );
              const payout = {
                id:payoutId,
                list:finalList,
              }
              payouts[payoutId] = payout;
              const payoutButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`create_payout_${payoutId}`)
                  .setLabel("Create Payout")
                  .setStyle(ButtonStyle.Primary),
              );
              await interaction.reply({
                content: formattedResponse.slice(0,1999),
                components: [payoutButton],
                flags: MessageFlags.Ephemeral,
              });
            }
          }
        } else if (commandName === "admin_seed_addresses") {
          if (interaction.isChatInputCommand()) {
            if (
              !interaction.memberPermissions?.has(
                PermissionsBitField.Flags.Administrator,
              )
            ) {
              await interaction.reply({
                content: "You do not have permission to use this command.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const guildId = interaction.guildId!;
            for (const { userId, chainId, address } of fakeEthAddresses) {
              await userModel.setAddress(userId, guildId, chainId, address);
            }

            await interaction.reply({
              content: "Fake Ethereum addresses have been seeded successfully.",
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "admin_safe_payout") {
          // Updated command logic
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator,
            )
          ) {
            await interaction.reply({
              content: "You do not have permission to use this command.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (interaction.isChatInputCommand()) {
            const tokenAddressInput = interaction.options.getString(
              "token_address",
              true,
            );
            const safeAddressInput = interaction.options.getString(
              "safe_address",
              true,
            );
            const donateAmount =
              interaction.options.getNumber("donate_amount") ?? 0;
            const [networkPrefix, safeAddress] = safeAddressInput.split(":");
            const chain = Chains.find(
              (chain) =>
                chain.shortName.toLowerCase() === networkPrefix.toLowerCase(),
            );
            if (!chain) {
              await interaction.reply({
                content: `Please use the full safe address which includes a chain specific prefix, like "eth:0x123...", valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            let tokenAddress = tokenAddressInput;
            if (tokenAddressInput.includes(":")) {
              const [tokenNetworkPrefix, maybeTokenAddress] =
                tokenAddressInput.split(":");
              const chain = Chains.find(
                (chain) =>
                  chain.shortName.toLowerCase() === networkPrefix.toLowerCase(),
              );
              if (!chain) {
                await interaction.reply({
                  content: `Please use the full safe address which includes a chain specific prefix, like "eth:0x123...", valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }
              assert(
                tokenNetworkPrefix === networkPrefix,
                "Token network must match the safe network",
              );
              tokenAddress = maybeTokenAddress;
            }
            const chainId = chain.chainId;
            const networkName = chain.name;
            const viemChain = getViemChain(chainId);

            assert(viemChain, `Chain ${chainId} not found`);
            const erc20 = viem.getContract({
              address: viem.getAddress(tokenAddress),
              abi: ERC20_ABI,
              client: viem.createPublicClient({
                chain: viemChain,
                transport: viem.http(),
              }),
            });
            const [name, symbol, decimals] = await Promise.all([
              erc20.read.name(),
              erc20.read.symbol(),
              erc20.read.decimals(),
            ]);
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
              `\`discordid OR unique name OR display name,amount\` (one per line)`,
              ``,
              `After submitting, you will receive a file to download.`,
            ].join("\n");

            const safeId = getId();
            safeGenerations[safeId] = {
              id: safeId,
              chainId,
              safeAddress,
              tokenAddress,
              decimals,
              tokenName: name,
              tokenSymbol: symbol,
              donateAmount,
            };
            const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`safePayoutModal_${safeId}`)
                .setLabel("Paste CSV Data")
                .setStyle(ButtonStyle.Primary),
            );

            await interaction.reply({
              content: instructions,
              components: [button],
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "admin_csv_airdrop_payout") {
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator,
            )
          ) {
            await interaction.reply({
              content: "You do not have permission to use this command.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          if (!interaction.isChatInputCommand()) return;

          const chainId = interaction.options.getInteger("network", true);
          const chain = ChainsById[chainId];
          assert(chain, "Network not found");
          const donateAmount =
            interaction.options.getNumber("donate_amount") ?? 0;
          const token = interaction.options.getString("token_address", true);
          const tokenAddressInput = interaction.options.getString(
            "token_address",
            true,
          );
          let tokenAddress = tokenAddressInput;
          if (tokenAddressInput.includes(":")) {
            const [tokenNetworkPrefix, maybeTokenAddress] =
              tokenAddressInput.split(":");
            const chain = Chains.find(
              (chain) =>
                chain.shortName.toLowerCase() ===
                tokenNetworkPrefix.toLowerCase(),
            );
            if (!chain) {
              await interaction.reply({
                content: `Please use the full safe address which includes a chain specific prefix, like "eth:0x123...", valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            assert(
              tokenNetworkPrefix === chain.shortName,
              "Token network must match the safe network",
            );
            tokenAddress = maybeTokenAddress;
          }

          const instructions = [
            `**CSV Airdrop (Safe plugin) Preparation**`,
            `Network: \`${chain.name}\``,
            ``,
            `Please click the button below to paste your CSV data.`,
            `The CSV should be in the format:`,
            `\`discordid OR unique name OR display name,amount\` (one per line)`,
            ``,
            `After submitting, you will receive a CSV file to download.`,
          ].join("\n");

          const viemChain = getViemChain(chainId);

          assert(viemChain, `Chain ${chainId} not found`);
          const erc20 = viem.getContract({
            address: viem.getAddress(tokenAddress),
            abi: ERC20_ABI,
            client: viem.createPublicClient({
              chain: viemChain,
              transport: viem.http(),
            }),
          });
          const [name, symbol, decimals] = await Promise.all([
            erc20.read.name(),
            erc20.read.symbol(),
            erc20.read.decimals(),
          ]);
          const id = getId();
          const payout = {
            id,
            chainId,
            donateAmount,
            tokenAddress,
            decimals,
            tokenName: name,
            tokenSymbol: symbol,
            type: "erc20",
          };
          csvAirdropPayouts[id] = payout;
          const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`csvAirdropPayoutModal_${id}`)
              .setLabel("Paste CSV Data")
              .setStyle(ButtonStyle.Primary),
          );
          await interaction.reply({
            content: instructions,
            components: [button],
            flags: MessageFlags.Ephemeral,
          });
        } else if (commandName === "admin_disperse_payout") {
          // New command logic for disperse payout
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator,
            )
          ) {
            await interaction.reply({
              content: "You do not have permission to use this command.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (interaction.isChatInputCommand()) {
            const chainId = interaction.options.getInteger("network", true);
            const networkName = ChainsById[chainId]?.name || "Unknown Network";
            const donateAmount =
              interaction.options.getNumber("donate_amount") ?? 0;

            const instructions = [
              `**Disperse Payout Preparation**`,
              `Network: \`${networkName}\``,
              ``,
              `Please click the button below to paste your CSV data.`,
              `The CSV should be in the format:`,
              `\`discordid OR unique name OR display name,amount\` (one per line)`,
              ``,
              `After submitting, you will receive a CSV file to download.`,
            ].join("\n");

            const disperseId = getId();
            const dispersePayout = {
              id: disperseId,
              chainId,
              donateAmount,
            };
            dispersePayouts[disperseId] = dispersePayout;
            const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`dispersePayoutModal_${disperseId}`)
                .setLabel("Paste CSV Data")
                .setStyle(ButtonStyle.Primary),
            );

            await interaction.reply({
              content: instructions,
              components: [button],
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "admin_set_safe_address") {
          // Updated command logic
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator,
            )
          ) {
            await interaction.reply({
              content: "You do not have permission to use this command.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          if (interaction.isChatInputCommand()) {
            const safeAddressInput = interaction.options.getString(
              "safe_address",
              true,
            );
            const [networkPrefix, address] = safeAddressInput.split(":");
            const chain = Chains.find(
              (chain) =>
                chain.shortName.toLowerCase() === networkPrefix.toLowerCase(),
            );
            if (!chain) {
              await interaction.reply({
                content: `Please use the full safe address which includes a chain specific prefix, like "eth:0x123...", valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            const guildId = interaction.guildId!;
            await safeModel.setAddress(
              guildId,
              guildId,
              chain.chainId,
              address,
            );
            await interaction.reply({
              content: `Safe address stored for ${chain.name} (${chain.chainId}): ${address}`,
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "admin_remove_safe_address") {
          // New command logic for removing a safe address
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator,
            )
          ) {
            await interaction.reply({
              content: "You do not have permission to use this command.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          if (interaction.isChatInputCommand()) {
            const safeAddressInput = interaction.options.getString(
              "safe_address",
              true,
            );
            const [networkPrefix, address] = safeAddressInput.split(":");
            const chain = Chains.find(
              (chain) =>
                chain.shortName.toLowerCase() === networkPrefix.toLowerCase(),
            );
            if (!chain) {
              await interaction.reply({
                content: `Please use the full safe address which includes a chain specific prefix, like "eth:0x123...", valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            const guildId = interaction.guildId!;
            await safeModel.deleteAddress(guildId, guildId, chain.chainId); // Assuming delete method exists
            await interaction.reply({
              content: `Safe address removed for ${chain.name} (${chain.chainId}): ${address}`,
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "admin_set_token") {
          // New command logic for adding a token
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator,
            )
          ) {
            await interaction.reply({
              content: "You do not have permission to use this command.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          if (interaction.isChatInputCommand()) {
            const network = interaction.options.getInteger("network", true);
            const foundChain = Chains.find(
              (chain) => chain.chainId === network,
            );
            assert(foundChain, "Chain not found");
            const tokenAddress = interaction.options.getString(
              "token_address",
              true,
            );
            const guildId = interaction.guildId!;
            const viemChain = getViemChain(foundChain.chainId);
            assert(viemChain, `Chain ${foundChain.chainId} not found`);

            const erc20 = viem.getContract({
              address: viem.getAddress(tokenAddress),
              abi: ERC20_ABI,
              client: viem.createPublicClient({
                chain: viemChain,
                transport: viem.http(),
              }),
            });
            const [name, symbol, decimals] = await Promise.all([
              erc20.read.name(),
              erc20.read.symbol(),
              erc20.read.decimals(),
            ]);
            const tokenInfo = {
              guildId,
              chainId: foundChain.chainId,
              name,
              symbol,
              decimals,
              address: tokenAddress,
            };
            await tokenModel.setToken(tokenInfo);
            await interaction.reply({
              embeds: [
                {
                  title: `✅ Token Added for ${foundChain.name}`,
                  color: 0x2ecc71,
                  description: `**Token Address:**\n\`${tokenAddress}\``,
                  fields: [
                    {
                      name: "Chain",
                      value: `${foundChain.name} (${foundChain.chainId})`,
                      inline: true,
                    },
                    {
                      name: "Name",
                      value: `${name}`,
                      inline: true,
                    },
                    {
                      name: "Symbol",
                      value: `${symbol}`,
                      inline: true,
                    },
                    {
                      name: "Decimals",
                      value: `${decimals}`,
                      inline: true,
                    },
                  ],
                  footer: {
                    text: "Token information saved successfully.",
                  },
                },
              ],
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "admin_remove_token") {
          // New command logic for removing a token
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator,
            )
          ) {
            await interaction.reply({
              content: "You do not have permission to use this command.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          if (interaction.isChatInputCommand()) {
            const tokenAddressInput = interaction.options.getString(
              "token_address",
              true,
            );
            const [networkPrefix, tokenAddress] = tokenAddressInput.split(":");
            const chain = Chains.find(
              (chain) =>
                chain.shortName.toLowerCase() === networkPrefix.toLowerCase(),
            );
            if (!chain) {
              await interaction.reply({
                content: `Please use the full safe address which includes a chain specific prefix, like "eth:0x123...", valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            const guildId = interaction.guildId!;
            const token = await tokenModel.getToken(
              guildId,
              chain.chainId,
              tokenAddress,
            );
            if (!token) {
              await interaction.reply({
                content: `Token not found on chain ${chain.name} with address ${tokenAddress}`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            await tokenModel.deleteToken(guildId, chain.chainId, tokenAddress); // Assuming delete method exists
            await interaction.reply({
              content: `Token address removed for ${chain.name} (${chain.chainId}): ${token.name}(${token.symbol})`,
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (commandName === "admin_search_address") {
          if (interaction.isChatInputCommand()) {
            const guild = interaction.guild;
            const guildId = interaction.guildId;
            assert(guildId, "Guild not found");
            assert(guild, "Guild not found");
            const address = interaction.options.getString("address", true);
            const usersWithAddress = await safeModel.getUsersByAddress(
              guildId,
              address,
            );

            if (usersWithAddress.length === 0) {
              await interaction.reply({
                content: `No users found for address: ${address}`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const userAddresses = await Promise.all(
              usersWithAddress.map(async ({ userId, chainId, address }) => {
                try {
                  const chain = ChainsById[chainId];
                  const user = await guild.members.fetch(userId);
                  return { user, chain }; // Return an object with user and chain
                } catch (error) {
                  console.error(
                    `Error fetching user data for userId ${userId}:`,
                    error,
                  );
                  return null; // Return null for filtering out errors
                }
              }),
            ).then((results) => results.filter((result) => result !== null));

            const groupedUserAddresses: Record<
              string,
              { user: GuildMember; chain: ChainSummary }[]
            > = _.groupBy(userAddresses, "user.id");
            const userCards: string = renderUsers(
              Object.entries(groupedUserAddresses).map(
                ([userId, addresses]: [
                  string,
                  { user: GuildMember; chain: ChainSummary }[],
                ]) => {
                  const user: GuildMember = addresses[0].user; // Get the user from the first address
                  const chainAddresses: {
                    chain: ChainSummary;
                    address: string;
                  }[] = addresses.map(({ chain }) => ({ chain, address }));
                  return [user, chainAddresses];
                },
              ),
            );

            await interaction.reply({
              content: `**Users found for address ${address}:**\n\n${userCards}`,
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      } catch (error) {
        console.error("Error handling command:", error);
        if (error instanceof Error) {
          await interaction.reply({
            content: error.message,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "An unknown error occurred.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    } else if (interaction.isAutocomplete()) {
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === "address") {
        const userId = interaction.user.id;
        const guildId = interaction.guildId!;
        const userAddresses = await userModel.getUser(userId, guildId);

        // Check if a network option is set
        const networkOption = interaction.options.get("network");
        let filteredAddresses = userAddresses;

        if (networkOption?.value) {
          const selectedNetwork = Number(networkOption.value);
          filteredAddresses = userAddresses.filter(
            ({ chainId }) => chainId === selectedNetwork,
          );
        }

        const userInput = interaction.options.getString("address", false) || "";
        let maybeAddress: string | undefined;
        if (userInput) {
          maybeAddress = userInput.split(":")[1] ?? userInput;
        }

        if (maybeAddress) {
          // Filter addresses based on user input, assuming input is the start of the address
          filteredAddresses = filteredAddresses.filter(({ address }) =>
            address.toLowerCase().startsWith(maybeAddress.toLowerCase()),
          );
        }
        console.log({ maybeAddress, filteredAddresses, userInput });

        const choices = filteredAddresses.map(({ chainId, address }) => {
          const chain = ChainsById[chainId];
          const chainName = chain ? chain.name : "Unknown Chain";
          return {
            name: `${chainName} (${chainId}): ${address}`,
            value: `${chainId}:${address}`,
          };
        });

        try {
          await interaction.respond(choices);
        } catch (err) {
          console.error(err, "Error autocomplete address");
        }
      } else if (focusedOption.name === "safe_address") {
        const guildId = interaction.guildId!;
        let safeAddresses = await safeModel.getUser(guildId, guildId);

        const userInput =
          interaction.options.getString("safe_address", false) || "";
        const [inputNetwork, inputAddress] = userInput.split(":");
        safeAddresses = safeAddresses.filter(({ chainId, address }) => {
          const chain = ChainsById[chainId];
          const chainName = chain ? chain.name.toLowerCase() : "";

          const matchesNetwork = inputNetwork
            ? chainName.startsWith(inputNetwork.toLowerCase())
            : true;

          const matchesAddress = inputAddress
            ? address.toLowerCase().startsWith(inputAddress.toLowerCase())
            : true;

          return matchesNetwork && matchesAddress;
        });

        const choices = safeAddresses.map(({ chainId, address }) => {
          const chain = ChainsById[chainId];
          const chainName = chain ? chain.name : "Unknown Chain";
          return {
            name: `${chainName}:${address}`,
            value: `${chain.shortName}:${address}`,
          };
        });

        try {
          await interaction.respond(choices);
        } catch (err) {
          console.error(err, "Error autocomplete safe address");
        }
      } else if (focusedOption.name === "token_address") {
        const handled = await handleTokenAutocomplete(interaction, { tokenModel });
        if (handled) return;
      }
    } else if (interaction.isModalSubmit()) {
      try {
        if (await handleTokensModalSubmit(interaction, { tokenModel })) {
          return;
        }
        if (await handleSafesModalSubmit(interaction, { safeModel })) {
          return;
        }
        if (
          await handlePayoutsModalSubmit(interaction, {
            client,
            userModel,
            tokenModel,
            safeModel,
            stores: { payouts, safeGenerations, dispersePayouts, csvAirdropPayouts },
          })
        ) {
          return;
        }
        // --- BEGIN generic payout modal handling ---
        if (interaction.customId === "userInputModal") {
          const userInput = interaction.fields.getTextInputValue("userInput");
          await interaction.reply(`You entered: ${userInput}`);
        } else if (interaction.customId.startsWith("addAddress_")) {
          const network = parseInt(interaction.customId.split("_")[1], 10);
          const address = interaction.fields.getTextInputValue("addressInput");
          const userId = interaction.user.id;
          const guildId = interaction.guildId!;

          await userModel.setAddress(userId, guildId, network, address);
          const chain = ChainsById[network];
          const chainName = chain ? chain.name : "Unknown Chain";
          await interaction.reply({
            content: `Address set for ${chainName} (${network}): ${address}`,
            flags: MessageFlags.Ephemeral,
          });
        } else if (interaction.customId.startsWith("payoutModal_")) {
          // await interaction.deferReply({ ephemeral: true });
          const [_, payoutId] = interaction.customId.split("_");
          const payout = payouts[payoutId];
          if (!payout) {
            await interaction.reply({
              content: `Unable to find payout list, try searching again`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const csvData = interaction.fields.getTextInputValue("csvInput");
          assert(csvData,'Payout amounts not found')
          payout.csvData = csvData

          const row =
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`payoutChain_${payoutId}`)
                .setPlaceholder("Choose a network")
                .addOptions(
                  Object.values(Chains).map((chain) => ({
                    label: `${chain.name} (${chain.chainId})`,
                    value: `${chain.chainId}`,
                    description: chain.shortName
                      ? `${chain.shortName}`
                      : undefined,
                  }))
                )
            );
          await interaction.reply({
            content: "Select chain for payout",
            components: [row],
            flags: MessageFlags.Ephemeral,
          });

          return;
        } else if (interaction.customId.startsWith("safePayoutModal_")) {
          await interaction.deferReply({ ephemeral: true });
          // Modal submit for admin_safe_payout
          const [_, safeId] = interaction.customId.split("_");
          const safeData = safeGenerations[safeId];
          if (!safeData) {
            await interaction.reply({
              content: "Safe data not found",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          assert(safeData.safeAddress, 'Safe address not found');
          assert(safeData.tokenAddress, 'Token address not found');
          assert(typeof safeData.decimals !== 'undefined', 'Decimals not found');
          const csvData = interaction.fields.getTextInputValue("csvInput");
          // Parse CSV lines into [id, amount] pairs
          const lines = csvData
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith("#"));

          const errors: string[] = [];
          const userIdToAmount: Record<string, string> = {};
          const idToInput: Record<string, string> = {};
          const userIdToUser: Record<string, User> = {};

          // 1. Resolve Discord users
          for (let i = 0; i < lines.length; i++) {
            const [idRaw, amountRaw] = lines[i]
              .split(/[\t,= ]/)
              .map((s) => s.trim());

            if (!idRaw || !amountRaw) {
              errors.push(`Line ${i + 1}: Invalid format (expected id,amount)`);
              continue;
            }
            idToInput[idRaw] = lines[i];
            try {
              const user = await resolveDiscordUser(
                client,
                idRaw,
                interaction.guildId!
              );
              if (!user) {
                errors.push(`Line ${i + 1}: Could not resolve user "${idRaw}"`);
                continue;
              }
              userIdToAmount[user.id] = amountRaw;
              userIdToUser[user.id] = user;
            } catch (e) {
              errors.push(`Line ${i + 1}: Error resolving user "${idRaw}"`);
              continue;
            }
          }

          // 2. Lookup addresses for resolved users
          const addressEntries: [string, string][] = [];
          for (const userId in userIdToAmount) {
            try {
              // safeData should contain: { chainId, safeAddress, erc20Address, decimals }
              const address = await userModel.getAddress(
                userId,
                interaction.guildId!,
                safeData.chainId
              );
              if (!address) {
                const user = userIdToUser[userId];
                const userInfo = user
                  ? `${user.username}#${user.discriminator} (${user.id})`
                  : `User ID: ${userId}`;
                errors.push(
                  `${userInfo}: No address found for chain ${safeData.chainId}`
                );
                continue;
              }
              addressEntries.push([address, userIdToAmount[userId]]);
            } catch (e) {
              const user = userIdToUser[userId];
              const userInfo = user
                ? `${user.username}#${user.discriminator} (${user.id})`
                : `User ID: ${userId}`;
              errors.push(`${userInfo}: Error looking up address`);
              continue;
            }
          }
          if (
            process.env.DONATE_ADDRESS &&
            viem.isAddress(process.env.DONATE_ADDRESS) &&
            safeData.donateAmount &&
            safeData.donateAmount > 0
          ) {
            addressEntries.push([
              process.env.DONATE_ADDRESS,
              safeData.donateAmount.toString(),
            ]);
          }

          // 3. Generate Safe transaction batch
          const batchResult = generateSafeTransactionBatch({
            entries: addressEntries,
            chainId: safeData.chainId,
            safeAddress: safeData.safeAddress,
            erc20Address: safeData.tokenAddress,
            decimals: safeData.decimals,
            description: `Generated for safe ${safeData.safeAddress}`,
          });

          // 4. Combine errors from batchResult
          const allErrors = [...errors, ...(batchResult.errors || [])];

          // 5. Reply to user with results
          const batchJson = JSON.stringify(batchResult.batch, null, 2);
          const now = new Date();
          const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
          const files = [
            {
              name: `safe_batch_${dateStr}.json`,
              attachment: Buffer.from(batchJson, "utf-8"),
            },
          ];
          const chainName =
            ChainsById[safeData.chainId]?.name ?? "Unknown Chain";
          const tokenName = safeData.tokenName ?? "Unknown Token";
          const tokenSymbol = safeData.tokenSymbol ?? "Unknown Token Symbol";
          let content = `✅ SAFE JSON file generated for ${addressEntries.length} entries on ${chainName} using ${tokenName} (${tokenSymbol}).`;
          if (safeData.donateAmount > 0)
            content += `\nYou are donating ${safeData.donateAmount.toFixed(4)} ${tokenSymbol}, thank you! ❤️`;
          content += `\n💸 ___Total amount to transfer___: **${batchResult.totalAmountFormatted} ${tokenSymbol}**`;
          if (allErrors.length > 0) {
            content += `\n\n⚠️ Some issues were found:\n\`\`\`\n${allErrors.join("\n")}\n\`\`\``;
          }
          await interaction.editReply({
            content,
            files,
          });
        } else if (interaction.customId.startsWith("csvAirdropPayoutModal_")) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const [_, payoutId] = interaction.customId.split("_");
          const payoutData = csvAirdropPayouts[payoutId];
          assert(payoutData, "Unable to find original request, try again");
          const { chainId, donateAmount } = payoutData;
          const csvData = interaction.fields.getTextInputValue("csvInput");
          const guildId = interaction.guildId;
          assert(guildId, "Guild not found");
          await interaction.editReply({
            content:"Not supported yet...",
          });
          return;

        } else if (interaction.customId.startsWith("dispersePayoutModal_")) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          // Modal submit for admin_disperse_payout
          const [_, disperseId] = interaction.customId.split("_");
          const payoutData = dispersePayouts[disperseId];
          assert(payoutData, "Unable to find original request, try again");
          const { chainId, donateAmount } = payoutData;
          const csvData = interaction.fields.getTextInputValue("csvInput");
          const guildId = interaction.guildId;
          assert(guildId, "Guild not found");
          const {addressEntries, errors} = await parseRecipientsCsvAndResolveAddresses({client,csvData,guildId,userModel,chainId})
          const {file,description} = dispersePayout({addressEntries,chainId,donateAmount,donateAddress:process.env.DONATE_ADDRESS, errors})
          await interaction.editReply({
            content:description,
            files:[file],
          });
          return;
        }
      } catch (error) {
        console.error("Error handling modal submit:", error);
        if (error instanceof Error) {
          if (interaction.deferred) {
            await interaction.editReply({
              content: error.message,
            });
          } else {
            await interaction.reply({
              content: error.message,
              flags: MessageFlags.Ephemeral ,
            });
          }
        } else {
          if (interaction.deferred) {
            await interaction.editReply({
              content: "An unknown error occurred.",
            });
          } else {
            await interaction.reply({
              content: "An unknown error occurred.",
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      }
    } else if (interaction.isButton()) {
      if (await handleTokensButton(interaction, { tokenModel })) {
        return;
      }
      if (await handleSafesButton(interaction, { safeModel })) {
        return;
      }
      if (
        await handlePayoutsButton(interaction, {
          client,
          userModel,
          tokenModel,
          safeModel,
          stores: { payouts, safeGenerations, dispersePayouts, csvAirdropPayouts },
        })
      ) {
        return;
      }
      if(interaction.customId.startsWith("manageSafe")){
        // handle cancel logic
        if(interaction.customId.startsWith("manageSafe_cancel")){
          const guildId = interaction.guildId;
          assert(guildId,"Guild not found")
          const allSafes = await safeModel.getAllAddresses(guildId);
          const reply = getAdminManageSafesDisplay({allSafes})
          await interaction.update({
            ...reply,
          });
          return;
        }
        if (interaction.customId.startsWith("manageSafe_confirmRemove_")) {
          const guildId = interaction.guildId!;
          assert(guildId, "Guild not found");

          // Extract chainId and address from the customId: "manageSafe_confirmRemove_<chainId>_<address>"
          const matches = /^manageSafe_confirmRemove_(\d+)_(.+)$/.exec(interaction.customId);
          assert(matches && matches[1] && matches[2], "No Safe selected to remove.");
          const chainId = Number(matches[1]);
          const address = matches[2];
          assert(chainId, "Invalid Safe selection: missing chainId.");
          assert(address, "Invalid Safe selection: missing address.");

          // Remove the safe from storage
          await safeModel.deleteAddress(guildId, guildId, chainId);

          // Fetch updated safes list
          const allSafes = await safeModel.getAllAddresses(guildId);
          const reply = getAdminManageSafesDisplay({ allSafes });
          reply.content = `🗑️ Safe removed: ${address} (${ChainsById[chainId]?.name ?? chainId})\n\n` + reply.content;

          await interaction.update({
            ...reply,
          });
          return;
        }
        if (interaction.customId.startsWith("manageSafe_remove")) {
          const guildId = interaction.guildId!;
          assert(guildId, "Guild not found");
          const allSafes = await safeModel.getAllAddresses(guildId);

          if (Object.keys(allSafes).length === 0) {
            await interaction.update({
              content: "There are no Safe addresses to remove.",
              components: [],
            });
            return;
          }

          // Create select menu options from allSafes (chainId => address)
          const safeOptions = allSafes.map(({address,chainId}) => {
            const chain = ChainsById[chainId];
            return {
              label: `${chain ? chain.name : chainId}: ${address}`,
              description: `Remove Safe for ${chain ? chain.name : chainId}`,
              value: `${chainId}:${address}`,
            };
          });

          const selectMenu = new ActionRowBuilder<any>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("manageSafe_removeSelect")
              .setPlaceholder("Select a Safe to remove")
              .addOptions(safeOptions)
          );

          // Cancel button to return to main management component
          const cancelButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("manageSafe_cancel")
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Secondary)
          );

          await interaction.update({
            content: "Select the Safe address to remove:",
            components: [selectMenu, cancelButtonRow],
          });
          return;
        }
        if(interaction.customId.startsWith("manageSafe_add")){
          const modal = new ModalBuilder()
            .setCustomId(`manageSafe_addressModal`)
            .setTitle(`Set Safe address`)
            const addressInput = new TextInputBuilder()
              .setCustomId("safeAddress")
              .setPlaceholder("base:0x...")
              .setLabel(`Add Safe Address`)
              .setStyle(TextInputStyle.Short)
              .setRequired(true);
            modal.addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput)
            );

          let message = "Select a chain to add Safe on"
          if(interaction.customId.startsWith("manageSafe_edit")) message = "Select a chain to edit exisiting Safe"
          if(interaction.customId.startsWith("manageSafe_remove")) message = "Select a chain to remove existing Safe"
          await interaction.showModal(modal)
        }
      }else if(interaction.customId.startsWith("safePayoutGenerate_")){
        await interaction.deferReply({ephemeral:true})
        const [_, payoutId] = interaction.customId.split("_");
        const payout = payouts[payoutId];
        if (!payout) {
          await interaction.editReply({
            content: `Unable to find payout list, try searching again`,
          });
          return;
        }
        assert(payout.chainId,'Unable to find payout chain')
        assert(payout.safeAddress,'Unable to find safe address')
        assert(payout.tokenAddress,'Unable to find token address')
        assert(payout.decimals,'Unable to find token decimals')
        assert(payout.csvData,'Unable to payout CSV list')
        // Fetch guildId - fallback to interaction.guildId if available
        const guildId = interaction.guildId;
        assert(guildId,"Guild not found")
        const token = await tokenModel.getToken(guildId,payout.chainId,payout.tokenAddress)
        assert(token,'Unable to find token')

        const {addressEntries,errors} = await parseRecipientsCsvAndResolveAddresses({client,csvData:payout.csvData,guildId,userModel,chainId:payout.chainId})
        // 3. Generate Safe transaction batch
        const batchResult = generateSafeTransactionBatch({
          entries: addressEntries,
          chainId: payout.chainId,
          safeAddress: payout.safeAddress,
          erc20Address: payout.tokenAddress,
          decimals: payout.decimals,
          description: `Generated for safe ${payout.safeAddress}`,
        });

        // 4. Combine errors from batchResult
        const allErrors = [...errors, ...(batchResult.errors || [])];

        // 5. Reply to user with results
        const batchJson = JSON.stringify(batchResult.batch, null, 2);
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const files = [
          {
            name: `safe_batch_${dateStr}.json`,
            attachment: Buffer.from(batchJson, "utf-8"),
          },
        ];
        const chainName =
          ChainsById[payout.chainId]?.name ?? "Unknown Chain";
        const tokenName = token.name ?? "Unknown Token";
        const tokenSymbol = token.symbol ?? "Unknown Token Symbol";
        let content = `✅ SAFE JSON file generated for ${addressEntries.length} entries on ${chainName} using ${tokenName} (${tokenSymbol}).`;
        // if (safeData.donateAmount > 0)
        //   content += `\nYou are donating ${safeData.donateAmount.toFixed(4)} ${tokenSymbol}, thank you! ❤️`;
        content += `\n💸 ___Total amount to transfer___: **${batchResult.totalAmountFormatted} ${tokenSymbol}**`;
        if (allErrors.length > 0) {
          content += `\n\n⚠️ Some issues were found:\n\`\`\`\n${allErrors.join("\n")}\n\`\`\``;
        }
        await interaction.editReply({
          content,
          files,
        });
      }
      if(interaction.customId.startsWith("setSafeButton_")){
        const [_, payoutId] = interaction.customId.split("_");
        const payout = payouts[payoutId];
        if (!payout) {
          await interaction.reply({
            content: `Unable to find payout list, try searching again`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        assert(payout.chainId,'Unable to find payout chain')
        // Fetch guildId - fallback to interaction.guildId if available
        const guildId = interaction.guildId;
        assert(guildId,"Guild not found")
        const allSafes = await safeModel.getAllAddresses(guildId);
        const safesByChain = allSafes.filter(safe=>safe.chainId === payout.chainId)
        // Compose dropdown choices (token select options)
        const safeOptions = safesByChain.map(({ address, chainId }) => ({
          label: `${address} (${chainId})`,
          value: address,
        }));

        const overrideSafeMessage = `Replace exising Safe address on network`
        const addSafeMessage = `Add new Safe address on network`
        // Prepend an 'Add New Token' option
        safeOptions.unshift({
          label: `➕ ${safeOptions.length > 0 ? overrideSafeMessage : addSafeMessage}`,
          value: `ADD_SAFE`,
        });

        // Build the select menu for token selection
        const safeSelectionRow =
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`payoutSafeSelect_${payoutId}`)
              .setPlaceholder(`${safeOptions.length > 1 ? "Select Safe or change it" : "Add new Safe address"}`)
              .addOptions(safeOptions)
          );
        
        // await interaction.deferUpdate();
        const result = await interaction.update({
          content: `Select a Safe to use for payout, or add a new safe on ${ChainsById[payout.chainId]?.name ?? payout.chainId}:`, 
          components: [safeSelectionRow],
        });
        if(result.interaction.type === 3){
          payout.messageId = result.interaction.message.id
          payout.channelId = interaction.channelId
        }
        console.log('interaction edit reply',result)
      }
      if (interaction.customId.startsWith("safePayoutButton_")) {
        const [_, payoutId] = interaction.customId.split("_");
        const payout = payouts[payoutId];
        if (!payout) {
          await interaction.reply({
            content: `Unable to find payout list, try searching again`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const csvData = payout.csvData
        assert(csvData,'Token amounts not found')
        const guildId = interaction.guildId
        assert(guildId,"Guild not found")
        const chainId = payout.chainId
        assert(chainId, "ChainId not found")
        await interaction.update(renderSafePayoutSetupRow(payout));
      }else if(interaction.customId.startsWith("setTokenButton_")){
        const [_, payoutId] = interaction.customId.split("_");
        const payout = payouts[payoutId];
        if (!payout) {
          await interaction.reply({
            content: `Unable to find payout list, try searching again`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        assert(payout.chainId,'Unable to find payout chain')

        // Fetch guildId - fallback to interaction.guildId if available
        const guildId = interaction.guildId;
        assert(guildId,"Guild not found")

        // Get saved tokens for this guild
        const savedTokens: { address: string; symbol: string; chainId: number }[] = await tokenModel.getTokensByGuild(guildId);
        // Filter tokens by selected chain
        const selectedChainId = payout.chainId
        const filteredTokens = savedTokens.filter((t) => t.chainId === selectedChainId);

        // Compose dropdown choices (token select options)
        const tokenOptions = filteredTokens.map(({ address, symbol }) => ({
          label: symbol ? `${symbol}: ${address}` : address,
          value: address,
        }));

        // Prepend an 'Add New Token' option
        tokenOptions.unshift({
          label: "➕ Add a new token (not listed)",
          value: `ADD_TOKEN`,
        });

        // Build the select menu for token selection
        const tokenSelectRow =
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`payoutTokenSelect_${payoutId}`)
              .setPlaceholder("Choose an existing token, or add a new one")
              .addOptions(tokenOptions)
          );
        
        await interaction.update({
          content: `Select a token to use for payout, or add a new token on ${ChainsById[selectedChainId]?.name ?? selectedChainId}:`,
          components: [tokenSelectRow],
        });
      }else if (interaction.customId.startsWith("dispersePayoutButton_")) {
        const [_, payoutId] = interaction.customId.split("_");
        const payout = payouts[payoutId];
        if (!payout) {
          await interaction.reply({
            content: `Unable to find payout list, try searching again`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const csvData = payout.csvData
        assert(csvData,'Token amounts not found')
        const guildId = interaction.guildId
        assert(guildId,"Guild not found")
        const chainId = payout.chainId
        assert(chainId, "ChainId not found")
        const {addressEntries, errors} = await parseRecipientsCsvAndResolveAddresses({client,csvData,guildId,userModel,chainId})
        const {file,description} = dispersePayout({addressEntries,chainId,donateAmount:0,donateAddress:process.env.DONATE_ADDRESS, errors})
        await interaction.reply({
          content:description,
          files:[file],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }else if (interaction.customId.startsWith("create_payout_")) {
        const payoutId = interaction.customId.split("_")[2];
        const payout = payouts[payoutId]
        if (!payout) {
          await interaction.reply({
            content: `Unable to find payout list, try searching again`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId(`payoutModal_${payoutId}`)
          .setTitle("Edit payout amounts for users");


        const preset = renderPayoutPrefill(payout.list) 
        const input = new TextInputBuilder()
          .setCustomId(`csvInput`)
          .setLabel("Set token amounts for each user")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(preset)
          .setRequired(true);

        const actionRow =
          new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        return
      }
      if (interaction.customId.startsWith("addAddress_")) {
        const network = parseInt(interaction.customId.split("_")[1], 10);
        const chain = ChainsById[network];
        const chainName = chain ? chain.name : "Unknown Chain";
        const userId = interaction.user.id;
        const guildId = interaction.guildId!;
        // Check if the user already has an address set for this network
        const existingAddress = await userModel.getAddress(
          userId,
          guildId,
          network,
        );
        if (existingAddress) {
          await interaction.reply({
            content: `You already have an address set for this network: ${existingAddress}`,
            flags: MessageFlags.Ephemeral,
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
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const guildId = guild.id;
        const allDiscordUsers = await guild.members.fetch();
        const allAddresses = await userModel.getUsersByChain(network, guildId);

        const usersWithAddresses = new Set(
          allAddresses.map((addr) => addr.userId),
        );
        let usersWithoutAddresses = Array.from(allDiscordUsers.values()).filter(
          (user) => !usersWithAddresses.has(user.id) && !user.user.bot,
        );

        if (roleId) {
          await guild.roles.fetch();
          const roleMembers = guild.roles.cache.get(roleId)?.members;
          if (roleMembers && roleMembers.size > 0) {
            const roleMemberIds = new Set(
              roleMembers.map((member) => member.id),
            );
            usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
              roleMemberIds.has(user.id),
            );
          } else {
            usersWithoutAddresses = [];
          }
        }

        if (channelId) {
          const channel = await guild.channels.fetch(channelId);
          assert(
            channel !== null && channel.isTextBased(),
            "Must be a text channel",
          );
          const channelMembers = (channel as TextChannel).members;
          usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
            channelMembers.has(user.id),
          );
        }

        if (usersWithoutAddresses.length === 0) {
          await interaction.reply({
            content: `All users have addresses set for ${ChainsById[network].name} (${network}).`,
            flags: MessageFlags.Ephemeral,
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
              .setStyle(ButtonStyle.Primary),
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
    }
    if (interaction.isStringSelectMenu()){
      if (await handleTokensSelectMenu(interaction, { tokenModel })) {
        return;
      }
      if (await handleSafesSelectMenu(interaction, { safeModel })) {
        return;
      }
      if (
        await handlePayoutsSelectMenu(interaction, {
          client,
          userModel,
          tokenModel,
          safeModel,
          stores: { payouts, safeGenerations, dispersePayouts, csvAirdropPayouts },
        })
      ) {
        return;
      }
    }
  });

  await start(context);

  const api = Api(userModel);
  const apiRpc = RpcFactory(api as any);
  const apiRouter = RouterService(apiRpc);
  // Run the express app
  const app = Service({}, [{ router: apiRouter, path: "/user" }]); // Assuming no routers are passed for now
  const PORT = process.env.PORT || 3008;
  app.listen(PORT, () => {
    console.log(`Express server is running on port ${PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start Discord bot:", error);
  process.exitCode = 1;
});

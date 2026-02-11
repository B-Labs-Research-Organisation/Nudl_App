import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ChannelType,
  GuildMember,
  GuildTextBasedChannel,
  Interaction,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import assert from "assert";

import {
  Chains,
  ChainsById,
  ChainSummary,
  renderUser,
  renderUsers,
} from "../../utils";

export type AddressesFeatureDeps = {
  userModel: {
    setAddress(
      userId: string,
      guildId: string,
      chainId: number,
      address: string,
    ): Promise<void>;
    getAddress(
      userId: string,
      guildId: string,
      chainId: number,
    ): Promise<string | undefined>;
    getUser(
      userId: string,
      guildId: string,
    ): Promise<{ chainId: number; address: string }[]>;
    getUsersByChain(
      chainId: number,
      guildId: string,
    ): Promise<{ userId: string; chainId: number; address: string }[]>;
    deleteAddress(userId: string, guildId: string, chainId: number): Promise<boolean>;
  };
};

export async function handleAddressesCommands(
  interaction: Interaction,
  deps: AddressesFeatureDeps,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;

  const { userModel } = deps;

  const commandName = interaction.commandName;

  if (commandName === "set_address") {
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    const network = interaction.options.getInteger("network", true);
    const addressInput = interaction.options.getString("address", true);

    if (network === 0) {
      // add to all chains
      for (const chain of Chains) {
        await userModel.setAddress(userId, guildId, chain.chainId, addressInput);
      }
      await interaction.reply({
        content: `✅ Address set for all supported networks: ${addressInput}`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await userModel.setAddress(userId, guildId, network, addressInput);
    const chain = ChainsById[network];
    const chainName = chain ? chain.name : "Unknown Chain";

    await interaction.reply({
      content: `✅ Address set for ${chainName} (${network}): ${addressInput}`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (commandName === "remove_address") {
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    const networkAddress = interaction.options.getString("address", true);
    const [chainIdStr, address] = networkAddress.split(":");
    assert(chainIdStr, "Unable to find chain id");

    const chainId = Number(chainIdStr);
    await userModel.deleteAddress(userId, guildId, chainId);

    const chain = ChainsById[chainId];
    const chainName = chain ? chain.name : "Unknown Chain";

    await interaction.reply({
      content: `Address ${address} removed for ${chainName} (${chainId}).`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (commandName === "list_addresses") {
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    const userAddresses = await userModel.getUser(userId, guildId);

    if (userAddresses.length === 0) {
      await interaction.reply({
        content: "No addresses set for any networks.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const member = interaction.member;
    assert(
      member &&
        typeof (member as any).user === "object" &&
        member instanceof GuildMember,
      "Unable to find guild member",
    );

    const addresses = userAddresses
      .map(({ chainId, address }) => {
        const chain = ChainsById[chainId];
        if (!chain) return null;
        return { chain, address };
      })
      .filter(
        (addr): addr is { chain: ChainSummary; address: string } => addr !== null,
      );

    assert(addresses.length > 0, "No addresses found!");

    const formattedResponse = renderUser(member as GuildMember, addresses);

    await interaction.reply({
      content: formattedResponse,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (commandName === "admin_list_missing_addresses") {
    if (
      !interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const network = interaction.options.getInteger("network", true);
    const role = interaction.options.getRole("role", false);
    const channel: GuildTextBasedChannel | null = interaction.options.getChannel(
      "channel",
      false,
      [ChannelType.GuildText],
    );

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "This command can only be used within a guild.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const guildId = guild.id;

    const allDiscordUsers = await guild.members.fetch();
    const allAddresses = await userModel.getUsersByChain(network, guildId);

    const usersWithAddresses = new Set(allAddresses.map((addr) => addr.userId));
    let usersWithoutAddresses = Array.from(allDiscordUsers.values()).filter(
      (user) => !usersWithAddresses.has(user.id) && !user.user.bot,
    );

    if (role) {
      await guild.roles.fetch();
      const roleMembers = guild.roles.cache.get(role.id)?.members;
      if (roleMembers && roleMembers.size > 0) {
        const roleMemberIds = new Set(roleMembers.map((member) => member.id));
        usersWithoutAddresses = usersWithoutAddresses.filter((user) =>
          roleMemberIds.has(user.id),
        );
      } else {
        usersWithoutAddresses = [];
      }
    }

    if (channel) {
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
      return true;
    }

    const mentions = usersWithoutAddresses.map((u) => `<@${u.id}>`).join(" ");
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

    return true;
  }

  return false;
}

export async function handleAddressAutocomplete(
  interaction: Interaction,
  deps: AddressesFeatureDeps,
): Promise<boolean> {
  if (!interaction.isAutocomplete()) return false;

  const focusedOption = interaction.options.getFocused(true);
  if (focusedOption.name !== "address") return false;

  const userId = interaction.user.id;
  const guildId = interaction.guildId!;
  const userAddresses = await deps.userModel.getUser(userId, guildId);

  const networkOption = interaction.options.get("network");
  let filteredAddresses = userAddresses;

  if (networkOption?.value) {
    const selectedNetwork = Number(networkOption.value);
    filteredAddresses = userAddresses.filter(
      ({ chainId }) => chainId === selectedNetwork,
    );
  }

  const userInput = interaction.options.getString("address", false) || "";
  let maybeAddress;
  if (userInput) {
    maybeAddress = userInput.split(":")[1] ?? userInput;
  }

  if (maybeAddress) {
    filteredAddresses = filteredAddresses.filter(({ address }) =>
      address.toLowerCase().startsWith(maybeAddress.toLowerCase()),
    );
  }

  const choices = filteredAddresses.map(({ chainId, address }) => {
    const chain = ChainsById[chainId];
    const chainName = chain ? chain.name : "Unknown Chain";
    return {
      name: `${chainName} (${chainId}): ${address}`,
      value: `${chainId}:${address}`,
    };
  });

  try {
    await (interaction as AutocompleteInteraction).respond(choices);
  } catch (err) {
    console.error(err, "Error autocomplete address");
  }

  return true;
}

export async function handleAddAddressButton(
  interaction: Interaction,
  deps: AddressesFeatureDeps,
): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("addAddress_")) return false;

  const network = parseInt(interaction.customId.split("_")[1], 10);
  const chain = ChainsById[network];
  const chainName = chain ? chain.name : "Unknown Chain";
  const userId = interaction.user.id;
  const guildId = interaction.guildId!;

  const existingAddress = await deps.userModel.getAddress(userId, guildId, network);
  if (existingAddress) {
    await interaction.reply({
      content: `You already have an address set for this network: ${existingAddress}`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const modal = new ModalBuilder()
    .setCustomId(`addAddress_${network}`)
    .setTitle(`Add Address for ${chainName} (${network})`);

  const input = new TextInputBuilder()
    .setCustomId("addressInput")
    .setLabel("Enter your address")
    .setStyle(TextInputStyle.Short);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  modal.addComponents(actionRow);

  await (interaction as ButtonInteraction).showModal(modal);
  return true;
}

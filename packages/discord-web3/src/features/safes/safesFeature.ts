import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Interaction,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import assert from "assert";

import { ChainsById, getAdminManageSafesDisplay, Chains } from "../../utils";

export type SafesFeatureDeps = {
  safeModel: {
    getAllAddresses(guildId: string): Promise<any[]>;
    getAddress(
      userId: string,
      guildId: string,
      chainId: number,
    ): Promise<string | undefined>;
    setAddress(
      userId: string,
      guildId: string,
      chainId: number,
      address: string,
    ): Promise<void>;
    deleteAddress(userId: string, guildId: string, chainId: number): Promise<boolean>;
  };
};

export async function handleSafesCommand(
  interaction: Interaction,
  deps: SafesFeatureDeps,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== "admin_manage_safes") return false;

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

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command can only be used within a guild.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const guildId = guild.id;
  const allSafes = await deps.safeModel.getAllAddresses(guildId);
  const reply = getAdminManageSafesDisplay({ allSafes });

  await interaction.reply({
    ...reply,
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

export async function handleSafesButton(
  interaction: Interaction,
  deps: SafesFeatureDeps,
): Promise<boolean> {
  if (!interaction.isButton()) return false;

  if (interaction.customId.startsWith("cancelSetSafe")) {
    const guildId = interaction.guildId!;
    assert(guildId, "Guild not found");

    const allSafes = await deps.safeModel.getAllAddresses(guildId);
    const reply = getAdminManageSafesDisplay({ allSafes });
    await (interaction as ButtonInteraction).update({
      ...reply,
    });
    return true;
  }

  if (interaction.customId.startsWith("confirmSetSafe")) {
    const guildId = interaction.guildId!;
    assert(guildId, "Guild not found");

    const customIdParts = interaction.customId.split("_");
    const chainId = Number(customIdParts[1]);
    const address = customIdParts.slice(2).join("_");
    assert(chainId, "Unable to find chain id");
    assert(address, "Unable to find address");

    await deps.safeModel.setAddress(guildId, guildId, Number(chainId), address);

    const allSafes = await deps.safeModel.getAllAddresses(guildId);
    const reply = getAdminManageSafesDisplay({ allSafes });
    reply.content = `Safe address changed to ${address}!\n` + reply.content;

    await (interaction as ButtonInteraction).update({
      ...reply,
    });
    return true;
  }

  if (!interaction.customId.startsWith("manageSafe")) return false;

  // Cancel / back to main view
  if (interaction.customId.startsWith("manageSafe_cancel")) {
    const guildId = interaction.guildId;
    assert(guildId, "Guild not found");
    const allSafes = await deps.safeModel.getAllAddresses(guildId);
    const reply = getAdminManageSafesDisplay({ allSafes });
    await (interaction as ButtonInteraction).update({
      ...reply,
    });
    return true;
  }

  // Confirm remove
  if (interaction.customId.startsWith("manageSafe_confirmRemove_")) {
    const guildId = interaction.guildId!;
    assert(guildId, "Guild not found");

    const matches = /^manageSafe_confirmRemove_(\d+)_(.+)$/.exec(
      interaction.customId,
    );
    assert(matches && matches[1] && matches[2], "No Safe selected to remove.");
    const chainId = Number(matches[1]);
    const address = matches[2];

    await deps.safeModel.deleteAddress(guildId, guildId, chainId);

    const allSafes = await deps.safeModel.getAllAddresses(guildId);
    const reply = getAdminManageSafesDisplay({ allSafes });
    reply.content =
      `🗑️ Safe removed: ${address} (${ChainsById[chainId]?.name ?? chainId})\n\n` +
      reply.content;

    await (interaction as ButtonInteraction).update({
      ...reply,
    });
    return true;
  }

  // Remove flow: show select menu
  if (interaction.customId.startsWith("manageSafe_remove")) {
    const guildId = interaction.guildId!;
    assert(guildId, "Guild not found");

    const allSafes = await deps.safeModel.getAllAddresses(guildId);

    if (Object.keys(allSafes).length === 0) {
      await (interaction as ButtonInteraction).update({
        content: "There are no Safe addresses to remove.",
        components: [],
      });
      return true;
    }

    const safeOptions = (allSafes as any[]).map(({ address, chainId }) => {
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
        .addOptions(safeOptions),
    );

    const cancelButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("manageSafe_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).update({
      content: "Select the Safe address to remove:",
      components: [selectMenu, cancelButtonRow],
    });

    return true;
  }

  // Add safe: open modal
  if (interaction.customId.startsWith("manageSafe_add")) {
    const modal = new ModalBuilder()
      .setCustomId(`manageSafe_addressModal`)
      .setTitle(`Set Safe address`);

    const addressInput = new TextInputBuilder()
      .setCustomId("safeAddress")
      .setLabel("Safe Address")
      .setPlaceholder("chain:0x...  (e.g. eth:0xabc...)" )
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput),
    );

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  // Default: show manage safes view
  {
    const guildId = interaction.guildId!;
    assert(guildId, "Guild not found");
    const allSafes = await deps.safeModel.getAllAddresses(guildId);
    const reply = getAdminManageSafesDisplay({ allSafes });
    await (interaction as ButtonInteraction).update({
      ...reply,
    });
    return true;
  }
}

export async function handleSafesSelectMenu(
  interaction: Interaction,
  deps: SafesFeatureDeps,
): Promise<boolean> {
  if (!interaction.isStringSelectMenu()) return false;
  if (!interaction.customId.startsWith("manageSafe_removeSelect")) return false;

  const guildId = interaction.guildId!;
  assert(guildId, "Guild not found");

  const selectedValue = interaction.values[0];
  assert(selectedValue, "No Safe selected to remove.");

  const [chainIdStr, ...addressParts] = selectedValue.split(":");
  const chainId = Number(chainIdStr);
  const address = addressParts.join(":");
  assert(chainId, "Invalid Safe selection: missing chainId.");
  assert(address, "Invalid Safe selection: missing address.");

  const chainName = ChainsById[chainId]?.name ?? chainId;

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`manageSafe_confirmRemove_${chainId}:${address}`)
      .setLabel("Yes, remove")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("manageSafe_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  await (interaction as StringSelectMenuInteraction).update({
    content: `⚠️ Are you sure you want to remove the Safe address \`${address}\` for **${chainName}**?`,
    components: [confirmRow],
  });

  return true;
}

export async function handleSafesModalSubmit(
  interaction: Interaction,
  deps: SafesFeatureDeps,
): Promise<boolean> {
  if (!interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith("manageSafe_addressModal")) return false;

  const safeAddress = interaction.fields.getTextInputValue("safeAddress");
  const [networkPrefix, address] = safeAddress.split(":");
  assert(networkPrefix, "Safe address requires network prefix");

  const addrChain = Chains.find(
    (chain) => chain.shortName.toLowerCase() === networkPrefix.toLowerCase(),
  );
  assert(
    addrChain,
    `Network not found with prefix ${networkPrefix}. Supply Safe address in the form of chain:address.`,
  );
  assert(
    address,
    "Safe address requires address. Supply Safe address in the form of chain:address.",
  );

  const guildId = interaction.guildId!;
  assert(guildId, "Guild not found");

  const existingSafeAddress = await deps.safeModel.getAddress(
    guildId,
    guildId,
    addrChain.chainId,
  );

  if (existingSafeAddress === address) {
    const allSafes = await deps.safeModel.getAllAddresses(guildId);
    const reply = getAdminManageSafesDisplay({ allSafes });
    reply.content =
      `Safe address is already set to ${address} on ${addrChain.name}!\n\n` +
      reply.content;

    await (interaction as any).update({
      ...reply,
    });
    return true;
  }

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirmSetSafe_${addrChain.chainId}_${address}`)
      .setLabel(
        existingSafeAddress
          ? `Override existing Safe address`
          : `Set as Safe address`,
      )
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cancelSetSafe`)
      .setLabel(`Cancel`)
      .setStyle(ButtonStyle.Secondary),
  );

  let content;
  if (existingSafeAddress) {
    content = `A Safe address is already set for **${addrChain.name}**:\n\`${existingSafeAddress}\`\n\nDo you want to override it with:\n\`${address}\` ?`;
  } else {
    content = `You are about to set the following Safe address for **${addrChain.name}**:\n\`${address}\`\n\nDo you want to proceed?`;
  }

  await (interaction as any).update({
    content,
    components: [confirmRow],
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

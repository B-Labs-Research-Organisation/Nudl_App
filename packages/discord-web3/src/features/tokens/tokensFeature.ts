import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Interaction,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import assert from "assert";

import { ChainsById, fetchErc20TokenInfo, getAdminManageTokensDisplay, tokenRemovalSelectionDisplay } from "../../utils";

export type TokensFeatureDeps = {
  tokenModel: {
    getTokensByGuild(guildId: string): Promise<any[]>;
    setToken(tokenInfo: any): Promise<void>;
    deleteToken(
      guildId: string,
      chainId: number,
      tokenAddress: string,
    ): Promise<boolean>;
  };
};

/**
 * Handles `/admin_manage_tokens`.
 */
export async function handleTokensCommand(
  interaction: Interaction,
  deps: TokensFeatureDeps,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName !== "admin_manage_tokens") return false;

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

  const allTokens = await deps.tokenModel.getTokensByGuild(guild.id);
  const reply = getAdminManageTokensDisplay({ allTokens });
  await interaction.reply({
    ...reply,
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

/**
 * Handles button presses for the token management UI.
 *
 * Custom IDs (current):
 * - manageTokens
 * - manageTokens_add_<chainId>
 * - manageTokens_remove_<chainId>
 * - manageTokens_confirmRemove_<chainId>_<tokenAddress>
 */
export async function handleTokensButton(
  interaction: Interaction,
  deps: TokensFeatureDeps,
): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("manageTokens")) return false;

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command can only be used within a guild.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const allTokens = await deps.tokenModel.getTokensByGuild(guild.id);

  if (interaction.customId.startsWith("manageTokens_add")) {
    // CustomId format: "manageTokens_add_<chainId>" (chainId required in current UI)
    const parts = interaction.customId.split("_");
    const chainId = parts.length > 2 ? parts[2] : undefined;
    assert(chainId, "Chain not found");

    const modal = new ModalBuilder()
      .setCustomId(`manageTokens_add_${chainId}`)
      .setTitle(`Add Token Address (Chain ID: ${chainId})`);

    const addressInput = new TextInputBuilder()
      .setCustomId("tokenAddress")
      .setLabel("Token Address")
      .setPlaceholder("0x...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput),
    );

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  if (interaction.customId.startsWith("manageTokens_remove")) {
    const parts = interaction.customId.split("_");
    const chainId = parts.length > 2 ? parts[2] : undefined;
    assert(chainId, "No chain selected");

    const reply = tokenRemovalSelectionDisplay({
      chainId: Number(chainId),
      allTokens,
    });
    await (interaction as ButtonInteraction).update(reply);
    return true;
  }

  if (interaction.customId.startsWith("manageTokens_confirmRemove_")) {
    const customIdParts = interaction.customId.split("_");
    const chainId = customIdParts[2];
    const tokenAddress = customIdParts[3];
    assert(chainId, "No chain selected");
    assert(tokenAddress, "No token selected");

    await deps.tokenModel.deleteToken(guild.id, Number(chainId), tokenAddress);

    const manageMoreRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("manageTokens")
        .setLabel("Manage More Tokens")
        .setStyle(ButtonStyle.Primary),
    );

    const chainName =
      ChainsById[Number(chainId)]?.name ?? `Chain ID ${chainId}`;

    await (interaction as ButtonInteraction).update({
      content: `✅ Token has been deleted from **${chainName}**.`,
      components: [manageMoreRow],
    });
    return true;
  }

  // Default: rerender main view
  const reply = getAdminManageTokensDisplay({ allTokens });
  await (interaction as ButtonInteraction).update(reply);
  return true;
}

/**
 * Handles modal submits for adding tokens from the token management UI.
 */
export async function handleTokensModalSubmit(
  interaction: Interaction,
  deps: TokensFeatureDeps,
): Promise<boolean> {
  if (!interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith("manageTokens_add")) return false;

  const parts = interaction.customId.split("_");
  const chainId = parts.length > 2 ? parts[2] : undefined;
  assert(chainId, "Chain not found");

  const chain = ChainsById[Number(chainId)];
  assert(chain, `Network not found for chainId: ${chainId}`);

  const tokenAddress = interaction.fields.getTextInputValue("tokenAddress");
  assert(tokenAddress, "Token address is required");

  const guildId = interaction.guildId;
  assert(guildId, "Guild not found");

  const tokenInfo = await fetchErc20TokenInfo({
    chainId: chain.chainId,
    tokenAddress,
    guildId,
  });

  await deps.tokenModel.setToken(tokenInfo);

  const manageMoreRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("manageTokens")
      .setLabel("Manage More Tokens")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: [
      `✅ Token added to **${chain.name}**!`,
      "",
      `**Name:** ${tokenInfo.name}`,
      `**Symbol:** ${tokenInfo.symbol}`,
      `**Decimals:** ${tokenInfo.decimals}`,
      `**Address:** \`${tokenInfo.address}\``,
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
    components: [manageMoreRow],
  });

  return true;
}

/**
 * Handles select menus for token management UI.
 *
 * Custom IDs (current):
 * - manageTokens_removeSelect_<chainId>
 * - manageTokens_networkSelect_dropdown
 */
export async function handleTokensSelectMenu(
  interaction: Interaction,
  deps: TokensFeatureDeps,
): Promise<boolean> {
  if (!interaction.isStringSelectMenu()) return false;

  if (interaction.customId.startsWith("manageTokens_removeSelect_")) {
    const chainIdStr = interaction.customId.replace(
      "manageTokens_removeSelect_",
      "",
    );
    const chainId = parseInt(chainIdStr, 10);

    const selectedTokenAddress = interaction.values
      ? interaction.values[0]
      : undefined;
    assert(selectedTokenAddress, "No token selected to remove.");
    assert(chainId, "Invalid customId format: missing chainId.");

    const guild = interaction.guild;
    let tokenLabel = selectedTokenAddress;
    if (guild) {
      const allTokens = await deps.tokenModel.getTokensByGuild(guild.id);
      const match = allTokens.find(
        (t: any) =>
          t.address.toLowerCase() === selectedTokenAddress.toLowerCase() &&
          t.chainId === chainId,
      );
      if (match) {
        tokenLabel = match.symbol
          ? `${match.symbol} (${selectedTokenAddress.slice(0, 6)}...${selectedTokenAddress.slice(-4)})`
          : `${selectedTokenAddress.slice(0, 6)}...${selectedTokenAddress.slice(-4)}`;
      } else {
        tokenLabel = `${selectedTokenAddress.slice(0, 6)}...${selectedTokenAddress.slice(-4)}`;
      }
    }

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `manageTokens_confirmRemove_${chainId}_${selectedTokenAddress}`,
        )
        .setLabel("Yes, Remove")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("manageTokens")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as StringSelectMenuInteraction).update({
      content: `⚠️ Are you sure you want to remove the token **${tokenLabel}** from **${chainName}**?`,
      components: [confirmRow],
    });

    return true;
  }

  if (interaction.customId.startsWith("manageTokens_networkSelect")) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "This command can only be used within a guild.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const allTokens = await deps.tokenModel.getTokensByGuild(guild.id);
    const selectedNetwork = interaction.values
      ? interaction.values[0]
      : undefined;

    const reply = getAdminManageTokensDisplay({
      allTokens,
      selectedNetwork,
    });

    await (interaction as StringSelectMenuInteraction).update(reply);
    return true;
  }

  return false;
}

/**
 * Handles token autocomplete for commands that accept `token_address`.
 */
export async function handleTokenAutocomplete(
  interaction: Interaction,
  deps: TokensFeatureDeps,
): Promise<boolean> {
  if (!interaction.isAutocomplete()) return false;

  const focusedOption = interaction.options.getFocused(true);
  if (focusedOption.name !== "token_address") return false;

  const guildId = interaction.guildId!;
  const userInput =
    interaction.options.getString("token_address", false) || "";
  const [inputNetwork, inputAddress] = userInput.split(":");

  const tokens = await deps.tokenModel.getTokensByGuild(guildId);

  const filteredTokens = tokens.filter(({ address }: any) => {
    const matchesAddress = inputAddress
      ? address.toLowerCase().startsWith(inputAddress.toLowerCase())
      : true;
    return matchesAddress;
  });

  const choices = filteredTokens.map(({ address, symbol, chainId }: any) => {
    const chain = ChainsById[chainId];
    const chainName = chain ? chain.name : "Unknown Chain";
    return {
      name: `${chainName}:${symbol}:${address}`,
      value: `${chain ? chain.shortName : "unknown"}:${address}`,
    };
  });

  try {
    await (interaction as AutocompleteInteraction).respond(choices);
  } catch (err) {
    console.error(err, "Error autocomplete token address");
  }

  return true;
}

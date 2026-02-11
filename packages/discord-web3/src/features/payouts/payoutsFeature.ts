import {
  ActionRowBuilder,
  Interaction,
  MessageFlags,
  StringSelectMenuBuilder,
  User,
} from "discord.js";
import assert from "assert";
import * as viem from "viem";

import {
  Chains,
  ChainsById,
  dispersePayout,
  generateSafeTransactionBatch,
  parseRecipientsCsvAndResolveAddresses,
  resolveDiscordUser,
} from "../../utils";

export type PayoutsFeatureDeps = {
  client: any;
  userModel: {
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
  };
  stores: {
    payouts: Record<string, any>;
    safeGenerations: Record<string, any>;
    dispersePayouts: Record<string, any>;
    csvAirdropPayouts: Record<string, any>;
  };
};

/**
 * Handles payout-related modal submits.
 *
 * Custom IDs:
 * - payoutModal_<payoutId>
 * - safePayoutModal_<safeId>
 * - dispersePayoutModal_<disperseId>
 * - csvAirdropPayoutModal_<payoutId>
 * - addAddress_<chainId>
 */
export async function handlePayoutsModalSubmit(
  interaction: Interaction,
  deps: PayoutsFeatureDeps,
): Promise<boolean> {
  if (!interaction.isModalSubmit()) return false;

  const { client, userModel, stores } = deps;
  const { payouts, safeGenerations, dispersePayouts, csvAirdropPayouts } =
    stores;

  // Existing generic modal
  if (interaction.customId === "userInputModal") {
    const userInput = interaction.fields.getTextInputValue("userInput");
    await interaction.reply({
      content: `You entered: ${userInput}`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.customId.startsWith("addAddress_")) {
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
    return true;
  }

  if (interaction.customId.startsWith("payoutModal_")) {
    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const csvData = interaction.fields.getTextInputValue("csvInput");
    assert(csvData, "Payout amounts not found");
    payout.csvData = csvData;

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`payoutChain_${payoutId}`)
        .setPlaceholder("Choose a network")
        .addOptions(
          Object.values(Chains).map((chain) => ({
            label: `${chain.name} (${chain.chainId})`,
            value: `${chain.chainId}`,
            description: chain.shortName ? `${chain.shortName}` : undefined,
          })),
        ),
    );

    await interaction.reply({
      content: "Select chain for payout",
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (interaction.customId.startsWith("safePayoutModal_")) {
    await interaction.deferReply({ ephemeral: true });

    const [_, safeId] = interaction.customId.split("_");
    const safeData = safeGenerations[safeId];
    if (!safeData) {
      await interaction.editReply({
        content: "Safe data not found",
      });
      return true;
    }

    assert(safeData.safeAddress, "Safe address not found");
    assert(safeData.tokenAddress, "Token address not found");
    assert(typeof safeData.decimals !== "undefined", "Decimals not found");

    const csvData = interaction.fields.getTextInputValue("csvInput");

    const lines = csvData
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    const errors: string[] = [];
    const userIdToAmount: Record<string, string> = {};
    const idToInput: Record<string, string> = {};
    const userIdToUser: Record<string, User> = {};

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
          interaction.guildId!,
        );
        if (!user) {
          errors.push(`Line ${i + 1}: Could not resolve user "${idRaw}"`);
          continue;
        }
        userIdToAmount[user.id] = amountRaw;
        userIdToUser[user.id] = user;
      } catch {
        errors.push(`Line ${i + 1}: Error resolving user "${idRaw}"`);
        continue;
      }
    }

    const addressEntries: [string, string][] = [];
    for (const userId in userIdToAmount) {
      try {
        const address = await userModel.getAddress(
          userId,
          interaction.guildId!,
          safeData.chainId,
        );
        if (!address) {
          const user = userIdToUser[userId];
          const userInfo = user
            ? `${user.username}#${user.discriminator} (${user.id})`
            : `User ID: ${userId}`;
          errors.push(
            `${userInfo}: No address found for chain ${safeData.chainId}`,
          );
          continue;
        }
        addressEntries.push([address, userIdToAmount[userId]]);
      } catch {
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

    const batchResult = generateSafeTransactionBatch({
      entries: addressEntries,
      chainId: safeData.chainId,
      safeAddress: safeData.safeAddress,
      erc20Address: safeData.tokenAddress,
      decimals: safeData.decimals,
      description: `Generated for safe ${safeData.safeAddress}`,
    });

    const allErrors = [...errors, ...(batchResult.errors || [])];
    const batchJson = JSON.stringify(batchResult.batch, null, 2);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    const files = [
      {
        name: `safe_batch_${dateStr}.json`,
        attachment: Buffer.from(batchJson, "utf-8"),
      },
    ];

    const chainName = ChainsById[safeData.chainId]?.name ?? "Unknown Chain";
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

    return true;
  }

  if (interaction.customId.startsWith("csvAirdropPayoutModal_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [_, payoutId] = interaction.customId.split("_");
    const payoutData = csvAirdropPayouts[payoutId];
    assert(payoutData, "Unable to find original request, try again");

    await interaction.editReply({
      content: "Not supported yet...",
    });
    return true;
  }

  if (interaction.customId.startsWith("dispersePayoutModal_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [_, disperseId] = interaction.customId.split("_");
    const payoutData = dispersePayouts[disperseId];
    assert(payoutData, "Unable to find original request, try again");

    const { chainId, donateAmount } = payoutData;
    const csvData = interaction.fields.getTextInputValue("csvInput");

    const guildId = interaction.guildId;
    assert(guildId, "Guild not found");

    const { addressEntries, errors } =
      await parseRecipientsCsvAndResolveAddresses({
        client,
        csvData,
        guildId,
        userModel,
        chainId,
      });

    const { file, description } = dispersePayout({
      addressEntries,
      chainId,
      donateAmount,
      donateAddress: process.env.DONATE_ADDRESS,
      errors,
    });

    await interaction.editReply({
      content: description,
      files: [file],
    });

    return true;
  }

  return false;
}

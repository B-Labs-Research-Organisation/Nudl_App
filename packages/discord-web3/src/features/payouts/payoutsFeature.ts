import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Interaction,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  User,
} from "discord.js";
import assert from "assert";
import * as viem from "viem";

import {
  Chains,
  ChainsById,
  dispersePayout,
  generateSafeTransactionBatch,
  getViemChain,
  parseRecipientsCsvAndResolveAddresses,
  renderPayoutPrefill,
  renderSafePayoutSetupRow,
  resolveDiscordUser,
} from "../../utils";
import ERC20_ABI from "../../erc20.abi";

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
  tokenModel?: {
    getToken(
      guildId: string,
      chainId: number,
      address: string,
    ): Promise<any | undefined>;
    getTokensByGuild(guildId: string): Promise<any[]>;
    setToken(tokenInfo: any): Promise<void>;
  };
  safeModel?: {
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
  };
  stores: {
    payouts: Record<string, any>;
    safeGenerations: Record<string, any>;
    dispersePayouts: Record<string, any>;
    csvAirdropPayouts: Record<string, any>;
  };
};

async function buildPayoutConfigSummary(
  interaction: Interaction,
  payout: any,
  opts?: {
    recipientCount?: number;
    tokenSymbol?: string;
    tokenName?: string;
    amountCount?: number;
    pointsCount?: number;
    bothCount?: number;
  },
): Promise<string> {
  const chainId = Number(payout?.chainId);
  const chainName = ChainsById[chainId]?.name ?? String(chainId);
  const mode = payout?.recipientsMode ?? "manual";

  let roleLabel = "(none)";
  let channelLabel = "(none)";

  const guild = interaction.guild;
  if (guild) {
    if (payout?.roleId) {
      try {
        await guild.roles.fetch();
        const role = guild.roles.cache.get(payout.roleId);
        roleLabel = role ? `${role.name} (${role.id})` : `${payout.roleId}`;
      } catch {
        roleLabel = `${payout.roleId}`;
      }
    }

    if (payout?.channelId) {
      try {
        const ch = await guild.channels.fetch(payout.channelId);
        const chName = (ch as any)?.name;
        channelLabel = chName ? `#${chName} (${payout.channelId})` : `${payout.channelId}`;
      } catch {
        channelLabel = `${payout.channelId}`;
      }
    }
  }

  const tokenLine = payout?.tokenAddress
    ? `• Token: ${opts?.tokenName || "(unknown)"}${opts?.tokenSymbol ? ` (${opts.tokenSymbol})` : ""} — \`${payout.tokenAddress}\``
    : null;

  return [
    "\n📋 **Payout configuration**",
    `• Session: \`${payout?.id ?? "(n/a)"}\``,
    `• Platform: ${payout?.type ?? "(unknown)"}`,
    `• Chain: ${chainName} (${chainId})`,
    tokenLine,
    payout?.safeAddress ? `• Safe: \`${payout.safeAddress}\`` : null,
    `• Recipients source: ${mode}`,
    `• Role filter: ${roleLabel}`,
    `• Channel filter: ${channelLabel}`,
    `• Parsed recipients: ${opts?.recipientCount ?? 0}`,
    typeof opts?.amountCount === "number" ? `• Rows with amount: ${opts.amountCount}` : null,
    typeof opts?.pointsCount === "number" ? `• Rows with points: ${opts.pointsCount}` : null,
    typeof opts?.bothCount === "number" ? `• Rows with both: ${opts.bothCount}` : null,
    payout?.donateAmount ? `• Donation: ${Number(payout.donateAmount)}${opts?.tokenSymbol ? ` ${opts.tokenSymbol}` : ""}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

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

  if (interaction.customId.startsWith("payoutDonateModal_")) {
    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout session, try again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const raw = interaction.fields.getTextInputValue("donationAmount");
    const donateAmount = Number(raw);
    if (!Number.isFinite(donateAmount) || donateAmount < 0) {
      await interaction.reply({
        content: "Donation amount must be a number ≥ 0.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    payout.donateAmount = donateAmount;

    const chainId = Number(payout.chainId);
    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    // Show next-step buttons again
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`payoutDonateModal_${payoutId}`)
        .setLabel("Donation (optional)")
        .setStyle(ButtonStyle.Success),
    );

    if (payout.type === "disperse") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dispersePayoutButton_${payoutId}`)
          .setLabel(`Generate Disperse file (${chainName})`)
          .setStyle(ButtonStyle.Primary),
      );
    } else if (payout.type === "safe") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`safePayoutButton_${payoutId}`)
          .setLabel(`Continue Safe setup (${chainName})`)
          .setStyle(ButtonStyle.Success),
      );
    } else if (payout.type === "csv-airdrop") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`setTokenButton_${payoutId}`)
          .setLabel(`Select token (${chainName})`)
          .setStyle(ButtonStyle.Secondary),
      );
    }

    const responsePayload = {
      content:
        `✅ Donation updated: **${donateAmount.toFixed(4)}** (adds an extra line item; total spend increases).`,
      components: [row],
    };

    // If modal originated from a component, prefer updating that original message.
    try {
      await (interaction as any).update(responsePayload);
    } catch {
      await interaction.reply({
        ...responsePayload,
        flags: MessageFlags.Ephemeral,
      });
    }

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

    // If dashboard already selected network + platform, skip chain selection.
    if (payout.chainId && payout.type) {
      const chainId = Number(payout.chainId);
      const chainName = ChainsById[chainId]?.name ?? String(chainId);

      if (payout.type === "disperse") {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`payoutDonateModal_${payoutId}`)
            .setLabel("Donation (optional)")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`dispersePayoutButton_${payoutId}`)
            .setLabel(`Generate Disperse file (${chainName})`)
            .setStyle(ButtonStyle.Primary),
        );

        const donateLine = payout.donateAmount
          ? `\nDonation: **${Number(payout.donateAmount).toFixed(4)}** (adds an extra line item)`
          : "\nDonation: **0**";

        await interaction.reply({
          content:
            `✅ CSV captured for **Disperse** on **${chainName}**.` +
            donateLine +
            `\nClick below to generate the file.`,
          components: [row],
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }

      if (payout.type === "safe") {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`payoutDonateModal_${payoutId}`)
            .setLabel("Donation (optional)")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`safePayoutButton_${payoutId}`)
            .setLabel(`Continue Safe setup (${chainName})`)
            .setStyle(ButtonStyle.Success),
        );

        const donateLine = payout.donateAmount
          ? `\nDonation: **${Number(payout.donateAmount).toFixed(4)}** (adds an extra line item)`
          : "\nDonation: **0**";

        await interaction.reply({
          content:
            `✅ CSV captured for **Safe** on **${chainName}**.` +
            donateLine +
            `\nNext: pick Safe + Token (we’ll autofill if possible).`,
          components: [row],
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }

      if (payout.type === "csv-airdrop") {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`payoutDonateModal_${payoutId}`)
            .setLabel("Donation (optional)")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`setTokenButton_${payoutId}`)
            .setLabel(`Select token (${chainName})`)
            .setStyle(ButtonStyle.Secondary),
        );

        const donateLine = payout.donateAmount
          ? `\nDonation: **${Number(payout.donateAmount).toFixed(4)}** (adds an extra line item)`
          : "\nDonation: **0**";

        await interaction.reply({
          content:
            `✅ CSV captured for **CSV Airdrop** on **${chainName}**.` +
            donateLine +
            `\nNext: select token (Safe CSV Airdrop needs token_address per row).`,
          components: [row],
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }

      if (payout.type === "nudl-app") {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`nudlAppGenerate_${payoutId}`)
            .setLabel(`Generate nudl-app CSV (${chainName})`)
            .setStyle(ButtonStyle.Primary),
        );

        await interaction.reply({
          content:
            `✅ CSV captured for **nudl-app** on **${chainName}**.` +
            `\nNext: generate the export file (supports amount, points, or both).`,
          components: [row],
          flags: MessageFlags.Ephemeral,
        });

        return true;
      }
    }

    // Default legacy flow: ask for network
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
      const line = lines[i];
      let idRaw = "";
      let amountRaw = "";

      const delimited = /^(.*)[\t,=]\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*$/i.exec(
        line,
      );
      if (delimited) {
        idRaw = delimited[1]?.trim() ?? "";
        amountRaw = delimited[2]?.trim() ?? "";
      } else {
        const parts = line.split(/\s+/).map((s) => s.trim()).filter(Boolean);
        if (parts.length === 2) {
          idRaw = parts[0] ?? "";
          amountRaw = parts[1] ?? "";
        }
      }

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

  // Payout-setup modals (Safe + Token) launched from payout select menus
  if (interaction.customId.startsWith("addSafeModal_")) {
    assert(deps.safeModel, "safeModel required");

    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const foundChain = Chains.find((chain) => chain.chainId === payout.chainId);
    assert(foundChain, "Chain not found");

    const safeAddress = interaction.fields.getTextInputValue("safeAddress");
    const [networkPrefix, address] = safeAddress.split(":");

    if (networkPrefix && address) {
      const addrChain = Chains.find(
        (chain) => chain.shortName.toLowerCase() === networkPrefix.toLowerCase(),
      );
      if (addrChain?.chainId !== foundChain.chainId) {
        await interaction.reply({
          content: `Safe network (${addrChain?.name}) does not match selected network (${foundChain.name})`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
    }

    const guildId = interaction.guildId!;
    const actualAddress = address ?? safeAddress;

    await deps.safeModel.setAddress(
      guildId,
      guildId,
      foundChain.chainId,
      actualAddress,
    );

    payout.safeAddress = actualAddress;

    const renderSetup = renderSafePayoutSetupRow(payout);
    await (interaction as any).update({
      embeds: [
        {
          title: `✅ Safe Added for ${foundChain.name}`,
          color: 0x2ecc71,
          description: `**Safe Address:**\n\`${actualAddress}\``,
          fields: [
            {
              name: "Chain",
              value: `${foundChain.name} (${foundChain.chainId})`,
              inline: true,
            },
          ],
          footer: {
            text: "Safe information saved successfully.",
          },
        },
      ],
      ...renderSetup,
    });

    return true;
  }

  if (interaction.customId.startsWith("addTokenModal_")) {
    assert(deps.tokenModel, "tokenModel required");

    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const foundChain = Chains.find((chain) => chain.chainId === payout.chainId);
    assert(foundChain, "Chain not found");

    const tokenAddress = interaction.fields.getTextInputValue("tokenAddress");
    const guildId = interaction.guildId!;

    // Use existing helper to fetch name/symbol/decimals and normalize address
    // (fetchErc20TokenInfo is used elsewhere for token mgmt; keep it consistent)
    // We’ll just do a minimal viem contract read here if needed later.

    // Reuse on-chain reads already used in main.ts in earlier logic:
    // Store token with normalized checksum address
    const checksum = viem.getAddress(tokenAddress);

    // Best-effort metadata fetch (some tokens can revert name/symbol)
    let name = "";
    let symbol = "";
    let decimals = 18;
    try {
      const viemChain = getViemChain(foundChain.chainId);
      assert(viemChain, `Chain ${foundChain.chainId} not found`);

      const erc20 = viem.getContract({
        address: checksum,
        abi: ERC20_ABI as any,
        client: viem.createPublicClient({
          chain: viemChain,
          transport: viem.http(),
        }),
      });
      const results = await Promise.all([
        erc20.read.name().catch(() => ""),
        erc20.read.symbol().catch(() => ""),
        erc20.read.decimals().catch(() => 18),
      ]);
      name = results[0] as string;
      symbol = results[1] as string;
      decimals = Number(results[2]);
    } catch {
      // ok
    }

    const tokenInfo = {
      guildId,
      chainId: foundChain.chainId,
      name,
      symbol,
      decimals,
      address: checksum,
    };

    await deps.tokenModel.setToken(tokenInfo as any);

    // ensure payout state picks up decimals
    payout.tokenAddress = checksum;
    payout.decimals = decimals;

    const renderSetup = renderSafePayoutSetupRow(payout);
    await (interaction as any).update({
      embeds: [
        {
          title: `✅ Token Added for ${foundChain.name}`,
          color: 0x2ecc71,
          description: `**Token Address:**\n\`${checksum}\``,
          fields: [
            {
              name: "Chain",
              value: `${foundChain.name} (${foundChain.chainId})`,
              inline: true,
            },
            ...(name
              ? [{ name: "Name", value: `${name}`, inline: true }]
              : []),
            ...(symbol
              ? [{ name: "Symbol", value: `${symbol}`, inline: true }]
              : []),
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
      ...renderSetup,
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  return false;
}

/**
 * Handles payout-related button interactions.
 */
export async function handlePayoutsButton(
  interaction: Interaction,
  deps: PayoutsFeatureDeps,
): Promise<boolean> {
  if (!interaction.isButton()) return false;

  const { client, userModel, tokenModel, safeModel, stores } = deps;
  const { payouts } = stores;

  // Donation modal opener
  if (interaction.customId.startsWith("payoutDonateModal_")) {
    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout session, try again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const chainId = Number(payout.chainId);
    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    const modal = new ModalBuilder()
      .setCustomId(`payoutDonateModal_${payoutId}`)
      .setTitle(`Donation (optional) — ${chainName}`);

    const input = new TextInputBuilder()
      .setCustomId("donationAmount")
      .setLabel("Donation amount (0 to skip)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(payout.donateAmount ?? 0));

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  // Safe payout generation once setup is complete
  if (interaction.customId.startsWith("safePayoutGenerate_")) {
    assert(tokenModel, "tokenModel required");

    await (interaction as ButtonInteraction).deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await (interaction as ButtonInteraction).editReply({
        content: `Unable to find payout list, try searching again`,
      });
      return true;
    }

    assert(payout.chainId, "Unable to find payout chain");
    assert(payout.safeAddress, "Unable to find safe address");
    assert(payout.tokenAddress, "Unable to find token address");
    assert(payout.decimals, "Unable to find token decimals");
    assert(payout.csvData, "Unable to payout CSV list");

    const guildId = interaction.guildId;
    assert(guildId, "Guild not found");

    const token = await tokenModel.getToken(
      guildId,
      payout.chainId,
      payout.tokenAddress,
    );
    assert(token, "Unable to find token");

    const { addressEntries, errors } =
      await parseRecipientsCsvAndResolveAddresses({
        client,
        csvData: payout.csvData,
        guildId,
        userModel,
        chainId: payout.chainId,
      });

    if (
      process.env.DONATE_ADDRESS &&
      viem.isAddress(process.env.DONATE_ADDRESS) &&
      Number(payout.donateAmount ?? 0) > 0
    ) {
      addressEntries.push([
        process.env.DONATE_ADDRESS,
        String(payout.donateAmount),
      ]);
    }

    const batchResult = generateSafeTransactionBatch({
      entries: addressEntries,
      chainId: payout.chainId,
      safeAddress: payout.safeAddress,
      erc20Address: payout.tokenAddress,
      decimals: payout.decimals,
      description: `Generated for safe ${payout.safeAddress}`,
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

    const chainName = ChainsById[payout.chainId]?.name ?? "Unknown Chain";
    const tokenName = token.name ?? "Unknown Token";
    const tokenSymbol = token.symbol ?? "Unknown Token Symbol";

    let content = `✅ SAFE JSON file generated for ${addressEntries.length} entries on ${chainName} using ${tokenName} (${tokenSymbol}).`;
    if (Number(payout.donateAmount ?? 0) > 0) {
      content += `\nYou are donating ${Number(payout.donateAmount).toFixed(4)} ${tokenSymbol}, thank you! ❤️`;
    }
    content += `\n💸 ___Total amount to transfer___: **${batchResult.totalAmountFormatted} ${tokenSymbol}**`;

    if (allErrors.length > 0) {
      content += `\n\n⚠️ Some issues were found:\n\`\`\`\n${allErrors.join("\n")}\n\`\`\``;
    }

    content += await buildPayoutConfigSummary(interaction, payout, {
      recipientCount: addressEntries.length,
      tokenName,
      tokenSymbol,
    });

    await (interaction as ButtonInteraction).editReply({
      content,
      files,
    });

    return true;
  }

  // Set safe button (show safe select)
  if (interaction.customId.startsWith("setSafeButton_")) {
    assert(safeModel, "safeModel required");

    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    assert(payout.chainId, "Unable to find payout chain");

    const guildId = interaction.guildId;
    assert(guildId, "Guild not found");

    const allSafes = await safeModel.getAllAddresses(guildId);
    const safesByChain = allSafes.filter((safe: any) => safe.chainId === payout.chainId);

    const safeOptions = safesByChain.map(({ address, chainId }: any) => ({
      label: `${address} (${chainId})`,
      value: address,
    }));

    const overrideSafeMessage = `Replace exising Safe address on network`;
    const addSafeMessage = `Add new Safe address on network`;

    safeOptions.unshift({
      label: `➕ ${safeOptions.length > 0 ? overrideSafeMessage : addSafeMessage}`,
      value: `ADD_SAFE`,
    });

    const safeSelectionRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`payoutSafeSelect_${payoutId}`)
          .setPlaceholder(
            `${safeOptions.length > 1 ? "Select Safe or change it" : "Add new Safe address"}`,
          )
          .addOptions(safeOptions),
      );

    const result = await (interaction as ButtonInteraction).update({
      content: `Select a Safe to use for payout, or add a new safe on ${ChainsById[payout.chainId]?.name ?? payout.chainId}:`,
      components: [safeSelectionRow],
    });

    // maintain existing side-effect
    if ((result as any).interaction?.type === 3) {
      payout.messageId = (result as any).interaction.message.id;
      payout.channelId = interaction.channelId;
    }

    return true;
  }

  // Safe payout setup view
  if (interaction.customId.startsWith("safePayoutButton_")) {
    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const csvData = payout.csvData;
    assert(csvData, "Token amounts not found");
    assert(interaction.guildId, "Guild not found");
    assert(payout.chainId, "ChainId not found");

    await (interaction as ButtonInteraction).update(renderSafePayoutSetupRow(payout));
    return true;
  }

  // Set token button (show token select)
  if (interaction.customId.startsWith("setTokenButton_")) {
    assert(tokenModel, "tokenModel required");

    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    assert(payout.chainId, "Unable to find payout chain");

    const guildId = interaction.guildId;
    assert(guildId, "Guild not found");

    const savedTokens: { address: string; symbol: string; chainId: number }[] =
      await tokenModel.getTokensByGuild(guildId);

    const selectedChainId = payout.chainId;
    const filteredTokens = savedTokens.filter((t) => t.chainId === selectedChainId);

    const tokenOptions = filteredTokens.map(({ address, symbol }) => ({
      label: symbol ? `${symbol}: ${address}` : address,
      value: address,
    }));

    tokenOptions.unshift({
      label: "➕ Add a new token (not listed)",
      value: `ADD_TOKEN`,
    });

    const tokenSelectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`payoutTokenSelect_${payoutId}`)
          .setPlaceholder("Choose an existing token, or add a new one")
          .addOptions(tokenOptions),
      );

    await (interaction as ButtonInteraction).update({
      content: `Select a token to use for payout, or add a new token on ${ChainsById[selectedChainId]?.name ?? selectedChainId}:`,
      components: [tokenSelectRow],
    });

    return true;
  }

  // Disperse payout button
  if (interaction.customId.startsWith("dispersePayoutButton_")) {
    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const csvData = payout.csvData;
    assert(csvData, "Token amounts not found");

    const guildId = interaction.guildId;
    assert(guildId, "Guild not found");

    const chainId = payout.chainId;
    assert(chainId, "ChainId not found");

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
      donateAmount: Number(payout.donateAmount ?? 0),
      donateAddress: process.env.DONATE_ADDRESS,
      errors,
    });

    const summary = await buildPayoutConfigSummary(interaction, payout, {
      recipientCount: addressEntries.length,
    });

    await interaction.reply({
      content: `${description}${summary}`,
      files: [file],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  // nudl-app generator
  if (interaction.customId.startsWith("nudlAppGenerate_")) {
    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    assert(payout.type === "nudl-app", "Invalid payout type");
    const csvData = payout.csvData;
    assert(csvData, "Payout CSV not found");

    const guildId = interaction.guildId;
    assert(guildId, "Guild not found");

    const chainId = payout.chainId;
    assert(chainId, "ChainId not found");

    const lines = csvData
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.startsWith("#"));

    const errors: string[] = [];
    const entries: { address: string; amount?: string; points?: string }[] = [];
    let amountCount = 0;
    let pointsCount = 0;
    let bothCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(",");
      const idRaw = (parts[0] ?? "").trim();
      const amountRaw = (parts[1] ?? "").trim();
      const pointsRaw = (parts[2] ?? "").trim();

      if (!idRaw) {
        errors.push(`Line ${i + 1}: Missing user identifier`);
        continue;
      }
      if (!amountRaw && !pointsRaw) {
        errors.push(`Line ${i + 1}: Must provide amount, points, or both`);
        continue;
      }
      if (amountRaw && !Number.isFinite(Number(amountRaw))) {
        errors.push(`Line ${i + 1}: Invalid amount "${amountRaw}"`);
        continue;
      }
      if (pointsRaw && !Number.isFinite(Number(pointsRaw))) {
        errors.push(`Line ${i + 1}: Invalid points "${pointsRaw}"`);
        continue;
      }

      const user = await resolveDiscordUser(client, idRaw, guildId);
      if (!user) {
        errors.push(`Line ${i + 1}: Could not resolve user "${idRaw}"`);
        continue;
      }

      const address = await userModel.getAddress(user.id, guildId, chainId);
      if (!address) {
        errors.push(`Line ${i + 1}: No address found for ${idRaw} on chain ${chainId}`);
        continue;
      }

      if (amountRaw) amountCount += 1;
      if (pointsRaw) pointsCount += 1;
      if (amountRaw && pointsRaw) bothCount += 1;

      entries.push({
        address,
        ...(amountRaw ? { amount: amountRaw } : {}),
        ...(pointsRaw ? { points: pointsRaw } : {}),
      });
    }

    const out = [
      "address,amount,points",
      ...entries.map((e) => `${e.address},${e.amount ?? ""},${e.points ?? ""}`),
    ].join("\n") + "\n";

    const chainName = ChainsById[Number(chainId)]?.name ?? String(chainId);
    const summary = await buildPayoutConfigSummary(interaction, payout, {
      recipientCount: entries.length,
      amountCount,
      pointsCount,
      bothCount,
    });

    const contentLines = [
      `✅ nudl-app CSV generated for **${chainName}**.`,
      errors.length ? `\n⚠️ Issues found:\n\`\`\`\n${errors.join("\n")}\n\`\`\`` : "",
      summary,
    ].filter(Boolean);

    await interaction.reply({
      content: contentLines.join("\n"),
      files: [
        {
          name: `nudl-app_${chainName}_${Date.now()}.csv`,
          attachment: Buffer.from(out, "utf-8"),
        },
      ],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  // CSV Airdrop (Safe app) generator
  if (interaction.customId.startsWith("csvAirdropGenerate_")) {
    assert(tokenModel, "tokenModel required");

    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    assert(payout.type === "csv-airdrop", "Invalid payout type");
    const csvData = payout.csvData;
    assert(csvData, "Payout CSV not found");

    const guildId = interaction.guildId;
    assert(guildId, "Guild not found");

    const chainId = payout.chainId;
    assert(chainId, "ChainId not found");

    const tokenAddress = payout.tokenAddress;
    assert(tokenAddress, "Token not selected");

    const { addressEntries, errors } =
      await parseRecipientsCsvAndResolveAddresses({
        client,
        csvData,
        guildId,
        userModel,
        chainId,
      });

    const entries = [...addressEntries];
    if (
      process.env.DONATE_ADDRESS &&
      viem.isAddress(process.env.DONATE_ADDRESS) &&
      Number(payout.donateAmount ?? 0) > 0
    ) {
      entries.push([
        process.env.DONATE_ADDRESS,
        String(payout.donateAmount),
      ]);
    }

    const header = "token_address,receiver,amount";
    const lines = entries.map(
      ([receiver, amount]) => `${tokenAddress},${receiver},${amount}`,
    );

    const out = [header, ...lines].join("\n") + "\n";

    const chainName = ChainsById[Number(chainId)]?.name ?? String(chainId);

    const donationLine =
      Number(payout.donateAmount ?? 0) > 0
        ? `\nYou are donating ${Number(payout.donateAmount).toFixed(4)} (adds an extra line item), thank you! ❤️`
        : "";

    let tokenName: string | undefined;
    let tokenSymbol: string | undefined;
    if (tokenModel) {
      const token = await tokenModel.getToken(guildId, chainId, tokenAddress);
      tokenName = token?.name;
      tokenSymbol = token?.symbol;
    }

    const summary = await buildPayoutConfigSummary(interaction, payout, {
      recipientCount: entries.length,
      tokenName,
      tokenSymbol,
    });

    const contentLines = [
      `✅ CSV Airdrop file generated for **${chainName}**.${donationLine}`,
      errors.length ? `\n⚠️ Issues found:\n\`\`\`\n${errors.join("\n")}\n\`\`\`` : "",
      summary,
    ].filter(Boolean);

    await interaction.reply({
      content: contentLines.join("\n"),
      files: [
        {
          name: `csv-airdrop_${chainName}_${Date.now()}.csv`,
          attachment: Buffer.from(out, "utf-8"),
        },
      ],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  // Create payout button: open modal
  if (interaction.customId.startsWith("create_payout_")) {
    const payoutId = interaction.customId.split("_")[2];
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`payoutModal_${payoutId}`)
      .setTitle("Edit payout amounts for users");

    const preset = renderPayoutPrefill(payout.list);
    const input = new TextInputBuilder()
      .setCustomId(`csvInput`)
      .setLabel("Set token amounts for each user")
      .setStyle(TextInputStyle.Paragraph)
      .setValue(preset)
      .setRequired(true);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    modal.addComponents(actionRow);

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  // Open modal to paste Safe payout CSV
  if (interaction.customId.startsWith("safePayoutModal_")) {
    const [_, safeId] = interaction.customId.split("_");

    const modal = new ModalBuilder()
      .setCustomId(`safePayoutModal_${safeId}`)
      .setTitle("Paste Safe Payout CSV");

    const input = new TextInputBuilder()
      .setCustomId("csvInput")
      .setLabel("Paste CSV (discordid,amount per line)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      input,
    );
    modal.addComponents(actionRow);

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  // Open modal to paste Disperse payout CSV
  if (interaction.customId.startsWith("dispersePayoutModal_")) {
    const [_, disperseId, chainIdStr] = interaction.customId.split("_");
    const chainId = parseInt(chainIdStr, 10);

    const modal = new ModalBuilder()
      .setCustomId(`dispersePayoutModal_${disperseId}_${chainId}`)
      .setTitle("Paste Disperse Payout CSV");

    const input = new TextInputBuilder()
      .setCustomId("csvInput")
      .setLabel("Paste CSV (discordid,amount per line)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      input,
    );
    modal.addComponents(actionRow);

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  return false;
}

/**
 * Handles payout-related select menu interactions.
 */
export async function handlePayoutsSelectMenu(
  interaction: Interaction,
  deps: PayoutsFeatureDeps,
): Promise<boolean> {
  if (!interaction.isStringSelectMenu()) return false;

  const { tokenModel, safeModel, stores } = deps;
  const { payouts } = stores;

  if (interaction.customId.startsWith("payoutChain_")) {
    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const selectedValue = interaction.values[0];
    assert(selectedValue, "Unable to find Chain Id, try again");

    payout.chainId = Number(selectedValue);

    const selectedChainId = Number(selectedValue);
    const actionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dispersePayoutButton_${payoutId}`)
        .setLabel("Disperse")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`safePayoutButton_${payoutId}`)
        .setLabel("Safe")
        .setStyle(ButtonStyle.Success),
    );

    await (interaction as StringSelectMenuInteraction).update({
      content: `You selected: **${ChainsById[selectedChainId]?.name ?? selectedChainId}**!\nChoose a payout method:`,
      components: [actionsRow],
    });

    return true;
  }

  if (interaction.customId.startsWith("payoutSafeSelect_")) {
    assert(safeModel, "safeModel required");

    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const selectedValue = interaction.values[0];
    assert(selectedValue, "Unable to find safe, try again");

    const guildId = interaction.guildId;
    assert(guildId, "Guild ID not found");

    const chainId = payout.chainId;
    assert(chainId, "Chain ID not found");

    const chainName = ChainsById[chainId]?.name ?? `Chain ID ${chainId}`;
    const existingSafeAddress = await safeModel.getAddress(guildId, guildId, chainId);

    if (selectedValue === "ADD_SAFE") {
      const modal = new ModalBuilder()
        .setCustomId(`addSafeModal_${payoutId}`)
        .setTitle(`Add New Safe for ${chainName}`);

      const addressInput = new TextInputBuilder()
        .setCustomId("safeAddress")
        .setLabel(`Add Safe Address`)
        .setPlaceholder(existingSafeAddress ?? "0x...")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput),
      );

      await (interaction as StringSelectMenuInteraction).showModal(modal);
      return true;
    }

    const safeAddress = await safeModel.getAddress(guildId, guildId, chainId);
    assert(safeAddress, "Safe not found");

    payout.safeAddress = safeAddress;
    await (interaction as StringSelectMenuInteraction).update(
      renderSafePayoutSetupRow(payout),
    );

    return true;
  }

  if (interaction.customId.startsWith("payoutTokenSelect_")) {
    assert(tokenModel, "tokenModel required");

    const [_, payoutId] = interaction.customId.split("_");
    const payout = payouts[payoutId];
    if (!payout) {
      await interaction.reply({
        content: `Unable to find payout list, try searching again`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const selectedValue = interaction.values[0];
    assert(selectedValue, "Unable to find token, try again");

    const chainId = payout.chainId;
    assert(chainId, "Chain ID not found");

    const chainName = ChainsById[chainId]?.name ?? `Chain ID ${chainId}`;

    if (selectedValue === "ADD_TOKEN") {
      const modal = new ModalBuilder()
        .setCustomId(`addTokenModal_${payoutId}`)
        .setTitle(`Add New Token for ${chainName}`);

      const addressInput = new TextInputBuilder()
        .setCustomId("tokenAddress")
        .setLabel(`Add Token Address`)
        .setPlaceholder("0x...")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput),
      );

      await (interaction as StringSelectMenuInteraction).showModal(modal);
      return true;
    }

    const token = await tokenModel.getToken(
      interaction.guildId!,
      Number(chainId),
      selectedValue,
    );
    assert(token, "Token not found");

    // If an existing token was selected, set on payout.
    payout.tokenAddress = token.address;
    payout.decimals = token.decimals;

    if (payout.type === "csv-airdrop") {
      const generateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`csvAirdropGenerate_${payoutId}`)
          .setLabel("Generate CSV Airdrop file")
          .setStyle(ButtonStyle.Primary),
      );

      await (interaction as StringSelectMenuInteraction).update({
        content:
          `Token selected: **${token.symbol ?? ""}** \`${token.address}\`\n` +
          `Now generate the Safe CSV Airdrop transfer file.`,
        components: [generateRow],
      });
      return true;
    }

    await (interaction as StringSelectMenuInteraction).update(
      renderSafePayoutSetupRow(payout),
    );

    return true;
  }

  return false;
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Interaction,
  MessageFlags,
  PermissionsBitField,
} from "discord.js";
import assert from "assert";
import * as viem from "viem";

import ERC20_ABI from "../../erc20.abi";
import { Chains, ChainsById, getId, getViemChain } from "../../utils";

export type PayoutCommandsDeps = {
  safeGenerations: Record<string, any>;
  dispersePayouts: Record<string, any>;
  csvAirdropPayouts: Record<string, any>;
};

export async function handlePayoutCommands(
  interaction: Interaction,
  deps: PayoutCommandsDeps,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;

  const { safeGenerations, dispersePayouts, csvAirdropPayouts } = deps;

  if (interaction.commandName === "admin_safe_payout") {
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

    const tokenAddressInput = interaction.options.getString(
      "token_address",
      true,
    );
    const safeAddressInput = interaction.options.getString("safe_address", true);
    const donateAmount = interaction.options.getNumber("donate_amount") ?? 0;

    const [networkPrefix, safeAddress] = safeAddressInput.split(":");
    const chain = Chains.find(
      (c) => c.shortName.toLowerCase() === networkPrefix.toLowerCase(),
    );

    if (!chain) {
      await interaction.reply({
        content: `Please use the full safe address which includes a chain specific prefix, like "eth:0x123...", valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    // token may optionally include a prefix too
    let tokenAddress = tokenAddressInput;
    if (tokenAddressInput.includes(":")) {
      const [tokenNetworkPrefix, maybeTokenAddress] =
        tokenAddressInput.split(":");
      const tokenChain = Chains.find(
        (c) => c.shortName.toLowerCase() === tokenNetworkPrefix.toLowerCase(),
      );
      if (!tokenChain) {
        await interaction.reply({
          content: `Please use a valid chain prefix. Valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
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

    return true;
  }

  if (interaction.commandName === "admin_csv_airdrop_payout") {
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

    const chainId = interaction.options.getInteger("network", true);
    const chain = ChainsById[chainId];
    assert(chain, "Network not found");

    const donateAmount = interaction.options.getNumber("donate_amount") ?? 0;

    const tokenAddressInput = interaction.options.getString(
      "token_address",
      true,
    );

    let tokenAddress = tokenAddressInput;
    if (tokenAddressInput.includes(":")) {
      const [tokenNetworkPrefix, maybeTokenAddress] =
        tokenAddressInput.split(":");
      const prefChain = Chains.find(
        (c) => c.shortName.toLowerCase() === tokenNetworkPrefix.toLowerCase(),
      );
      if (!prefChain) {
        await interaction.reply({
          content: `Please use the full token address which includes a chain specific prefix, like "eth:0x123...", valid prefixes: ${Chains.map((x) => x.shortName).join(", ")}`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      assert(
        tokenNetworkPrefix === prefChain.shortName,
        "Token network must match the selected network",
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
    csvAirdropPayouts[id] = {
      id,
      chainId,
      donateAmount,
      tokenAddress,
      decimals,
      tokenName: name,
      tokenSymbol: symbol,
      type: "erc20",
    };

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

    return true;
  }

  if (interaction.commandName === "admin_disperse_payout") {
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

    const chainId = interaction.options.getInteger("network", true);
    const networkName = ChainsById[chainId]?.name || "Unknown Network";
    const donateAmount = interaction.options.getNumber("donate_amount") ?? 0;

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
    dispersePayouts[disperseId] = {
      id: disperseId,
      chainId,
      donateAmount,
    };

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

    return true;
  }

  return false;
}

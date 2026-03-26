import assert from "assert";
import ERC20_ABI from "./erc20.abi";
import * as viem from "viem";
import * as chains from "viem/chains";
import * as Models from './models'
import {
  User,
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
  Utils,
  GuildMember,
  Guild,
  Collection,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  CacheType,
  Message,
} from "discord.js";
import { keccak256, toBytes } from "viem";

export interface Payout {
  id:string;
  chainId?: number;
  csvData?: string;
  tokenAddress?: string;
  safeAddress?: string;
  decimals?: number;
  interaction?:StringSelectMenuInteraction<CacheType>;
  messageId?: string;
  channelId?: string;
  list: [GuildMember, { chain: ChainSummary; address: string; }[]][]
}
export type Payouts = Record<string,Payout> 

export function getId(): string {
  return Math.random().toString(36).substring(2, 9);
}
export function encodeKey(
  arr: (string | number)[],
  delimiter = "!",
): string {
  return arr.join(delimiter);
}

export function decodeKey(key: string, delimiter = "!"): string[] {
  return key.split(delimiter);
}
export const Chains = [
  { chainId: 1, name: "Ethereum Mainnet", currency: "ETH", shortName: "eth" },
  // { chainId: 3, name: "Ropsten Testnet", currency: "ETH" },
  // { chainId: 4, name: "Rinkeby Testnet", currency: "ETH" },
  // { chainId: 5, name: "Goerli Testnet", currency: "ETH" },
  // { chainId: 42, name: "Kovan Testnet", currency: "ETH" },
  // { chainId: 56, name: "Binance Smart Chain Mainnet", currency: "BNB" },
  // { chainId: 97, name: "Binance Smart Chain Testnet", currency: "BNB" },
  {
    chainId: 137,
    name: "Polygon Mainnet",
    currency: "MATIC",
    shortName: "matic",
  },
  // { chainId: 80001, name: "Mumbai Testnet", currency: "MATIC" },
  // { chainId: 43114, name: "Avalanche Mainnet", currency: "AVAX" },
  // { chainId: 43113, name: "Avalanche Fuji Testnet", currency: "AVAX" },
  // { chainId: 250, name: "Fantom Opera", currency: "FTM" },
  // { chainId: 4002, name: "Fantom Testnet", currency: "FTM" },
  { chainId: 42161, name: "Arbitrum One", currency: "ETH", shortName: "arb1" },
  // { chainId: 421611, name: "Arbitrum Rinkeby", currency: "ETH" },
  { chainId: 10, name: "Optimism", currency: "ETH", shortName: "oeth" },
  // { chainId: 69, name: "Optimism Kovan", currency: "ETH" },
  // { chainId: 100, name: "xDai Chain", currency: "xDAI" },
  // { chainId: 77, name: "POA Network Sokol", currency: "POA" },
  // { chainId: 99, name: "POA Network Core", currency: "POA" },
  // { chainId: 1666600000, name: "Harmony Mainnet Shard 0", currency: "ONE" },
  // { chainId: 1666700000, name: "Harmony Testnet Shard 0", currency: "ONE" },
  // { chainId: 128, name: "Huobi ECO Chain Mainnet", currency: "HT" },
  // { chainId: 256, name: "Huobi ECO Chain Testnet", currency: "HT" },
  // { chainId: 25, name: "Cronos Mainnet", currency: "CRO" },
  // { chainId: 338, name: "Cronos Testnet", currency: "CRO" },
  // { chainId: 1284, name: "Moonbeam", currency: "GLMR" },
  // { chainId: 1285, name: "Moonriver", currency: "MOVR" },
  // { chainId: 1287, name: "Moonbase Alpha", currency: "DEV" },
  // { chainId: 1663, name: "Metis Andromeda", currency: "METIS" },
  // { chainId: 1088, name: "Metis Stardust", currency: "METIS" },
  { chainId: 8453, name: "Base Mainnet", currency: "ETH", shortName: "base" },
  // { chainId: 84531, name: "Base Goerli Testnet", currency: "ETH" },
];

export interface ChainSummary {
  name: string;
  currency: string;
  shortName: string;
  chainId: number;
}

export function mapChainsById(): Record<number, ChainSummary> {
  return Chains.reduce(
    (acc, { chainId, name, currency, shortName }) => {
      acc[chainId] = { name, currency, shortName, chainId };
      return acc;
    },
    {} as Record<number, ChainSummary>,
  );
}

export const ChainsById = mapChainsById();

type GuildMembersCacheEntry = {
  fetchedAt: number;
  members: Collection<string, GuildMember>;
};

const guildMembersCache = new Map<string, GuildMembersCacheEntry>();
const guildMembersInFlight = new Map<string, Promise<Collection<string, GuildMember>>>();

export async function fetchGuildMembersCached(
  guild: Guild,
  opts?: { ttlMs?: number; allowStaleOnError?: boolean; forceRefresh?: boolean },
): Promise<Collection<string, GuildMember>> {
  const ttlMs = opts?.ttlMs ?? 60_000;
  const allowStaleOnError = opts?.allowStaleOnError ?? true;
  const forceRefresh = opts?.forceRefresh ?? false;

  const now = Date.now();
  const existing = guildMembersCache.get(guild.id);

  if (!forceRefresh && existing && now - existing.fetchedAt < ttlMs) {
    return existing.members;
  }

  const inFlight = guildMembersInFlight.get(guild.id);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    try {
      await guild.members.fetch();
      const members = guild.members.cache;
      guildMembersCache.set(guild.id, { fetchedAt: Date.now(), members });
      return members;
    } catch (err) {
      if (allowStaleOnError && existing) {
        return existing.members;
      }
      throw err;
    } finally {
      guildMembersInFlight.delete(guild.id);
    }
  })();

  guildMembersInFlight.set(guild.id, fetchPromise);
  return fetchPromise;
}

export interface RpcParams {
  id: string | undefined;
  ip: string | undefined;
  token: string | undefined;
  params: unknown;
  method: string;
}
export type RpcFunction = (params: RpcParams) => Promise<unknown | void>;

export function RpcFactory(
  api: Record<
    string,
    (...args: unknown[]) => Promise<JSON | void> | JSON | void
  >,
): RpcFunction {
  return async (params: RpcParams) => {
    const method = api[params.method];
    assert(method, "No method by that name");
    return method(params.params);
  };
}

export function getViemChain(chainId: number): viem.Chain {
  const chain = Object.values(chains).find((chain) => chain.id === chainId);
  if (!chain) {
    throw new Error(`Chain ${chainId} not found`);
  }
  return chain;
}

export const stringifyReplacer = (_: string, value: any) =>
  value === undefined ? null : value;

const serializeJSONObject = (json: any): string => {
  if (Array.isArray(json)) {
    return `[${json.map((el) => serializeJSONObject(el)).join(",")}]`;
  }

  if (typeof json === "object" && json !== null) {
    let acc = "";
    const keys = Object.keys(json).sort();
    acc += `{${JSON.stringify(keys, stringifyReplacer)}`;

    for (const key of keys) {
      acc += `${serializeJSONObject(json[key])},`;
    }

    return `${acc}}`;
  }

  return `${JSON.stringify(json, stringifyReplacer)}`;
};

/**
 * Computes the Safe transaction builder checksum using keccak256 hash
 * over the deterministic JSON string (with `meta.name` nullified).
 */
export function calculateSafeChecksum(batchJson: any): string | undefined {
  const normalized = {
    ...batchJson,
    meta: {
      ...batchJson.meta,
      name: null, // required: exclude `meta.name` from the hash
    },
  };
  const serialized = serializeJSONObject(normalized);
  return keccak256(toBytes(serialized));
}

/**
 * Converts a list of [address, amount] tuples into a Gnosis Safe transaction batch JSON,
 * and computes a checksum for the batch metadata.
 * @param params Object containing:
 *   - entries: Array<[string, string]>; // [toAddress, amount] as string (amount can be decimal)
 *   - chainId: number;
 *   - safeAddress: string;
 *   - erc20Address: string;
 *   - decimals: number;
 *   - txBuilderVersion?: string;
 *   - description?: string;
 * @returns The Safe transaction batch JSON object.
 */
export function generateSafeTransactionBatch(params: {
  entries: [string, string][];
  chainId: number;
  safeAddress: string;
  erc20Address: string;
  decimals: number;
  txBuilderVersion?: string;
  description?: string;
}) {
  const {
    entries,
    chainId,
    safeAddress,
    erc20Address,
    decimals,
    txBuilderVersion = "1.18.0",
    description = "",
  } = params;

  const transactions: any[] = [];
  let totalAmount = BigInt(0);
  const errors: string[] = [];

  entries.forEach(([toaddress, amount], index) => {
    if (
      typeof amount === "string" &&
      amount.trim().length > 0 &&
      typeof toaddress === "string" &&
      toaddress.trim().length > 0
    ) {
      try {
        const decimalFactor = BigInt(10) ** BigInt(decimals);
        const [whole, fraction = "0"] = amount.trim().split(".");
        const wholePart = BigInt(whole) * decimalFactor;
        const fractionPart = BigInt(fraction.padEnd(decimals, "0"));
        const totalValue = wholePart + fractionPart;
        totalAmount += totalValue;

        transactions.push({
          to: viem.getAddress(erc20Address),
          value: "0",
          data: null,
          contractMethod: {
            inputs: [
              { name: "to", type: "address", internalType: "address" },
              { name: "value", type: "uint256", internalType: "uint256" },
            ],
            name: "transfer",
            payable: false,
          },
          contractInputsValues: {
            to: viem.getAddress(toaddress.trim()),
            value: totalValue.toString(),
          },
        });
      } catch (e) {
        errors.push(`Line ${index + 1}: Error parsing amount "${amount}"`);
      }
    } else {
      if (!amount || amount.trim().length === 0) {
        errors.push(`Line ${index + 1}: Missing 'amount'`);
      }
      if (!toaddress || toaddress.trim().length === 0) {
        errors.push(`Line ${index + 1}: Missing 'toaddress'`);
      }
    }
  });

  // Prepare the batch object without checksum
  const createdAt = Date.now();
  const metaWithoutChecksum = {
    name: "Transactions Batch",
    description: description,
    txBuilderVersion: txBuilderVersion,
    createdFromSafeAddress: safeAddress,
    createdFromOwnerAddress: "",
    // checksum will be added after calculation
  };

  const batchWithoutChecksum = {
    version: "1.0",
    chainId: String(chainId),
    createdAt,
    meta: metaWithoutChecksum,
    transactions: transactions,
  };

  // Calculate checksum using modular function
  const checksum = calculateSafeChecksum(batchWithoutChecksum);

  // Add checksum to meta
  const metaWithChecksum = {
    ...metaWithoutChecksum,
    checksum,
  };

  const batch = {
    ...batchWithoutChecksum,
    meta: metaWithChecksum,
  };

  return {
    batch,
    totalAmount,
    errors,
    totalAmountFormatted: (
      Number(totalAmount) / Math.pow(10, decimals)
    ).toFixed(decimals),
  };
}

/**
 * Attempts to resolve a Discord user from a "MaybeId" string, which could be:
 * - a Discord user ID (snowflake)
 * - a Discord username with discriminator (e.g. "user#1234")
 * - a Discord global username (e.g. "@username" or "username")
 * - a Discord display name (nickname in a guild)
 *
 * @param client The Discord.js Client instance
 * @param maybeId The identifier to resolve
 * @param guildId The guild ID to search in (required)
 * @returns The resolved User object, or null if not found
 */
export async function resolveDiscordUser(
  client: Client,
  maybeId: string,
  guildId: string,
): Promise<User | null> {
  // Normalize (support "Display Name (@username)" or "Display Name (username)")
  const trimmed = maybeId.trim();
  const parenMatch = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(trimmed);
  if (parenMatch) {
    const inner = parenMatch[2].trim();
    const innerNoAt = inner.startsWith("@") ? inner.slice(1) : inner;

    // Prefer resolving by the "unique name" inside parentheses first.
    const byInner = await resolveDiscordUser(client, innerNoAt, guildId);
    if (byInner) return byInner;

    // Fall back to resolving by the outer display name.
    maybeId = parenMatch[1].trim();
  } else {
    maybeId = trimmed;
  }

  // Try direct user ID (snowflake)
  const idMatch = /^\d{15,21}$/.exec(maybeId);
  if (idMatch) {
    try {
      return await client.users.fetch(maybeId);
    } catch {
      // continue
    }
  }

  // Try username#discriminator
  const tagMatch = /^(.+)#(\d{4})$/.exec(maybeId);
  if (tagMatch) {
    const [_, username, discriminator] = tagMatch;
    try {
      const guild = await client.guilds.fetch(guildId);
      const members = await guild.members.fetch({ query: username, limit: 10 });
      const found = members.find(
        (m: GuildMember) =>
          m.user.username === username &&
          m.user.discriminator === discriminator,
      );
      if (found) return found.user;
    } catch {
      // ignore
    }
  }

  // Try global username (with or without @)
  let usernameQuery = maybeId;
  if (usernameQuery.startsWith("@")) usernameQuery = usernameQuery.slice(1);
  if (usernameQuery.length > 2) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const members = await guild.members.fetch({
        query: usernameQuery,
        limit: 10,
      });
      const found = members.find(
        (m: GuildMember) => m.user.username === usernameQuery,
      );
      if (found) return found.user;
    } catch {
      // ignore
    }
  }

  // Try display name/nickname in the guild
  try {
    const guild = await client.guilds.fetch(guildId);
    const members = await guild.members.fetch({ query: maybeId, limit: 10 });
    const found = members.find(
      (m: GuildMember) => m.displayName === maybeId || m.nickname === maybeId,
    );
    if (found) return found.user;
  } catch {
    // ignore
  }

  // Not found
  return null;
}

interface DiscordUser {
  user:{tag:string}
  id:string;
  displayName:string;
}
export function renderUser(
  user: DiscordUser,
  addresses: { chain: ChainSummary; address: string }[],
) {
  if (addresses.length === 0)
    return `No addresses found for **${user.displayName}** (${user.user.tag}, ${user.id}).`;

  const msg = [
    `${addresses.length} Addresses set for **${user.displayName}** (${user.user.tag}, ${user.id}):\`\`\`\n`,
  ];

  // Sort addresses by chain name
  addresses.sort((a, b) => a.chain.name.localeCompare(b.chain.name));

  addresses.forEach(({ chain, address }, index) => {
    // Align the addresses by calculating the maximum length of the chain name and chain ID
    const chainInfo = `${chain.name}(${chain.chainId}):`;
    const padding =
      Math.max(
        ...addresses.map(
          ({ chain }) => `${chain.name}(${chain.chainId}):`.length,
        ),
      ) + 1; // +2 for spacing
    msg.push(`${index + 1}. ${chainInfo.padEnd(padding)} ${address}`);
  });

  return msg.join("\n") + "```";
}

export function renderUsers(
  users: [DiscordUser, { chain: ChainSummary; address: string }[]][],
): string {
  if (users.length === 0) return "No users found.";

  const messages = users.map(([user, addresses]) => {
    return renderUser(user, addresses);
  });

  return messages.join("\n\n");
}


export function renderPayoutPrefill(
  users: [DiscordUser, { chain: ChainSummary; address: string }[]][],
): string {
  return users
    .map(([user]) => `${user.user.tag},0`)
    .join("\n");
}

/**
 * Utility to generate Disperse payout CSV content, summary, and file info.
 *
 * @param {Object[]} addressEntries - Array of [address, amount] tuples (string, string)
 * @param {number} chainId - Chain id for lookup
 * @param {number} donateAmount - Donation amount (pass 0 if not donating)
 * @param {string[]} errors - Error strings to append to final message
 * @param {string | undefined} donateAddress - Address for donation (nullable/undefined if not donating)
 * @param {string} [dateStr] - (optional) precomputed YYYY-MM-DD string, otherwise generated from now
 * @returns {{
 *   csvContent: string,
 *   description: string,
 *   file: { name: string, attachment: Buffer },
 *   totalAmount: number
 * }}
 */
export function dispersePayout({
  addressEntries,
  chainId,
  donateAmount,
  errors = [],
  donateAddress,
  dateStr,
}: {
  addressEntries: [string, string][],
  chainId: number,
  donateAmount: number,
  errors?: string[],
  donateAddress?: string,
  dateStr?: string,
}) {
  // Optionally add donation
  const entries = [...addressEntries];
  const hasDonation =
    donateAmount > 0 &&
    typeof donateAddress === "string" &&
    donateAddress.length > 0;

  if (hasDonation) {
    entries.push([donateAddress, donateAmount.toString()]);
  }

  // CSV header
  const csvContent =
    [
      "receiverAddress,value",
      ...entries.map(([address, amount]) => `${address},${amount}`),
    ].join("\n");

  // Date string for file naming
  const date =
    dateStr ||
    (() => {
      const now = new Date();
      return now.toISOString().slice(0, 10);
    })();

  const file = {
    name: `disperse_${date}.csv`,
    attachment: Buffer.from(csvContent, "utf-8"),
  };

  // Chain name via ChainsById, fallback if not imported
  const chainName = ChainsById[chainId]?.name ?? "Unknown Chain";

  // Calculate total amount
  const totalAmount = entries.reduce(
    (acc, [, amount]) => acc + parseFloat(amount),
    0,
  );

  let description = `✅ Disperse CSV generated for ${entries.length} entries on ${chainName} (${chainId}).`;
  if (hasDonation) {
    description += `\nYou are donating ${donateAmount.toFixed(4)}, thank you! ❤️`;
  }
  description += `\n💸 ___Total amount to transfer___: **${totalAmount}**`;
  if (errors.length > 0) {
    description += `\n\n⚠️ Some issues were found:\n\`\`\`\n${errors.join(
      "\n",
    )}\n\`\`\``;
  }

  return {
    csvContent,
    description,
    file,
    totalAmount,
  };
}

/**
 * Resolves CSV data into blockchain addresses and collects errors.
 * 
 * @param params
 *  - client: The Discord client instance to resolve users.
 *  - csvData: The raw CSV data (string).
 *  - guildId: The Discord guild/server ID in which to resolve names.
 *  - userModel: Object with getAddress(userId, guildId, chainId) method.
 *  - chainId: Number representing the blockchain to resolve for.
 * @returns Promise<{ addressEntries: Array<[string, string]>, errors: string[] }>
 */
export async function parseRecipientsCsvAndResolveAddresses({
  client,
  csvData,
  guildId,
  userModel,
  chainId,
}: {
  client: any;
  csvData: string;
  guildId: string;
  userModel: { getAddress: (userId: string, guildId: string, chainId: number) => Promise<string | undefined> };
  chainId: number;
}): Promise<{ addressEntries: [string, string][], errors: string[] }> {
  // Parse CSV lines into [id, amount] pairs
  const lines = csvData
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const errors: string[] = [];
  const userIdToAmount: Record<string, string> = {};
  const userIdToUser: Record<string, any> = {};

  // 1. Resolve Discord users
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let idRaw = "";
    let amountRaw = "";

    // Preferred: delimiter-based parsing (comma, tab, equals), preserving spaces in identifiers.
    // This supports values like: "Display Name (@unique_name),0"
    const delimited = /^(.*)[\t,=]\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*$/i.exec(
      line,
    );
    if (delimited) {
      idRaw = delimited[1]?.trim() ?? "";
      amountRaw = delimited[2]?.trim() ?? "";
    } else {
      // Legacy fallback: exactly two whitespace-separated tokens (e.g. "123456789 1.5").
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

    try {
      const user = await resolveDiscordUser(client, idRaw, guildId);
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
    const user = userIdToUser[userId];
    const userDisplayName = user ? user.username : "Unknown";
    const userUniqueName = user
      ? `${user.username}#${user.discriminator}`
      : "Unknown#0000";
    try {
      const address = await userModel.getAddress(
        userId,
        guildId,
        chainId
      );
      if (!address) {
        errors.push(
          `User ${userId} (${userDisplayName}, ${userUniqueName}): No address found for chain ${chainId}`
        );
        continue;
      }
      addressEntries.push([address, userIdToAmount[userId]]);
    } catch (e) {
      errors.push(
        `User ${userId} (${userDisplayName}, ${userUniqueName}): Error looking up address`
      );
      continue;
    }
  }

  return { addressEntries, errors };
}
// INSERT_YOUR_CODE

/**
 * Renders a token select menu row for payout flows.
 * @param {Object} params
 * @param {object} params.payout - The payout object containing at least payoutId and chainId.
 * @param {object} params.tokenModel - The tokenModel (must implement getTokensByGuild).
 * @param {string} params.guildId - The guild ID to look up token addresses.
 * @returns {Promise<ActionRowBuilder<StringSelectMenuBuilder>>}
 */
export async function renderTokenSelectRowForPayout({
  payout,
  tokenModel,
  guildId,
}:{payout:Payout,tokenModel:Models.Tokens, guildId:string}) {
  const payoutId = payout.id 
  const selectedChainId = payout.chainId;
  if (!payoutId || !selectedChainId) throw new Error('Missing payoutId or chainId');
  // Get saved tokens for this guild
  const savedTokens = await tokenModel.getTokensByGuild(guildId);
  // Filter tokens by selected chain
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

  // Build and return the select menu row
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`payoutTokenSelect_${payoutId}`)
        .setPlaceholder("Choose an existing token, or add a new one")
        .addOptions(tokenOptions)
    );
}

/**
 * Renders the action row for Safe payout setup with token/safe edit buttons and status.
 * @param {Object} params
 * @param {object} params.payout - The payout object with payoutId, tokenAddress, safeAddress etc.
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function renderSafePayoutSetupRow(payout :Payout) {
  const payoutId = payout.id
  if (!payoutId) throw new Error('Missing payoutId');

  const chainId = payout.chainId;
  if (!chainId) throw new Error('Missing chain');

  const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`setTokenButton_${payoutId}`)
      .setLabel(payout.tokenAddress ? "Edit Token Address" : "Set Token Address")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`setSafeButton_${payoutId}`)
      .setLabel(payout.safeAddress ? "Edit Safe Address" : "Set Safe Address")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`safePayoutGenerate_${payoutId}`)
      .setLabel("Generate Safe Payout")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!(payout.tokenAddress && payout.safeAddress))
  )];
  // Compose status info for user context
  const tokenAddrStr = payout.tokenAddress
    ? `**Token Address:** \`${payout.tokenAddress}\``
    : "*No token address set*";
  const safeAddrStr = payout.safeAddress
    ? `**Safe Address:** \`${payout.safeAddress}\``
    : "*No safe address set*";
  return {
    content:
      `Safe payout setup for ${ChainsById[chainId]?.name ?? chainId}:\n${tokenAddrStr}\n${safeAddrStr}`,
    components,
  };
}

/**
 * Renders the data for the admin_manage_safes screen, for use in a Discord reply.
 * This builds the summary and action row, but does not send a reply.
 * 
 * @param {object} params
 * @param {Array} params.allSafes - Array of all safe address objects for this guild.
 * @returns {{ content: string, components: [ActionRowBuilder<ButtonBuilder>] }}
 */
interface Safe {
  userId: string;
  chainId: number;
  address: string;
}
type Safes = Safe[]
export function getAdminManageSafesDisplay({ allSafes, prefix='manageSafe' }:{allSafes:Safes, prefix?:string}) {
  // Compose per-chain summary
  const perChainSummary = Chains.map((chain) => {
    const safeForChain = allSafes.find(
      (safe) => safe.chainId === chain.chainId
    );
    if (safeForChain) {
      return `**${chain.name}**: \`${safeForChain.address}\``;
    } else {
      return `**${chain.name}**: _None_`;
    }
  }).join("\n");

  // Buttons
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_add`)
      .setLabel("Add Safe")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${prefix}_remove`)
      .setLabel("Remove Safe")
      .setStyle(ButtonStyle.Danger)
  );

  const content =
    `**Manage Guild Safe Addresses**\n` +
    `Use the buttons below to add or remove a safe address for a specific chain.\n` +
    `_Safes must be added with network prefix and address_\n\n` +
    perChainSummary;

  return {
    content,
    components: [buttonRow],
  };
}
/**
 * Renders a Discord dropdown for selecting a token to remove from a specific chain.
 * 
 * @param {Object} params
 * @param {number} params.chainId - The selected chain id
 * @param {Array} params.tokensOnChain - Tokens to display (Models.Token[])
 * @param {string} [params.prefix="manageTokens"] - Prefix for customId
 * @returns {{ content: string, components: [ActionRowBuilder<StringSelectMenuBuilder>] }}
 */
export function selectTokenToRemoveDisplay({
  chainId,
  tokensOnChain,
  prefix = "manageTokens"
}: {
  chainId: number,
  tokensOnChain: Models.Token[],
  prefix?: string
}) {
  // Compose dropdown options, use symbol + short address as label
  const options = tokensOnChain.map(token => ({
    label: token.symbol ? `${token.symbol}` : token.address.slice(0, 6) + "...",
    description: token.name
      ? `${token.name} - ${token.address.slice(0, 6)}...${token.address.slice(-4)}`
      : `${token.address.slice(0, 6)}...${token.address.slice(-4)}`,
    value: `${token.address}`
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}_removeSelect_${chainId}`)
    .setPlaceholder('Select a token to remove')
    .addOptions(options)
    .setMinValues(1)
    .setMaxValues(1);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  // Compose user prompt
  const content = `❌ **Remove a Token from ${ChainsById[chainId]?.name ?? chainId}**\nSelect the token you wish to remove from this network:`;

  return {
    content,
    components: [row]
  };
}
export function getAdminManageTokensDisplay({
  allTokens,
  prefix = 'manageTokens',
  selectedNetwork, // optional, controls enabling add/remove buttons
}: {
  allTokens: Models.Token[],
  prefix?: string,
  selectedNetwork?: string, // (optional) string - "all" or chainId as string
}) {
  // Compose per-chain token summary; each chain can have multiple tokens.
  const perChainSummary = Chains.map((chain) => {
    const tokensOnChain = allTokens.filter(
      (token) => token.chainId === chain.chainId
    );

    if (tokensOnChain.length > 0) {
      const sorted = [...tokensOnChain].sort((a, b) =>
        (a.symbol || "").localeCompare(b.symbol || ""),
      );

      const symbolCol = Math.min(
        12,
        Math.max(3, ...sorted.map((t) => (t.symbol || "?").length)),
      );

      const tokensList =
        "```\n" +
        sorted
          .map((token) => {
            const symbol = (token.symbol || "?").padEnd(symbolCol);
            const name = token.name ? `  ${token.name}` : "";
            return `${symbol}  ${token.address}${name}`;
          })
          .join("\n") +
        "\n```";

      return `**${chain.name}**:\n${tokensList}`;
    } else {
      return `**${chain.name}**: _No tokens added_`;
    }
  }).join('\n\n');

  // Network dropdown for selecting which network to add or remove tokens from
  const networkDropdownRow = selectNetworkDropdown({
    allNetworks: Chains,
    prefix: `${prefix}_networkSelect`,
    selectedNetwork
  }).components[0];

  // The add/remove buttons are disabled unless a network is selected.
  // Comment: You must select a network to enable the Add/Remove Token buttons.
  const enableButtons = typeof selectedNetwork !== "undefined" && selectedNetwork !== "" && selectedNetwork !== "all";

  // If a network is selected, append the network number to the custom id
  const addCustomId = enableButtons ? `${prefix}_add_${selectedNetwork}` : `${prefix}_add`;
  const removeCustomId = enableButtons ? `${prefix}_remove_${selectedNetwork}` : `${prefix}_remove`;

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(addCustomId)
      .setLabel("Add Token")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!enableButtons),
    new ButtonBuilder()
      .setCustomId(removeCustomId)
      .setLabel("Remove Token")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!enableButtons)
  );

  const content =
    `**Manage Guild ERC-20 Tokens**\n` +
    `_All your tokens are shown below by network. You must select a network from the dropdown to add or remove tokens._\n\n` +
    perChainSummary + 
    `\n\nSelect a network below to enable the add/remove buttons for that network.\n`

  return {
    content,
    components: [networkDropdownRow, buttonRow],
  };
}

export function selectNetworkDropdown(params: {
  allNetworks: ChainSummary[],
  prefix?: string,
  selectedNetwork?: string, // Optional parameter for the selected network
}) {
  const {
    allNetworks,
    prefix = "networkSelect",
    selectedNetwork
  } = params;

  // Option: "All"
  const options = [
    ...allNetworks.map(net => ({
      label: net.name,
      value: String(net.chainId),
      description: net.shortName ? `(${net.shortName.toUpperCase()})` : undefined,
      default: selectedNetwork === String(net.chainId)
    })),
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}_dropdown`)
    .setPlaceholder("Select a network...")
    .addOptions(options);

  const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  return {
    components: [actionRow],
  };
}

/**
 * Default token management display, shows Add/Remove buttons and optionally a network dropdown.
 * This is meant for the normal "manage tokens" view, not for the removal select flow.
 */
export function tokenSelectionDisplay({
  allTokens,
  prefix = "manageTokens",
  selectedNetwork,
}: {
  allTokens: Models.Token[],
  prefix?: string,
  selectedNetwork?: string, // "all" or chainId as string
}) {
  // If selectedNetwork is undefined, default to "all"
  const actualSelectedNetwork = typeof selectedNetwork === "undefined" ? "all" : selectedNetwork;

  // Early return: No tokens at all
  if (!allTokens || allTokens.length === 0) {
    return {
      content: "No tokens available to manage.",
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${prefix}_add`)
            .setLabel("Add Token")
            .setStyle(ButtonStyle.Success)
        )
      ]
    };
  }

  // Compose a simple per-network summary
  const summaryLines = allTokens.map(token => {
    const chainLabel = (ChainsById[token.chainId]?.name)
      || token.chainId
      || "Unknown";
    return `• **${token.symbol}** on ${chainLabel}: \`${token.address.slice(0, 6)}...${token.address.slice(-4)}\`` +
      (token.name ? ` — ${token.name}` : "");
  }).join("\n");

  // Add/remove buttons
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_add`)
      .setLabel("Add Token")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${prefix}_remove`)
      .setLabel("Remove Token")
      .setStyle(ButtonStyle.Danger)
  );

  return {
    content: `**Manage Guild Tokens**\n${summaryLines ? `\n${summaryLines}\n` : "\n_No tokens currently registered._\n"}`,
    components: [buttonRow],
  };
}

/**
 * Shows the user a token selection menu to remove a token from a network.
 * Intended as a confirmation/removal select step.
 */
export function tokenRemovalSelectionDisplay({
  allTokens,
  chainId,
  prefix = "manageTokens"
}: {
  allTokens: Models.Token[],
  chainId: number,
  prefix?: string
}) {
  // Only tokens on this network
  const tokensOnChain = allTokens.filter(token => token.chainId === chainId);

  if (!tokensOnChain || tokensOnChain.length === 0) {
    return {
      content: `No tokens available to remove for ${ChainsById[chainId]?.name ?? `chain ${chainId}`}.`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${prefix}_add_${chainId}`)
            .setLabel("Add Token")
            .setStyle(ButtonStyle.Success)
        )
      ]
    }
  }

  // Compose select menu options for these tokens
  const menuOptions = tokensOnChain.map(token => ({
    label: `${token.symbol ?? token.address.slice(0, 6) + "..."}`,
    description: token.name
      ? `${token.name} - ${token.address.slice(0, 6)}...${token.address.slice(-4)}`
      : `${token.address.slice(0, 6)}...${token.address.slice(-4)}`,
    value: `${token.address}`
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}_removeSelect_${chainId}`)
    .setPlaceholder(
      menuOptions.length === 0
        ? "No tokens for this network."
        : "Select a token to remove"
    )
    .setDisabled(menuOptions.length === 0)
    .addOptions(
      menuOptions.slice(0, 25)
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  // Compose cancel row
  const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    content: `❌ **Remove a Token from ${ChainsById[chainId]?.name ?? chainId}**\nSelect the token you wish to remove from this network:`,
    components: [row, cancelRow]
  };
}

// viem, chainId, tokenAddress, guildId required
export async function fetchErc20TokenInfo({
  chainId,
  tokenAddress,
  guildId,
}: {
  chainId: number,
  tokenAddress: string,
  guildId: string,
}): Promise<{
  guildId: string,
  chainId: number,
  name: string,
  symbol: string,
  decimals: number,
  address: string,
}> {
  const viemChain = getViemChain(chainId);
  assert(viemChain, `Chain ${chainId} not found`);

  const address = viem.getAddress(tokenAddress);

  const erc20 = viem.getContract({
    address,
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

  return {
    guildId,
    chainId,
    name,
    symbol,
    decimals,
    address: tokenAddress,
  };
}
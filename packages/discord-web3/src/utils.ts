import assert from "assert";
import * as viem from "viem";
import * as chains from "viem/chains";
import { Client, User, GuildMember } from "discord.js";
import { keccak256, toBytes } from "viem";

export function getId(): string {
  return Math.random().toString(36).substring(2, 9);
}
export function encodeKey(
  arr: (string | number)[],
  delimiter: string = "!",
): string {
  return arr.join(delimiter);
}

export function decodeKey(key: string, delimiter: string = "!"): string[] {
  return key.split(delimiter);
}
export const Chains = [
  { chainId: 1, name: "Ethereum Mainnet", currency: "ETH" },
  // { chainId: 3, name: "Ropsten Testnet", currency: "ETH" },
  // { chainId: 4, name: "Rinkeby Testnet", currency: "ETH" },
  // { chainId: 5, name: "Goerli Testnet", currency: "ETH" },
  // { chainId: 42, name: "Kovan Testnet", currency: "ETH" },
  // { chainId: 56, name: "Binance Smart Chain Mainnet", currency: "BNB" },
  // { chainId: 97, name: "Binance Smart Chain Testnet", currency: "BNB" },
  { chainId: 137, name: "Polygon Mainnet", currency: "MATIC" },
  // { chainId: 80001, name: "Mumbai Testnet", currency: "MATIC" },
  // { chainId: 43114, name: "Avalanche Mainnet", currency: "AVAX" },
  // { chainId: 43113, name: "Avalanche Fuji Testnet", currency: "AVAX" },
  // { chainId: 250, name: "Fantom Opera", currency: "FTM" },
  // { chainId: 4002, name: "Fantom Testnet", currency: "FTM" },
  { chainId: 42161, name: "Arbitrum One", currency: "ETH" },
  // { chainId: 421611, name: "Arbitrum Rinkeby", currency: "ETH" },
  { chainId: 10, name: "Optimism", currency: "ETH" },
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
  { chainId: 8453, name: "Base Mainnet", currency: "ETH" },
  // { chainId: 84531, name: "Base Goerli Testnet", currency: "ETH" },
];

export function mapChainsById(): Record<
  number,
  { name: string; currency: string }
> {
  return Chains.reduce(
    (acc, { chainId, name, currency }) => {
      acc[chainId] = { name, currency };
      return acc;
    },
    {} as Record<number, { name: string; currency: string }>,
  );
}

export const ChainsById = mapChainsById();

export type RpcParams = {
  id: string | undefined;
  ip: string | undefined;
  token: string | undefined;
  params: unknown;
  method: string;
};
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

    for (let i = 0; i < keys.length; i++) {
      acc += `${serializeJSONObject(json[keys[i]])},`;
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
  entries: Array<[string, string]>;
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
  // Try direct user ID (snowflake)
  const idMatch = maybeId.match(/^\d{15,21}$/);
  if (idMatch) {
    try {
      return await client.users.fetch(maybeId);
    } catch {
      // continue
    }
  }

  // Try username#discriminator
  const tagMatch = maybeId.match(/^(.+)#(\d{4})$/);
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

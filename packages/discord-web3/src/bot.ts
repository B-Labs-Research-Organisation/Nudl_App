import assert from "assert";
import dotenv from "dotenv";
import { Client, GatewayIntentBits, REST } from "discord.js";
import { createClient as createRedisClient } from "redis";
import { Chains, ChainSummary, Payouts } from "./utils";
import {
  MapStore,
  RedisStore,
  Store,
  Tokens as createTokens,
  Users as createUsers,
} from "./models";

dotenv.config();

type UsersModel = ReturnType<typeof createUsers>;
type TokensModel = ReturnType<typeof createTokens>;

export interface ManageSafeSession {
  id: string;
  chainId?: number;
  safeAddress?: string;
}

export interface SafeGenerationSession {
  id: string;
  chainId: number;
  safeAddress?: string;
  tokenAddress?: string;
  decimals?: number;
  tokenName?: string;
  tokenSymbol?: string;
  donateAmount: number;
  recipients?: UsersModel;
}

export interface DispersePayoutSession {
  id: string;
  chainId: number;
  donateAmount: number;
  recipients?: UsersModel;
}

export interface CsvAirdropPayoutSession {
  id: string;
  type: string;
  chainId: number;
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  decimals: number;
  donateAmount: number;
  tokenId?: number;
  recipients?: UsersModel;
}

export type ManageSafesStore = Record<string, ManageSafeSession>;
export type SafeGenerationsStore = Record<string, SafeGenerationSession>;
export type DispersePayoutStore = Record<string, DispersePayoutSession>;
export type CsvAirdropPayoutStore = Record<string, CsvAirdropPayoutSession>;
export type PayoutStore = Payouts;

export interface BotStores {
  manageSafes: ManageSafesStore;
  safeGenerations: SafeGenerationsStore;
  dispersePayouts: DispersePayoutStore;
  csvAirdropPayouts: CsvAirdropPayoutStore;
  payouts: PayoutStore;
  ui: {
    /** key: `${guildId}:${userId}` */
    lastUserAddressesHub: Record<string, { channelId: string; messageId: string }>;
    /** key: `${guildId}:${userId}` */
    pendingAddressOverride: Record<string, { chainId: number; address: string }>;
  };
}

export interface BotModels {
  users: UsersModel;
  safes: UsersModel;
  tokens: TokensModel;
}

export interface BotConfig {
  discordToken: string;
  clientId: string;
  redisUrl?: string;
  chains: ChainSummary[];
}

export interface BotContext {
  client: Client;
  rest: REST;
  config: BotConfig;
  models: BotModels;
  stores: BotStores;
  logger: Console;
}

async function createStores(redisUrl?: string): Promise<BotModels> {
  let userStore: Store<string, string>;
  let tokenStore: Store<string, string>;
  let safeStore: Store<string, string>;

  if (redisUrl) {
    const redisClient = createRedisClient({ url: redisUrl });
    await redisClient.connect();
    userStore = new RedisStore(redisClient, "discord-web3");
    tokenStore = new RedisStore(redisClient, "discord-web3-tokens");
    safeStore = new RedisStore(redisClient, "discord-web3-safes");
  } else {
    userStore = new MapStore();
    tokenStore = new MapStore();
    safeStore = new MapStore();
  }

  const users = createUsers(userStore);
  const safes = createUsers(safeStore);
  const tokens = createTokens(tokenStore);

  return { users, safes, tokens };
}

export async function createBot(): Promise<BotContext> {
  const discordToken = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const redisUrl = process.env.REDIS_URL;

  assert(discordToken, "DISCORD_TOKEN is required");
  assert(clientId, "CLIENT_ID is required");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  const rest = new REST({ version: "10" }).setToken(discordToken);

  const models = await createStores(redisUrl);

  const stores: BotStores = {
    manageSafes: {},
    safeGenerations: {},
    dispersePayouts: {},
    csvAirdropPayouts: {},
    payouts: {},
    ui: {
      lastUserAddressesHub: {},
      pendingAddressOverride: {},
    },
  };

  return {
    client,
    rest,
    config: {
      discordToken,
      clientId,
      redisUrl,
      chains: Chains,
    },
    models,
    stores,
    logger: console,
  };
}

export async function start(context: BotContext): Promise<void> {
  await context.client.login(context.config.discordToken);
}

import { isAddress } from "viem";
import { encodeKey, decodeKey } from "./utils";
import { createClient } from "redis";

export interface Store<K, V> {
  set(key: K, value: V): Promise<this>;
  get(key: K): Promise<V | undefined>;
  has(key: K): Promise<boolean>;
  delete(key: K): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
  keys(): Promise<IterableIterator<K>>;
  values(): Promise<IterableIterator<V>>;
  entries(): Promise<IterableIterator<[K, V]>>;
}

export class MapStore<K, V> implements Store<K, V> {
  private map: Map<K, V>;

  constructor() {
    this.map = new Map<K, V>();
  }

  async set(key: K, value: V): Promise<this> {
    this.map.set(key, value);
    return this;
  }

  async get(key: K): Promise<V | undefined> {
    return this.map.get(key);
  }

  async has(key: K): Promise<boolean> {
    return this.map.has(key);
  }

  async delete(key: K): Promise<boolean> {
    return this.map.delete(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }

  async size(): Promise<number> {
    return this.map.size;
  }

  async keys(): Promise<IterableIterator<K>> {
    return this.map.keys();
  }

  async values(): Promise<IterableIterator<V>> {
    return this.map.values();
  }

  async entries(): Promise<IterableIterator<[K, V]>> {
    return this.map.entries();
  }
}

export class RedisStore<K, V> implements Store<K, V> {
  private client: ReturnType<typeof createClient>;
  private partitionKey: string;

  constructor(client: ReturnType<typeof createClient>, partitionKey: string) {
    this.client = client;
    this.partitionKey = partitionKey;
  }

  private getPartitionedKey(key: K): string {
    return `${this.partitionKey}:${String(key)}`;
  }

  async set(key: K, value: V): Promise<this> {
    await this.client.set(this.getPartitionedKey(key), JSON.stringify(value));
    return this;
  }

  async get(key: K): Promise<V | undefined> {
    const value = await this.client.get(this.getPartitionedKey(key));
    return value ? JSON.parse(value) : undefined;
  }

  async has(key: K): Promise<boolean> {
    const exists = await this.client.exists(this.getPartitionedKey(key));
    return exists === 1;
  }

  async delete(key: K): Promise<boolean> {
    const result = await this.client.del(this.getPartitionedKey(key));
    return result === 1;
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(`${this.partitionKey}:*`);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async size(): Promise<number> {
    const keys = await this.client.keys(`${this.partitionKey}:*`);
    return keys.length;
  }

  async keys(): Promise<IterableIterator<K>> {
    const keys = await this.client.keys(`${this.partitionKey}:*`);
    return keys
      .map((key) => key.replace(`${this.partitionKey}:`, "") as K)
      [Symbol.iterator]();
  }

  async values(): Promise<IterableIterator<V>> {
    const keys: string[] = await this.client.keys(`${this.partitionKey}:*`);
    const values: (string | null)[] = await Promise.all(
      keys.map((key: string) => this.client.get(key)),
    );
    return values
      .map((value: string | null) => JSON.parse(value!))
      [Symbol.iterator]() as IterableIterator<V>;
  }

  async entries(): Promise<IterableIterator<[K, V]>> {
    const keys = await this.client.keys(`${this.partitionKey}:*`);
    const entries = await Promise.all(
      keys.map(async (key: string) => {
        const value = await this.client.get(key);
        if (value === null) {
          throw new Error(`Value for key ${key} is null`);
        }
        return [
          key.replace(`${this.partitionKey}:`, "") as K,
          JSON.parse(value),
        ];
      }),
    );
    return entries[Symbol.iterator]() as IterableIterator<[K, V]>;
  }
}

export type PartialToken = {};

export type Token = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  chainId: number;
  guildId: string;
};

export function Tokens(store: Store<string, string>) {
  async function setToken(token: Token): Promise<void> {
    const key = encodeKey(
      [token.guildId, token.chainId, token.address].filter(Boolean),
    );
    const value = JSON.stringify(token);
    await store.set(key, value);
  }

  async function getToken(
    guildId: string,
    chainId: number,
    address: string,
  ): Promise<Token | undefined> {
    const key = encodeKey([guildId, chainId, address].filter(Boolean));
    const value = await store.get(key);
    if (value) {
      return JSON.parse(value) as Token;
    }
    return undefined;
  }

  async function deleteToken(
    guildId: string,
    chainId: number,
    address: string,
  ): Promise<boolean> {
    const key = encodeKey([guildId, chainId, address].filter(Boolean));
    return await store.delete(key);
  }

  async function hasToken(
    guildId: string,
    chainId: number,
    address: string,
  ): Promise<boolean> {
    const key = encodeKey([guildId, chainId, address].filter(Boolean));
    return await store.has(key);
  }

  async function getTokensByGuild(guildId: string): Promise<Token[]> {
    const entries = await store.entries();
    return Array.from(entries)
      .filter(([key, _]) => {
        const [storedGuildId] = decodeKey(key);
        return storedGuildId === guildId;
      })
      .map(([key, value]) => {
        console.log(key, value);
        return JSON.parse(value) as Token;
      });
  }

  async function getTokensByGuildAndChain(
    guildId: string,
    chainId: number,
  ): Promise<Token[]> {
    const entries = await store.entries();
    return Array.from(entries)
      .filter(([key, _]) => {
        const [storedGuildId, storedChainId] = decodeKey(key);
        return storedGuildId === guildId && Number(storedChainId) === chainId;
      })
      .map(([_, value]) => JSON.parse(value) as Token);
  }

  return {
    setToken,
    getToken,
    deleteToken,
    hasToken,
    getTokensByGuild,
    getTokensByGuildAndChain,
  };
}

export type Tokens = ReturnType<typeof Tokens>;

interface User {
  userId: string;
  guildId: string;
  chainId: number;
  address: string;
  roleId: string;
}

export function Users(store: Store<string, string>) {
  async function setAddress(
    userId: string,
    guildId: string,
    chainId: number,
    address: string,
  ): Promise<void> {
    if (!isAddress(address)) {
      throw new Error("Invalid Address");
    }
    const key = encodeKey([userId, guildId, chainId].filter(Boolean));
    await store.set(key, address);
  }

  async function getAddress(
    userId: string,
    guildId: string,
    chainId: number,
  ): Promise<string | undefined> {
    const key = encodeKey([userId, guildId, chainId].filter(Boolean));
    return await store.get(key);
  }

  async function deleteAddress(
    userId: string,
    guildId: string,
    chainId: number,
  ): Promise<boolean> {
    const key = encodeKey([userId, guildId, chainId].filter(Boolean));
    return await store.delete(key);
  }

  async function getUser(
    userId: string,
    guildId: string,
  ): Promise<{ chainId: number; address: string }[]> {
    const entries = await store.entries();
    const userEntries = Array.from(entries).filter(([key, _]) => {
      const [storedUserId, storedGuildId] = decodeKey(key);
      return storedUserId === userId && storedGuildId === guildId;
    });

    return userEntries.map(([key, address]) => {
      const [, , chainId] = decodeKey(key);
      return { chainId: Number(chainId), address };
    });
  }

  async function getUsersByChain(
    chainId: number,
    guildId: string,
  ): Promise<{ userId: string; chainId: number; address: string }[]> {
    const entries = await store.entries();
    return Array.from(entries)
      .filter(([key, _]) => {
        const [, storedGuildId, storedChainId] = decodeKey(key);
        return Number(storedChainId) === chainId && storedGuildId === guildId;
      })
      .map(([key, address]) => {
        const [userId, , storedChainId] = decodeKey(key);
        return { userId, chainId: Number(storedChainId), address };
      });
  }

  async function getAllAddresses(
    guildId: string,
  ): Promise<{ userId: string; chainId: number; address: string }[]> {
    const entries = await store.entries();
    return Array.from(entries)
      .filter(([key, _]) => {
        const [, storedGuildId] = decodeKey(key);
        return storedGuildId === guildId;
      })
      .map(([key, address]: [string, string]) => {
        const [userId, , chainId] = decodeKey(key);
        return { userId, chainId: Number(chainId), address };
      });
  }

  async function getUsersByAddress(
    guildId: string,
    address: string,
  ): Promise<{ userId: string; chainId: number; address: string }[]> {
    const entries = await store.entries();
    return Array.from(entries)
      .filter(([key, value]) => {
        const [, storedGuildId] = decodeKey(key);
        return storedGuildId === guildId && value === address;
      })
      .map(([key, address]: [string, string]) => {
        const [userId, , chainId] = decodeKey(key);
        return { userId, chainId: Number(chainId), address };
      });
  }

  async function getAddressesByUser(
    guildId: string,
    userId: string,
  ): Promise<{ userId: string; chainId: number; address: string }[]> {
    const entries = await store.entries();
    return Array.from(entries)
      .filter(([key]) => {
        const [storedUserId, storedGuildId] = decodeKey(key);
        return storedGuildId === guildId && storedUserId === userId;
      })
      .map(([key, address]: [string, string]) => {
        const [userId, , chainId] = decodeKey(key);
        return { userId, chainId: Number(chainId), address };
      });
  }

  return {
    setAddress,
    getAddress,
    getUser,
    getUsersByChain,
    getAllAddresses,
    deleteAddress,
    getUsersByAddress,
    getAddressesByUser,
  };
}

export type Users = ReturnType<typeof Users>;

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

interface User {
  userId: string;
  chainId: number;
  address: string;
  roleId: string;
}

export function Users(store: Store<string, string>) {
  async function setAddress(
    userId: string,
    chainId: number,
    address: string,
  ): Promise<void> {
    if (!isAddress(address)) {
      throw new Error("Invalid Address");
    }
    const key = encodeKey([userId, chainId]);
    await store.set(key, address);
  }

  async function getAddress(
    userId: string,
    chainId: number,
  ): Promise<string | undefined> {
    const key = encodeKey([userId, chainId]);
    return await store.get(key);
  }

  async function deleteAddress(
    userId: string,
    chainId: number,
  ): Promise<boolean> {
    const key = encodeKey([userId, chainId]);
    return await store.delete(key);
  }

  async function getUser(
    userId: string,
  ): Promise<{ chainId: number; address: string }[]> {
    const entries = await store.entries();
    const userEntries = Array.from(entries).filter(([key, _]) => {
      const [storedUserId] = decodeKey(key);
      return storedUserId === userId;
    });

    return userEntries.map(([key, address]) => {
      const [, chainId] = decodeKey(key);
      return { chainId: Number(chainId), address };
    });
  }

  async function getUsersByChain(
    chainId: number,
  ): Promise<{ userId: string; chainId: number; address: string }[]> {
    const entries = await store.entries();
    return Array.from(entries)
      .filter(([key, _]) => {
        const [, storedChainId] = decodeKey(key);
        return Number(storedChainId) === chainId;
      })
      .map(([key, address]) => {
        const [userId, storedChainId] = decodeKey(key);
        return { userId, chainId: Number(storedChainId), address };
      });
  }

  async function getAllAddresses(): Promise<
    { userId: string; chainId: number; address: string }[]
  > {
    const entries = await store.entries();
    return Array.from(entries).map(([key, address]: [string, string]) => {
      const [userId, chainId] = decodeKey(key);
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
  };
}

export type Users = ReturnType<typeof Users>;

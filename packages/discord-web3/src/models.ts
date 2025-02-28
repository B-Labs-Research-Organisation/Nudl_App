import { isAddress } from "viem";
import { encodeKey, decodeKey } from "./utils";
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

interface User {
  userId: string;
  chainId: number;
  address: string;
}

export function Users() {
  const store = new MapStore<string, string>();

  async function setAddress(
    userId: string,
    chainId: number,
    address: string,
  ): Promise<void> {
    if (!isAddress(address)) {
      throw new Error("Invalid Ethereum address");
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

  async function getUsersByChain(chainId: number) {
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

  return {
    setAddress,
    getAddress,
    getUser,
    getUsersByChain,
  };
}

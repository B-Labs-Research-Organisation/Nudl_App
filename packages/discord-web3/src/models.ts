import { isAddress } from 'viem';
import {encodeKey,decodeKey} from './utils'
export interface Store<K, V> {
  set(key: K, value: V): this;
  get(key: K): V | undefined;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  size: number;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  entries(): IterableIterator<[K, V]>;
}
export class MapStore<K, V> implements Store<K, V> {
  private map: Map<K, V>;

  constructor() {
    this.map = new Map<K, V>();
  }

  set(key: K, value: V): this {
    this.map.set(key, value);
    return this;
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}

interface User {
  userId: string;
  chainId: number;
  address: string;
}

export function User() {
  const store = new MapStore<string, string>();

  function setAddress(userId: string, chainId: number, address: string): void {
    if (!isAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }
    const key = encodeKey([userId, chainId]);
    store.set(key, address);
  }

  function getAddress(userId: string, chainId: number): string | undefined {
    const key = encodeKey([userId, chainId]);
    return store.get(key);
  }

  function getUser(userId: string): { chainId: number; address: string }[] {
    const userEntries = Array.from(store.entries()).filter(([key, _]) => {
      const [storedUserId] = decodeKey(key);
      return storedUserId === userId;
    });

    return userEntries.map(([key, address]) => {
      const [, chainId] = decodeKey(key);
      return { chainId: Number(chainId), address };
    });
  }

  return {
    setAddress,
    getAddress,
    getUser,
  };
}

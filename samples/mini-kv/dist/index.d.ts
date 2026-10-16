/**
 * mini-kv — a tiny in-memory key-value store with TTL.
 *
 * Purpose: a small, honest reverse-engineering target for Reverse Lab's
 * REA probe (`npm run rea:probe`). Deliberately simple: one class, a few
 * functions, wall-clock TTL semantics (Date.now), lazy expiry on read.
 */
export interface SetOptions {
  /** Time-to-live in milliseconds; entry never expires when omitted. */
  ttlMs?: number;
}
export declare class MiniKV {
  private readonly store;
  set(key: string, value: unknown, opts?: SetOptions): void;
  get<T = unknown>(key: string): T | undefined;
  has(key: string): boolean;
  delete(key: string): boolean;
  /** Eagerly evict expired entries; returns the number removed. */
  sweep(): number;
  /** Live (non-expired) keys. Triggers lazy expiry like get(). */
  keys(): string[];
  size(): number;
  clear(): void;
}
/** Convenience: build a MiniKV preloaded with the given entries. */
export declare function createStore(
  entries?: Record<string, unknown>,
  opts?: SetOptions,
): MiniKV;

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

interface Entry {
  value: unknown;
  /** Absolute wall-clock deadline (Date.now() ms), or null for no expiry. */
  expiresAt: number | null;
}

function isExpired(entry: Entry, nowMs: number): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= nowMs;
}

export class MiniKV {
  private readonly store = new Map<string, Entry>();

  set(key: string, value: unknown, opts?: SetOptions): void {
    const expiresAt =
      opts?.ttlMs !== undefined ? Date.now() + opts.ttlMs : null;
    this.store.set(key, { value, expiresAt });
  }

  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (isExpired(entry, Date.now())) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Eagerly evict expired entries; returns the number removed. */
  sweep(): number {
    const nowMs = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (isExpired(entry, nowMs)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Live (non-expired) keys. Triggers lazy expiry like get(). */
  keys(): string[] {
    const nowMs = Date.now();
    const live: string[] = [];
    for (const [key, entry] of this.store) {
      if (isExpired(entry, nowMs)) {
        this.store.delete(key);
      } else {
        live.push(key);
      }
    }
    return live;
  }

  size(): number {
    return this.keys().length;
  }

  clear(): void {
    this.store.clear();
  }
}

/** Convenience: build a MiniKV preloaded with the given entries. */
export function createStore(
  entries: Record<string, unknown> = {},
  opts?: SetOptions,
): MiniKV {
  const kv = new MiniKV();
  for (const [key, value] of Object.entries(entries)) {
    kv.set(key, value, opts);
  }
  return kv;
}

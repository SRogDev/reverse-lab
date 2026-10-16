/**
 * mini-kv — a tiny in-memory key-value store with TTL.
 *
 * Purpose: a small, honest reverse-engineering target for Reverse Lab's
 * REA probe (`npm run rea:probe`). Deliberately simple: one class, a few
 * functions, wall-clock TTL semantics (Date.now), lazy expiry on read.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiniKV = void 0;
exports.createStore = createStore;
function isExpired(entry, nowMs) {
  return entry.expiresAt !== null && entry.expiresAt <= nowMs;
}
class MiniKV {
  store = new Map();
  set(key, value, opts) {
    const expiresAt =
      opts?.ttlMs !== undefined ? Date.now() + opts.ttlMs : null;
    this.store.set(key, { value, expiresAt });
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (isExpired(entry, Date.now())) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }
  has(key) {
    return this.get(key) !== undefined;
  }
  delete(key) {
    return this.store.delete(key);
  }
  /** Eagerly evict expired entries; returns the number removed. */
  sweep() {
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
  keys() {
    const nowMs = Date.now();
    const live = [];
    for (const [key, entry] of this.store) {
      if (isExpired(entry, nowMs)) {
        this.store.delete(key);
      } else {
        live.push(key);
      }
    }
    return live;
  }
  size() {
    return this.keys().length;
  }
  clear() {
    this.store.clear();
  }
}
exports.MiniKV = MiniKV;
/** Convenience: build a MiniKV preloaded with the given entries. */
function createStore(entries = {}, opts) {
  const kv = new MiniKV();
  for (const [key, value] of Object.entries(entries)) {
    kv.set(key, value, opts);
  }
  return kv;
}

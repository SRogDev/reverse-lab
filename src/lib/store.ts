/**
 * Server-side store singleton.
 *
 * Phase 1 uses FileStore (JSON under `data/`, gitignored — zero keys).
 * Override the directory with REVERSE_LAB_DATA_DIR (tests use a tmpdir).
 * Swapping to SupabaseStore happens here when Roger provides credentials;
 * route handlers only ever see the `Store` interface.
 */

import { join } from "node:path";
import { FileStore, type Store } from "../evidence/store";

let instance: Store | null = null;
let instanceDir: string | undefined;

function dataDir(): string {
  return process.env.REVERSE_LAB_DATA_DIR ?? join(process.cwd(), "data");
}

export function getStore(): Store {
  const dir = dataDir();
  if (!instance || instanceDir !== dir) {
    instance = new FileStore({ dataDir: dir });
    instanceDir = dir;
  }
  return instance;
}

/** Test-only: drop the cached instance so a new data dir takes effect. */
export function resetStoreForTests(): void {
  instance = null;
  instanceDir = undefined;
}

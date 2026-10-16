import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";
import { resetStoreForTests } from "@/lib/store";

/** Point the store singleton at a fresh tmpdir before each test. */
export function setupIsolatedDataDir(): void {
  beforeEach(() => {
    process.env.REVERSE_LAB_DATA_DIR = mkdtempSync(
      join(tmpdir(), "rl-api-test-"),
    );
    resetStoreForTests();
  });
}

export function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function get(url: string): Request {
  return new Request(url, { method: "GET" });
}

/** Next 16 route params are async. */
export function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

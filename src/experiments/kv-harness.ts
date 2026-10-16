/**
 * Default benchmark harness for KV-store-like artifacts (the mini-kv
 * interface: `MiniKV` with set/get/has/delete/sweep/keys/size/clear, plus
 * the `createStore` helper).
 *
 * This is the `harnessScript` used by the application services and the
 * demo. It implements the runner's argv-json protocol:
 * - argv: `node harness.mjs <variantFile>` (variantFile in the cwd)
 * - stdout: `{ "measurements": { "wall_time_ms": <number>, "correctness": <number> } }`
 * - exit 0 on success; non-zero with a `HARNESS FAIL:` line on stderr otherwise.
 *
 * `correctness` is 1 when every behavioral check passes and the harness
 * exits 0 — any deviation fails loudly instead. `wall_time_ms` is the
 * wall-clock time of a 20k set/get round-trip loop (real measurement on
 * the lab host; noisy for micro-workloads, which is why the runner
 * repeats it and reports raw values).
 *
 * NOTE on the eager-sweep alternative: because it sweeps on every write,
 * the bulk loop is O(n^2) by construction — the measurement will show it.
 * That is a genuine algorithmic trade-off being measured, not a bug.
 */

/** Measurement names this harness emits. */
export const KV_MEASUREMENTS = ["wall_time_ms", "correctness"] as const;

export const KV_BENCHMARK_HARNESS: string = `// reverse-lab KV benchmark harness (argv-json protocol)
import { setTimeout as sleep } from "node:timers/promises";

function fail(msg) {
  process.stderr.write("HARNESS FAIL: " + msg + "\\n");
  process.exit(3);
}
function assert(cond, msg) {
  if (!cond) {
    fail(msg);
  }
}

const specifier = process.argv[2];
if (!specifier) {
  fail("missing artifact path argument");
}
const mod = await import("./" + specifier);
const MiniKV = mod.MiniKV ?? mod.default?.MiniKV ?? mod.default;
if (typeof MiniKV !== "function") {
  fail("artifact does not export a MiniKV constructor");
}

// --- correctness scenario (real TTL behavior) ---
const kv = new MiniKV();
kv.set("a", 1);
assert(kv.get("a") === 1, "get after set");
assert(kv.has("a") === true, "has after set");
kv.set("temp", 2, { ttlMs: 40 });
assert(kv.get("temp") === 2, "get before expiry");
await sleep(90);
assert(kv.get("temp") === undefined, "expired key returns undefined");
assert(kv.has("temp") === false, "expired key has() === false");
kv.set("x", 9);
assert(kv.delete("x") === true, "delete returns true");
assert(kv.get("x") === undefined, "deleted key returns undefined");
kv.set("k1", 1);
kv.set("k2", 2, { ttlMs: 30 });
await sleep(70);
const swept = kv.sweep();
assert(swept >= 1, "sweep removed at least one expired entry, got " + swept);
assert(kv.get("k1") === 1, "live key survives sweep");
assert(
  JSON.stringify(kv.keys().sort()) === JSON.stringify(["a", "k1"]),
  "keys() lists exactly the live keys",
);
assert(kv.size() === 2, "size counts live keys");
kv.clear();
assert(kv.size() === 0, "clear empties the store");

// --- timing: bulk set/get round-trip ---
const kv2 = new MiniKV();
const N = 20000;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  kv2.set("k" + i, i);
  const v = kv2.get("k" + i);
  if (v !== i) {
    fail("bulk round-trip mismatch at key k" + i);
  }
}
const wallMs = performance.now() - t0;

console.log(
  JSON.stringify({ measurements: { wall_time_ms: wallMs, correctness: 1 } }),
);
`;

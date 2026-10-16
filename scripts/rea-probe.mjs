#!/usr/bin/env node
/**
 * npm run rea:probe — run the real REA CLI over the repo's sample targets
 * and print what came back: claims, limitations, evidence_id.
 *
 * - analyze-javascript-application over samples/mini-kv (zero-engine).
 * - inspect-sqlite-database over a generated sample DB (only if the
 *   `sqlite3` CLI exists on this machine).
 *
 * This script spawns the real `rea-agents@6.5.0` binary. Nothing is
 * simulated: failures print the real error and the script reports exactly
 * what worked. Set REA_BIN to a pre-installed `rea` binary to skip npx
 * (npx can take ~70s to start under a minimal env; see
 * src/reverse-engineering/rea.ts PERFORMANCE NOTE).
 *
 * The production mapping (REA record -> lab Evidence) lives in
 * src/reverse-engineering/rea.ts; this script prints the raw fields.
 */

import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REA_PACKAGE = "rea-agents@6.5.0";
const EVIDENCE_ID_RE = /^ev_[0-9a-f]{64}$/;

function reaBin() {
  if (process.env.REA_BIN) {
    return { cmd: process.env.REA_BIN, prefix: [] };
  }
  return { cmd: "npx", prefix: ["-y", REA_PACKAGE] };
}

function runRea(command, args, { timeoutMs = 300_000 } = {}) {
  const { cmd, prefix } = reaBin();
  const fullArgs = [...prefix, command, ...args, "--json"];
  console.log(`\n$ ${cmd} ${fullArgs.join(" ")}`);
  const result = spawnSync(cmd, fullArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return result;
}

function printEvidence(label, result) {
  console.log(`--- ${label} ---`);
  if (result.error) {
    console.log(`SPAWN ERROR: ${result.error.message}`);
    return { ok: false, reason: `spawn error: ${result.error.message}` };
  }
  console.log(`exit code: ${result.status}`);
  if (result.status !== 0) {
    console.log("stdout:", (result.stdout || "").slice(0, 2000));
    console.log("stderr tail:", (result.stderr || "").slice(-800));
    return { ok: false, reason: `exit ${result.status}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    console.log("stdout was not JSON:", result.stdout.slice(0, 500));
    return { ok: false, reason: "non-JSON stdout" };
  }
  if (parsed && typeof parsed.error === "string") {
    console.log(
      `REA ERROR [${parsed.code}/${parsed.category}]: ${parsed.message}`,
    );
    return { ok: false, reason: `REA error: ${parsed.code}` };
  }
  const evidenceId = parsed.evidence_id;
  const idOk = EVIDENCE_ID_RE.test(evidenceId || "");
  console.log(`evidence_id: ${evidenceId}  (format valid: ${idOk})`);
  console.log(`operation:   ${parsed.operation}`);
  console.log(`provider:    ${parsed.provider?.id} (${parsed.provider?.name})`);
  const normalized = parsed.normalized_result || {};
  // "Claims": the operation result. Print summary + statistics; the full
  // normalized_result can be large, so keep the human-readable slice here.
  if (normalized.summary !== undefined) {
    console.log("summary:", JSON.stringify(normalized.summary).slice(0, 1200));
  }
  if (normalized.statistics !== undefined) {
    console.log("statistics:", JSON.stringify(normalized.statistics));
  }
  if (normalized.schema !== undefined) {
    console.log("schema:", JSON.stringify(normalized.schema).slice(0, 1500));
  }
  const limitations = parsed.limitations || [];
  console.log(`limitations (${limitations.length}, verbatim):`);
  limitations.forEach((line, i) => {
    console.log(`  [${i}] ${line}`);
  });
  return {
    ok: idOk,
    reason: idOk ? "ok" : "bad evidence_id format",
    evidenceId,
  };
}

function sqliteAvailable() {
  const probe = spawnSync("sqlite3", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
}

function makeSampleDb(path) {
  if (existsSync(path)) {
    unlinkSync(path);
  }
  const sql = [
    "CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);",
    "INSERT INTO users(name, created_at) VALUES ('ada', '2026-01-01'), ('grace', '2026-02-01'), ('alan', '2026-03-01');",
    "CREATE TABLE events(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL);",
    "INSERT INTO events(user_id, kind, at) VALUES (1, 'login', '2026-04-01'), (2, 'login', '2026-04-02'), (1, 'export', '2026-04-03');",
  ].join("\n");
  const result = spawnSync("sqlite3", [path], { input: sql, encoding: "utf8" });
  return result.status === 0;
}

function main() {
  console.log(
    "Reverse Lab REA probe — real CLI, real output, nothing simulated.",
  );
  const results = [];

  // 1. JavaScript application analysis (zero-engine).
  results.push([
    "analyze-javascript-application(samples/mini-kv)",
    printEvidence(
      "analyze-javascript-application → samples/mini-kv",
      runRea("analyze-javascript-application", ["samples/mini-kv"]),
    ),
  ]);

  // 2. SQLite inspection (zero-engine), only when sqlite3 exists.
  if (sqliteAvailable()) {
    const dbPath = join(tmpdir(), "lab-sqlite-sample.db");
    if (makeSampleDb(dbPath)) {
      results.push([
        "inspect-sqlite-database(sample db)",
        printEvidence(
          "inspect-sqlite-database → sample db, table users",
          runRea("inspect-sqlite-database", [
            dbPath,
            "--table",
            "users",
            "--row-limit",
            "20",
          ]),
        ),
      ]);
    } else {
      console.log("\nCould not create the sample SQLite DB — skipping.");
      results.push([
        "inspect-sqlite-database(sample db)",
        { ok: false, reason: "db creation failed" },
      ]);
    }
  } else {
    console.log(
      "\n`sqlite3` CLI not found — skipping inspect-sqlite-database (UNVERIFIED-in-this-env).",
    );
    results.push([
      "inspect-sqlite-database(sample db)",
      { ok: false, reason: "sqlite3 not installed" },
    ]);
  }

  console.log("\n=== probe summary ===");
  let allOk = true;
  for (const [name, r] of results) {
    console.log(`${r.ok ? "OK  " : "FAIL"}  ${name} — ${r.reason}`);
    if (!r.ok) {
      allOk = false;
    }
  }
  process.exit(allOk ? 0 : 1);
}

main();

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalExecutor, VercelSandboxExecutor } from "./executor";

const NODE = process.execPath;

describe("LocalExecutor", () => {
  let root: string;
  let executor: LocalExecutor;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "rl-exec-"));
    executor = new LocalExecutor({ sandboxRoot: root });
  });

  afterEach(() => {
    delete process.env.REVERSE_LAB_TEST_SENTINEL;
  });

  it("runs a command and captures stdout, stderr, exit code and duration", async () => {
    const res = await executor.run(
      NODE,
      ["-e", "console.log('out'); console.error('err')"],
      { cwd: ".", timeoutMs: 5000 },
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("out");
    expect(res.stderr).toContain("err");
    expect(res.timedOut).toBe(false);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("keeps non-zero exits visible as failures instead of throwing", async () => {
    const res = await executor.run(NODE, ["-e", "process.exit(3)"], {
      cwd: ".",
      timeoutMs: 5000,
    });
    expect(res.exitCode).toBe(3);
    expect(res.timedOut).toBe(false);
  });

  it("kills the process on timeout and reports timedOut", async () => {
    const start = Date.now();
    const res = await executor.run(
      NODE,
      ["-e", "setTimeout(() => {}, 30000)"],
      {
        cwd: ".",
        timeoutMs: 400,
      },
    );
    const elapsed = Date.now() - start;
    expect(res.timedOut).toBe(true);
    // The sleep was 30s; we must have killed it far earlier.
    expect(elapsed).toBeLessThan(10000);
    expect(res.durationMs).toBeGreaterThanOrEqual(400);
  });

  it("scrubs the parent environment: allowlist only", async () => {
    process.env.REVERSE_LAB_TEST_SENTINEL = "must-not-leak";
    const res = await executor.run(
      NODE,
      ["-e", "console.log(process.env.REVERSE_LAB_TEST_SENTINEL ?? 'ABSENT')"],
      { cwd: ".", timeoutMs: 5000 },
    );
    expect(res.stdout).toContain("ABSENT");
  });

  it("passes explicit opts.env through the allowlist", async () => {
    const res = await executor.run(
      NODE,
      ["-e", "console.log(process.env.RL_EXPLICIT ?? 'ABSENT')"],
      { cwd: ".", timeoutMs: 5000, env: { RL_EXPLICIT: "yes" } },
    );
    expect(res.stdout).toContain("yes");
  });

  it("keeps PATH functional so commands resolve", async () => {
    const res = await executor.run(NODE, ["-e", "console.log('has-path')"], {
      cwd: ".",
      timeoutMs: 5000,
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("has-path");
  });

  it("rejects cwd escapes outside the sandbox root", async () => {
    await expect(
      executor.run(NODE, ["-e", "1"], { cwd: "..", timeoutMs: 1000 }),
    ).rejects.toThrow(/sandbox/i);
    await expect(
      executor.run(NODE, ["-e", "1"], { cwd: "/etc", timeoutMs: 1000 }),
    ).rejects.toThrow(/sandbox/i);
  });

  it("allows a subdirectory of the sandbox root", async () => {
    await executor.writeFiles("sub/dir", { ".keep": "" });
    const res = await executor.run(NODE, ["-e", "console.log(process.cwd())"], {
      cwd: "sub/dir",
      timeoutMs: 5000,
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout.trim().endsWith(join("sub", "dir"))).toBe(true);
  });

  it("writeFiles/readFile round-trip inside the sandbox", async () => {
    await executor.writeFiles("proj", {
      "src/index.ts": "export const x = 1;\n",
      "README.md": "# hi\n",
    });
    const content = await executor.readFile("proj", "src/index.ts");
    expect(content).toBe("export const x = 1;\n");
  });

  it("writeFiles rejects path escapes", async () => {
    await expect(
      executor.writeFiles(".", { "../evil.txt": "x" }),
    ).rejects.toThrow(/sandbox/i);
  });

  it("readFile rejects path escapes", async () => {
    await expect(executor.readFile(".", "../package.json")).rejects.toThrow(
      /sandbox/i,
    );
  });

  it("surfaces spawn failures (unknown command) as errors", async () => {
    await expect(
      executor.run("rl-this-command-does-not-exist-xyz", [], {
        cwd: ".",
        timeoutMs: 1000,
      }),
    ).rejects.toThrow();
  });
});

describe("VercelSandboxExecutor", () => {
  it("fails honestly on every method: sandbox not configured", async () => {
    const executor = new VercelSandboxExecutor();
    await expect(
      executor.run("echo", ["hi"], { cwd: ".", timeoutMs: 1000 }),
    ).rejects.toThrow(/Vercel Sandbox not configured/);
    await expect(executor.writeFiles(".", { "a.txt": "x" })).rejects.toThrow(
      /requires VERCEL_TOKEN/,
    );
    await expect(executor.readFile(".", "a.txt")).rejects.toThrow(
      /execution-environments\.md/,
    );
  });
});

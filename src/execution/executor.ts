/**
 * Execution abstraction for Reverse Lab.
 *
 * The investigation engine plans work; an `Executor` runs it. Untrusted code
 * (analyzed targets, generated alternatives, tests) must never execute in the
 * Next.js process — it runs through an Executor that confines where it runs
 * and what environment it sees.
 *
 * Swap point: `LocalExecutor` runs commands on the app host (fine for trusted
 * local PoC targets). `VercelSandboxExecutor` implements the same interface
 * for isolated execution and currently fails honestly until Vercel Sandbox is
 * configured (see docs/architecture/execution-environments.md).
 */

import { spawn } from "node:child_process";
import { readFile as fsReadFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";

export interface RunOptions {
  /** Working directory, resolved inside the sandbox root. */
  cwd: string;
  /** Kill the process after this many ms; result reports `timedOut: true`. */
  timeoutMs: number;
  /** Extra env vars merged over the allowlist (never the parent env). */
  env?: Record<string, string>;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface Executor {
  run(cmd: string, args: string[], opts: RunOptions): Promise<RunResult>;
  writeFiles(cwd: string, files: Record<string, string>): Promise<void>;
  readFile(cwd: string, path: string): Promise<string>;
}

/** Env vars a child process may inherit. Everything else is scrubbed. */
const ENV_ALLOWLIST = ["PATH", "HOME", "LANG"] as const;

function buildEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Resolve `cwd` inside `root`, rejecting anything that escapes.
 * Both relative (`sub/dir`) and absolute paths under the root are accepted.
 */
function resolveWithin(root: string, cwd: string): string {
  const absoluteRoot = resolve(root);
  const resolved = isAbsolute(cwd) ? resolve(cwd) : resolve(absoluteRoot, cwd);
  if (resolved !== absoluteRoot && !resolved.startsWith(absoluteRoot + sep)) {
    throw new Error(
      `Refusing to operate outside the sandbox root: ${cwd} (root: ${absoluteRoot})`,
    );
  }
  return resolved;
}

/**
 * Runs commands on the local host, confined to a sandbox root directory.
 * The child never inherits `process.env`: only PATH/HOME/LANG plus explicit
 * `opts.env` are passed through.
 */
export class LocalExecutor implements Executor {
  private readonly sandboxRoot: string;

  constructor(opts?: { sandboxRoot?: string }) {
    this.sandboxRoot = resolve(opts?.sandboxRoot ?? process.cwd());
  }

  async run(cmd: string, args: string[], opts: RunOptions): Promise<RunResult> {
    const cwd = resolveWithin(this.sandboxRoot, opts.cwd);
    const startedAt = Date.now();

    return new Promise((resolvePromise, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(cmd, args, {
          cwd,
          // Intentionally a minimal string map: Next's ProcessEnv type
          // requires NODE_ENV, which we deliberately do not inherit.
          env: buildEnv(opts.env) as NodeJS.ProcessEnv,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        reject(
          err instanceof Error
            ? err
            : new Error(`Failed to spawn ${cmd}: ${String(err)}`),
        );
        return;
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, opts.timeoutMs);
      // Don't let a runaway timer keep the event loop alive after the test ends.
      timer.unref?.();

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to run ${cmd}: ${err.message}`));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolvePromise({
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          durationMs: Date.now() - startedAt,
          timedOut,
        });
      });
    });
  }

  async writeFiles(cwd: string, files: Record<string, string>): Promise<void> {
    const dir = resolveWithin(this.sandboxRoot, cwd);
    for (const [relativePath, content] of Object.entries(files)) {
      const target = resolveWithin(dir, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
  }

  async readFile(cwd: string, path: string): Promise<string> {
    const dir = resolveWithin(this.sandboxRoot, cwd);
    const target = resolveWithin(dir, path);
    return fsReadFile(target, "utf8");
  }
}

const SANDBOX_NOT_CONFIGURED =
  "Vercel Sandbox not configured — requires VERCEL_TOKEN/OIDC; " +
  "see docs/architecture/execution-environments.md";

/**
 * Honest stub for isolated execution. Every method fails loudly until Vercel
 * Sandbox is configured — it never fakes a successful run.
 */
export class VercelSandboxExecutor implements Executor {
  async run(
    _cmd: string,
    _args: string[],
    _opts: RunOptions,
  ): Promise<RunResult> {
    throw new Error(SANDBOX_NOT_CONFIGURED);
  }

  async writeFiles(
    _cwd: string,
    _files: Record<string, string>,
  ): Promise<void> {
    throw new Error(SANDBOX_NOT_CONFIGURED);
  }

  async readFile(_cwd: string, _path: string): Promise<string> {
    throw new Error(SANDBOX_NOT_CONFIGURED);
  }
}

/** Where the two executors differ and how to switch (for future workers). */
export function describeExecutorSwap(): string {
  return [
    "LocalExecutor: runs on the app host, confined to a sandbox root dir,",
    "scrubbed env. Use for trusted local PoC targets only.",
    "VercelSandboxExecutor: same interface, isolated Firecracker microVMs.",
    "Currently throws until VERCEL_TOKEN/OIDC is configured.",
    "Swap point: inject the Executor into the investigation engine;",
    "no call-site changes needed.",
  ].join(" ");
}

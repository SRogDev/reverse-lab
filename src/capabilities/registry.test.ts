/**
 * Capability registry tests.
 *
 * The registry is a closed, honest list of what the lab can actually do.
 * "Never invent capabilities" is enforced by asserting the exact expected
 * set: adding a new capability must be a deliberate, reviewed change.
 */
import { describe, expect, it } from "vitest";
import {
  capabilitiesForTargetKind,
  getCapability,
  KNOWN_CAPABILITY_IDS,
  listCapabilities,
} from "./registry";

describe("capability registry", () => {
  it("contains exactly the known, verified capabilities — nothing invented", () => {
    const ids = listCapabilities().map((c) => c.id);
    expect(ids.sort()).toEqual([...KNOWN_CAPABILITY_IDS].sort());
  });

  it("every capability carries the full contract fields", () => {
    for (const capability of listCapabilities()) {
      expect(capability.id.trim()).not.toBe("");
      expect(capability.purpose.trim()).not.toBe("");
      expect(Array.isArray(capability.targetKinds)).toBe(true);
      expect(Object.keys(capability.inputSchema).length).toBeGreaterThan(0);
      expect(capability.outputKind.trim()).not.toBe("");
      expect(capability.evidenceKind.trim()).not.toBe("");
      expect(Array.isArray(capability.dependencies)).toBe(true);
      expect(capability.limitations.length).toBeGreaterThan(0);
      expect(["read-target", "execute-sandbox", "network"]).toContain(
        capability.permission,
      );
    }
  });

  it("rea-javascript-app is verified and reads targets without executing them", () => {
    const cap = getCapability("rea-javascript-app");
    expect(cap).toBeDefined();
    expect(cap?.permission).toBe("read-target");
    expect(cap?.evidenceKind).toBe("rea:analyze_javascript_application");
  });

  it("rea-sqlite is verified for database snapshots", () => {
    const cap = getCapability("rea-sqlite");
    expect(cap).toBeDefined();
    expect(cap?.evidenceKind).toBe("rea:inspect_sqlite_database");
  });

  it("rea-native is honest about being unavailable (needs-configuration)", () => {
    const cap = getCapability("rea-native");
    expect(cap).toBeDefined();
    const joined = cap?.limitations.join("\n") ?? "";
    expect(joined).toMatch(/needs-configuration/i);
    expect(joined).toMatch(/no native analysis engine installed/i);
  });

  it("getCapability returns undefined for unknown ids", () => {
    expect(getCapability("does-not-exist")).toBeUndefined();
  });

  it("capabilitiesForTargetKind routes repo targets to the JS analyzer", () => {
    const ids = capabilitiesForTargetKind("repo").map((c) => c.id);
    expect(ids).toContain("rea-javascript-app");
    expect(ids).not.toContain("experiment-run");
  });

  it("codegen-typescript and experiment-run are sandbox capabilities", () => {
    expect(getCapability("codegen-typescript")?.permission).toBe(
      "execute-sandbox",
    );
    expect(getCapability("experiment-run")?.permission).toBe("execute-sandbox");
  });

  // Deliberate registry change (feat/llm-codegen): LLM synthesis joins the
  // closed list — with the same honesty semantics as rea-native: the
  // configuration requirement is stated in its limitations, never hidden.
  it("codegen-llm-typescript is registered, sandbox-bound, and honest about needing a real model", () => {
    const cap = getCapability("codegen-llm-typescript");
    expect(cap).toBeDefined();
    expect(cap?.permission).toBe("execute-sandbox");
    expect(cap?.evidenceKind).toBe("codegen:llm-typescript");
    const joined = cap?.limitations.join("\n") ?? "";
    expect(joined).toMatch(/needs-configuration/i);
    expect(joined).toMatch(/scripted provider cannot synthesize/i);
    expect(joined).toMatch(/UNVERIFIED/);
  });
});

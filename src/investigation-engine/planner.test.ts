/**
 * Planner tests — adaptive planning from a natural-language objective.
 *
 * The MVP planner is deterministic (no LLM): it detects target-kind hints
 * and selects registry capabilities. Tests assert the plan shape, the
 * capability selection, the honesty fields (questions, limitations), and
 * determinism of the step sequence.
 */
import { describe, expect, it } from "vitest";
import type { ResearchTarget } from "../types";
import { planObjective } from "./planner";

function target(overrides: Partial<ResearchTarget>): ResearchTarget {
  return {
    id: "target-1",
    projectId: "project-1",
    kind: "repo",
    ref: "samples/mini-kv",
    createdAt: "2026-10-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("planObjective", () => {
  it("plans an inspect→hypothesize→experiment pipeline for a JS repo objective", () => {
    const plan = planObjective(
      "Investigate the mini-kv TTL implementation and build a simpler alternative",
      [target({})],
    );
    const titles = plan.steps.map((s) => s.title);
    expect(titles.join("\n")).toMatch(/rea-javascript-app/i);
    expect(titles.join("\n")).toMatch(/hypothes/i);
    expect(titles.join("\n")).toMatch(/experiment/i);
    expect(plan.steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("adds codegen when the objective asks for an alternative", () => {
    const plan = planObjective("build a simpler alternative", [target({})]);
    expect(plan.steps.map((s) => s.title).join("\n")).toMatch(
      /codegen-typescript/i,
    );
    expect(plan.expectedEvidence).toContain("codegen:typescript");
  });

  it("omits codegen when the objective only asks for understanding", () => {
    const plan = planObjective("understand how mini-kv works", [target({})]);
    const titles = plan.steps.map((s) => s.title).join("\n");
    expect(titles).not.toMatch(/codegen-typescript/i);
    expect(titles).not.toMatch(/experiment-run/i);
  });

  it("selects rea-sqlite for database targets", () => {
    const plan = planObjective("inspect the user database schema", [
      target({ kind: "component", ref: "data/users.sqlite" }),
    ]);
    expect(plan.steps.map((s) => s.title).join("\n")).toMatch(/rea-sqlite/i);
    expect(plan.expectedEvidence).toContain("rea:inspect_sqlite_database");
  });

  it("is honest about rea-native being unavailable", () => {
    const plan = planObjective("analyze the native codec binary", [
      target({ kind: "component", ref: "build/codec.dll" }),
    ]);
    const titles = plan.steps.map((s) => s.title).join("\n");
    expect(titles).toMatch(/rea-native/i);
    expect(plan.constraints.join("\n")).toMatch(/needs-configuration/i);
    expect(plan.limitations.join("\n")).toMatch(/no native analysis engine/i);
  });

  it("always returns questions, evidence expectations, and criteria", () => {
    const plan = planObjective("investigate caching", [target({})]);
    expect(plan.questions.length).toBeGreaterThan(0);
    expect(plan.expectedEvidence.length).toBeGreaterThan(0);
    expect(plan.evaluationCriteria.length).toBeGreaterThan(0);
    expect(plan.constraints.length).toBeGreaterThan(0);
    expect(plan.limitations.length).toBeGreaterThan(0);
  });

  it("orders codegen before experiment design (the spec needs the alternative)", () => {
    const plan = planObjective(
      "Investigate the mini-kv TTL implementation and build a simpler alternative",
      [target({})],
    );
    const titles = plan.steps.map((s) => s.title);
    const codegenIdx = titles.findIndex((t) => /codegen-typescript/i.test(t));
    const designIdx = titles.findIndex((t) => /design experiment/i.test(t));
    const runIdx = titles.findIndex((t) => /experiment-run/i.test(t));
    expect(codegenIdx).toBeGreaterThanOrEqual(0);
    expect(designIdx).toBeGreaterThan(codegenIdx);
    expect(runIdx).toBeGreaterThan(designIdx);
  });

  it("is deterministic: same objective and targets → same step sequence", () => {
    const objective = "Investigate the mini-kv TTL implementation";
    const targets = [target({})];
    const a = planObjective(objective, targets).steps.map((s) => s.title);
    const b = planObjective(objective, targets).steps.map((s) => s.title);
    expect(a).toEqual(b);
  });

  it("gives each step a unique id and a detail naming its capability", () => {
    const plan = planObjective("build a simpler alternative", [target({})]);
    const ids = plan.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of plan.steps) {
      expect(step.detail).toBeDefined();
      expect(step.detail?.length).toBeGreaterThan(0);
    }
  });
});

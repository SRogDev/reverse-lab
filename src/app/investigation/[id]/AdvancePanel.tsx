"use client";

import { useState } from "react";
import { FlaskIcon } from "@/components/ui";
import {
  ApiError,
  apiPost,
  type InvestigationResponse,
  triggerAdvance,
} from "@/lib/api";
import type { InvestigationRun } from "@/types";

/**
 * Engine control: advance the plan and continue with a new instruction.
 *
 * Honesty contract:
 * - `/advance` missing (404) → "engine offline", nothing faked.
 * - `/continue` and experiment runs return 501 until the Phase 3/4 engine
 *   exists → the API's own message is shown verbatim.
 */

type EngineNotice = { kind: "info" | "error"; text: string } | null;

function explainAdvanceError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return (
        "Engine offline: POST /advance is not present on this investigation. " +
        "The endpoint is owned by the investigation engine worker and has not " +
        "been added yet — no steps were advanced, nothing was faked."
      );
    }
    return `Advance failed (HTTP ${err.status}): ${err.message}`;
  }
  return "Advance failed: the request could not be completed.";
}

export function AdvancePanel({
  investigationId,
  onRunUpdated,
}: {
  investigationId: string;
  onRunUpdated: (run: InvestigationRun) => void;
}) {
  const [maxSteps, setMaxSteps] = useState("3");
  const [advancing, setAdvancing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [notice, setNotice] = useState<EngineNotice>(null);

  async function handleAdvance() {
    setNotice(null);
    setAdvancing(true);
    try {
      const parsed = Number.parseInt(maxSteps, 10);
      const run = await triggerAdvance(
        investigationId,
        Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
      );
      onRunUpdated(run);
      setNotice({
        kind: "info",
        text: `Advance accepted. Status is now “${run.status}” — the live plan below will reflect new steps as the engine works.`,
      });
    } catch (err) {
      setNotice({ kind: "error", text: explainAdvanceError(err) });
    } finally {
      setAdvancing(false);
    }
  }

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    if (instruction.trim() === "") return;
    setNotice(null);
    setContinuing(true);
    try {
      const { run } = await apiPost<InvestigationResponse>(
        `/api/investigations/${investigationId}/continue`,
        { instruction: instruction.trim() },
      );
      onRunUpdated(run);
      setInstruction("");
      setNotice({
        kind: "info",
        text: "Instruction accepted — the investigation will continue from the new direction.",
      });
    } catch (err) {
      const text =
        err instanceof ApiError
          ? `Continue not executed (HTTP ${err.status}): ${err.message}`
          : "Continue failed: the request could not be completed.";
      setNotice({ kind: "error", text });
    } finally {
      setContinuing(false);
    }
  }

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="card">
        <h3>
          <FlaskIcon /> Advance the plan
        </h3>
        <p className="small muted">
          Ask the engine to work the next steps of the plan. The plan timeline
          below updates on its own every 3&nbsp;s.
        </p>
        <div className="field">
          <label htmlFor="max-steps">Max steps</label>
          <input
            id="max-steps"
            type="number"
            min={1}
            max={50}
            value={maxSteps}
            onChange={(e) => setMaxSteps(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={advancing}
          onClick={() => void handleAdvance()}
        >
          {advancing ? "Advancing…" : "Advance"}
        </button>
      </div>

      <form
        className="card"
        onSubmit={(e) => void handleContinue(e)}
        aria-label="Continue with a new instruction"
      >
        <h3>Continue with a new instruction</h3>
        <p className="small muted">
          Steer the investigation mid-run — new evidence, a sharper question, a
          change of direction.
        </p>
        <div className="field">
          <label htmlFor="instruction">Instruction</label>
          <textarea
            id="instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. focus on the retry path; ignore the cache layer"
          />
        </div>
        <button
          type="submit"
          className="btn"
          disabled={continuing || instruction.trim() === ""}
        >
          {continuing ? "Sending…" : "Send instruction"}
        </button>
      </form>

      {notice ? (
        <div
          className={notice.kind === "error" ? "form-error" : "card"}
          role={notice.kind === "error" ? "alert" : "status"}
          style={{ gridColumn: "1 / -1", marginTop: 0 }}
        >
          {notice.kind === "info" ? (
            <p className="small" style={{ marginBottom: 0 }}>
              {notice.text}
            </p>
          ) : (
            notice.text
          )}
        </div>
      ) : null}
    </div>
  );
}

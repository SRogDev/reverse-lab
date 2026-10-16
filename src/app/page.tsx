import Link from "next/link";
import { ArrowIcon, FlaskIcon, SectionHeading } from "@/components/ui";

export const metadata = {
  title: "Reverse Lab — autonomous reverse engineering laboratory",
  description:
    "Point it at a software target. It investigates how it works, records evidence, proposes experiments, and compares real measurements.",
};

export default function Home() {
  return (
    <>
      <section className="hero">
        <p className="kicker">Autonomous reverse engineering laboratory</p>
        <h1>
          Understand how software <span className="glow">really</span> works.
        </h1>
        <p className="lede">
          Reverse Lab points an autonomous investigation at a software target,
          records what it observes as evidence, proposes experiments, runs them
          in isolation, and compares real measurements — so every conclusion
          traces back to something that was actually seen.
        </p>
        <div className="hero-cta">
          <Link className="btn btn-primary" href="/workspace">
            Open the workspace <ArrowIcon />
          </Link>
          <a className="btn" href="#how-it-works">
            How it works
          </a>
        </div>
      </section>

      <section className="section" aria-labelledby="problems">
        <SectionHeading index="01">The problems it takes on</SectionHeading>
        <div className="grid-3">
          <div className="card">
            <h3>Undocumented behavior</h3>
            <p className="muted small">
              A library, service, or binary does something you did not expect.
              The lab reconstructs the behavior from observation instead of
              guessing from docs.
            </p>
          </div>
          <div className="card">
            <h3>“Can we build it better?”</h3>
            <p className="muted small">
              You suspect a faster or simpler implementation exists. The lab
              generates an alternative and measures it against the reference —
              the numbers decide, not opinions.
            </p>
          </div>
          <div className="card">
            <h3>Claims without receipts</h3>
            <p className="muted small">
              Performance advice, migration guides, and benchmarks travel
              without their context. The lab re-runs the claim in an isolated
              environment and shows you the raw values.
            </p>
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works" aria-labelledby="how">
        <SectionHeading index="02">How an investigation runs</SectionHeading>
        <div
          className="terminal"
          role="img"
          aria-label="Investigation pipeline diagram"
        >
          <div>
            <span className="prompt">$</span> lab investigate --target
            ./billing-service
          </div>
          <div className="dim">
            ├─ plan&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ inspect, probe, compare
          </div>
          <div className="dim">
            ├─ observe&nbsp;&nbsp;&nbsp;→ evidence, verbatim limitations
          </div>
          <div className="dim">
            ├─ hypothesize → labeled as hypotheses, never facts
          </div>
          <div className="dim">
            ├─ experiment → isolated runs, raw measurements
          </div>
          <div className="dim">
            └─ conclude&nbsp;&nbsp;→ statements bound to evidence
          </div>
        </div>
        <div className="grid-2" style={{ marginTop: "1.5rem" }}>
          <div className="card">
            <h3>1. Define the objective</h3>
            <p className="muted small">
              A research project holds a natural-language engineering objective
              and the targets under study — a repo, a component, a feature,
              docs, or a benchmark.
            </p>
          </div>
          <div className="card">
            <h3>2. The investigation works the plan</h3>
            <p className="muted small">
              The engine inspects the target with real reverse-engineering
              capabilities, records every observation as evidence with its
              limitations, and revises the plan as findings land.
            </p>
          </div>
          <div className="card">
            <h3>3. Experiments settle disputes</h3>
            <p className="muted small">
              Candidate explanations become experiment specs. Alternatives are
              executed in isolation; raw values — mean, min, max, n — are
              compared without invented scores.
            </p>
          </div>
          <div className="card">
            <h3>4. Knowledge you can audit</h3>
            <p className="muted small">
              Findings link to the evidence that backs them. Hypotheses stay
              labeled as hypotheses. Conclusions carry their limitations
              verbatim. Failed runs stay visible as failed.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="beyond">
        <SectionHeading index="03">Beyond ordinary AI tools</SectionHeading>
        <div className="card">
          <dl className="kv">
            <dt>Chat assistants</dt>
            <dd>
              Answer from training data and confident prose. When they are
              wrong, nothing in the transcript tells you.
            </dd>
            <dt>Coding agents</dt>
            <dd>
              Produce code fast, but the reasoning behind a choice evaporates
              the moment the diff lands.
            </dd>
            <dt>Reverse Lab</dt>
            <dd>
              Executes against the real target. Every finding points at
              evidence; every measurement is a recorded number, not a summary of
              one. Inconclusive is a first-class result.
            </dd>
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="examples">
        <SectionHeading index="04">
          Example engineering objectives
        </SectionHeading>
        <div className="stack">
          <div className="card">
            <p className="mono" style={{ marginBottom: "0.25rem" }}>
              “Why does this parser slow down 4× on inputs over 2 MB?”
            </p>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Target: the parser crate · Evidence: profiles and traces ·
              Experiment: alternative implementation measured against the
              reference on identical inputs.
            </p>
          </div>
          <div className="card">
            <p className="mono" style={{ marginBottom: "0.25rem" }}>
              “Reconstruct the retry policy of this closed API client.”
            </p>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Target: a vendored client binary · Evidence: observed request
              timings under fault injection · Outcome: a behavior spec with
              verbatim limitations, not a guess.
            </p>
          </div>
          <div className="card">
            <p className="mono" style={{ marginBottom: "0.25rem" }}>
              “Which of these two caches actually wins under our workload?”
            </p>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Target: two candidate implementations · Experiment: repeated runs
              in isolation · Comparison: raw hit-latency distributions,
              mean/min/max/n per candidate.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="status">
        <SectionHeading index="05">Current status</SectionHeading>
        <div className="card">
          <p className="small" style={{ marginBottom: "0.5rem" }}>
            <span className="badge badge-run-green">
              <span className="dot" aria-hidden="true" /> api online
            </span>{" "}
            <span className="badge badge-amber">
              <span className="dot" aria-hidden="true" /> engine pending
            </span>
          </p>
          <p className="muted small" style={{ marginBottom: 0 }}>
            The research API is live and FileStore-backed — projects, targets,
            investigations, evidence, and experiment specs persist today. The
            autonomous execution engine (plan advancement, isolated runs) is
            still being built: the UI shows its real status and never fakes a
            run.
          </p>
        </div>
        <div className="hero-cta">
          <Link className="btn btn-primary" href="/workspace">
            <FlaskIcon /> Start a research project
          </Link>
        </div>
      </section>
    </>
  );
}

# Product Vision — Reverse Lab

## The problem

Developers constantly face software they don't fully understand: an unfamiliar framework, a legacy service, a competitor's feature, an open-source library they depend on. Today's tools leave them stuck between two incomplete options:

- **Deep Research-style tools** synthesize documents and articles, but they don't inspect running systems, reconstruct behavior, or test whether an alternative is actually better.
- **AI coding agents** edit code inside a repository, but they don't investigate first — they have no notion of an engineering objective, a hypothesis, or an experiment.

The result: understanding complex systems stays slow and manual, and "better implementation" stays an opinion instead of a measured result.

## What Reverse Lab is

Reverse Lab is an **autonomous reverse engineering & experimental engineering laboratory**. Given an engineering objective, it:

1. **Investigates** how the relevant software works (reverse engineering — the core discipline),
2. **Reconstructs** its architecture and behavior from evidence,
3. **Identifies** concrete improvement opportunities,
4. **Builds** alternative implementations,
5. **Validates** them through real experiments with measured results.

The loop — *investigate → reconstruct → hypothesize → build alternative → measure → conclude* — is the product. Everything else (research, code generation, learning explanations) exists to serve it.

## Core principle

**The user defines the engineering objective. Reverse Lab autonomously determines how to investigate it.**

The system decides which tools to use, which questions to answer, which experiments to run, and when to iterate. The user inspects results, changes constraints, requests alternatives, and redirects the investigation at any time. Investigation state persists, so each iteration builds on previous knowledge instead of restarting.

## What makes it different

| Ordinary AI research / coding tools | Reverse Lab |
|---|---|
| Summarize sources | Inspect targets and reconstruct behavior |
| Answer questions | Pursue an engineering objective autonomously |
| Generate plausible code | Generate alternatives **and test them** |
| Report text | Structured evidence, measurements, traceable conclusions |
| One-shot | Iterative — state persists across runs |

## Who it's for

Software developers, AI engineers, software architects, technical founders, open-source maintainers, and engineers exploring unfamiliar technologies. The initial user is a developer with a specific engineering problem who wants to understand existing implementations and build something better.

## Non-goals

- Not a generic web-research product.
- Not a code editor or IDE replacement.
- Not a benchmark leaderboard or universal "code quality" scorer.
- The MVP does not depend on GPU-intensive training or model benchmarks.

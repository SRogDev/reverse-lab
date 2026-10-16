# Reverse Lab

**Autonomous reverse engineering & experimental engineering laboratory for developers.**

Reverse Lab investigates how software systems work, reconstructs their architecture and behavior, identifies opportunities for improvement, builds alternative implementations, and validates them through real engineering experiments.

The user defines the engineering objective. Reverse Lab autonomously determines how to investigate it — which tools to use, which questions to answer, which experiments to run — and iterates toward a better solution. Every conclusion stays traceable to evidence or experimental results.

## Status

**Phase 0 — Product & Technical Audit (in progress, started 2026-10-16).**

This repository currently contains product and research documentation only. There is no application code yet. Phase 0 validates the technical assumptions (reverse-engineering capabilities, execution environment, architecture) before any implementation begins. See [STATUS.md](STATUS.md) and [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md).

## Planned stack

- **App:** Next.js + React + TypeScript
- **Orchestration:** Vercel AI SDK + Vercel AI Gateway
- **Data:** Supabase (PostgreSQL + Row Level Security)
- **Isolated execution:** Vercel Sandbox (feasibility under audit)
- **Reverse engineering:** REA (capabilities under audit — unverified claims are marked as such)
- **Integration:** MCP (client + server)

## Repository structure

```
reverse-lab/
├── docs/
│   ├── PROJECT_BRIEF.md        # full handoff context for AI builders
│   ├── product/                # vision, core workflows, MVP scope
│   ├── research/               # REA audit, capability matrix, integration notes
│   ├── architecture/           # system architecture, execution environments
│   ├── roadmap/                # post-MVP direction
│   └── commercial/             # monetization strategy (docs only, no implementation)
├── AGENTS.md                   # working agreement for AI contributors
├── STATUS.md                   # current status and timeline
└── LICENSE                     # MIT
```

## Documentation

- [Project brief](docs/PROJECT_BRIEF.md) — start here if you are an AI agent picking up this project
- [Product docs](docs/product/) — vision, workflows, MVP scope and acceptance criteria
- [Research](docs/research/) — reverse-engineering capability audits (verified vs unverified)
- [Architecture](docs/architecture/) — system design and execution-environment findings
- [Roadmap](docs/roadmap/post-mvp.md) — what comes after the MVP
- [Commercial](docs/commercial/) — monetization strategy, documented only

## Principles

- **Evidence over assertions** — inferred internals are never presented as observed facts.
- **Experiments over unsupported claims** — improvements are tested under documented conditions, never simulated.
- **Small, complete workflows** over broad, incomplete features.
- **Failures are explicit** — a failed tool call or experiment is never silently converted into success.

## License

MIT — see [LICENSE](LICENSE).

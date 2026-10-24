# Upstream provenance — replica-skill

- **Source:** `Jakeschincariol/replica-skill` (public, MIT — see `LICENSE` in this directory, © Jake Schincariol).
- **How it got here:** anonymous tarball download (`codeload.github.com/.../tar.gz/refs/heads/main`) on 2026-10-23. No GitHub account, token, or API was used — Roger's SRogDev account is suspended and untouched by this download.
- **Tarball SHA-256:** `f198537e5754a8aa887bff7adc661571ab2dfbe5aafa701e05ea7362abd5aa6b`
- **Contents:** the 11 skills verbatim (`replica-recon` … `replica-deploy`, each with `SKILL.md` plus its helper scripts/templates) and the upstream `tests/`. The `.claude-plugin/` marketplace metadata was dropped (irrelevant outside Claude Code's plugin system).
- **Status in Reverse Lab:** vendored as METHOD SOURCE for the lab's code agent — see `docs/research/replica-skills-for-code-agent.md` for the stage-by-stage mapping. The skills are prompts + small Python tools written for Claude Code; they are not imported as a runtime library.
- **Refresh:** re-download the tarball and diff; do not edit the vendored copies in place — adaptations live in Reverse Lab's own prompts/capabilities, so upstream updates stay clean.

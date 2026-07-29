# Current Project Memory

Last updated: 2026-07-22

The detailed continuation record is [the architecture audit handoff](../handoffs/2026-07-22-architecture-audit-and-shutdown.md). The visual map is [the standalone architecture HTML](../crab-science-architecture.html).

Durable facts to carry forward:

- Crab-Science is currently a runnable technical preview, best described as `Phase 2.5 + Phase 3 alpha`.
- Green local tests prove module behavior, not real Provider, workDir/Git, CLI Ink, or remote CI behavior.
- Any EvolutionEngine mutation needs a user-visible decision path or an explicit, auditable policy.
- `workDir` must be treated as the source of truth for project assets; `process.cwd()` is not an equivalent substitute.
- A generated event is not a finished product capability until the CLI consumes it and exposes the resulting state or decision.
- Keep Node 20.x as a hard invariant because SQLite uses native bindings.

Next restart pointer: read the handoff, then implement the integration-hardening slice before the remaining HITL slices.

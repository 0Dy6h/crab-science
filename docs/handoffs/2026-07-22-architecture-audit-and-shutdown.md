# 2026-07-22 Architecture Audit And Shutdown Handoff

## Goal

Close the day by turning the first-principles architecture audit into durable project context. The project is at a runnable technical-preview stage: the core Agent path is real, while the self-evolution loop still has integration and user-control gaps.

## Current state

- The project is best classified as `Phase 2.5 + Phase 3 alpha`, not production-ready software.
- The repository contains 70 runtime TypeScript/TSX source files, 35 test files, and 558 passing tests.
- Phase 3 roadmap Slices 1, 2, 4, and 5 are locally complete; Slice 3 (major-change confirmation) and Slice 6 (remote CI) remain open.
- The architecture audit artifact is available at `docs/crab-science-architecture.html`.
- Existing user changes and the previous Phase 3 implementation changes remain in the working tree. No rollback or commit was performed in this shutdown task.

## Completed in this session

- Inspected the current package graph, CLI wiring, Agent loop, Session tree, EvolutionEngine, SQLite storage, Git versioning, Subagent delegation, tests, roadmap, and handoffs.
- Created a standalone architecture and completion map at `docs/crab-science-architecture.html`.
- Recorded the project-level assessment: strong engineering prototype, incomplete product closure, low production readiness.
- Captured the most important integration findings instead of treating module existence or mock tests as end-to-end proof.
- Added a short project-memory pointer at `docs/memory/2026-07-22-current-project-memory.md`.
- Updated `.codex/skills/node-sqlite-runtime-hygiene/SKILL.md` with reusable verification rules for real Provider, workDir/Git, persistence, and event-consumer checks.
- Updated the active Phase 3 roadmap with the audit-discovered integration debt and a better next-step order.

## Audit findings to preserve

### P0: user control and real execution

- `optimization_proposed` is emitted and stored in the CLI hook, but there is no Ink accept/reject loop and no refusal record.
- Evolution helpers pass `model: ''` to the LLM layer. Mock providers do not expose this; real Provider smoke tests have not proved the path.

### P1: integration correctness

- `SubagentDelegator` records an empty tool name on `tool_call_end`, so tool-using Subagents are not yet reliable.
- The delegated execution path advertises a tool allowlist but executes against the full registry.
- SkillVersioner assumes `process.cwd()` while the CLI supports a configured `workDir`; GitManager also reduces repository-external paths to a basename.
- SkillLoader exposes `setSkillMetricsRepo()` but the current CLI startup path does not wire it after SQLite initialization. EvolutionEngine and CLI history can therefore read different stores.
- Evolution events are collected but not rendered as a user-facing CLI surface. A generated event is not a completed product capability until a consumer and decision path exist.

### P2: product depth and delivery

- `/knowledge view`, `/versions --diff`, `/versions --rollback`, `/evolve status`, and `/subagents delete` are not complete.
- Remote GitHub Actions has not run. GitHub authentication with `workflow` scope is still required before pushing the workflow.
- Real API-provider, real workDir, full Ink interaction, and release/upgrade recovery behavior remain unverified.

## Key files and artifacts

- `docs/crab-science-architecture.html`
- `docs/memory/2026-07-22-current-project-memory.md`
- `docs/plans/2026-07-22-phase3-roadmap.md`
- `packages/evolution-engine/src/evolution-engine.ts`
- `packages/evolution-engine/src/subagent/subagent-delegator.ts`
- `packages/evolution-engine/src/skill/skill-optimizer.ts`
- `packages/evolution-engine/src/skill/skill-versioner.ts`
- `packages/storage/src/git-manager.ts`
- `apps/cli/src/hooks/use-agent.ts`
- `apps/cli/src/app.tsx`
- `.codex/skills/node-sqlite-runtime-hygiene/SKILL.md`

## Verification

- `Node v20.20.2` was used for the fresh test run.
- `vitest run` — passed: 34 test files, 558 tests.
- HTML structural check — passed: one balanced HTML document, one balanced SVG, no `<script>` tag, no trailing whitespace.
- Skill frontmatter and appended section were inspected manually. The provided `quick_validate.py` could not run because this host's `python` command is Python 2.7; the validator requires Python 3 and its allowed-frontmatter schema does not match the existing repo-local skill metadata.
- Earlier in the same continuation, workspace-local `tsup` builds and `tsc --noEmit` checks passed for `packages/shared`, `packages/storage`, `packages/llm-layer`, `packages/evolution-engine`, `packages/agent-core`, and `apps/cli`.
- Root `pnpm typecheck` remains unsuitable in the current sandbox because portable Node tries to access `C:\Users\12035`; use the documented workspace-local Node 20 fallback.

## Recommended next step

Implement one focused integration-hardening slice before taking on the remaining HITL work: pass a real evolution model, make workDir and Git repository paths explicit, preserve Subagent tool names and allowlists, and wire SkillLoader to SQLite. Add integration tests that exercise the actual composition boundary.

After that slice, return to the CLI major-change confirmation loop, then authenticate and confirm remote CI.

## Recommended reading order

1. `AGENTS.md`
2. `docs/memory/2026-07-22-current-project-memory.md`
3. `docs/crab-science-architecture.html`
4. `docs/plans/2026-07-22-phase3-roadmap.md`
5. This handoff
6. The P0/P1 source files listed above

## Recommended skill / toolset

- `node-sqlite-runtime-hygiene`
- `session-handoff`
- `test-driven-development`
- `systematic-debugging`
- `github-auth` and `git-workflow` only when remote CI work is authorized

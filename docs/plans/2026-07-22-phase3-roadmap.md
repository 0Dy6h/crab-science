# Phase 3 Completion Roadmap Implementation Plan

> **For Hermes:** Use test-driven-development skill to implement this plan task-by-task. Keep this file as the single active Phase 3 roadmap; archive any future superseded roadmap under `docs/plans/archive/`.

**Goal:** Close the remaining Phase 3 PRD acceptance gaps for Crab-Science's self-evolution system while preserving the verified Node 20 / SQLite baseline.

**Architecture:** Phase 3 is already implemented across `packages/storage`, `packages/evolution-engine`, `packages/agent-core`, and `apps/cli`. The remaining work should be thin vertical slices that turn the implemented modules into PRD-visible, CLI-verifiable behavior, with focused tests before each code change.

**Tech Stack:** TypeScript, pnpm 9.7.0, Turborepo, Vitest, Node.js 20.20.2, better-sqlite3, isomorphic-git, Ink CLI.

---

## Source Of Truth

- This file is the only active Phase 3 roadmap.
- Handoffs are continuation notes only:
  - `docs/handoffs/2026-07-22-node20-sqlite-baseline.md`
  - `docs/handoffs/2026-07-22-ci-node20-validation.md`
  - `docs/handoffs/2026-07-22-phase3-roadmap-slice1.md`
  - `docs/handoffs/2026-07-22-jsonl-migration-regression.md`
  - `docs/handoffs/2026-07-22-end-of-day.md`
- Product acceptance source: `docs/phase3-prd.md`
- Architecture source: `docs/phase3-architecture.md`

## Current Baseline

- Node runtime policy is pinned to Node.js 20.x through `.node-version`, `.nvmrc`, `.npmrc`, and `package.json#engines`.
- Local Node 20.20.2 validation has passed:
  - `pnpm install --frozen-lockfile`
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm test` (33 test files, 554 tests)
- GitHub Actions CI exists at `.github/workflows/ci.yml` but has not run remotely yet.
- Local `main` is ahead of `origin/main`; pushing the CI workflow currently requires refreshing GitHub auth with `workflow` scope.
- `docs/plans/` previously had no active roadmap; this file fixes the single-plan gap.

## Phase 3 Technical Acceptance Audit

| PRD technical acceptance item | Status | Evidence / gap |
|---|---:|---|
| `pnpm build` succeeds with no TypeScript errors | Done | Verified locally under Node 20.20.2 in the CI validation handoff. |
| Install, build, test, and runtime use Node.js 20.x; Node 24 is blocked | Done | `.node-version`, `.nvmrc`, `.npmrc`, `engines.node`, and Node 24 engine rejection are in place. |
| `packages/evolution-engine/` and `packages/storage/` exist | Done | Both packages exist with source, tests, package configs, and exports. |
| SQLite database can create, read, write, and migrate | Done locally | `CrabDatabase`, repositories, migrations, and storage tests exist. Slice 2 added direct JSONL migration regression coverage. |
| Phase 2 `executions.jsonl` can migrate to SQLite | Done locally | `002_jsonl_import.ts` implements import and `.migrated` backup; `database.test.ts` now pins valid-row import, invalid-line skip, field preservation, successful `.migrated` rename, and failed-insert no-rename behavior. |
| Skill metrics evaluator computes the three metrics correctly | Done | `metrics-evaluator.test.ts` and boundary tests cover success rate, duration trend, satisfaction, and thresholds. |
| Skill optimizer can generate structured LLM suggestions | Done / mock-backed | `SkillOptimizer` has LLM and fallback template paths. Acceptance still needs real-provider smoke later. |
| Skill version iteration records Git commits | Done | `SkillVersioner` and `GitManager` are implemented and tested. |
| Skill validation and automatic rollback work | Done | `skill-validator` tests cover validation and rollback behavior. |
| Subagent pattern detection identifies repeated patterns | Done | `pattern-detector` tests cover repeated pattern detection. |
| Subagent creation, delegation, and execution work | Partial | Creator, delegator, registry, and evaluator exist. End-to-end CLI-visible verification remains incomplete. |
| Transparent Subagent execution is stored in session tree child branches | Partial | `SubagentDelegator` uses session fork/summarize flow, but needs focused integration coverage. |
| Experience extraction produces meaningful key learnings | Done / mock-backed | `ExperienceExtractor` exists; real-provider quality remains a later acceptance smoke. |
| Knowledge graph retrieval finds relevant experience and injects context | Done | `KnowledgeGraph`, `KnowledgeRetriever`, `ContextBuilder`, and prompt injection paths exist with tests. |
| Evolution Engine scheduler triggers on cycle/threshold | Done | `evolution-engine.test.ts` covers scheduling, event callbacks, non-blocking completion, and guards. |
| User confirmation is triggered for major changes | Partial | Event path exists for `optimization_proposed`, but CLI confirmation UX is not complete. |
| CLI commands `/evolve`, `/subagents`, `/knowledge`, `/versions` work | Mostly done | `/knowledge` and `/versions` now exist with command-handler tests. Remaining depth: `/knowledge view`, Git-backed `/versions --diff`, and rollback UX. |
| Evolution analysis uses independent model config | Done | `evolutionModel`, provider inference, validation, and `useAgent` provider setup exist. |
| Existing tests and Phase 3 tests pass | Done locally | `pnpm build`, `pnpm typecheck`, and `pnpm test` passed under Node 20.20.2; current suite is 33 files / 554 tests. |

## Vertical Slices

### Slice 1: PRD CLI Command Compatibility

- Type: AFK
- Blocked by: None
- Status: Done locally on 2026-07-22
- Goal: Users can type the PRD command names `/knowledge` and `/versions` and get functional Phase 3 output.
- What to build: Add command-handler tests for the PRD command names, include `apps/**/__tests__/**/*.test.ts` in Vitest, and route `/knowledge` to the existing experience listing/search behavior and `/versions` to the existing changelog/version-history behavior.
- Acceptance criteria:
  - [x] `/knowledge` lists recent experiences.
  - [x] `/knowledge search <keyword>` filters recent experiences by task, key learning, tag, or skill.
  - [x] `/versions <skill>` shows changelog entries for that skill.
  - [x] `/help` lists `/knowledge` and `/versions`, while existing `/experience` and `/changelog` remain supported as aliases.
- Verification:
  - `vitest run apps/cli/__tests__/commands/handler.test.ts` under Node 20.20.2 — passed.
  - `pnpm build` under Node 20.20.2 — passed.
  - `pnpm typecheck` under Node 20.20.2 — passed.
  - `pnpm test` under Node 20.20.2 — passed: 33 test files, 551 tests.

### Slice 2: JSONL Migration Regression Test

- Type: AFK
- Blocked by: None
- Status: Done locally on 2026-07-22
- Goal: The Phase 2 `executions.jsonl` migration acceptance item is locked by a direct test.
- What to build: Add a storage test that creates a temp `skills/<skill>/executions.jsonl`, initializes `CrabDatabase`, asserts rows exist in `skill_executions`, and asserts the source file is renamed to `.migrated`.
- Acceptance criteria:
  - [x] Valid JSONL rows migrate into SQLite.
  - [x] Invalid lines are skipped without aborting valid rows.
  - [x] Source file is renamed only after successful insert.
- Verification:
  - `vitest run packages/storage/__tests__/database.test.ts` under Node 20.20.2 — passed: 1 test file, 7 tests.
  - `pnpm test` under Node 20.20.2 — passed: 33 test files, 554 tests.
  - `pnpm typecheck` under Node 20.20.2 — passed.
  - `pnpm build` under Node 20.20.2 — passed.

### Slice 3: CLI Major-Change Confirmation Loop

- Type: HITL
- Blocked by: UX decision on exact y/n prompt behavior inside Ink.
- Goal: Major optimization suggestions require explicit user confirmation before mutation.
- What to build: Surface `optimization_proposed` events in CLI state, display summary/diff, accept or reject confirmation, and call `EvolutionEngine.applyOptimization()` only on acceptance.
- Acceptance criteria:
  - [ ] Major suggestion is shown without auto-applying.
  - [ ] Accept path applies the suggestion and records changelog.
  - [ ] Reject path records the refusal without mutation.
- Verification:
  - Focused CLI hook/component tests if introduced.
  - `pnpm typecheck`
  - `pnpm test`

### Slice 4: Subagent Branch Transparency Integration

- Type: AFK
- Blocked by: Slice 1 only if using CLI command output in verification.
- Goal: Subagent delegation leaves a visible session tree child branch and a summary node on the main branch.
- What to build: Add an integration test around `DelegateTool` / `SubagentDelegator` with a mock provider and session manager.
- Acceptance criteria:
  - [ ] Delegate call forks a child branch.
  - [ ] Subagent result summary returns to the caller.
  - [ ] Failed subagent execution returns a failure summary without throwing through the main agent.
- Verification:
  - Focused agent-core/evolution-engine subagent test.
  - `pnpm test`

### Slice 5: `/versions` Git History Detail

- Type: AFK
- Blocked by: Slice 1.
- Goal: `/versions <skill>` can show actual Git-backed skill history, not only in-memory changelog entries.
- What to build: Expose safe read-only history from `EvolutionEngine` / `GitManager` to CLI and format version history.
- Acceptance criteria:
  - [ ] Existing skill with commits shows hash, timestamp, and message.
  - [ ] Unknown skill returns a clear empty-state message.
  - [ ] No rollback is performed unless an explicit rollback subcommand is later implemented.
- Verification:
  - Focused command-handler tests.
  - `pnpm typecheck`
  - `pnpm test`

### Slice 6: Remote CI Confirmation

- Type: HITL
- Blocked by: GitHub push/PR creation and a token that includes `workflow` scope for `.github/workflows/ci.yml`.
- Goal: Confirm `.github/workflows/ci.yml` passes on GitHub-hosted Ubuntu and Windows.
- What to build: No code unless remote CI fails.
- Acceptance criteria:
  - [ ] CI passes on `ubuntu-latest`.
  - [ ] CI passes on `windows-latest`.
  - [ ] Any platform-specific failure is captured as a follow-up slice.
- Verification:
  - GitHub Actions run result.

## Selected Next Slice

Slice 1 and Slice 2 are complete locally. Next implement Slice 4, because it is the next AFK acceptance gap; Slice 3 remains HITL until the exact CLI confirmation UX is chosen.

## Task Plan For Slice 4

### Task 1: Map the delegation path

**Objective:** Identify the smallest test seam that exercises `DelegateTool` and `SubagentDelegator` without requiring a real provider.

**Files to inspect first:**
- `packages/agent-core/src/tools/delegate-tool.ts`
- `packages/evolution-engine/src/subagent/subagent-delegator.ts`
- `packages/agent-core/src/session/manager.ts`
- Existing tests under `packages/agent-core/__tests__/session/` and `packages/evolution-engine/__tests__/subagent/`

### Task 2: Write focused branch-transparency tests

Add one integration-style test that uses a mock provider/session manager and asserts:
- a delegate call forks a child branch;
- the subagent result summary is attached or returned to the caller path;
- a failed subagent execution returns a failure summary instead of throwing through the main agent.

### Task 3: Patch only the missing integration behavior

If the tests expose a gap, keep the production change inside the delegation/session boundary. Do not broaden CLI behavior in this slice unless the test specifically needs CLI-visible output.

### Task 4: Verify

Run under Node 20.20.2:
- focused Slice 4 test file;
- `pnpm typecheck`;
- `pnpm test`.

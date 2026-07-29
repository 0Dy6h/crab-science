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
- Slice 4 and Slice 5 are now complete locally: subagent delegation records transparent session-tree branches, and `/versions <skill>` can prefer Git-backed history when available.

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
| Transparent Subagent execution is stored in session tree child branches | Done locally | `delegate-tool-integration.test.ts` covers task/result child branch creation, summary return to caller, and failure summary without throwing. |
| Experience extraction produces meaningful key learnings | Done / mock-backed | `ExperienceExtractor` exists; real-provider quality remains a later acceptance smoke. |
| Knowledge graph retrieval finds relevant experience and injects context | Done | `KnowledgeGraph`, `KnowledgeRetriever`, `ContextBuilder`, and prompt injection paths exist with tests. |
| Evolution Engine scheduler triggers on cycle/threshold | Done | `evolution-engine.test.ts` covers scheduling, event callbacks, non-blocking completion, and guards. |
| User confirmation is triggered for major changes | Partial | Event path exists for `optimization_proposed`, but CLI confirmation UX is not complete. |
| CLI commands `/evolve`, `/subagents`, `/knowledge`, `/versions` work | Mostly done | `/knowledge` and `/versions` now exist with command-handler tests. `/versions <skill>` prefers Git-backed history when available. Remaining depth: `/knowledge view`, `/versions --diff`, and rollback UX. |
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
- Status: Done locally on 2026-07-22
- Goal: Subagent delegation leaves a visible session tree child branch and a summary node on the main branch.
- What to build: Add an integration test around `DelegateTool` / `SubagentDelegator` with a mock provider and session manager.
- Acceptance criteria:
  - [x] Delegate call forks a child branch.
  - [x] Subagent result summary returns to the caller.
  - [x] Failed subagent execution returns a failure summary without throwing through the main agent.
- Verification:
  - `vitest run packages/agent-core/__tests__/subagents/delegate-tool-integration.test.ts` under Node 20.20.2 — passed: 1 test file, 2 tests.
  - Workspace-local `tsup` build for all packages/apps under Node 20.20.2 — passed.
  - Workspace-local `tsc --noEmit` for all packages/apps under Node 20.20.2 — passed.
  - `vitest run` under Node 20.20.2 — passed: 34 test files, 556 tests after Slice 4; 34 test files, 558 tests after Slice 5.

### Slice 5: `/versions` Git History Detail

- Type: AFK
- Blocked by: Slice 1.
- Status: Done locally on 2026-07-22
- Goal: `/versions <skill>` can show actual Git-backed skill history, not only in-memory changelog entries.
- What to build: Expose safe read-only history from `EvolutionEngine` / `GitManager` to CLI and format version history.
- Acceptance criteria:
  - [x] Existing skill with commits shows hash, timestamp, and message.
  - [x] Unknown skill returns a clear empty-state message.
  - [x] No rollback is performed unless an explicit rollback subcommand is later implemented.
- Verification:
  - `vitest run apps/cli/__tests__/commands/handler.test.ts` under Node 20.20.2 — passed: 1 test file, 6 tests.
  - Workspace-local `tsup` build for all packages/apps under Node 20.20.2 — passed.
  - Workspace-local `tsc --noEmit` for all packages/apps under Node 20.20.2 — passed.
  - `vitest run` under Node 20.20.2 — passed: 34 test files, 558 tests.

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

Slice 1, Slice 2, Slice 4, Slice 5, and **Slice H (integration hardening)** are complete locally. The remaining roadmap items are HITL:
- Slice 3: CLI major-change confirmation loop, blocked on exact Ink y/n prompt behavior.
- Slice 6: remote CI confirmation, blocked on GitHub auth/push with `workflow` scope.

## Slice H: Integration Hardening

- Type: AFK
- Status: Done locally on 2026-07-26
- Goal: Turn the self-evolution loop from "green mock tests, inert against a real provider" into a loop that actually runs end to end, and stop it from silently lying or corrupting version history. Driven by a 2026-07-26 first-principles audit (6 parallel finder agents + direct source reads; 56 raw findings, P0s independently reconfirmed).
- What was built / fixed:
  - **EVO-001 evolution model plumbing.** `SkillOptimizer`, `ExperienceExtractor`, and `SubagentCreator` no longer send `model: ''`. `EvolutionEngine` takes an explicit `evolutionModel` and threads it into all three. `apps/cli/src/hooks/use-agent.ts` resolves the evolution provider **and** model together, falling back to the main model when the evolution provider falls back (so a deepseek model id is never sent to Anthropic).
  - **LLM boundary guard.** `AnthropicProvider`/`OpenAIProvider` (and DeepSeek via inheritance) throw `LLMError` when `model` is empty, so the defect fails fast instead of costing a 400 round trip.
  - **EVO-002 config validation.** `ConfigManager.validate()` rejects empty/unrecognized `evolutionModel`.
  - **EVO-003 skill version.** Execution rows are written with the Skill's live `currentVersion` (read from `skill_metrics`), so the validation window can actually close and auto-rollback can fire.
  - **P-01 store coherence.** `use-agent.ts` now calls `SkillLoader.setSkillMetricsRepo()` after SQLite init, so loader reads and EvolutionEngine writes hit one store.
  - **Subagent delegation (SUB-01/02/03/08).** `SubagentDelegator.executeSubagentLoop` preserves tool names across `tool_call_start`, enforces the declared tool allowlist, appends the paired `assistant` `tool_use` message before tool results, forwards tool-error text, and runs tools in the configured `workDir` (not `process.cwd()`). `Agent` also writes tool-error text into the session node.
  - **workDir / Git path correctness (WD-1/WD-2/SEC-01/SEC-02).** `SkillVersioner`/`SkillOptimizer` locate `SKILL.md` under the configured `workDir`. `GitManager.toRelativePath` throws `PathOutsideRepoError` instead of collapsing out-of-repo paths to a basename; new `GitManager.isWithinRepo()` lets `SkillVersioner` refuse to mutate a skill it cannot version/roll back (checked before any file write).
  - **Self-modification safety (SEC-03/EVO-007/SEC-09).** LLM-supplied subagent names are sanitized (`assertSafeArtifactName`/`sanitizeArtifactName` in `@crab-science/shared`) and `save()` asserts the write path stays inside the subagents dir. `applyModification` no longer degenerates to "match line 0" on an empty section.
  - **F1 error surfacing.** `useAgent` renders the agent's `error` event to the user instead of swallowing it.
- Acceptance criteria:
  - [x] No evolution LLM call sends an empty model; providers reject empty models at the boundary.
  - [x] Delegated subagents call tools by name, only within their allowlist, with valid provider message sequencing.
  - [x] Skill version control refuses to mutate files outside the evolution Git repo rather than corrupting history.
  - [x] LLM-authored artifact names cannot escape their target directory.
  - [x] SkillLoader and EvolutionEngine share one SQLite metrics store.
  - [x] Provider/agent errors are visible in the CLI.
- Verification (Node 20.20.2, workspace-local binaries):
  - `vitest run` — passed: 39 test files, 578 tests (was 34 / 558; +20 regression tests across `provider-model-guard`, `artifact-name`, `git-manager-containment`, `subagent-creator-safety`, `delegator-tool-loop`, and config `evolutionModel` validation).
  - Workspace-local `tsup` build for all packages + cli — passed.
  - Workspace-local `tsc --noEmit` for all packages + cli — passed.
  - Toolchain note: the workspace had been relocated from `D:\开发\...`, leaving every pnpm symlink in `node_modules` dangling; a `pnpm install` under Node 20 (with `CI=1 --config.confirmModulesPurge=false`) was required before anything could build or test. See [[crab-science-node20-invariant]].

## Post-audit Integration Debt

The 2026-07-22 audit (reconfirmed and extended on 2026-07-26) found integration gaps not represented by the earlier slice count. **Slice H resolved the P0/P1 core of these:**

- [x] Pass an explicit evolution model to SkillOptimizer, ExperienceExtractor, and SubagentCreator. (Real-provider smoke still pending — capability is now correctly wired, not mock-only.)
- [x] Make `workDir` and Git repository paths explicit so project Skill versioning works outside `process.cwd()` and does not collapse paths to a basename.
- [x] Preserve Subagent tool names across stream events and enforce the declared tool allowlist in the execution loop.
- [x] Wire SkillLoader to the same SQLite SkillMetricsRepository used by EvolutionEngine.
- [ ] Changelog is still a process-local array; the SQLite `changelog` table has no readers/writers (P-02). `/changelog` and `/versions` in-memory entries do not survive restart. **Deferred** to a follow-up (add `ChangelogRepository`).
- [ ] Consume EvolutionEngine events in the CLI so proposals, ratings, rollback, and completion become visible and actionable. Partially addressed (errors now surface); the full `optimization_proposed` confirmation loop is Slice 3.

Deferred with rationale (not in Slice H): extension-loader sandboxing (SEC-05, large, by-design plugin trust), bash env-scrubbing of API keys (SEC-07), realpath/symlink containment (WD-7), context-window trimming (F7), TreeView reachability (F5), and a multi-root evolution Git repo (currently the evolver refuses to modify project-local skills rather than commit into the user's own repo).

These are implementation findings from source inspection, not new acceptance claims. The visual evidence map is in `docs/crab-science-architecture.html`; the durable records are in `docs/handoffs/2026-07-22-architecture-audit-and-shutdown.md` and `docs/handoffs/2026-07-26-integration-hardening-slice-h.md`.

## Remaining Task Plan

### Task 1: Resolve HITL Direction

Choose the next human-approved path:
- Slice 3 needs the exact CLI confirmation UX for major optimization suggestions.
- Slice 6 needs GitHub auth with `workflow` scope, then a push and remote CI check.

### Task 2: Keep Node 20 Validation

Run under Node 20.20.2:
- focused tests for the selected slice;
- workspace-local `tsup` build and `tsc --noEmit` if sandboxed `pnpm` is blocked;
- `vitest run`.

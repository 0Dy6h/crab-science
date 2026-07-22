# 2026-07-22 JSONL Migration Regression Handoff

## Goal

Implement Slice 2 from the Phase 3 roadmap: lock the Phase 2 `executions.jsonl` to SQLite migration acceptance item with a direct regression test.

## Current state

- Slice 2 is complete locally and marked done in `docs/plans/2026-07-22-phase3-roadmap.md`.
- `packages/storage/__tests__/database.test.ts` now creates a legacy `~/.crab-science/skills/<skill>/executions.jsonl` fixture and verifies migration into `skill_executions`.
- The test covers valid-row import, invalid JSON line skipping, default/preserved fields, `executions.jsonl.migrated` backup creation, and failed-insert no-rename behavior.
- The storage database test now changes `process.cwd()` to the temp test directory, so migration scans do not touch a repo-local `skills/` directory during tests.

## Completed in this session

- Added the direct JSONL migration regression test under the `CrabDatabase` initialization suite.
- Added the negative migration regression case for insert failure: no `.migrated` file is created and the original JSONL remains.
- Kept production migration code unchanged; existing `002_jsonl_import.ts` already satisfied the acceptance behavior.
- Updated the single active Phase 3 roadmap to mark Slice 2 done and to refresh the PRD audit evidence.
- Selected Slice 4 as the next AFK slice because Slice 3 still needs a CLI confirmation UX decision.

## Still open / blocked

- Slice 3 remains blocked on HITL UX: exact major-change confirmation behavior inside the Ink CLI.
- Slice 4 is the recommended next implementable slice: subagent delegation branch transparency integration coverage.
- Remote GitHub Actions has still not been observed; local CI-equivalent checks pass.

## Key files and artifacts

- `docs/plans/2026-07-22-phase3-roadmap.md`
- `packages/storage/__tests__/database.test.ts`
- `packages/storage/src/migrations/002_jsonl_import.ts`
- `packages/storage/src/database.ts`
- `docs/handoffs/2026-07-22-phase3-roadmap-slice1.md`

## Verification

- `vitest run packages/storage/__tests__/database.test.ts` under Node 20.20.2 — passed: 1 test file, 7 tests.
- `vitest run packages/agent-core/__tests__/extensions/loader.test.ts packages/storage/__tests__/database.test.ts` under Node 20.20.2 — passed: 2 test files, 35 tests.
- `pnpm test` under Node 20.20.2 — passed: 33 test files, 554 tests.
- `pnpm typecheck` under Node 20.20.2 — passed.
- `pnpm build` under Node 20.20.2 — passed.

## Recommended next step

Implement Slice 4 from the roadmap: add focused integration coverage showing subagent delegation forks a child session branch, returns a summary to the caller, and converts failed subagent execution into a failure summary.

## Recommended reading order

1. `docs/plans/2026-07-22-phase3-roadmap.md`
2. `packages/agent-core/src/tools/delegate-tool.ts`
3. `packages/evolution-engine/src/subagent/subagent-delegator.ts`
4. `packages/agent-core/src/session/manager.ts`
5. `docs/phase3-prd.md`

## Recommended skill / toolset

- `test-driven-development`
- `node-sqlite-runtime-hygiene` if running root validation or SQLite tests
- `session-handoff`
- `terminal`, `file`, and focused Vitest runs

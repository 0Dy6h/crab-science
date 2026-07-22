# 2026-07-22 CI + Node 20 Validation Handoff

## Goal

Continue the Phase 3 stabilization work after the Node 20 / SQLite baseline handoff, prove the normal root validation path works under Node 20, and make that validation reproducible in CI.

## Current state

- The project still targets Node.js 20.x only, with `20.20.2` declared in `.nvmrc` and `.node-version`.
- Root `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, and `pnpm test` now pass under the local portable Node 20.20.2 runtime.
- A GitHub Actions workflow now exists at `.github/workflows/ci.yml`.
- The CI workflow runs on both `ubuntu-latest` and `windows-latest`, uses pnpm 9.7.0, reads Node from `.node-version`, and runs the same root validation chain.
- Remote CI has not run yet because the workflow is only added locally.

## Completed in this session

### Node 20 root verification

- Confirmed the default shell runtime is Node 24.18.0, so normal project validation must explicitly use Node 20.
- Confirmed the local portable runtime exists at `.workbuddy/tools/node-v20.20.2-win-x64`.
- Re-ran root validation under Node 20.20.2 with elevated shell access because sandboxed global pnpm access cannot lstat `C:\Users\12035`.
- Verified the normal root commands now work, instead of relying only on package-by-package fallback commands.

### CI baseline

- Added `.github/workflows/ci.yml`.
- CI uses:
  - `actions/checkout@v4`
  - `pnpm/action-setup@v4` with `version: 9.7.0`
  - `actions/setup-node@v4` with `node-version-file: .node-version`
  - pnpm cache keyed by `pnpm-lock.yaml`
- CI runs:
  - `pnpm install --frozen-lockfile`
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm test`

## Still open / blocked

- Remote GitHub Actions has not executed yet; verify it after the workflow is pushed or opened in a PR.
- The working tree remains intentionally uncommitted. It includes the prior Node 20 / SQLite baseline changes plus the new CI workflow.
- The next Phase 3 product slice is not selected yet. Start by comparing the implemented code against the Phase 3 PRD technical acceptance checklist.
- `docs/plans/` does not currently contain a single active roadmap file; consider creating one before larger follow-up work.

## Key files and artifacts

- `.github/workflows/ci.yml`
- `.node-version`
- `.nvmrc`
- `.npmrc`
- `package.json`
- `pnpm-lock.yaml`
- `AGENTS.md`
- `.codex/skills/node-sqlite-runtime-hygiene/SKILL.md`
- `docs/handoffs/2026-07-22-node20-sqlite-baseline.md`
- `docs/phase3-prd.md`
- `docs/phase3-architecture.md`

## Verification

- `pnpm install --frozen-lockfile` under Node 20.20.2 — passed.
- `pnpm build` under Node 20.20.2 — passed.
- `pnpm typecheck` under Node 20.20.2 — passed.
- `pnpm test` under Node 20.20.2 — passed: 32 test files passed, 547 tests passed.
- CI workflow file was added and inspected locally, but remote CI has not run.

## Recommended next step

Create or restore a single active Phase 3 roadmap in `docs/plans/`, then choose the next concrete acceptance gap. A good first candidate is a Phase 3 checklist audit: map implemented code and tests against `docs/phase3-prd.md` technical acceptance items, then implement the smallest missing slice.

## Recommended reading order

1. `AGENTS.md`
2. `docs/handoffs/2026-07-22-node20-sqlite-baseline.md`
3. `docs/handoffs/2026-07-22-ci-node20-validation.md`
4. `.github/workflows/ci.yml`
5. `docs/phase3-prd.md` section 7 technical acceptance checklist
6. `docs/phase3-architecture.md` section 7 task list

## Recommended skill / toolset

- `node-sqlite-runtime-hygiene` for any install/build/test/runtime work.
- `writing-plans` and `vertical-slice-planning` if creating the active roadmap.
- `test-driven-development` for the next implementation slice.
- Codegraph for codebase inspection before editing TypeScript code.

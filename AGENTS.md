# AGENTS.md

## Project facts

- This is a pnpm/Turborepo TypeScript monorepo for the Crab-Science科研 AI Agent framework.
- Required runtime is Node.js 20.x. The repo pins 20.20.2 through `.nvmrc` and `.node-version`, and enforces `package.json#engines.node` as `>=20.0.0 <21.0.0` with `.npmrc` `engine-strict=true`.
- Do not use Node 24 for install/build/test/runtime. `better-sqlite3` is a native SQLite dependency; Node 24 can miss Windows prebuilts and fall into source compilation failures.
- Preferred package manager is `pnpm@9.7.0`, as declared in `package.json`.

## Validation notes

- Normal path on a machine with Node 20 active: `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test`.
- In this Windows workspace, a local Node 20 runtime may exist at `.workbuddy/tools/node-v20.20.2-win-x64`; it is ignored by git and should not be committed.
- If global/user `pnpm` is blocked by sandbox permissions under portable Node, validate with local workspace binaries: run `tsup` and `tsc --noEmit` per package, then `vitest run`.

## GitHub notes

- Commits that add or change `.github/workflows/*.yml` require a GitHub token with `workflow` scope. Before pushing CI changes, check `gh auth status`; if `workflow` is absent, run `gh auth refresh -h github.com -s workflow`.

## Project docs

- `docs/phase3-architecture.md` is the main Phase 3 architecture reference for SQLite, evolution engine, storage, knowledge, and skill/subagent versioning.
- `docs/phase3-prd.md` is the Phase 3 product/acceptance reference.
- `docs/handoffs/` contains durable continuation notes; read the newest relevant handoff before continuing a paused task.

## Collaboration

- Do not send optional commentary.

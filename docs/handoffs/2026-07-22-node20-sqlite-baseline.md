# 2026-07-22 Node 20 + SQLite Baseline Handoff

## Goal

Stabilize the Phase 3 SQLite/evolution baseline on Windows and formalize the project runtime policy so future work does not accidentally run `better-sqlite3` under Node 24.

## Current state

- Project runtime policy is now Node.js 20.x only.
- The repo declares Node 20.20.2 in `.nvmrc` and `.node-version`.
- `package.json#engines.node` is `>=20.0.0 <21.0.0`.
- `.npmrc` has `engine-strict=true`, so pnpm rejects Node 24 in this project.
- `better-sqlite3@11.10.0` has a working native binary for Node 20 in the current `node_modules`.
- A portable Node 20.20.2 runtime exists locally at `.workbuddy/tools/node-v20.20.2-win-x64`; this is ignored by git and should stay uncommitted.

## Completed in this session

### Runtime policy

- Added `.nvmrc` and `.node-version` with `20.20.2`.
- Added `.npmrc` with `engine-strict=true`.
- Narrowed the root `engines.node` from `>=20.0.0` to `>=20.0.0 <21.0.0`.
- Updated README and Phase 3 docs to record the Node 20 / SQLite native dependency rule.
- Added project `AGENTS.md` with the project facts future agents need before touching install/build/test flows.
- Added a project-level Codex skill for Node/SQLite runtime hygiene at `.codex/skills/node-sqlite-runtime-hygiene/SKILL.md`.

### Windows / SQLite baseline from this work block

- `BashTool` now handles Windows better by preferring Git Bash and falling back to `cmd.exe`.
- `ExtensionLoader` has an esbuild transform fallback for sandbox/temp-dir access issues.
- SQLite storage and evolution tests were stabilized under Node 20.
- Repository ordering was made deterministic where SQLite row ties could otherwise cause flaky tests.
- `expandTilde()` and `SkillVersioner` now handle Windows home resolution through `HOME` / `USERPROFILE`.

## Still open / blocked

- Normal `pnpm build` / `pnpm typecheck` under portable Node 20 could not be run inside this sandbox because the global/user pnpm entrypoint lives under `C:\Users\12035\AppData\Roaming\npm`, and the sandbox cannot lstat the parent user directory.
- Turbo invokes package scripts through that global pnpm path, so the sandbox-safe verification used local workspace binaries instead.
- On a real developer shell with Node 20 active through nvm/fnm/mise/asdf or a system install, rerun the normal commands:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

- Consider adding CI that runs on Node 20.x so the runtime policy is enforced outside local machines too.
- Consider whether to add a local package-manager bootstrap path, such as Corepack/pnpm pinned locally, if future sandboxed agents need to run root Turbo scripts under portable Node.

## Key files and artifacts

- `.nvmrc`
- `.node-version`
- `.npmrc`
- `package.json`
- `README.md`
- `AGENTS.md`
- `.codex/skills/node-sqlite-runtime-hygiene/SKILL.md`
- `docs/phase3-architecture.md`
- `docs/phase3-prd.md`
- `packages/storage/src/repositories/experience-repo.ts`
- `packages/storage/src/repositories/skill-metrics-repo.ts`
- `packages/shared/src/utils.ts`
- `packages/evolution-engine/src/skill/skill-versioner.ts`
- `packages/agent-core/src/tools/bash-tool.ts`
- `packages/agent-core/src/extensions/loader.ts`

## Verification

- With portable Node 20.20.2:

```powershell
.\node_modules\.bin\vitest.CMD run
```

Result: 32 test files passed, 547 tests passed.

- With portable Node 20.20.2, build equivalent was run package-by-package through local `tsup.CMD`; all workspace packages built successfully before cleanup removed ignored `dist/` outputs.
- With portable Node 20.20.2, typecheck equivalent was run package-by-package through local `tsc.CMD --noEmit`; all workspace packages passed.
- With system Node 24.18.0:

```powershell
pnpm install --frozen-lockfile --ignore-scripts --offline
```

Result: failed fast with `ERR_PNPM_UNSUPPORTED_ENGINE`, expected `>=20.0.0 <21.0.0`, got `v24.18.0`.

## Recommended next step

Start the next session by running a real-shell Node 20 verification of the normal root scripts, then move to the next Phase 3 vertical slice only if `pnpm build`, `pnpm typecheck`, and `pnpm test` are green under Node 20.

## Recommended reading order

1. `AGENTS.md`
2. `.codex/skills/node-sqlite-runtime-hygiene/SKILL.md`
3. `README.md`
4. `docs/phase3-architecture.md` ADR-P3-001 and section 8
5. `docs/phase3-prd.md` technical acceptance checklist

## Recommended skill / toolset

- `node-sqlite-runtime-hygiene` for any install/build/test/runtime work touching SQLite or native dependencies.
- `test-driven-development` when implementing the next Phase 3 vertical slice.
- Local terminal + file editing tools; prefer workspace-local binaries when sandbox restrictions block global pnpm.

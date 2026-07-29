---
name: node-sqlite-runtime-hygiene
description: Use when installing, testing, building, or debugging Crab-Science code that touches SQLite, better-sqlite3, pnpm, Turbo, or Node runtime compatibility.
version: 2
lastUpdated: 2026-07-26
---

# Node / SQLite Runtime Hygiene

This project uses `better-sqlite3`, a native SQLite dependency. The first principle is simple: native Node modules are coupled to the Node ABI, so runtime version selection is part of correctness, not a convenience detail.

## Runtime invariant

- Only Node.js 20.x is supported for this repository.
- The intended local version is 20.20.2, declared in `.nvmrc` and `.node-version`.
- `package.json#engines.node` must stay `>=20.0.0 <21.0.0`.
- `.npmrc` must keep `engine-strict=true`.
- Do not use Node 24 for `pnpm install`, tests, builds, or runtime checks. On Windows, Node 24 can miss `better-sqlite3` prebuilts and fall back to native compilation.

## Before install/build/test

1. Check the runtime:

```powershell
node -v
```

2. If it is not `v20.x`, switch before doing anything that can touch dependencies:

```powershell
nvm use
```

3. If this Windows workspace has the local portable runtime and no version manager is available, prepend it for verification only:

```powershell
$workspace = (Get-Location).Path
$node20 = Join-Path $workspace '.workbuddy\tools\node-v20.20.2-win-x64'
$env:PATH = "$node20;$workspace\node_modules\.bin;$env:PATH"
node -v
```

`.workbuddy/` is ignored by git and must not be committed.

## Normal verification path

On a real shell where Node 20 and pnpm are both available:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

## Sandbox fallback path

If portable Node 20 works but global/user `pnpm` is blocked by sandbox access to `C:\Users\<user>\AppData\Roaming\npm`, avoid Turbo/root pnpm scripts and use workspace-local binaries:

```powershell
$workspace = (Get-Location).Path
$node20 = Join-Path $workspace '.workbuddy\tools\node-v20.20.2-win-x64'
$env:PATH = "$node20;$workspace\node_modules\.bin;$env:PATH"

$packages = @(
  'packages/shared',
  'packages/storage',
  'packages/llm-layer',
  'packages/evolution-engine',
  'packages/agent-core',
  'apps/cli'
)

foreach ($pkg in $packages) {
  Push-Location $pkg
  try {
    & (Join-Path $workspace 'node_modules\.bin\tsc.CMD') --noEmit
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & (Join-Path $workspace 'node_modules\.bin\tsup.CMD')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
}

& (Join-Path $workspace 'node_modules\.bin\vitest.CMD') run
```

Build outputs in `dist/` and Turbo caches are ignored and can be removed after verification.

## Workspace relocation breaks the toolchain (checked 2026-07-26)

pnpm writes **absolute** symlinks into `node_modules` (each `node_modules/<pkg>` points at an absolute path under `node_modules/.pnpm/...`). If the workspace directory is moved or renamed after install — e.g. from `D:\开发\...` to `D:\螃蟹's Projects\...` — every one of those symlinks dangles and points at the old, now-missing path. Symptoms: `vitest`, `tsup`, `tsc`, and any `@crab-science/*` import fail with `Cannot find module` / `ERR_MODULE_NOT_FOUND`, even though `node_modules` looks populated. The sandbox-fallback binaries above will NOT work in this state.

Diagnose by resolving a workspace symlink and checking the target exists:

```bash
readlink node_modules/vitest   # if it points at a path that no longer exists, symlinks are stale
```

Fix by reinstalling under Node 20 (this also rebuilds `better-sqlite3` for the current ABI). pnpm will prompt to purge `node_modules`; make it non-interactive:

```bash
CI=1 pnpm install --frozen-lockfile --prefer-offline --config.confirmModulesPurge=false
```

Do this **first** in any fresh session whose repo path differs from where dependencies were originally installed. A plain `pnpm install` may exit 0 at the interactive purge prompt without actually reinstalling — always pass the flags above.

## Vitest resolves to src, tsc resolves to dist

Two different module-resolution rules apply in this monorepo, and confusing them wastes time:

- Root `vitest.config.ts` aliases every `@crab-science/*` to that package's `src/index.ts`. So **tests run against source** — you do not need to build a package to test changes to it, and a cross-package edit is visible to tests immediately.
- `tsc` and `tsup` (and the built CLI at runtime) resolve `@crab-science/*` through each package's `package.json` `exports`, i.e. its built `dist/`. So **typecheck sees stale types** until you rebuild.

Consequence: if a downstream package's `tsc --noEmit` reports "no exported member X" or "property Y does not exist" for a symbol you just added to `shared`/`storage`, that is a stale-`dist` error, not a real one. Rebuild dependencies in order (`shared` → `storage` → `llm-layer` → `evolution-engine` → `agent-core` → `apps/cli`) before typechecking downstream. Tests passing while typecheck fails is the tell.

## CI workflow push note

This repository's CI workflow validates the Node 20 / SQLite baseline. When a commit adds or edits `.github/workflows/*.yml`, GitHub requires the pushing token to include the `workflow` scope.

Before pushing CI workflow changes:

```powershell
gh auth status
gh auth refresh -h github.com -s workflow
```

## Failure interpretation

- `ERR_PNPM_UNSUPPORTED_ENGINE` under Node 24 is expected and good; it means the guardrail is working.
- `better-sqlite3` attempting source compilation usually means the wrong Node version or missing native prebuilt for the active ABI.
- If SQLite tests are skipped or fail to load `better-sqlite3`, verify Node version before changing storage code.

## Integration truth checks

Use these checks before calling a Node/SQLite-backed evolution change complete. Slice H (2026-07-26) fixed the P0 versions of all of these and added regression tests — treat those tests as the guardrail and keep them green:

- Treat mock-backed EvolutionEngine tests as unit evidence only. Run a real Provider smoke path, or label the capability explicitly as mock-backed. (Real-provider smoke is still pending.)
- Pass an explicit non-empty model through every evolution LLM call. Providers now throw on `model: ''` — see `packages/llm-layer/__tests__/provider-model-guard.test.ts`.
- Treat the configured `workDir` as the source of truth for project Skills and Extensions. `GitManager` now refuses (throws `PathOutsideRepoError`) rather than basename-collapsing out-of-repo paths — see `packages/storage/__tests__/git-manager-containment.test.ts`.
- Wire the SkillLoader execution logger to the same SQLite repository used by EvolutionEngine after database initialization (done in `apps/cli/src/hooks/use-agent.ts`). Do not assume a fallback JSONL reader observes SQLite writes.
- Trace every EvolutionEngine event to a CLI consumer. An emitted event without a rendered state, user decision, or persisted audit record is not a completed product capability. (Errors now surface; the `optimization_proposed` confirmation loop and changelog persistence are still open.)
- For Subagent integration, test at least one tool-using delegation, not only a text-only provider response. Preserve the tool name from `tool_call_start` through execution and enforce the declared allowlist — see `packages/agent-core/__tests__/subagents/delegator-tool-loop.test.ts`.
- Never let an LLM-authored artifact name reach the filesystem unsanitized — use `assertSafeArtifactName`/`sanitizeArtifactName` from `@crab-science/shared`; see `packages/shared/__tests__/artifact-name.test.ts`.

## What to preserve

- Keep `.nvmrc`, `.node-version`, `.npmrc`, and `engines.node` aligned.
- Keep README and Phase 3 docs in sync when runtime policy changes.
- Record any new native dependency runtime constraint in `AGENTS.md` so future agents see it before running commands.

---
name: node-sqlite-runtime-hygiene
description: Use when installing, testing, building, or debugging Crab-Science code that touches SQLite, better-sqlite3, pnpm, Turbo, or Node runtime compatibility.
version: 1
lastUpdated: 2026-07-22
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

## What to preserve

- Keep `.nvmrc`, `.node-version`, `.npmrc`, and `engines.node` aligned.
- Keep README and Phase 3 docs in sync when runtime policy changes.
- Record any new native dependency runtime constraint in `AGENTS.md` so future agents see it before running commands.

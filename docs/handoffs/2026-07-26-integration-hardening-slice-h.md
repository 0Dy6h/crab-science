# 2026-07-26 Integration Hardening (Slice H) Handoff

## Goal

Turn the Phase 3 self-evolution loop from "green mock tests, inert against a real LLM provider" into a loop that runs end to end, and stop it from silently lying or corrupting version history. Driven by a first-principles audit rather than the existing slice count.

## What prompted this

A 2026-07-26 first-principles audit (6 parallel finder agents reading real source, plus direct reads in the main session) produced 56 raw findings across 6 areas. The adversarial-verify and synthesis phases of the audit workflow failed on an API context-config error, so the P0s were re-verified by hand. The confirmed core: every existing test injects a mock provider that ignores `options.model` and returns canned JSON, so the whole evolution mechanism was provably broken against any real API and no test caught it.

## Completed in this session

Slice H is complete locally. See `docs/plans/2026-07-22-phase3-roadmap.md` → "Slice H: Integration Hardening" for the full item list and acceptance criteria. Summary of source changes:

- **Evolution model plumbing (EVO-001/002).** `EvolutionEngine` now takes an explicit `evolutionModel` (+ `workDir`) and threads the model into `SkillOptimizer`, `ExperienceExtractor`, `SubagentCreator` (all previously hardcoded `model: ''`). `use-agent.ts` resolves evolution provider and model together and falls back to the main model when the provider falls back. `ConfigManager.validate()` rejects empty/unrecognized `evolutionModel`.
- **LLM boundary guard.** `AnthropicProvider`/`OpenAIProvider` throw `LLMError` on empty model.
- **Skill version + store coherence (EVO-003/P-01).** Execution rows use the live `currentVersion`; `use-agent.ts` wires `SkillLoader.setSkillMetricsRepo()` after SQLite init so reads/writes share one store.
- **Subagent delegation (SUB-01/02/03/08).** `executeSubagentLoop` preserves tool names, enforces the tool allowlist, pairs `assistant` `tool_use` messages before tool results, forwards error text, and uses `workDir`.
- **workDir / Git correctness + self-mod safety (WD-1/WD-2/SEC-01/02/03/09, EVO-007).** `SkillVersioner`/`SkillOptimizer` use `workDir`; `GitManager.toRelativePath` throws `PathOutsideRepoError` instead of basename-collapsing, with a new `isWithinRepo()` pre-check so `SkillVersioner` refuses to mutate un-versionable skills before writing; artifact names are sanitized and containment-checked; `applyModification` no longer matches line 0 on an empty section.
- **F1.** `useAgent` renders the agent `error` event to the user.

New regression tests (+20): `packages/llm-layer/__tests__/provider-model-guard.test.ts`, `packages/shared/__tests__/artifact-name.test.ts`, `packages/storage/__tests__/git-manager-containment.test.ts`, `packages/evolution-engine/__tests__/subagent/subagent-creator-safety.test.ts`, `packages/agent-core/__tests__/subagents/delegator-tool-loop.test.ts`, and `evolutionModel` cases in `packages/agent-core/__tests__/config/manager.test.ts`.

## Verification

All under repo-local Node 20.20.2 (`.workbuddy/tools/node-v20.20.2-win-x64`):

- `vitest run` — passed: 39 test files, 578 tests (baseline was 34 / 558).
- Workspace-local `tsup` build for all packages + cli — passed.
- Workspace-local `tsc --noEmit` for all packages + cli — passed.

## Toolchain gotcha (important)

The workspace had been moved from `D:\开发\螃蟹的vibe science agent框架` to `D:\螃蟹's Projects\...`. pnpm's `node_modules` symlinks are absolute and pointed at the old, now-deleted path, so **every** cross-package import, `vitest`, `tsup`, and `tsc` was broken at the new location — nothing could build or test until dependencies were reinstalled. Fix that ran clean:

```
CI=1 PATH="<repo>/.workbuddy/tools/node-v20.20.2-win-x64:$PATH" \
  pnpm install --frozen-lockfile --prefer-offline --config.confirmModulesPurge=false
```

This rebuilt `better-sqlite3` against Node 20. Do this first in any fresh session at this path. Vitest resolves `@crab-science/*` to `src` via root `vitest.config.ts` aliases (no build needed to test), but `tsc` resolves to each package's built `dist`, so rebuild dependencies before typechecking downstream packages.

## Still open / deferred

- **Slice 3 (HITL):** the `optimization_proposed` → user confirm → `applyOptimization()` loop. Errors now surface, but the accept/reject UX is still undecided (Ink y/n behavior).
- **Slice 6 (HITL):** remote CI; needs GitHub auth with `workflow` scope.
- **P-02:** changelog persistence. The SQLite `changelog` table exists (migration 001) but has no readers/writers; `getChangelog()`/`recordChangelog()` use a process-local array, so `/changelog` and `/versions` in-memory entries do not survive restart. Follow-up: add `ChangelogRepository`, wire it into `EvolutionEngine`.
- **Deferred with rationale:** extension-loader sandboxing (SEC-05), bash env-scrubbing (SEC-07), realpath/symlink containment (WD-7), context-window trimming (F7), TreeView reachability (F5), multi-root evolution Git repo. The last is why the evolver currently **refuses** to modify project-local skills (`workDir/skills`) rather than commit into the user's own project git — a deliberate safety choice, not a bug.
- **Real-provider smoke** for the evolution loop remains unverified; the capability is now correctly wired, not proven against a live API.

## Recommended next step

Pick one:
1. P-02 changelog persistence — small, self-contained, makes `/changelog` and `/versions` durable (good AFK follow-up).
2. Slice 3 CLI confirmation loop — the last big product gap for safe self-modification (needs the Ink UX decision).
3. Slice 6 remote CI — needs GitHub auth.

## Recommended reading order

1. `AGENTS.md`
2. `docs/plans/2026-07-22-phase3-roadmap.md` → "Slice H"
3. This handoff
4. `packages/evolution-engine/src/subagent/subagent-delegator.ts` and `apps/cli/src/hooks/use-agent.ts` (the two highest-leverage changed files)

## Session close (2026-07-26)

- **State at close:** all Slice H work complete and verified. `vitest run` green at 39 files / 578 tests; full `tsup` build and `tsc --noEmit` clean across all packages + cli; all `dist/` rebuilt against Node 20.
- **Workspace:** clean. `dist/`, `node_modules/`, `.pnpm-store/` are gitignored and untracked; no stray temp/debug files. The audit workflow's transcripts live under the harness session dir, outside the repo.
- **Not committed.** The working tree holds this slice plus earlier uncommitted Phase 3 work (Slices 4/5 and the 2026-07-22 audit artifacts) — 22 modified + several new files. Nothing was committed or pushed; that decision is left to the user.
- **Skill iterated:** `.codex/skills/node-sqlite-runtime-hygiene/SKILL.md` bumped to v2 — added the workspace-relocation / dangling-pnpm-symlink repair, the vitest-src-vs-tsc-dist resolution note, and pointers from each integration-truth check to its new regression test.
- **Memory iterated:** `crab-science-integration-debt` (fixed vs. open), `crab-science-node20-invariant` (relocation repair + resolution note), and new `crab-science-working-style`.
- **First thing next session:** if the repo path still differs from the original install location, run the `CI=1 pnpm install ... --config.confirmModulesPurge=false` repair before building/testing (see the toolchain gotcha above).

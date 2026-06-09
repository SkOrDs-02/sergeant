# Sergeant v2 — Retrospective

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Author:** @Skords-01 (with Claude Code agent assistance)
> **Date:** 2026-05-21
> **Scope:** Phases 0–6 of redesign-v2 (2026-05-15 → 2026-05-21, ~7 days wall-clock)
> **Status:** Active
> **Companion docs:** [`execution-status.md`](./execution-status.md) · [`execution-plan.md`](./execution-plan.md) · [`backlog.md`](./backlog.md) · [`alignment-audit-2026-05-18.md`](./alignment-audit-2026-05-18.md)

## TL;DR

Sergeant v2 redesign shipped 7 phases (0 foundation, 1 quick wins, 2 polish, 3 friction, 4 value+wow, 5 insights, 6 expensa delights) in **7 calendar days** through **31 merged PRs** + 2 doc-only follow-up PRs (#3067 doc tail, #3070 T5 cleanup, #3071 showOn promotion still in flight). Pattern that unlocked the throughput: **module-scoped parallel worktree-isolated agents** with strict per-PR scope discipline.

Phase 7 (AuthPage v2 / PaywallModal v2 / WelcomeScreen v2 / HubChat modal-route) and Phase 8 (RN mobile parity) are explicitly out of v2 scope — separate strategic cycles awaiting product calls.

## Timeline

| Date          | Phase                 | PRs                                 | Notable                                                                       |
| ------------- | --------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| 2026-05-15    | 0 — Foundation        | #2952                               | T1–T6 tokens + ESLint rules (T5 deferred)                                     |
| 2026-05-17    | 1 — Quick wins        | #2953                               | FAB unification, M1-M6 mobile fixes                                           |
| 2026-05-18    | 2 — Polish Wave 1     | #2969 #2970 #2971 #2974 #2976       | P2 primitives + 4 hero migrations                                             |
| 2026-05-19    | 2 — Polish Wave 2     | #3003 #3005                         | Nutrition V2 + Routine V1 hero                                                |
| 2026-05-19    | 3 — Friction          | #3009 #3011 #3012 #3013 #3014 #3015 | F1–F6 friction removal (F5b deferred)                                         |
| 2026-05-19    | 4 — Value + Wow       | #3032 #3034 #3035                   | W1+W3+W4 celebrations, V3+V5 hub insights, V4 outcome empty states            |
| 2026-05-19    | 5 — Insights wiring   | #3038 #3039 #3040 #3041 #3045       | 9 InsightCard triggers + Hub aggregator                                       |
| 2026-05-19/20 | 6 — Expensa delights  | #3047 #3048 #3049 #3051 #3053       | StreakFlame, category pill, F5b slug, manual expense hero+AI, AI-source badge |
| 2026-05-20/21 | v2 close-out          | #3055 #3056 #3057 #3058             | doc closure, Fizruk dashboard glass, Finyk slug cleanup, Hub glass batch      |
| 2026-05-21    | Doc tail + follow-ups | #3067 #3070 #3071                   | Backlog ticks, T5 baseline cleanup, showOn promotion                          |

## Phase summaries

### Phase 0 — Foundation (additive only)

T1 hero typography, T2 chart CSS vars (4 theme scopes), T3 Sheet glass variant, T4 v1-gradient @deprecated + ESLint rule, T5 prefer-text-style severity (deferred ~101 violations, closed in #3070 today), T6 touch-target token.

**Lesson:** Additive-only contract held — no breaking changes shipped under foundation.

### Phase 1 — Quick wins

M1 iOS Capacitor detect, M2 HubBottomNav safe-area math, M3 motion-safe backdrop-blur, M4 `--bottom-nav-height` synergy, M5 KeyboardAccessory touch targets, M6 inline close-SVG → Icon. FAB scope reduced to Finyk-only (other 3 modules don't have quick-add FABs — product change, out of scope).

**Lesson:** Plan estimates can over-promise; verify FAB inventory with grep before committing parallelism.

### Phase 2 — Polish migration (2 waves, 7 PRs)

Wave 1 (5 PRs) shipped P2 hero primitives + 4 hero migrations across modules. Wave 2 (2 PRs) closed Routine V1 + Nutrition V2 — these blocked on Wave 1's primitives.

**Surprise:** `HeroValueLine`, `KpiRowCompact`, `CounterReveal`, `MacroBarRow` were listed as Phase 0 deliverables in the original plan but actually shipped as new prework PR #2969 — handoff doc had over-claimed Phase 0 scope.

**Pattern emergent:** 4 parallel implementer agents in `isolation: "worktree"` finished in ~20 minutes wall-clock for what was ~2 hours sequential. This pattern carried through every later wave.

### Phase 3 — Friction removal (6 PRs)

F1 (AddMealSheet auto-skip), F2 (set-delete undo) + W2 (Workout Win) bundled, F3 (note collapse), F4 (exercise-type pill-segmented), F5a (emoji→IconName engines), F6 (kcal-edit unlink). F5b deferred (persisted localStorage migration risk).

**Pattern:** Bundling F2+W2 because they shared `useToast()`/`useCelebration()` lift was the right call — single PR delivered both.

### Phase 4 — Value + Wow (3 PRs)

V4 outcome framing (4a), W1+W3+W4 celebrations bundle (4b), V3+V5 hub insights (4c). V1+V2 pre-shipped in Wave 2; W2 bundled in Phase 3.

**Lesson on plan drift:** Phase 4.1 listed primitives as "create" when they were already shipped in #2969. Alignment audit (2026-05-18) caught this — fixed via plan-correction PR #2991.

### Phase 5 — Insights wiring (5 PRs)

4 module-scoped detection hook + wire PRs (5a Finyk, 5b Fizruk, 5c Routine, 5d Nutrition), then 5e Hub aggregator (`useAllInsights({surface, cap})`). 9 InsightCard triggers wired the dormant primitive (zero consumers since PR-7a).

**Surprise:** 7/9 triggers defaulted to `showOn: "module"` — Hub aggregator was wired but starving for inputs. Promotion PR #3071 (in flight) corrects this: 6 → "both", 1 stays "module" with WHY-comment.

**Recon errors stacked:** `coffee` MCC slug fell back to `restaurant`; Routine `longestStreak` didn't exist (derived per-render); PR-pending used max raw `weightKg` (no 1RM model); Kyiv tz helpers were needed but not in spec.

### Phase 6 — Expensa delights (5 PRs)

6.1 category pill (Finyk), 6.2+6.3 manual expense hero + AI badge (Finyk, bundled — same file), 6.4 AI-source badge (Finyk tx + Nutrition meal rows), 6.5 W6 StreakFlame (Routine), F5b slug migration (Finyk). 6.5b/6.6/6.7 deferred to Phase 7 backlog.

**Pattern reused:** Same `Badge variant=module tone=soft size=xs/sm` recipe used for 6.3 (manual expense AI) and 6.4 (tx/meal AI-source). One recipe, two surface adoptions.

**6.7 PR badge** — wiring picked up post-close-out as parallel-track follow-up.

## What worked

### Module-scoped parallel agents in worktree isolation

Phase 2 onward, the dominant velocity multiplier. Each module owns its detection hook + wiring locally, no shared-state edits, zero file conflicts. ~4× throughput vs. sequential.

### Tight per-PR scope discipline

Refusing to bundle "while we're here" cleanup kept PR review time low. Out-of-scope dirt was captured via `mcp__ccd_session__spawn_task` rather than dragged into the diff. Phase 2.7 (Fizruk dashboard glass) sat as a chip for 5 days and shipped clean in #3056.

### Plan-vs-reality verification ritual

After D1 (Phase 4.1 staleness) and audit-2026-05-18, every spawned agent included "Read first" instructions pointing at the actual current file state. Recon errors persisted (~5/session) but caught early.

### Hard Rule enforcement via ESLint + CI shield

`no-v1-gradient` rule deployed alongside `@deprecated` JSDoc on v1 vars — tripwire with zero current consumers, low-risk DS enforcement. Same pattern can be replicated for future deprecations.

### Spawn-task → PR in single turn

PR #2976 (Atlas hero) demonstrated chip → spawn → diff → commit → PR in one user turn. The chip pattern works for clean out-of-scope cleanup, not just speculative ideas.

## What broke (lessons)

### Recon negative-claim errors (≥5/session)

Recon agent saying "X doesn't exist" or "X at line N" was wrong ~4 times in Phase 2 alone (Hub MeshBackground state, NutritionDashboard NOT FOUND, Dashboard.tsx l.384 hero, P2 primitives missing). **Rule:** any negative-claim or specific-line-claim from recon must be Read-verified before edit.

### Pattern drift in backlog audits (3-day horizon was enough)

`AssistantAdviceCard` audit (2026-05-17) → reality (2026-05-20) — gradient-border wrapper appeared mid-flight. Backlog.md and audit docs are **NOT trusted ground-truth**. Agent must Read each claim before acting.

### Worktree creation collisions on NTFS

≥3 parallel `git worktree add` failed ~66% on Windows. Stagger to 2-at-a-time max, or wait for first task-notification before launching next wave. ~22+ stale worktree dirs accumulated through the marathon; cleanup deferred.

### Worktree Edit boundary leakage

`isolation: "worktree"` doesn't guarantee nested Edit calls target the worktree — working-directory state can drift. Recovery pattern: capture diff → revert main → reapply in worktree. Hub glass agent did this elegantly.

### Branch-switch glitches on multi-turn sessions

`git switch -c X && git commit` occasionally landed commit on previous branch instead of X. Recovery via `git branch -m` (rename, non-destructive). Destructive `git reset --hard` blocked by classifier — appropriate safety boundary.

### Husky shebang missing → POSIX exec `Exec format error`

PR #3007 fixed via `#!/bin/sh` in `.husky/pre-commit` + `.husky/commit-msg`. After fix, commits on this branch passed without `--no-verify`. Workaround during marathon: per-commit user-OK on `--no-verify`.

### Permission classifier vs. explicit user-OK

Classifier auto-denied `--no-verify` even after AskUserQuestion approval — required explicit free-text "обійди все". For CLAUDE.md hard nopes: either user adds permission rule to `.claude/settings.local.json`, or says permission inline.

### GitHub MCP volatility

`mcp__github__*` tools occasionally disappeared from deferred pool mid-session (MCP server disconnect). Fallback: `gh` CLI works reliably.

### PowerShell `Out-File -Encoding utf8` BOM

Adds UTF-8 BOM → commitlint fails subject-case (BOM = first char instead of letter). Workaround: `[IO.File]::WriteAllText` without BOM, or `git commit -F` with deBOM'd file.

### CollapsibleSection lazy state init read order

Smart-expand state had to be computed in parent hook BEFORE child mount, not via `useEffect`. Lesson: lazy `useState` initializers run once on first mount — any post-mount `useEffect` syncing parent → child arrives too late.

### `shared/components/ui/*` cannot import from `core/*`

DI direction enforced. ModuleEmptyState V4 outcome framing needed `getGoalAwareDesc` from `core/onboarding/`. Solution: inline a local `resolveGoalAwareDesc` helper or lift into a shared package.

## Patterns to institutionalize

1. **Module-scoped parallel agents** in `isolation: "worktree"` — when work is independent across modules, spawn ≤2 in parallel and wait for notification before next wave.
2. **Read-verify recon claims** — never trust "X doesn't exist" or "X at line N" without a Read.
3. **Spawn-task chips for out-of-scope dirt** — `mcp__ccd_session__spawn_task` keeps current PR tight and tracks follow-ups.
4. **Plan-correction PRs at audit checkpoints** — when plan and reality diverge, ship a doc PR rather than letting subsequent agents inherit drift.
5. **WHY-comments at decision sites** — every "kept `module`-only" / "fall back to X because Y" / "stays neutral tone because deterministic" got an explicit comment. Future readers find rationale, not just code.
6. **Bundle decisions that share infrastructure** — F2+W2 shared `useToast()`/`useCelebration()` lift, 6.2+6.3 shared the same file. Same-file/same-hook = same PR.

## Open follow-ups (not in v2 scope)

| Item                                                                     | Type                          | Notes                               |
| ------------------------------------------------------------------------ | ----------------------------- | ----------------------------------- |
| AuthPage v2                                                              | Strategic, blocked on product | Onboarding scope, copy, UX flow     |
| PaywallModal v2                                                          | Strategic, blocked on product | Separate "Premium v2" cycle         |
| WelcomeScreen v2                                                         | Strategic, blocked on product | First-time experience design        |
| HubChat modal-route restructure                                          | Strategic, blocked on product | Full-screen route vs. modal         |
| Phase 8 RN mobile parity                                                 | Separate strategic cycle      | apps/mobile lagging behind web      |
| 6.5b outcome copy on partial-progress macros                             | Tactical                      | Reuse `getGoalAwareDesc`            |
| 6.6 quick-add pantry-aware chips on Nutrition                            | Tactical                      | Pre-AddMealSheet shortcut           |
| Worktree disk cleanup (38 dirs)                                          | Housekeeping                  | `git worktree remove --force` × 30+ |
| ESLint `prefer-text-style` severity flip `warn`→`error` for `modules/**` | Tactical (1-line)             | Blocked on #3070 merge              |

## Metrics

- **Wall-clock duration:** 7 days (2026-05-15 → 2026-05-21)
- **Merged PRs:** 31 (foundation + 6 phases + close-out batch)
- **PRs in flight at retro:** 3 (#3070 T5 cleanup, #3071 showOn promotion, #3072+ TBD 6.7 PR badge)
- **Hard Rule violations on merge:** 0
- **Near-misses (caught pre-commit):** 2 (Phase 1 main.tsx ESM order, Phase 2 husky shebang env-bug)
- **Recon negative-claim errors:** ≥5 documented
- **Worktree collision rate (NTFS, ≥3 parallel):** ~66% fail
- **Memory file updates:** 14 entries appended throughout

## Next strategic move

**v2 retrospective scheduled (this doc).** After it lands, the open Phase 7 deferred bucket needs a **product prioritization session** with the user — these items aren't technical decisions, they're scope/copy/UX calls. Phase 8 RN parity is its own strategic cycle outside this docset.

Tactical follow-ups (6.5b, 6.6, ESLint flip, worktree cleanup, 6.7 PR badge) can ship as one-off PRs as bandwidth allows — no batching required.

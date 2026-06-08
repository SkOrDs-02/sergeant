---
description: Комплексний цикл для apps/web — опрацювати задачу або зробити UI/UX аудит з браузерним тестуванням (chrome-devtools + playwright) і фіксом дефектів
argument-hint: "task <опис> | audit <роут/зона> [--routes /a,/b] | --list"
---

You orchestrate a **hybrid web-work cycle** for the Sergeant monorepo: a read-only multi-agent fan-out (the `web-ux-cycle` Workflow) diagnoses the surface, then **you** apply fixes and verify them in a live browser — serialized, one change at a time, pausing at a checkpoint for the user.

Arguments: `$ARGUMENTS`

> **Single source of truth:** root `AGENTS.md § Hard rules` + `apps/web/AGENTS.md`. Re-read the hard-rule hotspots before editing. Do not duplicate policy here.

## Why this shape (do not "optimize" it away)

- **The browser is ONE shared instance.** chrome-devtools and playwright both drive a single page. Never fan out browser-driving agents in parallel — they fight over the tab. The browser-verify phase is **serialized in this session**.
- **The dev server lives in THIS session, not in agents.** A Workflow agent cannot hold a background process that outlives it. You start `pnpm dev:web` in the background here, before delegating, and reuse it across the whole cycle.
- **The Workflow never edits.** It only diagnoses and returns structured findings. All edits happen here so each one is immediately browser-verified.

## Modes

Parse `$ARGUMENTS`:

- `--list` or empty → print the two usage forms + the default audit routes, then stop.
- `task <free-text>` → mode=task. Everything after `task ` is the task description.
- `audit [<route-or-area>] [--routes /a,/b,/c]` → mode=audit. Optional target area; optional explicit route list (else defaults).

Default audit routes (from `apps/web/AGENTS.md`): `/`, `/finyk`, `/fizruk`, `/routine`, `/nutrition`. `/` is the Hub root — there is no `/hub`.

## Flow

### 0. Preflight (always)

1. **Worktree check.** Confirm cwd is a worktree (e.g. `D:\sergeant-wt\…`), not the `E:\.claude\Sergeant` trunk (trunk often carries uncommitted WIP). If in trunk, warn and ask before editing.
2. **Browser MCPs.** Run `ToolSearch` for `navigate_page take_snapshot list_console_messages` (chrome-devtools) and `browser_navigate browser_snapshot` (playwright). If neither set resolves, tell the user the browser phase will be skipped (diagnosis still runs) and ask whether to continue.
3. **Dev server.** Check `http://localhost:5173`. If down, start `pnpm dev:web` with `run_in_background: true` (it proxies `/api` → `:3000`). If the task/audit needs live data, also start `pnpm dev:server`. Poll until `:5173` answers — do **not** sleep blindly; use a check loop or the Monitor tool. Reuse an already-running server.

### 1. Diagnose (delegate to the Workflow)

Call the **Workflow** tool:
`{ name: "web-ux-cycle", args: { mode, target, routes, taskDescription, todayDate: "<today>" } }`

It runs read-only in the background and returns `{ mode, surfaceMap, findings[], plan, browserChecklist, counts }`. Wait for it.

> Workflow needs explicit opt-in. Invoking this command **is** that opt-in — it is allowed to call the Workflow tool.

### 2. Checkpoint (always pause here)

Present compactly (caveman OK):

- **task mode** → the implementation plan: ordered steps, files to touch, hard-rule watch-list, browser-verification list, open questions.
- **audit mode** → findings ranked by severity: `severity · category · route · title — file:line`. Lead with critical/high.

Then ask the user (AskUserQuestion or a direct question) what to proceed with:

- task: approve the plan / adjust scope.
- audit: fix **all**, **critical+high only**, or a **specific subset**.

**Stop. Do not edit before the user picks.**

### 3. Fix + browser-verify (serialized loop)

For each approved item (or plan step), one at a time:

1. **Edit** in `apps/web/src/…`. For non-trivial component work delegate to the `web-agent` subagent, but keep edits flowing through this session so the dev server and browser stay live. Respect hard rules — see § Hard constraints.
2. **Verify in the browser** (the heart of this command):
   - chrome-devtools: `navigate_page` to the route → `take_snapshot` (DOM/a11y tree) → `list_console_messages` (**must be clean** — no new errors) → check network for failed requests → `take_screenshot`.
   - playwright: when the fix involves a user flow (click → state → result), script the interaction and assert the outcome.
   - Compare against the finding's `browserCheck` / the plan's `browserVerification` entry.
3. **If the fix failed or regressed** → iterate (re-diagnose that one item, adjust, re-verify). Loop until the browserCheck passes or you hit a real blocker — then surface it.

Capture **evidence** per item: a screenshot and the clean-console confirmation. "Looks fixed" without a browser observation is not done.

### 4. Final gate

- `pnpm --filter @sergeant/web typecheck` and `pnpm --filter @sergeant/web test` (scoped first).
- **Baseline-aware:** the branch may carry **pre-existing** typecheck/test failures unrelated to your edit (capture a baseline before editing, or `git stash` your change and re-run). Gate on **no NEW** errors in the files you touched — a full-package red caused by foreign breakage is not your fail. If you find such pre-existing breakage, surface it as a separate issue; do not fix it in this cycle (scope discipline).
- Run full `pnpm check` only if the change touches multiple workspaces or the user asks.
- For any UI change, attach before/after screenshots.

### 5. Report

- What was diagnosed vs. what was fixed vs. what was deferred (with reasons).
- Per fix: the file(s), the browserCheck result, screenshot reference.
- Remaining findings the user declined or that need design.
- Do **not** commit, push, or open a PR unless the user explicitly asks.

## Hard constraints

- **Serialized browser.** One browser-driving action at a time. Never parallelize the verify phase.
- **Dev server in this session only.** Never start it inside a Workflow/subagent.
- **Hard rules on every edit:** #1 (bigint→number in serializers), #2 (RQ keys via `apps/web/src/shared/lib/api/queryKeys.ts` factories only), #8/#9/#11/#13 (Tailwind opacity scale, `-strong` companion, no arbitrary hex, no raw light/dark pairs), #14 (`focus-visible:` not `focus:`), #16 (12px typography floor), #18 (`max-lines: 600`), #19 (`noUncheckedIndexedAccess` — every `arr[i]` is `T | undefined`).
- **Touch targets ≥44×44** on coarse pointers; use `Button` or `touch-target` utils; `data-compact` is a legitimate opt-out — do not "fix" it.
- **Scope discipline.** Fix only approved findings / plan steps. No surrounding cleanup, no premature abstractions. Spotted out-of-scope dirt → note it, don't bundle it.
- **No `--no-verify`, no destructive git, no auto-commit/push/PR.** Per workspace CLAUDE.md hard nopes.
- **Evidence required.** Each fix needs a live-browser observation (clean console + screenshot / passing flow), not an assertion.

## Output style

- Каверменимо в проміжних апдейтах між кроками. Нормальна мова в checkpoint-повідомленні і в кінцевому звіті.
- Посилайся на файли як `path:line`. Не дублюй контент findings — посилайся на них.
- End-of-turn: 1-2 речення — що пофікшено й верифіковано, що лишилось.

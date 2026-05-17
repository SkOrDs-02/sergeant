# Sergeant v2 — Execution Brief (orchestration contract)

> **Last validated:** 2026-05-17 by @Skords-01.
> **Next review:** updated after Phase 7 close-out.
> **Status:** Active.
> **Companion docs:** [`execution-plan.md`](./execution-plan.md) (what to do) · [`execution-status.md`](./execution-status.md) (what's done) · [`governance.md`](./governance.md) (governance) · [`migration.md`](./migration.md) (BEFORE/AFTER patterns).

## What this doc is

This is the **orchestration contract** for any agent running the Sergeant v2 redesign execution. The plan doc says **what** to build. The status doc says **what's already built**. This brief says **how to run the work** — toolkit dispatch, acceptance gates, anti-patterns, self-eval rubric. Phases 0+1 ran under this contract; Phases 2-6 inherit it.

Read this **once** at session start. Don't re-read between turns — the rules don't change.

## Global execution contract

- Phases run in dependency order: 0 → 1 → (2 ∥ 3) → 4 → 5 → 6. Phase 7 (mobile RN parity) is out of scope.
- Each phase = one branch `feat/redesign-v2/phase-N-<topic>` from `main` (or from the parent phase branch if stacked). Sub-PRs branch off the phase branch when ≥3 independent surfaces.
- Before the first diff of a phase: emit `# Phase N — План` (toolkit / files / risks / S-M-L estimate). After the last diff: emit `# Phase N — Self-eval` (1-5 rubric below).
- Stop and ask the user if any of: hard-rule violation likely · scope creep ≥ 1 unplanned surface · local-policy command you'd need to run · destructive git op (force-push, hard reset, branch delete on shared).

## Toolkit dispatch matrix

Use this to decide **what to delegate vs do yourself.**

### Subagents — mandatory triggers

| Signal in the task | Agent | How to call |
|---|---|---|
| > 3 grep / glob to locate file/symbol/pattern | `Explore` | One call, ≤ 250-word report + file list. **Point-verify any "X doesn't exist" claim before acting on it** — recon agents prove presence well but absence poorly. |
| Architecture decision with 2+ valid paths (T1 additive vs patch; sub-PR codemod recipe; primitive API) | `Plan` | Before implementation, not after. |
| Before merge of any phase PR | `code-reviewer` | Independent read on the diff. |
| Security-sensitive (env vars, auth, secrets) | `code-reviewer` (with security focus prompt) | — |
| Q about Claude Code / Agent SDK / Anthropic API itself | `claude-code-guide` | — |
| Brand voice / copy for V1-V5 (Phase 4 / 5) | `brand-voice:enforce-voice` | Brief = brand guidelines + target string. |

### Parallelism — mandatory

- Phase 3 sub-PRs (3.1, 3.3, 3.4, 3.5) are independent — **spawn implementer agents in parallel in one message** with multiple Agent blocks. 3.2 + W2 (bundled, motion-sensitive) stays sequential in main context.
- Phase 2 + Phase 3 are mutually independent after Phase 1 — can ship in parallel review.
- `Explore` for recon + `Plan` for primitive design = parallel pair.

### Skills — load one per phase

| Phase | Specialist skill | Reason |
|---|---|---|
| Phase 0 (tokens) | `sergeant-web-ui` | Repo has no `sergeant-design-system` skill — DS work falls under web-ui. |
| Phase 1 (FAB, hero, glass migration) | `sergeant-web-ui` | Web shell + UI. |
| Phase 2 (polish migration codemod) | `sergeant-web-ui` + read `docs/design/redesign-v2/migration.md` | BEFORE/AFTER patterns canonical. |
| Phase 3 (friction UX) | `sergeant-web-ui` + read `docs/design/undo-pattern.md` | Pattern A for F2 (set-delete undo). |
| Phase 4 (primitives, motion) | `sergeant-web-ui` | P1/P2 primitives live in `shared/ui`. |
| Phase 5 (insights) | `sergeant-web-ui` | Wiring. |
| Phase 6 (Expensa delights) | `sergeant-web-ui` | Category-tinted icon pills + amount hero typography. |

**Before changing any SKILL.md:** load `sergeant-writing-skills` first. After changes: `pnpm lint:skills && pnpm skills:lock`. CI fails without updated lock.

### Top-level commands — when relevant

- `/simplify` — after Phase 2.3 codemod (mass swap → clean up loose ends).
- `/review` — before merge of every PR (free local single-pass).
- `/ultrareview` — only for the riskiest PRs (Phase 2.3 codemod, Phase 4 primitives) and only if user explicitly asks (it's billed).
- `/security-review` — N/A for this work (no auth / secret changes).
- `vercel-react-best-practices` (skill) — load before Phase 4 primitives for memo / ref-stable patterns.
- `design:accessibility-review` — for `prefers-reduced-motion` and a11y on CounterReveal.

### MCP / external tools

- **Claude-in-Chrome MCP** (`mcp__Claude_in_Chrome__*`) — for visual verification. Prefer **Vercel preview URL** over local `pnpm dev:web` (local install has Windows native-binding pain). Smoke checklist: hub → 4 module entries → screenshot + console errors. Use `javascript_tool` for `getComputedStyle` introspection (more reliable than screenshot which can timeout).
- **Playwright MCP** — alternative if Chrome extension unavailable. DOM snapshot for smoke verification.
- **Figma MCP** — compare against handoff mockups `screens/Part-{1,2,3}.html` when in doubt about C1-C5 fidelity.
- **context7 MCP** — for fresh React / Tailwind / Recharts API docs (Phase 4 primitives need CounterReveal animation API).
- **`mcp__ccd_session__spawn_task`** — when you spot out-of-scope dirt (stale TODO, dead import, typo not from plan), spawn as separate task chip. Do not bundle into current diff.

### Memory — fix lessons per phase

- After each phase: **update** `project_redesign_v2_tokens.md` (don't proliferate per-phase files). Behavioral lessons (recon errors, scope reductions, anti-pattern slips) go here — not in repo docs.
- Do NOT save: file paths I edited (git log has it), git history, debugging recipes, ephemeral conversation context.
- Save the **why** behind non-obvious decisions: scope reductions, defer choices, recon-agent corrections.

## Local execution policy (Windows / slow hardware)

The dev laptop is old. Heavy commands hang the agent in background and pollute context.

| Command | Run locally? |
|---|---|
| `pnpm typecheck` (or `--filter @sergeant/web typecheck`) | ✅ Always after non-trivial diff. |
| `pnpm lint:skills && pnpm skills:lock` | ✅ Only after SKILL.md changes. |
| `node --test packages/eslint-plugin-sergeant-design/__tests__/<rule>.test.mjs` | ✅ When changing the plugin. |
| `git` ops | ✅ Default. |
| `pnpm test` / `pnpm --filter ... test` | ❌ CI runs on push/PR. Don't run locally unless user explicitly asks. |
| `pnpm lint` / `pnpm format` / `pnpm format:check` | ❌ CI auto-formats + lints. |
| `pnpm check` (full canonical gate) | ❌ Only when user explicitly asks for pre-PR validation. |
| `pnpm build` / `pnpm --filter ... build` | ❌ Except quick single-target compilation check. |
| `pnpm dev:*` | ❌ User starts dev servers in their own terminal. |
| `pnpm install` / `pnpm install --force` | ⚠️ User-driven. If target worktree needs deps, ask them to run. |

**Before reporting completion:** if you did NOT run a test / lint / build that the work would normally need, **say so explicitly**. Don't claim verified what you didn't verify.

## Per-phase acceptance gates

Every phase ships with:

1. **Plan emitted** before first diff (`# Phase N — План` with toolkit / files / risks / estimate).
2. **Self-eval emitted** after last diff (`# Phase N — Self-eval` with 1-5 rubric below).
3. **Typecheck clean** (or all non-clean errors explained as baseline drift on main).
4. **PR description** with the standard sections: Summary · Governing Skill · Playbook · Test plan · Docs and Governance · Risk and Rollout · Hard Rule #15 acknowledgement.
5. **`redesign-v2-execution-status.md` updated** in the same PR — phase progress matrix, any divergences, any follow-ups deferred.
6. **Memory updated** with behavioral lessons from the phase.

If a phase requires Chrome MCP smoke verification (Phase 1, 2, 4 visual changes) and Vercel preview is unavailable (CI fails, build skipped), **document why smoke was not run** in self-eval. Don't claim verified what wasn't.

## Anti-patterns (penalty in self-eval)

- ❌ Did the work yourself when it should have been delegated to a subagent (Explore for > 3 greps, Plan for architecture decisions, code-reviewer pre-merge).
- ❌ Sequential subagent calls for independent work (should have been one message with parallel Agent blocks).
- ❌ Didn't load specialist skill for the touched surface.
- ❌ Didn't use Chrome MCP after visual change when preview was available.
- ❌ Changed v1 token without `@deprecated` marker (T4 pattern).
- ❌ Raw hex in `className` (Hard Rule #11).
- ❌ `bg-white dark:bg-stone-800` instead of `bg-surface-glass` (Hard Rule #13).
- ❌ `focus:` instead of `focus-visible:` (Hard Rule #14).
- ❌ Text smaller than 12px floor (Hard Rule #16).
- ❌ Two ambient animations concurrent (Hard Rule #17).
- ❌ Codemod swap without verifying hero gradient visible through glass alpha (Phase 2 C3, C4, finyk overview, fizruk dashboard).
- ❌ `git push` without explicit per-push user authorization.
- ❌ Skipped `pnpm lint:skills && pnpm skills:lock` after SKILL.md changes.
- ❌ Acted on a recon-agent "X doesn't exist" claim without point-verifying with a Read.
- ❌ Code between `import` statements in ESM files.
- ❌ Stash-transfer dance between worktrees when target needed a `pnpm install` upfront.

## Self-eval rubric (1-5 scale + one sentence per dimension)

- **Coverage** — phase / task closure.
- **Hard rules** — violations of #11-#17.
- **Local-policy** — forbidden commands run.
- **Toolkit utilization** — delegation vs doing-yourself ratio.
- **Parallelism** — how many independent tasks actually ran in parallel.
- **Anti-pattern hits** — self-penalty score.
- **PR hygiene** — branch naming, commit format, no unauthorized pushes.
- **Verification honesty** — frank about what wasn't tested.

Average < 4 → top-3 fixes for the next phase iteration.

## Open-question defaults (from original brief)

When the plan has an open question and no user input is available, apply:

- **T1 strategy** → additive (new `text-style-display-hero`, don't patch existing `text-style-display` weight).
- **F5 emoji eradication scope** → production code + data layer (`recommendationEngine`, `insightsEngine`, `ManualExpenseSheet` category labels). Seed fixtures stay as-is for back-compat.
- **W2 celebration gating** → save-last-set only by default. PR-detection (5%+ over previous) deferred to Phase 5+.
- **V3 HubInsightsBlock smart-expansion threshold** → viewport-based only (`innerWidth >= 390`) for MVP. Settings toggle deferred until feedback arrives.

Anything else novel → emit `# Open question` block **before** the change with the trigger to spawn `Plan` agent if material.

## Worktree hygiene

- Each phase = new worktree if working on independent surface: `git -C Sergeant worktree add ..\sergeant-redesign-v2-<phase> -b feat/redesign-v2/phase-N-<topic>`.
- If reusing the same worktree across phases, **switch to `main` and pull before creating the next phase branch.** Stale branches accumulate.
- Target worktrees need their own `pnpm install` (5-min one-time cost). Worth it to avoid stash-transfer dance for typecheck.
- After phase merge: delete the local branch (`git branch -D feat/redesign-v2/phase-N-...`); origin auto-deletes on merge.

## Constraints

- **No `git commit`** until explicitly requested for the current chunk.
- **No `git push`** without explicit per-push authorization. "Approval once is not approval forever" (CLAUDE.md).
- **No PR open / merge** without explicit authorization.
- **No `--no-verify`** to skip hooks.
- **No `--force` push to main / master.** `--force-with-lease` to feature branches OK with permission.
- **Large diffs** (Phase 2.3 codemod ~15 files): emit TL;DR + file list **before** showing the code.
- **Unknown answer** → say `UNKNOWN` or emit `# Open question` block. Don't invent.

## Session handoff

Cold-start agent reading order:

1. `AGENTS.md` — hard rules.
2. `CLAUDE.md` — local-execution policy.
3. **This file** — orchestration contract.
4. `docs/design/redesign-v2/execution-status.md` — current progress.
5. `docs/design/redesign-v2/execution-plan.md` — intent / sequencing.
6. `docs/design/redesign-v2/governance.md` — governance.
7. `docs/design/redesign-v2/migration.md` — BEFORE/AFTER patterns.

Plus memory: `C:\Users\dmytr\.claude\projects\E---claude-Sergeant\memory\project_redesign_v2_tokens.md` (behavioral lessons + follow-ups).

Tell the next session: **"Continue redesign v2 execution from Phase 2. Read the brief, the status doc, and check memory."** That's enough — the brief is self-contained.

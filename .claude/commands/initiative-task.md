---
description: Виконати наступний невиконаний таск з ініціативи у docs/initiatives/
argument-hint: "[NNNN-slug | NNNN | --list]"
---

You are executing **one atomic task** from a Sergeant initiative in `docs/initiatives/`. Initiatives are multi-PR program-of-work plans; each phase has a table of PR rows + a `## Критерії DONE` checklist. Your job: pick the next undone unit, route it to the right specialist skill + playbook, and ship it through the canonical CI gates.

Arguments: `$ARGUMENTS`

## Behavior

### Mode A — `--list` or no args → picker

1. Read `docs/initiatives/README.md` and parse the active-initiatives table (`## Активні ініціативи`).
2. For each row, open the linked file and count unchecked items in `## Критерії DONE` (`- [ ]` lines).
3. Render a compact table: `#`, slug, status header from file, priority, open criteria count, ETA. Caveman tone OK.
4. Ask the user which initiative to drive (or to type a slug like `0017`).
5. Stop — do **not** start work without explicit pick.

### Mode B — `<NNNN>` or `<NNNN-slug>` → execute

1. **Resolve file.** Glob `docs/initiatives/{_,}NNNN-*.md`. If 0 hits → report missing and offer `--list`. If multiple (active + archived) → prefer active (no `_` prefix).
2. **Parse the file.**
   - Status header (`> **Status:** ...`) — bail if `Done`/`Closed`/`Archived`/`Withdrawn` (offer to switch to another initiative).
   - All `## Phase N` blocks → find first PR-row table where the matching `## Критерії DONE` for that phase still has `- [ ]` items.
   - Inside that table, pick the first PR whose "Файли" cells reference paths that **do not yet match the criterion's expected state**. If ambiguous, list the 2-3 candidate PRs and ask the user.
3. **Route to specialist skill** by inspecting the `Файли` column:
   - `apps/web/**`, `apps/web-shell/**`, `*.tsx` under web → `sergeant-web-ui`
   - `apps/server/**`, route handlers, serializers → `sergeant-server-api`
   - `apps/server/db/migrations/**`, `*.sql` → `sergeant-data-and-migrations`
   - `apps/mobile/**`, Expo → `sergeant-mobile-expo`
   - `apps/server/src/hubchat/**` → `sergeant-hubchat`
   - `tools/openclaw/**` → `sergeant-openclaw`
   - `auth.ts`, Better Auth → `better-auth-best-practices`
   - `docs/**`, `scripts/docs/**`, `.github/workflows/docs-*.yml` → cross-surface: read **no** specialist, treat as `sergeant-writing-skills` if SKILL.md is touched, otherwise plain docs work
   - Multiple surfaces → load `sergeant-feature-delivery` as the umbrella, then the dominant surface skill.
4. **Match playbook.** Cross-reference the PR's intent against `docs/playbooks/INDEX.md`. If a playbook fits the PR title (e.g. "add migration" → `add-sql-migration.md`, "add endpoint" → `add-api-endpoint.md`, "add hard rule" → `add-hard-rule.md`), load it as the canonical recipe.
5. **Confirm plan with the user** in 4-6 lines max:
   - Initiative + phase
   - PR row picked (PR-N.M with one-line intent)
   - Skill being loaded
   - Playbook being followed (or "none — direct work")
   - Files about to be touched
   - One open question if anything is ambiguous; otherwise none
6. **Execute** per the skill + playbook. Match scope to the PR row only — no surrounding cleanup, no extra PRs, no premature abstractions. If you spot dirt, spawn it via `mcp__ccd_session__spawn_task`.
7. **Verify** per the relevant `Критерії DONE` subitem. Run only the scoped commands first (`pnpm --filter <pkg> test`, `pnpm --filter <pkg> typecheck`). Run `pnpm check` only if the PR touches multiple workspaces or the user asks for the full gate.

### Closing the loop (always, before declaring done)

When all criteria for the picked PR pass:

1. **Tick the criterion** in `## Критерії DONE` (turn `- [ ]` into `- [x]`).
2. **If this PR closes the whole phase** (all criteria for that phase now `- [x]`):
   - Update the phase row in `## План змін` table if it has a status column.
   - If this was the last phase and the whole initiative is done, update `> **Status:**` header to `Done`, add an `## Outcome` section, and follow the rename protocol in `docs/initiatives/README.md` step 4 (`git mv NNNN-... _NNNN-...`, update all `.md` links, regenerate `follow-ups.md`).
3. **Sync README.md** row in `docs/initiatives/README.md` if status text changed.
4. **Run CI gates** in this order, stop on first fail:
   ```
   pnpm lint:initiative-status-sync
   pnpm docs:check-links
   pnpm docs:check-initiative-followups
   ```
5. **Commit** only if the user asks — do not auto-commit. When committing, use `feat(initiative-NNNN): PR-N.M short subject` format and reference the initiative in the body.

## Hard constraints

- **One PR row per invocation.** Never bundle multiple PR rows into one diff unless the user explicitly says so.
- **No status flips without verification.** Do not check off a criterion that you have not actually verified (file exists, test passes, command output matches expected). Stating "looks done" is not done.
- **Hard Rule discipline.** Re-read `AGENTS.md § Hard rules` before touching code; the most-broken ones in initiative work are #1 (bigint→number coercion), #2 (RQ key factories), #15 (PR body checklist), #18 (`max-lines: 600`), #19 (`noUncheckedIndexedAccess`).
- **Slug stability.** Slug-only TODO markers (`TODO(0001-module-decomposition): ...`), `hard-rules.json` refs — never rewrite when renaming files. Only update `.md`-suffixed links.
- **No `--no-verify`, no destructive git, no auto-push, no auto-PR-create.** Per workspace CLAUDE.md hard nopes.
- **Carry-over discipline.** If you mark an initiative `Done` and there is leftover work, it MUST land in `### Carry-over → successor` with one of the four prefixes (`**YYYY-MM-DD:**`, `**Recurring (...):**`, `**Будь-яка фраза:**`, or no-prefix) before the rename + status flip.

## Edge cases

- **PR row is observational** (`_(observational — чекає на ...)_` or `_(self-report)_`): do not attempt to verify; report to user and skip to next unchecked criterion.
- **PR row references a follow-up that was deferred** (e.g. "Phase 3-6 — pending, gated на baseline-week measurement"): do not start; surface the blocker and ask user whether to override.
- **Initiative file uses directory form** (`stack-pulse-2026-05/`): read `00-overview.md` first, then pick a `pr-NN-*.md` file as the unit.
- **Multiple initiatives could own the task**: ask the user, do not guess.
- **Specialist skill is missing or load fails**: fall back to `sergeant-start-here` + the playbook, and note the gap in the end-of-turn summary so the user can fix the skill catalog.

## Output style

- Каверменимо в апдейтах між кроками. Нормальна мова в plan-confirm повідомленні і в кінцевому summary.
- Не дублюй контент з initiative-файлу — посилайся (`docs/initiatives/NNNN-slug.md § Phase 1`).
- End-of-turn: 1-2 речення — що зачекнуто, що далі (наступний PR-row у тій самій фазі, або `Phase X complete → move to Phase Y`).

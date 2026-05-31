---
description: Виконати наступний невиконаний таск з ініціативи у docs/initiatives/
argument-hint: "[NNNN-slug | NNNN | --list]"
---

You are executing **one atomic task** from a Sergeant initiative in `docs/initiatives/`. Initiatives are multi-PR program-of-work plans; each phase has a table of PR rows + a `## Критерії DONE` checklist. Your job: pick the next undone unit, route it to the right specialist skill + playbook, and ship it through the canonical CI gates.

Arguments: `$ARGUMENTS`

## Behavior

### Mode A — `--list` or no args → picker

1. Discover active initiatives via `glob docs/initiatives/[0-9]*.md` (filter out `_`-prefixed completed files) + `glob docs/initiatives/*/` for directory-form series like `stack-pulse-2026-05/`. Cross-check against the active-initiatives table in `docs/initiatives/README.md`; warn if drift exists between file system and README.
2. For each file-form initiative, count `- [ ]` lines scoped to the `## Критерії DONE` section only (use awk between `^## Критерії DONE` and the next `^## ` — counting whole-file checkboxes captures stale carry-over and gives wrong picture). For each directory-form series, count `pr-NN-*.md` files where `> **Status:**` header is not `Done`/`Closed`/`Merged`.
3. Render a compact table: `#`, slug, status header (truncated to ~80 chars), priority, open / done criteria count, ETA. Mark directory-form rows with `(series)` suffix. Caveman tone OK.
4. Ask the user which initiative to drive (or to type a slug like `0017`, or a series-internal slug like `stack-pulse-2026-05/pr-01`).
5. Stop — do **not** start work without explicit pick.

### Mode B — `<NNNN>` or `<NNNN-slug>` → execute

1. **Resolve file.** Glob `docs/initiatives/{_,}NNNN-*.md`. If 0 hits → report missing and offer `--list`. If multiple (active + archived) → prefer active (no `_` prefix).
2. **Parse the file.**
   - Status header (`> **Status:** ...`) — bail if `Done`/`Closed`/`Archived`/`Withdrawn` (offer to switch to another initiative).
   - Find the **single `## Критерії DONE` section** of the file (it is always one block — see § DONE structure variants below for how phases are encoded inside it).
   - Inside that section, collect all `- [ ]` items. If any contains an inline progress marker (italic `_Прогрес: …_`, `_(observational …)_`, `_(self-report …)_`, or a "deferred to Phase X" / "blocked by Y" hint), respect those signals before picking a PR row — they are the ground truth, not the phase tables.
   - Cross-reference the unchecked criteria back to the `## План змін` PR-row tables (`PR-N.M | Що ввозиться | Файли`). Pick the first PR row whose intent matches an unchecked criterion AND whose Файли paths don't already reflect the criterion's expected state. If ambiguous, list the 2-3 candidates and ask the user.
3. **Route to specialist skill** by inspecting the `Файли` column:
   - `apps/web/**`, `apps/web-shell/**`, `*.tsx` under web, **and web build config** (`apps/web/vite.config.{js,ts,mts}`, `apps/web/eslint.config.js`, `apps/web/tsconfig*.json`) → `sergeant-web-ui`
   - `apps/server/**`, route handlers, serializers → `sergeant-server-api`
   - `apps/server/db/migrations/**`, `*.sql` → `sergeant-data-and-migrations`
   - `apps/mobile/**`, Expo → `sergeant-mobile-expo`
   - `apps/server/src/hubchat/**` → `sergeant-hubchat`
   - `tools/openclaw/**` → `sergeant-openclaw`
   - `auth.ts`, Better Auth → `better-auth-best-practices`
   - `docs/**`, `scripts/docs/**`, `.github/workflows/docs-*.yml` → cross-surface: read **no** specialist, treat as `sergeant-writing-skills` if SKILL.md is touched, otherwise plain docs work
   - `.github/workflows/**` (non-docs), `tools/**` (non-openclaw), `packages/config/**`, root `eslint.config.js` / `pnpm-workspace.yaml` → no specialist exists; load `sergeant-start-here` + relevant playbook from `docs/playbooks/` (e.g. `fix-failing-ci.md`). Note the catalog gap in the end-of-turn summary.
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

## DONE structure variants

Initiative files use **one** `## Критерії DONE` block, but the internal structure varies. The picker logic must handle all three:

1. **Flat list** (most common — 0003, 0006, 0010, 0017):

   ```markdown
   ## Критерії DONE

   - [x] Foo shipped.
   - [ ] Bar measured under 350 KB.
   - [ ] Baz — deferred to Phase 5 (router lazy approach reverted via RR7 bug).
   ```

   Map criteria back to `## План змін` PR rows by matching keywords + Файли paths. Italic inline markers (`_Прогрес: …_`, deferred-to-X hints) are ground truth.

2. **Per-phase sub-headings** (0015 pattern):

   ```markdown
   ## Критерії DONE

   ### Phase 1

   - [x] today.md generated.
   - [ ] Daily cron не падає 7 днів поспіль _(observational — …)_

   ### Phase 2

   - [ ] open-work.md має колонки Skill + Playbook.
   ```

   Pick the first phase sub-heading that still has `- [ ]` items, then proceed as flat.

3. **Linked progress markers** (0014 / multi-PR series pattern): criteria reference PR-N.M IDs directly (`- [ ] PR-1.2 — push notifications wired`). Match by ID, not by Файли.

If the structure doesn't fit any variant, stop and ask the user — don't guess.

## Edge cases

- **PR row is observational** (`_(observational — чекає на ...)_` or `_(self-report)_`): do not attempt to verify; report to user and skip to next unchecked criterion.
- **PR row references a follow-up that was deferred** (e.g. "Phase 3-6 — pending, gated на baseline-week measurement"): do not start; surface the blocker and ask user whether to override.
- **All unchecked criteria point to a single blocked theme** (e.g. 0006 has 3 open criteria, all three describe bundle-split work explicitly deferred to "Phase 5 RR7 RootLayout refactor"): treat as a deferred follow-up — do not start. Surface the shared blocker once, not three times.
- **Initiative file uses directory form** (`stack-pulse-2026-05/`): read `00-overview.md` first, then pick a `pr-NN-*.md` file as the unit; each `pr-NN-*.md` has its own status header and acts like a flat initiative file.
- **DONE checklist references work the status header claims is done**: the status header is informal prose and can lag behind reality. Trust the checkbox state + Файли paths over the prose. Surface the drift in the end-of-turn summary so it can be fixed in a separate `docs(docs)` PR.
- **Multiple initiatives could own the task**: ask the user, do not guess.
- **Specialist skill is missing or load fails**: fall back to `sergeant-start-here` + the playbook, and note the gap in the end-of-turn summary so the user can fix the skill catalog.

## Output style

- Каверменимо в апдейтах між кроками. Нормальна мова в plan-confirm повідомленні і в кінцевому summary.
- Не дублюй контент з initiative-файлу — посилайся (`docs/initiatives/NNNN-slug.md § Phase 1`).
- End-of-turn: 1-2 речення — що зачекнуто, що далі (наступний PR-row у тій самій фазі, або `Phase X complete → move to Phase Y`).

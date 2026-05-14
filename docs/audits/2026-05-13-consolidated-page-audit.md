# Consolidated Page Audit — 2026-05-13

> **Last validated:** 2026-05-13 by Devin (parent session).
> **Status:** Active
> **Parent session:** <https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40>
> **Scope:** All web app pages (`apps/web`), audited by 9 parallel child Devin sessions across 12 perspectives (security, a11y, performance, UX, bugs, hard-rule compliance, TS strictness, Tailwind tokens, i18n, test coverage, AI markers, lifecycle markers).
> **Type:** Pure static analysis (no dev server, no code changes).

## Coverage

| #   | Scope                                       | Audit doc PR                                                       | Session                                                                   | Findings | C | H  | M  | L  |
| --- | ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------- | - | -- | -- | -- |
| 01  | Auth & Onboarding                           | [#2763](https://github.com/Skords-01/Sergeant/pull/2763)           | [9f2c…](https://app.devin.ai/sessions/9f2cdfd031a74c01bbe21761c904b3fc)   | 25       | 0 | 6  | 16 | 3  |
| 02  | Hub Dashboard, Modules Grid, App shell      | [#2797](https://github.com/Skords-01/Sergeant/pull/2797) ¹         | [2956…](https://app.devin.ai/sessions/2956c2f7b4c94f7081b5313adeef6dcb)   | 24       | 0 | 4  | 10 | 10 |
| 03  | Hub Chat, Search & Backup                   | [#2748](https://github.com/Skords-01/Sergeant/pull/2748)           | [3a0a…](https://app.devin.ai/sessions/3a0a090ab898412eb35820cf1e5cf506)   | 26       | 1 | 5  | 14 | 6  |
| 04  | Hub Settings, Profile & Assistant Catalogue | **BLOCKED** — VM infra failure                                     | [772b…](https://app.devin.ai/sessions/772b6624cb984266866c6aa08f690baf)   | —        | — | —  | —  | —  |
| 05  | Finyk module (5 pages)                      | [#2767](https://github.com/Skords-01/Sergeant/pull/2767)           | [0f48…](https://app.devin.ai/sessions/0f48de39c5254cb58a32181db0207816)   | 25       | 0 | 8  | 13 | 4  |
| 06  | Fizruk Part 1 (Dashboard/Atlas/Workouts/Exercise) | [#2799](https://github.com/Skords-01/Sergeant/pull/2799) ¹    | [c9b0…](https://app.devin.ai/sessions/c9b04a79c3bb46ac90d3bfb09f1695e9)   | 27       | 0 | 5  | 15 | 7  |
| 07  | Fizruk Part 2 (Progress/Measurements/Programs/Body) | [#2774](https://github.com/Skords-01/Sergeant/pull/2774)     | [f194…](https://app.devin.ai/sessions/f194e4aa3a724b3e8adc6051531ca88b)   | 50       | 0 | 6  | 25 | 19 |
| 08  | Nutrition module (4 pages)                  | [#2798](https://github.com/Skords-01/Sergeant/pull/2798) ¹         | [3918…](https://app.devin.ai/sessions/3918e132a0b8450798eb70a6aca59182)   | 25       | 0 | 6  | 12 | 7  |
| 09  | Routine module + Strategy page              | [#2747](https://github.com/Skords-01/Sergeant/pull/2747)           | [1a98…](https://app.devin.ai/sessions/1a98402bdac94eda9811a2632622c7a2)   | 23       | 0 | 7  | 12 | 4  |
| 10  | Error/Status/Marketing + PWA/Sync/Billing   | [#2744](https://github.com/Skords-01/Sergeant/pull/2744)           | [d35e…](https://app.devin.ai/sessions/d35e2047d5614fc093be63cb8c39150e)   | 30       | 1 | 3  | 18 | 8  |
|     | **Total (9 scopes)**                        |                                                                    |                                                                            | **255**  | **2** | **50** | **135** | **68** |

> ¹ PR created by the parent session from the pushed branch because the child's `git_pr` builtin returned `Bad credentials` (operational blocker; PAT secrets were valid). All branch content was pushed by the child.

## Critical findings (2)

### C1 — `useChatSend` runs `tool_calls` from the model through `executeActions` with no runtime validation

**Scope:** 03-hub-chat-search · **File:** `apps/web/src/core/hub/chat/useChatSend.ts` · **Perspective:** security

The model is allowed to emit `tool_calls[]` and those calls are dispatched through `executeActions(toolCalls, opts)` without any allow-list or schema validation. A malicious prompt-injection (or a compromised AI provider response) can invoke arbitrary actions exposed by the runtime (delete data, navigate to attacker URLs, exfiltrate via side-effects). The host page has full Better Auth cookie context.

**Fix:** validate every `tool_call` against a Zod allow-list of `{ name, args }` before dispatch; route through an audited registry; reject unknown tool names with a logged event.

### C2 — `/api/*` GET responses cached across user sessions (cross-user data leak on shared device)

**Scope:** 10-errors-pwa-marketing · **File:** `apps/web/src/sw.ts` · **Perspective:** security

The service worker uses a single `Cache` namespace for `/api/*` GET responses keyed only by URL. After user A logs out and user B logs in on the same device, B's first GET to e.g. `/api/finyk/transactions` will hit A's cached response until the cache is invalidated. No `Vary: Cookie` handling, no per-user cache namespace, no flush on `signOut`.

**Fix:** key the API cache by hashed session id; clear `caches.delete("api-v1")` (or rotate the version) inside the `signOut` success handler; add `Cache-Control: private` to all `/api/*` server responses; add a contract test that asserts `vary` includes `Cookie` on authenticated endpoints.

## High-severity themes (50 findings)

The 50 high-severity findings cluster into 7 dominant themes — fix these and ~40 % of medium-severity findings collapse along with them.

### Theme 1 — Timezone correctness (Domain invariant: Europe/Kyiv)

Eight high-severity findings ride on the same root cause: derived day/week keys use **host device time** instead of Kyiv local time.

- 03 F1: `hubChatSessions.deriveSessionTitle` formats with host TZ.
- 03 F2: `HubChatHistoryDrawer.formatStamp` uses host time for "today" detection.
- 03 F8: `searchTypes.localDateKey` & `searchSources` produce non-Kyiv day keys.
- 05 F6: `now = new Date()` at module-load freezes Finyk's "current month".
- 07 F1: Fizruk Progress page reckons week boundary in local TZ.
- 07 F2: Fizruk Programs computes `todayDayIndex` in local TZ.
- 09 F3: Routine `setHours(12, 0, 0, 0)` derives day keys in local device time.
- 09 F6: Routine deep-link `?routineDay=…` validates format only, not the calendar date.

**Fix:** centralise `getKyivDayKey()`, `getKyivWeekStart()`, `parseKyivDate()` in `apps/web/src/shared/lib/time/kyivTime.ts`; ESLint custom rule that bans direct `new Date()` / `Date.now()` constructions outside this module; replace all 8 sites.

### Theme 2 — Touch targets below 44×44 px (WCAG 2.5.5 / Apple HIG)

Six high-severity findings + ~12 medium ones describe inline `<button>` elements with 24–32 px hit areas across FTUX, hub-chat drawer, analytics nav, pantry rows.

- 01 F8 (touch-target collapse on 5 FTUX surfaces — DailyNudge / DemoModeBanner / SoftAuthPromptCard / ReEngagementCard / FirstRunHintBanner).
- 02 F4 (period prev/next nav).
- 03 F6 (HubChatHistoryDrawer close/delete).
- 05 F5 (Finyk analytics month-nav).
- 08 F4 (Nutrition pantry ItemRow delete).
- 06 (Atlas anterior/posterior toggle).

**Fix:** make the global `Button` primitive the *only* way to render touch targets in non-data-cell contexts; add a code-mod that converts inline `<button class="w-6 h-6 …">` to `<Button variant="ghost" iconSize="sm">`; an ESLint custom rule that flags inline `<button>` with explicit `w-*` / `h-*` below the floor.

### Theme 3 — Tailwind tokens / palette violations (Hard Rule #11 / #13 / #9)

Twelve high-severity findings around invented tokens (`text-error` is dropped silently), raw saturated palette steps without `-strong` companion, foreign module accents.

- 01 F1 (14 `text-error`/`bg-error` occurrences — `error` token does not exist; silently renders no colour).
- 02 F5 (raw `sky/emerald/orange/lime-500` for module accent cards).
- 05 F2 (arbitrary decimal opacity bypasses `valid-tailwind-opacity`).
- 05 F3 (raw `emerald` palette with `text-white` and no `-strong` companion — Hard Rule #9).
- 08 F1, F2, F3 (raw `blue/yellow/green/amber/sky-400-500` in macro labels, water tracker, log banner).
- 09 F5 (foreign module accents — `sky-*`, `emerald-*` inside Routine subtree, Hard Rule #12).

**Fix:** rename `text-error` → `text-danger` everywhere (14 hits in auth alone); add `error: danger` alias if rename is too risky; expand `eslint-plugin-sergeant-design` to reject any `text-*-{400,500}` outside the design-tokens preset; add a CI gate that prints which token a raw-palette class would map to.

### Theme 4 — Hard Rule #10 (lifecycle markers) systemically missing

Every audit scope reports the same finding: the vast majority of files have no `> **Last validated:**` / `> **Status:**` header. The lint exists (`scripts/check-lifecycle-markers.mjs`) but is not on the pre-commit/PR-gate matrix.

- 06 F1, 08 F6 explicitly call it out as scope-wide; the other 7 audits list per-file occurrences.

**Fix:** turn `lint:lifecycle-markers` from advisory to required on PRs touching `apps/web/src/**/*.{ts,tsx}`; bulk-add markers via a script that reads `git log -1 --format=%ci` for `Last validated`; document `Status` defaults (Active for src, Scaffolded for `.stories.tsx`, Deprecated for `*-legacy/*`).

### Theme 5 — Hard Rule #2 (RQ keys via factories) — multiple inline `queryKey: [...]` and raw localStorage strings

- 02 F1: HubReports duplicates hardcoded LS keys (`fizruk_workouts_v1`, `finyk_tx_cache`, `hub_routine_v1`, `nutrition_log_v1`) instead of `STORAGE_KEYS`; same duplication exists in `useFinykHubPreview.ts:20`.
- 05 (several medium findings): inline `queryKey: ["finyk", "transactions"]` instead of `finykKeys.transactions()`.

**Fix:** ESLint custom rule `sergeant-design/no-inline-query-key` + `no-raw-storage-key`; codemod that swaps known string literals to `STORAGE_KEYS.*` and `xKeys.*()` calls.

### Theme 6 — `noUncheckedIndexedAccess` bypassed via non-null assertions (Hard Rule #19)

- 06 F4 (Fizruk Part 1): `history[0]!.workout?.id`, `new Date(y!, mo! - 1, …)`, `next[idx]!`.
- 07 F6 (Fizruk Part 2): Program startSession uses `sessionKey!` on a possibly-missing key.

**Fix:** ban `!` non-null assertion via ESLint `@typescript-eslint/no-non-null-assertion: error`; replace with `if (x) { … }` guards or Zod parsing at the boundary.

### Theme 7 — Bug hunting (correctness-impacting logic errors)

- 01 F5: `CelebrationModal` hijacks global Enter/Space — types in any input fire the modal action.
- 01 F6: "Забули пароль?" never pre-fills email user typed (reads `defaultValues` instead of `watch()`).
- 02 F3: HubReports does not react to live LS changes in the same tab (stale chart).
- 06 F3: rest-timer is destroyed on page navigation and **never fires the end-cue** — the whole point of the eyes-off timer is silently broken.
- 06 F5: `useWorkoutsViewFromSession` disables `exhaustive-deps` with English comment + bare `catch{}` (3 issues stacked).
- 07 F3: Measurements stores height/weight/girths **without any range validation** — accepts `weightKg = 99999` (sensitive health PII).
- 07 F4: Measurements allows saving completely empty form.
- 09 F1: Strategy page calls `/api/internal/strategic/*` without `internalFetch` / bearer auth.
- 09 F2: Strategy page leaks raw server `error.message` to the user.
- 09 F7: `useRoutineReminders` swallows every error via empty `catch{}`.
- 10 F1: Service Worker has no offline navigation fallback to `/offline`.
- 10 F3: Sentry Session Replay records text without `maskAllText: true` — PII leak.
- 10 F4: `PricingPage` redirects to `checkout.url` without origin allow-list (open redirect).

## Recurring "horizontal" themes (medium/low severity)

These do not block but require a coordinated fix because they show up everywhere:

1. **Pluralization of Ukrainian noun forms** is naive across the app (e.g. `ReEngagementCard`, Finyk operation counts) — wrong form at 21+ days.
2. **Touch-target audit cleanup** beyond Theme 2 hits ~12 more medium-severity sites.
3. **Empty-state / error-state messaging** is inconsistent — some pages show raw error message strings.
4. **Lazy boundaries** are correct at the module level but several large vendor deps (zxing barcode, chart libs) are still eager in some pages.
5. **AI-DANGER / AI-CONTEXT markers** are missing in high-risk auth, OAuth, and SW code despite project rules.

## Operational notes

- 9 of 10 audits completed. **Scope 04 (Hub Settings / Profile / Assistant Catalogue) was hard-blocked by a VM infrastructure failure** (`realproxyclient.service` running but `/opt/.devin/.realproxy-addr` missing — outbound network unreachable for that child). A retry session is queued.
- 3 child sessions reported `git_pr` "Bad credentials" with valid PAT secrets present in env (`pat`, `GITHUB_TOKEN`). Parent session created PRs #2797, #2798, #2799 from the children's pushed branches via the GitHub REST API as a fallback. Worth investigating why the builtin git_pr tool fails inside child sessions (operational blocker filed by 02-hub-dashboard child).
- All 9 audit PRs use the `[freeze-exception]` tag — they only add `docs/audits/2026-05-13-page-audit-*.md` files, no code changes.

## Recommended next steps

1. **Triage criticals C1 / C2 today.** Both are real security issues (prompt-injection tool execution + cross-user SW cache leak).
2. **Land Theme 1 (timezone) as a single PR** — replace 8 sites with central helpers. Side effect: stale-chart bug (02 F3) likely disappears once invalidation routes through `hubKeys`.
3. **Add CI gates for Themes 2 (touch-target), 3 (tailwind tokens), 6 (non-null assertions)** — all three are 100 % mechanically detectable.
4. **Bulk script lifecycle-marker headers (Theme 4)** — one-time migration commit + CI gate going forward.
5. **Open per-PR fix tickets for the 13 individual bugs in Theme 7** — these are the highest-quality high-severity finds.

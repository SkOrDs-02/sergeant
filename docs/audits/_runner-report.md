# Audit runner report

> **Last validated:** 2026-05-31 by audits-runner workflow. **Next review:** 2026-06-30.
> **Status:** Reference

## TL;DR

- **Ship autoSafe doc edits this week** (4 items): style-guide PR-X3, doc-hygiene date-header canonicalization, .env.example secrets warnings, observability metrics doc cleanups, plus mechanical lifecycle-marker insertion on auth/onboarding/hub-chat scopes. Zero behavior change.
- **Top P0/critical to plan next:** C1 tool_calls Zod allow-list (consolidated audit + F3 hub-chat duplicate), C2 SW per-user cache, F12 Sentry Replay maskAllText, F13 PricingPage open-redirect, F8 Strategy bearer-auth, PR-12 SyncSetupRequiredError guard, P1 CSRF browser sign-up. These are user-blocking security/auth issues.
- **Close 2 audits as stale:** README gap analysis (2026-05-03) and doc-hygiene roast (2026-05-13) — all items resolved.

## Progress (rolling — last updated 2026-06-01)

9 PR-ів злито у main з цього звіту. Inline ✅ нижче — закриті items, з [PR# / batch#] у дужках.

| Batch                        | PR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Closed (items / findings)                                                                                                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Init                         | [#3153](https://github.com/Skords-01/Sergeant/pull/3153)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 2 stale audits (README gap, doc-hygiene roast); audits-runner tooling shipped                                                                                                                                                                                                   |
| 1                            | [#3155](https://github.com/Skords-01/Sergeant/pull/3155)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | hub-dash F16, F18 (closure notes — split shipped)                                                                                                                                                                                                                               |
| 2                            | [#3156](https://github.com/Skords-01/Sergeant/pull/3156)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | backend-roast metrics §Відкриті refresh; auth-onb F15 (6 AI markers)                                                                                                                                                                                                            |
| 3                            | [#3157](https://github.com/Skords-01/Sergeant/pull/3157)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | auth-onb F14, hub-chat F11 (closed as superseded by Rule #10)                                                                                                                                                                                                                   |
| 4                            | [#3158](https://github.com/Skords-01/Sergeant/pull/3158)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ux-roast PR-X3 — new `docs/copy/style-guide.uk.md` + AGENTS link                                                                                                                                                                                                                |
| 5                            | [#3159](https://github.com/Skords-01/Sergeant/pull/3159)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | auth-onb F23 (crypto.randomUUID), hub-dash F11 (DEV-only error.message), hub-dash F12 (Monday digest idempotency)                                                                                                                                                               |
| 6                            | [#3160](https://github.com/Skords-01/Sergeant/pull/3160)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | hub-dash F2 (BarChart aria-label across 4 module cards)                                                                                                                                                                                                                         |
| 7                            | [#3161](https://github.com/Skords-01/Sergeant/pull/3161)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | hub-dash F15 (adaptiveSort entries()), auth-onb F13 (pluralDays)                                                                                                                                                                                                                |
| 8                            | [#3162](https://github.com/Skords-01/Sergeant/pull/3162)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | auth-onb F18 (CelebrationModal pause-on-focus/hover), hub-dash F19 (NutritionBootGate)                                                                                                                                                                                          |
| 9-Decisions (2026-06-01)     | [#3225](https://github.com/Skords-01/Sergeant/pull/3225) [#3228](https://github.com/Skords-01/Sergeant/pull/3228) [#3229](https://github.com/Skords-01/Sergeant/pull/3229) [#3230](https://github.com/Skords-01/Sergeant/pull/3230) [#3231](https://github.com/Skords-01/Sergeant/pull/3231)                                                                                                                                                                                                                                                                                                                                                                                                                | hub-chat F3 (Zod envelope), audit-10 F2 (SW per-user cache), auth-onb F2+F3 (AuthPage decomp), audit-10 F16 partial (10-fail wipe), tail (CSRF / text-error / tracing)                                                                                                          |
| A-Pack (2026-06-01, 15-pack) | [#3232](https://github.com/Skords-01/Sergeant/pull/3232) [#3233](https://github.com/Skords-01/Sergeant/pull/3233) [#3234](https://github.com/Skords-01/Sergeant/pull/3234) [#3235](https://github.com/Skords-01/Sergeant/pull/3235) [#3236](https://github.com/Skords-01/Sergeant/pull/3236) [#3237](https://github.com/Skords-01/Sergeant/pull/3237) [#3238](https://github.com/Skords-01/Sergeant/pull/3238) [#3239](https://github.com/Skords-01/Sergeant/pull/3239) [#3240](https://github.com/Skords-01/Sergeant/pull/3240) [#3241](https://github.com/Skords-01/Sergeant/pull/3241)                                                                                                                   | audit-10 F7 (hop-by-hop), audit-03 F4 (autoSend), audit-03 F26 (head-guard), audit-02 F24 (ErrorBoundary test), audit-09 F23 (tuple), audit-10 F29 (verified), audit-03 F6 (touch), audit-07 F4 (Measurements empty), 0017 finalize, audit-05 F25 + tracker                     |
| B-Pack (2026-06-01, 15-pack) | [#3244](https://github.com/Skords-01/Sergeant/pull/3244) [#3245](https://github.com/Skords-01/Sergeant/pull/3245) [#3246](https://github.com/Skords-01/Sergeant/pull/3246) [#3247](https://github.com/Skords-01/Sergeant/pull/3247) [#3248](https://github.com/Skords-01/Sergeant/pull/3248) [#3249](https://github.com/Skords-01/Sergeant/pull/3249) [#3250](https://github.com/Skords-01/Sergeant/pull/3250) [#3251](https://github.com/Skords-01/Sergeant/pull/3251) [#3252](https://github.com/Skords-01/Sergeant/pull/3252) [#3253](https://github.com/Skords-01/Sergeant/pull/3253) [#3254](https://github.com/Skords-01/Sergeant/pull/3254) [#3255](https://github.com/Skords-01/Sergeant/pull/3255) | audit-09 F11+F13 Strategy i18n + touch, F10 drag-guard, audit-05 F2 opacity, F9 parseLocalDate, F11 emoji, F12 pills touch, audit-08 F11 invalidate scope, F14 predicate, F10 wontfix, audit-06 F8 useMemo, F7 unknown deep-link, audit-09 F5+F6 verified, audit-08 F5 verified |

**Discoveries during triage (already done before audit ran):** doc-hygiene#1 (date canonicalization), app-audit#env-example (NUTRITION_BACKUP / BETTER_AUTH_TOKEN_ENC warnings), backend-roast#metrics-§6 (cleaned in PR #2933), auth-onb F1 (text-error → text-danger across auth tree).

**Audits tracker delta:** 26 open → **23 open** (2 closed as stale Init batch; the F-level closures don't change tracker count since the audit docs stay Active with remaining findings).

## Execute now

AutoSafe + low-risk doc-only items, safe to batch as a single PR per audit.

### 2026-05-02-doc-hygiene-audit

- [x] ✅ doc-hygiene#1 — already done in repo (canonicalized 2026-05-02 by prior doc-hygiene PR; verified during Batch 1 triage)

### 2026-05-06-ux-roast-pr-plan

- [x] ✅ ux-roast#PR-X3 — `docs/copy/style-guide.uk.md`, `AGENTS.md` (link) — pure docs new style guide + link [Batch 4 / #3158]

### 2026-05-07-app-audit

- [x] ✅ app-audit#env-example — already done in repo (NUTRITION_BACKUP_KEY_SECRET / BETTER_AUTH_TOKEN_ENC_KEY warnings present on `.env.example:11–12`)

### 2026-05-13-backend-performance-roast

- [x] ✅ backend-roast#metrics-§6 — already closed in PR [#2933](https://github.com/Skords-01/Sergeant/pull/2933) (stray copy-paste cleaned; verified during Batch 2)
- [x] ✅ backend-roast#metrics-Відкриті — `docs/observability/metrics.md` — refresh stale "Відкриті питання" section [Batch 2 / #3156]

### 2026-05-13-page-audit-01-auth-onboarding

- [x] ✅ auth-onb#F14 — **closed as superseded by Rule #10** (default Active needs no marker on source files) [Batch 3 / #3157]
- [x] ✅ auth-onb#F15 — AuthContext, authClient, useOnboardingWizardState, presetApply, cleanupDemoData — AI-CONTEXT/AI-DANGER markers added [Batch 2 / #3156]

### 2026-05-13-page-audit-02-hub-dashboard

- [x] ✅ hub-dash#F16 — `apps/web/src/core/hub/HubReports.tsx` — closure note (Sprint 2 0017 split already shipped, 261 LOC) [Batch 1 / #3155]
- [x] ✅ hub-dash#F18 — `apps/web/src/core/hub/ExpensesCard.tsx` — closure note (Array.isArray cast already in card split) [Batch 1 / #3155]

### 2026-05-13-page-audit-03-hub-chat-search

- [x] ✅ hub-chat#F11 — **closed as superseded by Rule #10** (HubChatPage.tsx already carries `@scaffolded`) [Batch 3 / #3157]

## Plan first

Sorted by impact (security/auth/money first, then domain invariants, then UX/perf, then cleanup).

### Critical security & auth (do these first)

1. **C1 / F3** — Zod allow-list for model `tool_calls` before `executeActions` dispatch — `apps/web/src/core/hub/chat/useChatSend.ts`. Prompt-injection RCE on authed user. Needs discriminated-union schema + server mirror. **Use `engineering:architecture` ADR + plan-first.**
2. **C2** — Per-user SW cache for `/api/*` + flush on signOut + `Cache-Control: private` — `apps/web/src/sw.ts`. Cross-user data leak on shared device. Needs contract test.
3. **F12** — Sentry Session Replay `maskAllText: true` — Sentry init. PII leak; tiny diff, security-sensitive.
4. **F13** — PricingPage `checkout.url` open-redirect → add origin allow-list. Money-path security.
5. **F8** — Strategy page must use `internalFetch` with bearer auth → `/api/internal/strategic/*`. Missing bearer.
6. **F4** — `/chat?q=&autoSend=1` deep-link auto-send → referrer/nonce policy decision needed.
7. **P1 CSRF** — Browser sign-up blocked by CSRF guard — Better Auth `/api/auth/sign-up/email`. M10 invariant must hold; add `X-Requested-With` in client.
8. **P1 CSP/CORS dev split-origin** — `traceparent` header + `127.0.0.1:3000` connect-src. Scope to dev only.
9. **P1 telemetry CSRF exempt** — `/api/v1/metrics/web-vitals` 403 in CSRF guard. Mirror unversioned exempt scope.
10. **PR-12** — SyncSetupRequiredError guard for `sync_op_outbox` + Sentry breadcrumb — production P0 SQLITE_ERROR. User-data implications.

### Domain invariants (Kyiv tz, money, IDs)

11. **Theme 1 (consolidated)** — Centralize Kyiv TZ helpers + replace 8 host-TZ sites → `apps/web/src/shared/lib/time/kyivTime.ts` (new). Add ESLint rule.
12. **F1/F2/F8 (hub-chat)** — `deriveSessionTitle`, `HubChatHistoryDrawer.formatStamp`, `localDateKey` — all roll up under Theme 1 Kyiv helper.
13. **Theme 5** — ESLint `no-inline-query-key` + `no-raw-storage-key` codemod → factories/STORAGE_KEYS. Hard Rule #2.
14. **F1 (hub-dash)** — Migrate hardcoded LS keys in `{Fitness,Expenses,Routine,Nutrition}Card.tsx` to STORAGE_KEYS.
15. **F13 (hub-dash)** — `FTUX_MODULES_HINT_KEY` to STORAGE_KEYS.
16. **F21 (hub-dash)** — `finyk_tx_cache` → `STORAGE_KEYS.FINYK_TX_CACHE`.
17. **F16/F17 (auth-onb)** — `presetApply.ts` / `seedDemoData.ts` bypass `createModuleStorage` allowlist — storage contract change.
18. **Theme 6** — Ban non-null assertions in Fizruk P1/P2 — `noUncheckedIndexedAccess` discipline.
19. ✅ **F15 (hub-dash)** — Six `!` assertions in `adaptiveSort.ts` — replaced with `for…entries()` [Batch 7 / #3161].

### Server / env / observability

20. **P1.4 (dead-code)** — Phase 2 process.env burn-down: 4 callers + test refactors (`requireAnthropicKey`, `requireGroqKey`, `posthogCapture`, `authTransactionalMail`). Split into 4 PRs per audit guidance.
21. **app-audit obs migration** — `apps/server/src/obs/{logger,metrics,tracing}.ts` + push to `env.ts`. 64 `process.env` occurrences.
22. **backend-roast tracing.ts** — DI vs env.ts singleton design decision needed before refactor.
23. ✅ **F11 (hub-dash)** — `ModuleErrorBoundary` raw `error.message` now wrapped in `import.meta.env.DEV` [Batch 5 / #3159].

### Theme refactors (cross-cutting visual / policy)

24. ✅ **F1 (auth-onb)** — already done in repo (zero `text-error` matches in `apps/`/`packages/`; verified during Batch 6 triage).
25. ✅ **F19 (auth-onb)** — subset of F1, also already done in repo.
26. **Theme 3 (consolidated)** — Same rename + ban raw saturated palette steps + lint plugin.
27. **Theme 2** — 44×44 touch targets via Button primitive + ESLint + codemod.
28. **F7-F12 (auth-onb)** — DailyNudge/DemoModeBanner/SoftAuthPromptCard/ReEngagementCard/FirstRunHintBanner small CTAs → Button primitive.
29. **F4/F6/F7 (hub-chat/dash)** — period nav + drawer + cancel pill touch targets.
30. **Theme 4** — Promote `lint:lifecycle-markers` to required + bulk-add headers via script.
31. **F5 (hub-dash)** — Replace `bg-sky/emerald/orange/lime` with module tokens.
32. **F17 (hub-dash)** — `from-brand-100 to-teal-100` raw palette — register `brand-secondary` token.
33. **F9 (hub-dash)** — `HubInsightsPanel` foreign module-accents — severity palette or `-strong` companions.

### Auth/onboarding decomposition

34. **F2 (auth-onb)** — `AuthPage.tsx` 693 LOC violates Hard Rule #18 (max 600). Decompose.
35. **F3 (auth-onb)** — Scaffolded auth siblings dead — wire or delete. Couples with F2.
36. **F4 (auth-onb)** — `PermissionsPrompt.tsx` 263+153 LOC unwired — delete or wire.
37. **F20 (auth-onb)** — Reconcile tests with live inline copies after F3.
38. **F5/F6 (auth-onb) / F2 ux-roast-F2** — `CelebrationModal` global Enter/Space hijack + forgot-password email pre-fill.

### UX & feature bugs

39. **F4 (hub-chat) — Theme 7 F4 (consolidated)** — Fizruk rest-timer destroyed on navigation — lifecycle/persistence redesign.
40. **F7 F6/F7 (consolidated)** — Validate weight/height/girth + block empty Measurements save.
41. **F7 F3 (consolidated) / F3 (hub-dash)** — HubReports live LS reactivity via `hub-storage-updated` event bus. F10/F22 hub-dash depend on it.
42. ✅ **F12 (hub-dash)** — `useMondayAutoDigest` idempotency guard via mount-scoped ref + in-timer re-check [Batch 5 / #3159].
43. ✅ **F19 (hub-dash)** — auth gate landed via `NutritionBootGate` + `AuthenticatedNutritionBoot` two-component pattern; bundle-lazy split is follow-up [Batch 8 / #3162].
44. **F14 (hub-chat)** — Title rewrite steamrolls user titles — schema change `titleSource`.
45. **F5 (hub-chat)** — Voice keyword auto-triggers TTS without consent — settings toggle.
46. **F15 (hub-chat)** — SSE consumer lacks per-chunk/total byte cap.
47. **F9 (hub-chat)** — Nested interactive elements in session row — structural refactor.

### Perf

48. **PR-22** — Lazy Insights/Digest + finyk Overview sub-card split. Bundle reshape.
49. **PR-24** — Mobile 100dvh + safe-area-inset-bottom across 4 module roots. Needs iOS QA.
50. **PR-25** — PostHog/Sentry init defer — boot-sequence change.

### UX-roast remainder (PR-0 unblocker first)

51. ✅ **PR-0** — Telemetry events + ADR + tracker shipped via prior catalog work; tracker entry flipped in Batch 10 / #TBD. 11 downstream PRs unblocked.
52. **PR-1a/1b** — App-lock PIN + biometric. High-blast-radius security surface.
53. **PR-2** — Module settings gear shortcut across 4 headers.
54. **PR-3 / PR-20** — Bento subtitles + FTUX empty bento (PR-20 depends on PR-3).
55. **PR-6** — HubReports EmptyState + illustrations.
56. **PR-7 / PR-8** — Permissions overview + Hub notifications sub-group (PR-8 depends on PR-7).
57. **PR-9** — `<TimeInput>` unification + nutrition reminderHour→reminderHour+reminderMinute migration.
58. **PR-14** — Request-ID in `ModuleErrorBoundary`.
59. **PR-16** — Memory Bank → Settings → Асистент. Deep-link hash migration.
60. **PR-19** — `aria-live` conflicts fix.
61. **PR-30** — Loading-state copy unify (1st person) — touches auth/profile/settings broadly.
62. **PR-35** — «Діагностика SW» move to Experimental.
63. **PR-42** — Pricing chat-counter + usage endpoint. Money path.
64. **PR-X1** — ESLint `no-english-toast-string` rule.
65. **PR-X2** — Playwright FTUX visual regression spec.
66. **PR-X4** — PostHog dashboard-as-code (needs PostHog provisioning).

### Dead-code & tests

67. **P1.1** — Knip deps sweep (4 unused + 10 unused dev + 38 unlisted). Per-workspace verification.
68. **P1.3** — 77 unused exports + 51 duplicate exports. Split into 3-4 surface-scoped PRs.
69. **P1.5** — mobile-shell knip 5 unused exports — verify-and-close (likely stale per 2026-05-14).
70. **P2 hoisted-deps** — `pnpm-workspace.yaml` nohoist verification.
71. **P1.2 follow-up** — Lighthouse CI LCP warn → error 3000 ms + branch protection.
72. **app-audit#renderWithProviders** — New `apps/mobile/test-utils/` wrapping ApiClientProvider. Fixes ~36 mobile test failures.
73. **mobile TransactionsPage tests** — 21/21 failures missing ApiClientProvider. Same pattern as PR #2215.
74. **app-audit#jest.mock hoist** — Rename `getVibePicksMock` → `mockGetVibePicks`.
75. **app-audit#act wrap** — `setReduceMotion` in `OnboardingWizard.test.tsx`.
76. **playwright.smoke webServer.command** — Windows-safe wrapper.

### Governance / docs (medium-risk)

77. **doc-hygiene#hard-rules split** — Move Hard Rules full text to `docs/governance/hard-rules.md`. Touches canonical policy + every skill backlink.
78. **doc-hygiene#scripts audit** — Verify package.json / workflows / husky deps before deleting anything.
79. **app-audit#node engine align** — bump engines or document .nvmrc.
80. **PR-13** — Update openclaw agent prompt cheatsheet (timestamp columns).
81. **backend-roast#@sergeant/db-schema umbrella export drop** — coordinate with mobile.

### Hub-dash misc

82. 🟡 **F2/F14 (hub-dash)** — F2 BarChart `aria-label` done across 4 module cards [Batch 6 / #3160]; F14 BentoCard `aria-label`/`aria-hidden` still open.
83. **F6/F7/F8/F20 (hub-dash)** — aggregateReport `now` arg, insights context, interval gating, CrossModulePreview telemetry.
84. **F22/F23/F24 (hub-dash)** — dead optional chain, missing HubReports test, ErrorBoundary test coverage.

### Auth-onb misc

85. ✅ **F18 (auth-onb)** — CelebrationModal autoCloseMs paused on focus/hover with `queueMicrotask` resume re-check [Batch 8 / #3162].
86. **F21/F22 (auth-onb)** — Better Auth client cast + AuthContext PostHog identify cast/disable.
87. ✅ **F23 (auth-onb)** — `presetApply.uid()` migrated to `crypto.randomUUID()` (RFC 4122 v4) [Batch 5 / #3159].
88. **F24/F25 (auth-onb)** — DemoModeBanner/DailyNudge dismiss aria-label, ResetPasswordPage autoFocus hostility.
89. ✅ **F13 (auth-onb)** — ReEngagementCard now uses `pluralDays()` from `@sergeant/shared` (CLDR rules + existing tests) [Batch 7 / #3161].

### Hub-chat F10/F12/F13

90. **F10** — `HubSearch` focus trap via `useDialogFocusTrap`.
91. **F12** — `HubChatBody` auto-scroll → `stickToBottom`.
92. **F13** — `handleClose` unreliable `history.length` → sessionStorage state.

## Close as stale

- ✅ `docs/audits/2026-05-03-readme-gap-analysis.md` — Status: Closed (historical record) [Init / #3153].
- ✅ `docs/audits/2026-05-13-documentation-hygiene-roast.md` — Status: Closed (historical record) [Init / #3153].

## Blocked

- ✅ **ux-roast PR-0 (telemetry)** — closed as shipped (Batch 10): all 9 events live in `packages/shared/src/lib/analyticsEvents.ts:273-302`, ADR-0054 covers §1-§13 decisions. 11 downstream PR-1a/1b/2/3/6/7/8/14/16/22/42/X4 now unblocked.
- **ux-roast PR-11 (CSV export)** — blocked on S3/R2 credentials.
- **ux-roast PR-28 (Avatar upload)** — blocked on S3/R2 credentials.
- **consolidated audit Scope 04** — Devin VM infra failure; retry queued. Also `git_pr` builtin returning "Bad credentials" in child Devin sessions despite valid PAT.
- **backend-roast P2-3 db-schema umbrella drop** — blocked on mobile-focused roast #5/10 coordination.
- **backend-roast SQLite `sync_op_outbox`** — blocked on Stage 8/9 SQLite migration program.
- **backend-roast P2-2 tracing.ts** — blocked on DI-vs-singleton design decision.
- **backend-roast audit text inconsistencies** — P2-1 push.ts and P2-4 metrics.md §6 marked both closed and open; reconcile before execution.
- **hub-dash audit-freeze window** — 2026-05-05 → 2026-06-02. Today 2026-05-31; 2 days remaining or route via `[freeze-exception]`. Status: all PRs in this batch stayed inside the freeze rules (no new top-level audit/initiative/playbook/ADR files added).

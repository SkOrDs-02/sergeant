# Audit runner report

> **Last validated:** 2026-05-31 by audits-runner workflow. **Next review:** 2026-06-30.
> **Status:** Reference

## TL;DR

- **Ship autoSafe doc edits this week** (4 items): style-guide PR-X3, doc-hygiene date-header canonicalization, .env.example secrets warnings, observability metrics doc cleanups, plus mechanical lifecycle-marker insertion on auth/onboarding/hub-chat scopes. Zero behavior change.
- **Top P0/critical to plan next:** C1 tool_calls Zod allow-list (consolidated audit + F3 hub-chat duplicate), C2 SW per-user cache, F12 Sentry Replay maskAllText, F13 PricingPage open-redirect, F8 Strategy bearer-auth, PR-12 SyncSetupRequiredError guard, P1 CSRF browser sign-up. These are user-blocking security/auth issues.
- **Close 2 audits as stale:** README gap analysis (2026-05-03) and doc-hygiene roast (2026-05-13) — all items resolved.

## Execute now

AutoSafe + low-risk doc-only items, safe to batch as a single PR per audit.

### 2026-05-02-doc-hygiene-audit

- [ ] doc-hygiene#1 — `docs/audits/archive/2026-04-28-ux-ui-audit.md` — canonicalize three date params into single freshness-header

### 2026-05-06-ux-roast-pr-plan

- [ ] ux-roast#PR-X3 — `docs/copy/style-guide.uk.md`, `AGENTS.md` (link) — pure docs new style guide + link

### 2026-05-07-app-audit

- [ ] app-audit#env-example — `.env.example` — document NUTRITION_BACKUP_KEY_SECRET / BETTER_AUTH_TOKEN_ENC_KEY warnings

### 2026-05-13-backend-performance-roast

- [ ] backend-roast#metrics-§6 — `docs/observability/metrics.md` — fill per-model AI-token join-pattern doc gap (verify against PR #2933 first)
- [ ] backend-roast#metrics-Відкриті — `docs/observability/metrics.md` — refresh stale "Відкриті питання" section

### 2026-05-13-page-audit-01-auth-onboarding

- [ ] auth-onb#F14 — auth/_ + onboarding/_ — insert Last validated/Status lifecycle markers (mechanical mass edit)
- [ ] auth-onb#F15 — AuthContext, authClient, useOnboardingWizardState, presetApply, cleanupDemoData — add AI-CONTEXT/AI-DANGER markers

### 2026-05-13-page-audit-02-hub-dashboard

- [ ] hub-dash#F16 — `apps/web/src/core/hub/HubReports.tsx` — close as resolved (Sprint 2 0017 split already shipped, 261 LOC)
- [ ] hub-dash#F18 — `apps/web/src/core/hub/ExpensesCard.tsx` — close as resolved (Array.isArray cast already in card split)

### 2026-05-13-page-audit-03-hub-chat-search

- [ ] hub-chat#F11 — 23 in-scope hub chat/search/backup files — insert lifecycle markers (Hard Rule #10)

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
19. **F15 (hub-dash)** — Six `!` assertions in `adaptiveSort.ts` — replace with guards.

### Server / env / observability

20. **P1.4 (dead-code)** — Phase 2 process.env burn-down: 4 callers + test refactors (`requireAnthropicKey`, `requireGroqKey`, `posthogCapture`, `authTransactionalMail`). Split into 4 PRs per audit guidance.
21. **app-audit obs migration** — `apps/server/src/obs/{logger,metrics,tracing}.ts` + push to `env.ts`. 64 `process.env` occurrences.
22. **backend-roast tracing.ts** — DI vs env.ts singleton design decision needed before refactor.
23. **F11 (hub-dash)** — `ModuleErrorBoundary` renders raw `error.message` in prod — token/stack leak risk.

### Theme refactors (cross-cutting visual / policy)

24. **F1 (auth-onb)** — `text-error` → `text-danger` token rename across 14 occurrences in auth tree.
25. **F19 (auth-onb)** — `ResetPasswordPage` mixed `text-error` / `text-danger` — subset of F1.
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
42. **F12 (hub-dash)** — `useMondayAutoDigest` idempotency guard — 2× LLM cost risk.
43. **F19 (hub-dash)** — `App.tsx` nutrition boot hooks unconditional — add auth gate + lazy.
44. **F14 (hub-chat)** — Title rewrite steamrolls user titles — schema change `titleSource`.
45. **F5 (hub-chat)** — Voice keyword auto-triggers TTS without consent — settings toggle.
46. **F15 (hub-chat)** — SSE consumer lacks per-chunk/total byte cap.
47. **F9 (hub-chat)** — Nested interactive elements in session row — structural refactor.

### Perf

48. **PR-22** — Lazy Insights/Digest + finyk Overview sub-card split. Bundle reshape.
49. **PR-24** — Mobile 100dvh + safe-area-inset-bottom across 4 module roots. Needs iOS QA.
50. **PR-25** — PostHog/Sentry init defer — boot-sequence change.

### UX-roast remainder (PR-0 unblocker first)

51. **PR-0** — Telemetry events + ADR + tracker. **Blocks 10 other PRs** — schedule first in the queue.
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

82. **F2/F14 (hub-dash)** — BarChart `aria-label` + BentoCard active-state `aria-label`/`aria-hidden`.
83. **F6/F7/F8/F20 (hub-dash)** — aggregateReport `now` arg, insights context, interval gating, CrossModulePreview telemetry.
84. **F22/F23/F24 (hub-dash)** — dead optional chain, missing HubReports test, ErrorBoundary test coverage.

### Auth-onb misc

85. **F18 (auth-onb)** — CelebrationModal 10s auto-dismiss races input — bump to 15s or drop.
86. **F21/F22 (auth-onb)** — Better Auth client cast + AuthContext PostHog identify cast/disable.
87. **F23 (auth-onb)** — `presetApply.uid()` Math.random → `crypto.randomUUID()`.
88. **F24/F25 (auth-onb)** — DemoModeBanner/DailyNudge dismiss aria-label, ResetPasswordPage autoFocus hostility.
89. **F13 (auth-onb)** — ReEngagementCard UA pluralization edge cases (use `Intl.PluralRules`).

### Hub-chat F10/F12/F13

90. **F10** — `HubSearch` focus trap via `useDialogFocusTrap`.
91. **F12** — `HubChatBody` auto-scroll → `stickToBottom`.
92. **F13** — `handleClose` unreliable `history.length` → sessionStorage state.

## Close as stale

- `docs/audits/2026-05-03-readme-gap-analysis.md` — closure note confirms all 15 checklist items de-facto covered in current README with per-item line mappings.
- `docs/audits/2026-05-13-documentation-hygiene-roast.md` — 53 broken links + 3 stale claims fixed; all P0/P1/P2 closed.

## Blocked

- **ux-roast PR-0 (telemetry)** — not started; blocks PR-1a, PR-1b, PR-2, PR-6, PR-7, PR-8, PR-14, PR-16, PR-22, PR-42, PR-X4. Unblock first.
- **ux-roast PR-11 (CSV export)** — blocked on S3/R2 credentials.
- **ux-roast PR-28 (Avatar upload)** — blocked on S3/R2 credentials.
- **consolidated audit Scope 04** — Devin VM infra failure; retry queued. Also `git_pr` builtin returning "Bad credentials" in child Devin sessions despite valid PAT.
- **backend-roast P2-3 db-schema umbrella drop** — blocked on mobile-focused roast #5/10 coordination.
- **backend-roast SQLite `sync_op_outbox`** — blocked on Stage 8/9 SQLite migration program.
- **backend-roast P2-2 tracing.ts** — blocked on DI-vs-singleton design decision.
- **backend-roast audit text inconsistencies** — P2-1 push.ts and P2-4 metrics.md §6 marked both closed and open; reconcile before execution.
- **hub-dash audit-freeze window** — 2026-05-05 → 2026-06-02. Today 2026-05-31; 2 days remaining or route via `[freeze-exception]`.

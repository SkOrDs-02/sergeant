<!-- AUTO-GENERATED -->

# Audit runner report

> **Last validated:** 2026-06-08 by audit-triage routine. **Next review:** 2026-09-06.
> **Status:** Reference

## Triage digest — 2026-06-08

Source: `docs/open-work.md §Аудити й прожарки` (17 open docs) + direct reads of each audit file. Audits with `Closed` / `Archived` / `Done` status excluded. Sorted by impact within each bucket.

---

## A — Security / Correctness

Highest blast radius; fix before next release.

1. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` C1** — `useChatSend.ts` dispatches AI `tool_calls` with no allow-list or Zod schema validation; prompt injection → arbitrary action execution with full Better Auth cookie context. **Add Zod-validated tool registry; reject + log unknown tool names before dispatch.**

2. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` C2 / `docs/90-work/audits/2026-05-13-page-audit-10-errors-pwa-marketing.md`** — Service-worker `Cache` namespace for `/api/*` keyed by URL only; after user A signs out on a shared device, user B receives A's cached API responses. **Key API cache by hashed session id; flush cache in `signOut` handler; add `Cache-Control: private` on all `/api/*` server responses.**

3. **`docs/90-work/audits/2026-05-13-page-audit-10-errors-pwa-marketing.md` F3 + F4** — Sentry Session Replay records text without `maskAllText: true` (PII leak); `PricingPage` redirects to `checkout.url` without origin allow-list (open redirect). **Add `maskAllText: true` to Sentry Replay init; validate `checkout.url` origin against an explicit allowlist before redirect.**

4. **`docs/90-work/audits/2026-05-13-page-audit-01-auth-onboarding.md` F1** — 14× `text-error`/`bg-error` references a non-existent design token; auth error banners and the password-strength bar render colorless in production (Tailwind silently drops unknown utilities). **Replace all 14 occurrences with `text-danger`/`bg-danger`** (pure rename, no logic change, zero risk).

5. **`docs/90-work/audits/2026-05-13-dead-code-hard-rules-roast.md` P1.4** — Four `process.env` callers (`requireAnthropicKey`, `requireGroqKey`, `posthogCapture` ×2, `authTransactionalMail`) bypass the typed `env` object; `lint:env-single-source` budget drifts with each feature PR. **Ship PR(A): migrate `requireAnthropicKey` + refactor `coach.route.test.ts` to `vi.resetModules + vi.stubEnv` pattern (net −1; establishes canonical test pattern for remaining 3 PRs).**

6. **`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`** — Security boundary of 1819-LOC `routes/internal/openclaw.ts` has been stub-audited (bearer-token guard on all 57 routes confirmed; HMAC grace-mode noted); audit-log gaps for write-tools and approval-gate drift vs ADR-0027 are not yet fully verified. **Assign a backend owner and schedule a full audit session before the 2026-08-11 trigger window.**

---

## B — Cheap AutoSafe Wins

Low-effort, high signal-to-noise; can ship independently without cross-team coordination.

1. **`docs/90-work/audits/2026-05-25-hubsettings-cls-chunk-load.md` MEDIUM #1** — `HubSettingsPage.tsx` lazy sections throw `ChunkLoadError` on stale-chunk PWA deploys → permanent white screen with no recovery UI. **Create `ChunkErrorBoundary.tsx`; wrap all 4 `<Suspense>` blocks; add retry button calling `window.location.reload()`** (5 files, branch `fix/hub-settings-cls-error-boundary`).

2. **`docs/90-work/audits/2026-05-25-hubsettings-cls-chunk-load.md` MEDIUM #2** — All 4 lazy sections share `minH: 72` (collapsed-state height); real painted height is 160–280 px → CLS jump when user has already scrolled. **Measure real heights via DevTools on `/hub#settings`; set per-section `minH` in `HubSettingsPage.tsx:254-277`** (can combine with MEDIUM #1 in one PR).

3. **`docs/90-work/audits/2026-05-13-testing-devx-roast.md` P1-4 PARTIAL** — 7 Detox e2e specs authored (`auth-flows`, `nutrition-full`, `nutrition-water-barcode`, `fizruk-full`, `fizruk-measurements`, `deep-link`, `offline-sync`) but not green because component `testID` props are missing in source. **Add missing `testID` attributes to auth/nutrition/fizruk source components** to unblock the authored suite without writing any new specs.

4. **`docs/90-work/audits/2026-05-13-dead-code-hard-rules-roast.md` P1.5** — Five exported symbols in `apps/mobile-shell` (`requestNativeBarcode`, `requestPermissions`, `subscribePushTokens`, `isCapacitorReady`, `getPlatform`) have zero JS importers. **Delete or wire into the Capacitor shell entry point** (micro-PR, no test-file changes needed).

5. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` Theme 2 (touch targets, partial)** — Three surfaces remain below 44×44 px after the previous audits-runner pass: 5 FTUX components (01 F8 — `DailyNudge`, `DemoModeBanner`, `SoftAuthPromptCard`, `ReEngagementCard`, `FirstRunHintBanner`), Finyk analytics month-nav (05 F5), Fizruk Atlas anterior/posterior toggle (06). **Batch-add `min-h-[44px] min-w-[44px]`** (pure CSS; ESLint `no-small-button-touch-target` already surfaces these as `warn`).

---

## C — Unblock Chains

Shipping these removes blockers on downstream work.

1. **`docs/90-work/audits/2026-05-06-ux-roast-pr-plan.md` Sprint 0 PR-0** — 9 PostHog events already catalogued in `analyticsEvents.ts`; Sprint 0 is formally open and blocks App-lock (PR-1a/1b), module settings (A4), error-boundary (A8) and ~11 other downstream items (20/41 PRs shipped; 21 remain). **Formally close PR-0** with a landing note pointing to the existing events, unblocking the full Sprint 1 queue.

2. **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md` P1-E** — `fizrukActions`, `finykActions`, `nutritionActions` still write via `safeWriteLS` (localStorage bypass), violating the state-write-paths doctrine; migration is impossible without server endpoints. **Create `POST /api/v1/finyk/manual-expenses`** as priority-1 domain endpoint to enable the finyk chatActions migration (per P1-E migration plan in the roast).

3. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` audit-04 coverage gap** — Hub Settings, Profile & Assistant Catalogue were **never audited** (VM infra failure at 2026-05-13 session); 0 findings recorded for these pages. **Re-run page-audit-04** to complete the 10-scope coverage matrix and close the blind spot before Sprint 9 planning.

4. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` individual page audits 02, 05–09** — Scopes for Hub Dashboard, Finyk, Fizruk Part 1/2, Nutrition, Routine+Strategy contain individual H/M findings beyond the 7 consolidated themes (e.g., 06 F3: rest-timer silently broken on navigation; 07 F3/F4: Measurements accepts `weightKg=99999` with no validation; 09 F1/F2: Strategy page calls internal API without bearer auth). **Triage each audit for H/M items not already in consolidated themes 1–7**; target at least one fix per sprint.

---

## D — Blocked / Gated

No immediate action possible without external input or a gating milestone.

1. **`docs/90-work/audits/2026-05-06-ux-roast-pr-plan.md` PR-11 + PR-28** — CSV export and Avatar upload explicitly **paused pending S3/R2 credentials** from founder; skeleton work can start but the upload-storage half must wait.

2. **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md` P1-E full migration** — `fizrukActions`/`nutritionActions` → `apiClient` migration blocked until `POST /api/v1/fizruk/workouts` and `POST /api/v1/nutrition/log` server endpoints exist; unblocks incrementally as each domain API ships (C2 above covers finyk priority-1).

3. **`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md` + `docs/90-work/audits/2026-08-XX-sync-engine-roast.md`** — Both are stubs **gated on the Q3 2026 backend-roast cycle** (trigger window 2026-08-11); no actionable findings before that date.

4. **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md` P2 open enhancements** — `STANDALONE_ROUTES` factory pattern and Provider HMR remount-invariant test are low-risk, deferred to a future tech-debt sprint.

---

## Coverage notes

- **Audit-04 (Hub Settings / Profile / Assistant Catalogue):** Never completed — active blind spot covering an estimated 30–40 H/M findings.
- **Individual page audits 02 (Hub Dashboard), 05–09 (Finyk, Fizruk Part 1/2, Nutrition, Routine+Strategy):** Read at consolidated-theme level only this pass; individual H/M findings not captured by themes 1–7 may require separate triage (see C4 above).
- **`docs/90-work/audits/2026-05-13-testing-devx-roast.md` P2 items (P2-2 ESLint plugin coverage, P2-4 property-based tests, P2-5 `pnpm check` parallelisation):** Nice-to-have; not blocking any lane.
- **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md` outstanding P2 items:** Low risk; tracked in `docs/90-work/tech-debt/frontend.md`.

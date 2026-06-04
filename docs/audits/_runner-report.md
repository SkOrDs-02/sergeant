<!-- AUTO-GENERATED -->
# Audit runner report

> **Last validated:** 2026-06-04 by audit-triage routine. **Next review:** 2026-09-02.
> **Status:** Active

## Triage digest — 2026-06-04

Source: `docs/open-work.md §Аудити й прожарки` (20 open docs) + direct reads of each audit file. Audits with `Closed` / `Archived` status excluded. Sorted by impact within each bucket.

---

## A — Security / Correctness

Highest blast radius; fix before next release.

1. **`docs/audits/2026-05-13-consolidated-page-audit.md` C1** — `useChatSend.ts` dispatches AI `tool_calls` with no allow-list or Zod schema validation; prompt injection → arbitrary action execution with full Better Auth cookie context. **Add a Zod-validated tool registry; reject + log unknown tool names before dispatch.**

2. **`docs/audits/2026-05-13-consolidated-page-audit.md` C2 / `docs/audits/2026-05-13-page-audit-10-errors-pwa-marketing.md`** — Service-worker `Cache` namespace for `/api/*` is keyed by URL only; after user A signs out on a shared device, user B receives A's cached API responses. **Key API cache by hashed session id; flush cache in `signOut` handler; add `Cache-Control: private` on all `/api/*` server responses.**

3. **`docs/audits/2026-05-13-dead-code-hard-rules-roast.md` P1.4** — Four `process.env` callers (`requireAnthropicKey`, `requireGroqKey`, `posthogCapture` ×2, `authTransactionalMail`) bypass the typed `env` object; `lint:env-single-source` budget drifts with each feature PR. **Ship PR(A): migrate `requireAnthropicKey` + refactor `coach.route.test.ts` to `vi.resetModules + vi.stubEnv` pattern** (net −1; establishes canonical test pattern for remaining 3 PRs).

4. **`docs/audits/2026-08-XX-openclaw-internal-roast.md`** — Security boundary of 1781-LOC `routes/internal/openclaw.ts` (bearer-token guard coverage, audit-log gaps for write-tools, write-tool approval-gate drift vs ADR-0027) is a stub awaiting Q3 audit. **Assign backend owner and schedule full audit session before 2026-08-11 trigger window.**

---

## B — Cheap AutoSafe Wins

Low-effort, high signal-to-noise; can ship independently.

1. **`docs/audits/2026-05-13-testing-devx-roast.md` P1-4 PARTIAL** — Seven Detox e2e specs are authored (`auth-flows`, `nutrition-full`, `nutrition-water-barcode`, `fizruk-full`, `fizruk-measurements`, `deep-link`, `offline-sync`) but not green because component `testID` props are missing in source. **Add missing `testID` attributes to auth/nutrition/fizruk components** to unblock the authored suite without new spec work.

2. **`docs/audits/2026-05-13-dead-code-hard-rules-roast.md` P1.5** — Five exported symbols in `apps/mobile-shell/` (`requestNativeBarcode`, `requestPermissions`, `subscribePushTokens`, `isCapacitorReady`, `getPlatform`) have zero JS importers. **Delete or wire into the Capacitor shell entry point** (micro-PR, no test changes needed).

3. **`docs/audits/2026-05-13-consolidated-page-audit.md` Theme 2 (touch targets)** — Three surfaces remain below 44×44 px after the audits-runner pass: FTUX 5 components (01 F8 — `DailyNudge`, `DemoModeBanner`, `SoftAuthPromptCard`, `ReEngagementCard`, `FirstRunHintBanner`), Finyk analytics month-nav (05 F5), Fizruk Atlas anterior/posterior toggle (06). ESLint `no-small-button-touch-target` already warns. **Batch-add `min-h-[44px] min-w-[44px]` across the 3 remaining surfaces** (pure CSS, no logic change).

4. **`docs/audits/2026-05-13-page-audit-01-auth-onboarding.md`** — 25 findings (0C, 6H, 16M, 3L); no execution PRs beyond F1 (token rename) closed in the audits-runner pass. **Pick the top-H item and ship** (H-class items: a11y hit-area + CSRF/CORS surface + FTUX flow gaps per consolidated §01 cluster).

5. **`docs/audits/2026-05-13-web-frontend-ergonomics-roast.md` F2-II / F4 / F7** — Three ergonomics findings deferred from the 2026-06-02 runner pass. **Review and ship at least one** (F4 is likely smallest; confirm scope from the roast file).

---

## C — Unblock Chains

Shipping these removes blockers on downstream work.

1. **`docs/audits/2026-05-06-ux-roast-pr-plan.md` Sprint 0 PR-0** — Telemetry ADR + PostHog event taxonomy foundation has not started; it blocks A1 (App-lock UX), A4, A8, and ~21 downstream Sprint 2/3 UX PRs (20/41 shipped so far). **Ship PR-0** to unblock roughly half the remaining UX execution plan.

2. **`docs/audits/2026-05-13-web-architecture-state-roast.md` P1-E** — `fizrukActions`, `finykActions`, and `nutritionActions` still write via `safeWriteLS` (localStorage bypass), violating the state-write-paths doctrine; migration is impossible without server endpoints. **Create `POST /api/v1/finyk/manual-expenses`** as priority-1 domain endpoint to enable the finyk chatActions migration (per P1-E migration plan in the roast).

3. **`docs/audits/2026-05-13-consolidated-page-audit.md` audit-04 coverage gap** — Hub Settings, Profile & Assistant Catalogue were **never audited** (VM infra failure; 0 findings recorded). **Re-run page-audit-04** to complete the consolidated 10-scope coverage matrix before Sprint 9 planning.

4. **`docs/audits/2026-08-XX-sync-engine-roast.md`** — Atomic-transaction boundaries and DLQ TTL in the 3031-LOC `syncV2.ts` are undocumented; this must be clarified before Stage 8/9 SQLite dual-write is wired. **Trigger Q3 audit session** (gated on sprint-roadmap Спринт 8 closeout, planned 2026-08-11).

---

## D — Blocked / Gated

No immediate action possible without external input or gating milestone.

1. **`docs/audits/2026-05-06-ux-roast-pr-plan.md` PR-11 + PR-28** — CSV export (PR-11) and Avatar upload (PR-28) are explicitly **paused pending S3/R2 credentials** from founder. Skeleton can be started; upload storage half must wait.

2. **`docs/audits/2026-05-13-web-architecture-state-roast.md` P1-E full migration** — chatActions `safeWriteLS` → `apiClient` migration for fizruk/nutrition blocked until their server endpoints exist (no `POST /api/v1/fizruk/workouts`, `POST /api/v1/nutrition/log`). Unblocked incrementally as each domain API ships (see C2 above for finyk priority).

3. **`docs/audits/2026-08-XX-openclaw-internal-roast.md` + `docs/audits/2026-08-XX-sync-engine-roast.md`** — Both are stubs in Draft status, **gated on Q3 2026 backend-roast cycle** (trigger window 2026-08-11). No actionable findings yet.

4. **`docs/audits/2026-05-15-deep-audit-state-of-repo.md`** — Status Active but 0 truly-outstanding items (D1–D4 all closed 2026-06-03); retained for cross-references only. **Candidate for archiving** once cross-ref consumers are updated.

---

## Coverage notes

- **Zero findings — audit-04 (Hub Settings / Profile / Assistant Catalogue):** Never completed due to VM infra failure at the consolidated audit session (2026-05-13). This is an active blind spot covering Settings, Profile, and the Assistant Catalogue pages.
- **Potential input truncation:** Page audits 06 (fizruk-part1, 27 findings), 07 (fizruk-part2, 50 findings), 08 (nutrition, 25 findings), and 09 (routine-strategy, 23 findings) were not read in detail this pass. Theme 1 (TZ correctness) and Theme 2 (touch targets) are accounted for via the consolidated audit; remaining H/M findings in these four files may have additional open work beyond what this triage captures.
- **`docs/audits/2026-05-07-full-app-regression-ux-audit.md`:** Active with 7 PR mentions; content not fully read this pass — may contain residual findings beyond the archived `app-audit` cross-refs.
- **`docs/audits/2026-05-02-doc-hygiene-audit.md`:** Active but all P0 items (ADR gap rule, lifecycle markers, CLAUDE/DEVIN thin-pointer) were closed in the original PR; remaining items appear cosmetic (duplicate `Last validated` dates).

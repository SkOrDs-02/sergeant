<!-- AUTO-GENERATED -->

# Audit runner report

> **Last validated:** 2026-06-11 by audit-triage routine. **Next review:** 2026-09-09.
> **Status:** Reference

## Triage digest — 2026-06-11

Source: `docs/open-work.md §Аудити й прожарки` (15 open docs) + direct reads of key audit files. Audits with `Closed` / `Archived` / `Done` / `Reference` status excluded. Sorted by impact within each bucket.

Delta from 2026-06-08 pass: **3 audits removed** (`page-audit-01-auth-onboarding` + `dead-code-hard-rules-roast` archived 2026-06-08; `hubsettings-cls-chunk-load` closed 2026-06-09); **1 audit added** (`2026-06-08-codebase-cleanup-audit`); testing-devx P1-4 (Detox testIDs) closed 2026-06-09.

---

## A — Security / Correctness

Highest blast radius; fix before next release.

1. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` C1** — `useChatSend.ts` dispatches AI `tool_calls` with no allow-list or Zod schema validation; prompt injection → arbitrary action execution with full Better Auth cookie context. **Add Zod-validated tool registry; reject + log unknown tool names before dispatch.**

2. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` C2 / `docs/90-work/audits/2026-05-13-page-audit-10-errors-pwa-marketing.md`** — Service-worker `Cache` namespace for `/api/*` keyed by URL only; after user A signs out on a shared device, user B receives A's cached API responses. **Key API cache by hashed session id; flush cache in `signOut` handler; add `Cache-Control: private` on all `/api/*` server responses.**

3. **`docs/90-work/audits/2026-05-13-page-audit-10-errors-pwa-marketing.md` F3 + F4** — Sentry Session Replay records text without `maskAllText: true` (PII leak); `PricingPage` redirects to `checkout.url` without origin allow-list (open redirect). **Add `maskAllText: true` to Sentry Replay init; validate `checkout.url` origin against an explicit allowlist before redirect.**

4. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md` + `docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`** — 5 write-tools (`write/strategy-doc`, `write/github-issue`, `write/post-to-topic`, `write/pause-workflow`, `write/mute-alert`) and 3 n8n-mutation routes (`n8n/trigger`, `n8n/activate`, `snapshot/refresh`) sit behind the same `INTERNAL_API_KEY` bearer token as read-only routes; approval-gate (ADR-0036) lives on Gateway-side only and is not re-verified at the HTTP layer. Additionally, `strategy-doc` / `github-issue` / `pause-workflow` / `mute-alert` handlers do not write inline audit rows — they rely on a separate `write-audit/log` call from the Gateway; if the Gateway fails to call it, an external mutation occurs with no persisted audit trail. **Schedule a full audit session against `apps/server/src/routes/internal/openclaw.ts` before the 2026-08-11 trigger window; assign a backend owner; evaluate adding server-side re-verification for write-scope routes.**

---

## B — Cheap AutoSafe Wins

Low-effort, high signal-to-noise; can ship independently without cross-team coordination.

1. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md` PR-A** — `eslint.baseline.js:131` lists `tools/console/tsconfig.json` in the TypeScript import-resolver project list; `tools/console/` does not exist (directory is `tools/openclaw/`). The resolver silently falls back to `node` mode and cannot see the openclaw workspace for import rules. **Fix path to `tools/openclaw/tsconfig.json` + re-snapshot eslint-print-config fixtures** (zero logic change, maximum agent-clarity gain).

2. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md` PR-D** — `sergeant-design/ai-marker-syntax` is set to `"warn"` in `eslint.baseline.js:194` with note "promote to error once clean"; there are currently **0** `AI-LEGACY` markers in the codebase. **Promote to `"error"` in `eslint.baseline.js`** (no violation to fix, purely a gate-hardening step).

3. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` Theme 2 (touch targets, partial)** — Seven surfaces remain below the 44×44 px WCAG 2.5.5 floor: 5 FTUX components (`DailyNudge`, `DemoModeBanner`, `SoftAuthPromptCard`, `ReEngagementCard`, `FirstRunHintBanner` — audit-01 F8), Finyk analytics month-nav (audit-05 F5), Fizruk Atlas anterior/posterior toggle (audit-06). **Batch-add `min-h-[44px] min-w-[44px]`** (pure CSS; ESLint `no-small-button-touch-target` already surfaces these as `warn`).

---

## C — Unblock Chains

Shipping these removes blockers on downstream work.

1. **`docs/90-work/audits/2026-05-06-ux-roast-pr-plan.md` Sprint 0 PR-0** — 9 PostHog events already catalogued in `analyticsEvents.ts`; Sprint 0 is formally open and blocks App-lock (PR-1a/1b), module settings (A4), error-boundary (A8), and ~11 other downstream items (20/41 PRs shipped; 21 remain). **Formally close PR-0** with a landing note pointing to the existing events, unblocking the full Sprint 1 queue.

2. **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md` P1-E** — `fizrukActions`, `finykActions`, `nutritionActions` still write via `safeWriteLS` (localStorage bypass), violating the state-write-paths doctrine; migration is impossible without server endpoints. **Create `POST /api/v1/finyk/manual-expenses`** as priority-1 domain endpoint to enable the finyk chatActions migration (per P1-E migration plan in the roast).

3. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md` audit-04 coverage gap** — Hub Settings, Profile & Assistant Catalogue were **never audited** (VM infra failure at 2026-05-13 session); 0 findings recorded for these pages. **Re-run page-audit-04** to complete the 10-scope coverage matrix and close the blind spot before Sprint 9 planning.

4. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md` PR-B + PR-C** — Doc-hygiene outstanding: archive remaining stale initiatives/plans from Tema 2 (e.g., `pr-plan-2026-05.md`, `storage-roadmap.md` confirmed done items), update ADR-0058–0061 from `Proposed` to `Accepted`, fix ADR-0003 stale price, add ADR-0025↔ADR-0062 cross-link. PR-C deploy-file coordination: `Dockerfile.console` → `Dockerfile.openclaw`, `railway.console.toml` → `railway.openclaw.toml`, `commitlint.config.js` scope cleanup. **Ship PR-B as doc-only; coordinate PR-C with a Railway deploy window.**

---

## D — Blocked / Gated

No immediate action possible without external input or a gating milestone.

1. **`docs/90-work/audits/2026-05-06-ux-roast-pr-plan.md` PR-11 + PR-28** — CSV export and Avatar upload explicitly **paused pending S3/R2 credentials** from founder; skeleton work can start but the upload-storage half must wait.

2. **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md` P1-E full migration** — `fizrukActions`/`nutritionActions` → `apiClient` migration blocked until `POST /api/v1/fizruk/workouts` and `POST /api/v1/nutrition/log` server endpoints exist; unblocks incrementally as each domain API ships (C2 above covers finyk priority-1).

3. **`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md` + `docs/90-work/audits/2026-08-XX-sync-engine-roast.md`** — Both are stubs **gated on the Q3 2026 backend-roast cycle** (trigger window 2026-08-11); no actionable findings before that date.

4. **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md` P2 open enhancements** — `STANDALONE_ROUTES` factory pattern and Provider HMR remount-invariant test are low-risk, deferred to a future tech-debt sprint.

5. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md` PR-C Railway rename** — Service name rename `sergeant-hubchat` → `sergeant-openclaw` (domain + webhook reconfiguration) requires founder coordination outside git; not actionable as a code PR.

---

## Coverage notes

- **Audit-04 (Hub Settings / Profile / Assistant Catalogue):** Never completed — active blind spot covering an estimated 30–40 H/M findings. Highest-priority gap in the coverage matrix.
- **Page-audit-09 F1/F2:** Strategy page calls an internal API without bearer auth — high-severity finding buried in a per-page audit not yet captured by consolidated themes 1–7; needs dedicated triage.
- **Individual page audits 02 (Hub Dashboard), 05–09 (Finyk, Fizruk Part 1/2, Nutrition, Routine+Strategy):** Scanned only at consolidated-theme level this pass; individual H/M findings beyond themes 1–7 are not yet triaged (see C3 above).
- **Testing devx roast P2 items** (P2-2 ESLint plugin coverage, P2-4 property-based tests): nice-to-have; not blocking any lane.
- **Web architecture roast outstanding P2 items:** Low risk; tracked in `docs/90-work/tech-debt/frontend.md`.
- **Codebase cleanup react-hooks v7 suppressions (~152 violations in `eslint.baseline.js:146–178`):** Legitimate debt without owner or deadline — recommend creating a dedicated initiative with a ticket and date before next triage cycle.

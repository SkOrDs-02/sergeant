<!-- AUTO-GENERATED -->

# Audit runner report

> **Last validated:** 2026-06-13 by audit-triage routine. **Next review:** 2026-09-09.
> **Status:** Reference

## Triage digest — 2026-06-13

Source: `docs/open-work.md §Аудити й прожарки` (15 open docs) + direct reads of key audit files. Audits with `Closed` / `Archived` / `Done` / `Reference` status excluded. Sorted by impact within each bucket.

Delta from 2026-06-11 pass (reconciliation): **7 findings reconciled as already-shipped** and moved out of A/B into the new «Закриті з минулого тріажу (verified shipped 2026-06-13)» section below. They were carried as OPEN in the 2026-06-11 digest but are confirmed live on the current branch (each with `file:line` evidence). The source audits were annotated inline (`✅ Закрито 2026-06-13`); no document `Status:` header was flipped, so `docs/open-work.md` does not regenerate. Items moved: consolidated C1, C2, Theme 2 touch-targets; 10-errors F3, F4; codebase-cleanup PR-A, PR-D. The C2/F2 service-worker partition pair is the same root finding tracked across both audits.

Delta from 2026-06-08 pass: **3 audits removed** (`page-audit-01-auth-onboarding` + `dead-code-hard-rules-roast` archived 2026-06-08; `hubsettings-cls-chunk-load` closed 2026-06-09); **1 audit added** (`2026-06-08-codebase-cleanup-audit`); testing-devx P1-4 (Detox testIDs) closed 2026-06-09.

---

## A — Security / Correctness

Highest blast radius; fix before next release.

1. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md` + `docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`** — 5 write-tools (`write/strategy-doc`, `write/github-issue`, `write/post-to-topic`, `write/pause-workflow`, `write/mute-alert`) and 3 n8n-mutation routes (`n8n/trigger`, `n8n/activate`, `snapshot/refresh`) sit behind the same `INTERNAL_API_KEY` bearer token as read-only routes; approval-gate (ADR-0036) lives on Gateway-side only and is not re-verified at the HTTP layer. Additionally, `strategy-doc` / `github-issue` / `pause-workflow` / `mute-alert` handlers do not write inline audit rows — they rely on a separate `write-audit/log` call from the Gateway; if the Gateway fails to call it, an external mutation occurs with no persisted audit trail. **Schedule a full audit session against `apps/server/src/routes/internal/openclaw.ts` before the 2026-08-11 trigger window; assign a backend owner; evaluate adding server-side re-verification for write-scope routes.**

---

## B — Cheap AutoSafe Wins

Low-effort, high signal-to-noise; can ship independently without cross-team coordination.

_All previously-listed B items (codebase-cleanup PR-A, PR-D; consolidated Theme 2 touch targets) are verified-shipped as of 2026-06-13 — see «Закриті з минулого тріажу» below. No open B-bucket items remain this pass._

---

## Закриті з минулого тріажу (verified shipped 2026-06-13)

Findings carried as OPEN in the 2026-06-11 digest but confirmed already-shipped on the current branch during the 2026-06-13 reconciliation. Each source audit is annotated inline; no `Status:` header was flipped.

1. **`2026-05-13-consolidated-page-audit.md` C1** — AI `tool_calls` runtime validation. ✅ `useChatSend.ts` now routes every batch through `parseToolCalls()` (Zod schema in `./toolCallSchema`); a schema mismatch drops the batch, toasts the user, and falls back to plain text before any handler runs — arbitrary action execution blocked (`apps/web/src/core/hub/chat/useChatSend.ts:319-339`).

2. **`2026-05-13-consolidated-page-audit.md` C2 + `2026-05-13-page-audit-10-errors-pwa-marketing.md` F2** — cross-user SW cache leak. ✅ `apps/web/src/sw/cache.ts` partitions the runtime cache per user via `userPartitionPlugin` (hashed `__u=` prefix), `setActiveUserKey`, and a `signOut → CLEAR_SW_CACHES` flush. Server adds a stronger layer: `cachingMiddleware({ policy: "no-store" })` mounted on all `/api` (`apps/server/src/app.ts:157`) — stricter than the audit's recommended `Cache-Control: private`. Cross-user leak closed.

3. **`2026-05-13-page-audit-10-errors-pwa-marketing.md` F3** — Sentry Replay PII. ✅ `replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })` (`apps/web/src/core/observability/sentry.ts:329`); regression test asserts all three flags.

4. **`2026-05-13-page-audit-10-errors-pwa-marketing.md` F4** — PricingPage open redirect. ✅ `assertAllowedCheckoutUrl()` host allow-list defined in `apps/web/src/core/PricingPage.tsx:61-74`, applied before `window.location.assign` on checkout (L225) and portal (L270).

5. **`2026-06-08-codebase-cleanup-audit.md` PR-A** — `eslint.baseline.js` `tools/console` resolver path. ✅ No `tools/console` reference remains in `eslint.baseline.js`; the resolver project list is web/mobile/mobile-shell only.

6. **`2026-06-08-codebase-cleanup-audit.md` PR-D** — `sergeant-design/ai-marker-syntax` warn→error. ✅ Already `"error"` at `eslint.baseline.js:193` (promoted 2026-06-08, `0 violations` confirmed in the rule comment).

7. **`2026-05-13-consolidated-page-audit.md` Theme 2 touch targets (partial)** — all 7 named surfaces now ≥44×44 px. ✅ DailyNudge (`min-w/h-[44px]`), FirstRunHintBanner (`min-h/w-[44px]`), DemoModeBanner + SoftAuthPromptCard (rendered via `<Button>`, which auto-applies 44px for `xs`/`sm`/`iconOnly`), ReEngagementCard (`Button size="sm"`) — closes audit-01 F8; Finyk analytics month-nav `min-w/h-[44px]` (`apps/web/src/modules/finyk/pages/Analytics.tsx:128`) — closes audit-05 F5; Fizruk Atlas anterior/posterior toggle `min-h-[44px]` (`apps/web/src/modules/fizruk/components/BodyAtlas.tsx:340/347`) — closes audit-06 Atlas.

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
- **Codebase cleanup react-hooks v7 suppressions (~152 violations in `eslint.baseline.js:146–178`):** Now tracked by [`docs/90-work/initiatives/0021-react-hooks-v7-cleanup.md`](../initiatives/0021-react-hooks-v7-cleanup.md) (Agent-ready, ETA 2026-09-09, start not-before Sprint 9 2026-07-07). Phase 0 partial (5 inline disables fixed); baseline burn-down (−50% target) outstanding.

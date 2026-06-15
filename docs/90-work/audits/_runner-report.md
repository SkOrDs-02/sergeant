<!-- AUTO-GENERATED -->

# Audit runner report

> **Last validated:** 2026-06-15 by audit-triage routine. **Next review:** 2026-09-13.
> **Status:** Reference

## Triage digest — 2026-06-15

Source: `docs/open-work.md §Аудити й прожарки` (16 open docs) + direct reads of key audit files. Audits with `Closed` / `Archived` / `Done` / `Reference` status excluded. Sorted by impact within each bucket.

Delta from 2026-06-13 pass: **fable5-independent-audit P2 second wave (2026-06-12) verified shipped** — global `pg.types.setTypeParser(int8)` bigint parser, single-source `coverage-thresholds.json`, Monobank unit tests (24), Testcontainers pg16→pg17 alignment, orphan `syncV2Types.ts` removed. These were listed in the 2026-06-13 B bucket; all confirmed closed. The remaining open queue from that audit is now the P2-"далі" set documented in the fable5 file. **No new audits added this pass.**

---

## A — Security / Correctness

Highest blast radius; fix before next release.

1. **`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`** — 8 mutation-capable routes (5 `write/*` + 3 `n8n/*`) share the same `INTERNAL_API_KEY` bearer token as all read-only routes; approval gate (ADR-0036) lives on Gateway-side only with no server-side re-verification, so a compromised key gives direct write access bypassing approval flow. Additionally, 4 of 5 write-tool handlers (`strategy-doc`, `github-issue`, `pause-workflow`, `mute-alert`) do not write an inline audit row — they rely on a separate Gateway `write-audit/log` call that may never fire, leaving external mutations with no persisted audit trail. **Assign a backend owner and schedule the full audit session before the 2026-08-11 trigger window; evaluate per-scope bearer tokens or server-side scope re-verification for mutating routes.**

2. **`docs/90-work/audits/2026-05-13-page-audit-09-routine-strategy.md`** — Strategy page calls an internal API without bearer auth (high-severity F1/F2 noted in the consolidated-page-audit coverage section but not yet triaged at item level or fixed). **Read the audit findings and ship a fix before Sprint 9.**

3. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (pnpm audit critical-gate) — `pnpm audit` critical-gate has no exception-path: the `audit-exceptions` ledger is not read by the gate, and the PR-label escape exists only for `high`, not `critical`. A new critical CVE forces a choice between blocking all PRs or merging through the gate blind. **Add a `--exceptions-file docs/04-governance/security/audit-exceptions.md` reader to the audit gate or document the override path clearly.**

4. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (merge serialization / CI discipline) — `enforce_admins=false` still allows merging through red required checks; ≥3 migration number collisions have occurred on main from concurrent merges without a merge queue. **Founder action: enable required checks enforcement + merge queue in branch protection (1 click).**

---

## B — Cheap AutoSafe Wins

Low-effort, high signal-to-noise; can ship independently without cross-team coordination.

1. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md` PR-B** — doc-only PR (zero code risk): archive stale confirmed-done initiatives and plans (`pr-plan-2026-05.md`, `storage-roadmap.md`), promote ADR-0058–0061 from `Proposed` to `Accepted`, fix stale price in ADR-0003 body (still shows historical ₴99; ADR-0051 set $7), add ADR-0025↔ADR-0062 cross-link. **Ship as a standalone doc-hygiene PR (`docs(agents)`).**

2. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (freshness mechanics) — `bump-last-validated` hook stamps any staged `.md` with today's date, conflating churn with review; 53% of the corpus was stamped by a single link-rewrite commit, making the freshness dashboard unreliable as a review signal. **Design and ship a manual `validate-marker` vs churn-bump split** (e.g. opt-in `--validate` flag in `bump-last-validated.mjs`).

3. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (i18n ratchet) — `en.ts` has 215 lines vs `uk.ts` 847 lines; the i18n allowlist covers 243 files with no ratchet preventing the gap from widening further. **Add a numeric ratchet** (`max_english_only_literals`) to the i18n lint gate to stop regression while the backlog is burned down.

4. **`docs/90-work/audits/2026-05-13-testing-devx-roast.md`** (P1-1 remaining contract fixtures) — contract-fixture pattern covers only `/api/me` and `/api/barcode`; Hard Rule #3 runtime drift on the remaining endpoints is caught only by TypeScript compilation. **Add fixtures for food-search, parse-pantry, sync/v2, finyk/cashflow, nutrition/log, routine/today, fizruk/heatmap** (per plan in `docs/02-engineering/testing/2026-05-05-tests-pr-plan.md` T29/T30).

---

## C — Unblock Chains

Shipping these removes blockers on downstream work.

1. **`docs/90-work/audits/2026-05-06-ux-roast-pr-plan.md`** — 21 of 41 PRs remain outstanding; PR-1a (App-lock PIN flow) is the earliest P0 item blocking ~11 downstream Sprint 1 UX items (PR-2 module settings, PR-3 module picker, PR-6 error boundary, PR-7 permissions, PR-8 form validation, etc.). PR-0 telemetry is formally closed (events in `analyticsEvents.ts:273-302`). **Start PR-1a to unlock the Sprint 1 queue before Sprint 9 planning.**

2. **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md`** (P1-E) — `fizrukActions`, `finykActions`, and `nutritionActions` in HubChat `chatActions` still write via `safeWriteLS` (localStorage bypass), violating the state-write-paths doctrine (`docs/02-engineering/architecture/state-write-paths.md`). The finyk path is now unblocked (ws-10 `POST /api/finyk/manual-expenses` shipped via #3516). **Create `POST /api/v1/fizruk/workouts` and `POST /api/v1/nutrition/log` server endpoints** to unblock the fizruk and nutrition chatAction migrations next.

3. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md`** (audit-04 gap) — Hub Settings, Profile & Assistant Catalogue was **never audited** (VM infra failure during the 2026-05-13 session); the estimated 30–40 H/M findings represent the largest single blind spot in the 10-scope coverage matrix. **Re-run page-audit-04** before Sprint 9 planning to close this gap.

4. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md`** (PR-C) — `Dockerfile.console` → `Dockerfile.openclaw` + `railway.console.toml` rename + `commitlint.config.js` `console` scope removal remain incomplete; service-catalog and deploy docs still reference the old names. The Trivy scan extension landed (commit `120ec9d94`) but the remaining parts need a Railway deploy window. **Coordinate with founder for a deploy window; then ship the rename PR.**

---

## D — Blocked / Gated

No immediate action possible without external input or a gating milestone.

1. **`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`** + **`docs/90-work/audits/2026-08-XX-sync-engine-roast.md`** — both stubs are gated on the Q3 2026 backend-roast trigger window (2026-08-11); no actionable findings should be extracted before that date.

2. **`docs/90-work/audits/2026-05-06-ux-roast-pr-plan.md`** PR-11 (CSV export) + PR-28 (Avatar upload) — explicitly paused pending S3/R2 storage credentials from founder; skeleton work can begin but the upload-storage half must wait.

3. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (founder-gated ws-02 / ws-01b / UptimeRobot) — ФОП registration (5–10 calendar-day lag), final price decision + ADR-0051 amend, `APPLE_*` env vars in Railway, UptimeRobot external uptime signal — all require founder action; no agent-executable path exists.

4. **`docs/90-work/audits/2026-05-13-web-architecture-state-roast.md`** (P1-E fizruk/nutrition) — chatAction migration for fizruk and nutrition surfaces is blocked on the server endpoints listed in C2 above.

5. **`docs/90-work/audits/2026-05-13-testing-devx-roast.md`** — Mobile Detox missing 5 suites (auth, nutrition, fizruk, deep-link, offline-sync) + mutation testing PR-required tier-1 floor unset — large scope items deferred to Sprint 9 planning (2026-07-07).

6. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (SLO/alert stack) — Grafana Cloud alert rules exist as design artifacts only; UptimeRobot wiring is a founder action; Grafana Cloud sync decision (keep 24 design rules vs delete) requires owner input.

---

## Coverage notes

- **Audit-04 (Hub Settings / Profile / Assistant Catalogue):** never completed — active blind spot estimated at 30–40 H/M findings. Highest-priority gap in the 10-scope coverage matrix (see C3 above).
- **`2026-05-13-page-audit-09-routine-strategy.md` F1/F2:** Strategy page internal API without bearer auth (high-severity) — identified in consolidated coverage notes but not formally extracted to A bucket until this pass; no fix PR found.
- **Individual page audits 05–09 (Finyk, Fizruk Part 1/2, Nutrition, Routine/Strategy):** scanned at consolidated-theme level only in prior passes; individual H/M findings beyond themes 1–7 are not yet triaged. Fizruk Part 2 alone has 50 findings (0 critical, 6 high, 25 medium, 19 low).
- **react-hooks v7 suppressions (~152 baseline violations):** tracked by initiative `0021-react-hooks-v7-cleanup.md` (Agent-ready 🟢, ETA 2026-09-09, start not-before Sprint 9 2026-07-07); Phase 0 partial (5 inline disables fixed); baseline burn-down outstanding.
- **Orphan billing schemas (m047/m070-072):** two-phase DROP candidates post-launch — not actionable until billing is live; tracked as P2 in fable5 audit.
- **ESLint baselines without deadlines (react-hooks ~152, non-null ~96):** covered by initiative 0021 above; burn-down «2026-Q3» label exists but no enforcement date is set.

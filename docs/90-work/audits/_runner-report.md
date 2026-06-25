<!-- AUTO-GENERATED -->
<!-- AI-GENERATED: audits-runner -->

# Audit runner report

> **Last validated:** 2026-06-25 by audits-runner workflow. **Next review:** 2026-09-23.
> **Status:** Reference

## Triage digest — 2026-06-25

Source: `docs/open-work.md §Аудити й прожарки` (9 open audits) + direct reads of all audit files. Audits with `Closed` / `Archived` / `Done` / `Reference` status excluded. Sorted by impact within each bucket.

Delta from 2026-06-22 pass: PRs **#3688–#3721** landed since last triage. Notable: **#3711** raises web test coverage to 75% line floor (closes the web coverage floor concern previously tracked from the fable5 audit and testing-devx-roast); **#3717** closes the react-hooks/use-memo baseline entry (burn-down progressing); **#3709** extends touch-target enforcement to `role=button/menuitem/option`; **#3702–#3707** close HC AA accessibility items (theme-aware ink for buttons, badges, tabs, dialog roles, landmarks) from `consolidated-page-audit`. No new audit files added this pass.

---

## A — Security / Correctness

Highest blast radius; fix before next release.

1. **`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`** — permission matrix fully documented (57 routes, 2026-06-16): 4 of 5 write-tool handlers (`write/strategy-doc`, `write/github-issue`, `write/pause-workflow`, `write/mute-alert`) have **no inline `openclaw_write_audit` row** — they rely solely on a separate Gateway `write-audit/log` call that may never fire if the Gateway drops the connection, leaving external mutations (GitHub commits, Telegram posts, n8n triggers) with no persisted audit trail. All 57 routes share a single `INTERNAL_API_KEY` bearer scope with **no per-route ACL**, so a compromised key grants direct write access bypassing the approval flow. **Assign backend owner; add inline `openclaw_write_audit` write to the 4 write-tool handlers as a standalone P1 PR before the 2026-08-11 full audit session; evaluate per-scope bearer tokens or server-side scope re-verification for mutating routes.**

2. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (pnpm audit critical-gate) — `audit-exceptions.md` ledger is not read by the gate; PR-label escape exists only for `high`, not `critical`. A new critical CVE forces either blocking all PRs or merging blind. **Add `--exceptions-file docs/04-governance/security/audit-exceptions.md` reader to the audit gate and document the critical-override path.**

3. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (merge serialization / CI discipline) — `enforce_admins=false` still allows merging through red required checks; ≥3 migration number collisions have occurred on main from concurrent merges without a merge queue. **Founder action: enable required checks enforcement + merge queue in branch protection (1 click in GitHub settings).**

---

## B — Cheap AutoSafe Wins

Low-effort, high signal-to-noise; can ship independently without cross-team coordination.

1. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md`** (plop rename residual) — `plop-templates/hubchat-tool/` and `new-console-specialist` generators still carry stale `hubchat`/`console` branding; 10+ doc-refs in active skills/comments still point to old names, disorienting agents. **Ship a single docs-only rename PR `chore(agents): rename plop templates console→openclaw`.**

2. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (freshness mechanics) — `bump-last-validated` hook stamps any staged `.md` with today's date, conflating churn with deliberate review; 53% of the corpus was stamped by a single link-rewrite commit, making the freshness dashboard unreliable. **Design and ship a manual `--validate` opt-in flag in `bump-last-validated.mjs` to differentiate intentional review from churn-driven stamps.**

3. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (i18n ratchet) — `en.ts` 215 lines vs `uk.ts` 847 lines; i18n allowlist covers 243 files with no numeric ratchet preventing the gap from widening. **Add `max_english_only_literals` ratchet to the i18n lint gate to block regression while the backlog burns down.**

4. **`docs/90-work/audits/2026-05-13-testing-devx-roast.md`** (P1-1 contract fixtures) — Hard Rule #3 runtime drift is caught only at compile time for 7 of 9 endpoint families; contract-fixture pattern covers only `/api/me` + `/api/barcode`. **Add fixtures for `/food-search`, `/parse-pantry`, `/sync/v2`, `/finyk/cashflow`, `/nutrition/log`, `/routine/today`, `/fizruk/heatmap` (T29/T30).**

5. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md`** (Theme 4 lifecycle markers) — `lint:lifecycle-markers` CI gate remains advisory-only (`continue-on-error: true`); majority of `apps/web/src/**/*.{ts,tsx}` still have no `@status` / `Last validated` headers. **Flip gate to `error` for files touched per-PR and run bulk-add script to reduce backlog.**

---

## C — Unblock Chains

Shipping these removes blockers on downstream work.

1. **`docs/90-work/audits/2026-05-06-ux-roast-pr-plan.md`** — 21 of 41 PRs outstanding; PR-1a (App-lock PIN flow, `BiometricAdapter.ts` absent from `core/security/`) is P0 blocking ~11 downstream Sprint 1 items (PR-2 module settings, PR-3 module picker, PR-6 error boundary, PR-7 permissions, PR-8 form validation, PR-14 error-boundary analytics, PR-16 offline status, PR-22 session expiry, PR-42 changelog); PR-1b biometric add-on also open. **Start PR-1a App-lock PIN flow to unlock Sprint 1 queue before Sprint 9 planning (2026-07-07).**

2. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md`** (audit-04 gap) — Hub Settings, Profile & Assistant Catalogue was **never audited** (VM infra failure 2026-05-13); estimated 30–40 H/M findings — the largest single blind spot in the 10-scope coverage matrix. **Re-run page-audit-04 before Sprint 9 planning (2026-07-07) to close this gap.**

3. **`docs/90-work/audits/2026-05-13-consolidated-page-audit.md`** (page audits 07 + 08) — Fizruk Part 2 has 50 findings (6H + 25M + 19L); Nutrition has 25 (6H + 13M + 6L); H-severity items not individually triaged. Fizruk F3 (`Measurements.tsx` accepts `weightKg=99999` with no range guard) is the highest-value untracked H-severity item. **Triage H-severity findings in audit-07 and audit-08; prioritize Fizruk F3 range validation first.**

4. **`docs/90-work/audits/2026-06-08-codebase-cleanup-audit.md`** (`@removeBy 2026-09-01` tombstones) — legacy KV→SQLite tombstone references expire 2026-09-01; planning now avoids a September crunch. **Schedule tombstone batch pass; add to Sprint 9 backlog.**

---

## D — Blocked / Gated

No immediate agent action possible without external input or a gating milestone.

1. **`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`** + **`docs/90-work/audits/2026-08-XX-sync-engine-roast.md`** — both stubs are gated on the Q3 2026 backend-roast trigger window (2026-08-11); no full audit should be extracted before that date. Exception: A1 write-tool audit-row fix above can proceed independently.

2. **`docs/90-work/audits/2026-05-06-ux-roast-pr-plan.md`** PR-11 (CSV export) + PR-28 (Avatar upload) — explicitly paused pending S3/R2 storage credentials from founder; skeleton work can begin without the upload-storage half.

3. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (ws-02 / ws-01b / UptimeRobot) — ФОП registration (5–10 calendar-day lag), final pricing decision + ADR-0051 amend, `APPLE_*` env vars in Railway, UptimeRobot external uptime signal — all require founder action; no agent-executable path exists.

4. **`docs/90-work/audits/2026-05-13-testing-devx-roast.md`** — Mobile Detox suite (5 new specs: auth / nutrition / fizruk / deep-link / offline-sync; specs authored in #3363, awaiting simulator run) + mutation testing PR-required tier-1 floor — both deferred to Sprint 9 planning (2026-07-07).

5. **`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`** (SLO / alert stack) — Grafana Cloud alert rules exist as design-only artifacts; UptimeRobot wiring and decision on 24 Grafana design rules (keep vs delete) are founder-gated.

---

## Coverage notes

- **Audit-04 (Hub Settings / Profile / Assistant Catalogue):** never completed — active blind spot estimated at 30–40 H/M findings. Highest-priority coverage gap in the 10-scope matrix (see C2 above).
- **Individual page audit H/M findings (05 Finyk, 06 Fizruk Part 1, 07 Fizruk Part 2, 08 Nutrition, 09 Routine/Strategy):** items beyond closed themes 1–7 are not yet individually triaged; Fizruk Part 2 alone has 50 findings.
- **PRs #3688–#3721 (since 2026-06-22):** #3711 raises web coverage floor to 75% lines (closes the coverage-floor concern from testing-devx-roast and fable5 audit); #3717 closes react-hooks/use-memo baseline entry; HC AA + touch-target items continue to close. Per-finding reconciliation deferred to next full audit session.
- **react-hooks v7 baseline violations:** burn-down progressing via initiative 0021 (🟢 agent-ready, not-before Sprint 9 2026-07-07); use-memo entry closed #3717.
- **ESLint baselines without enforcement dates (react-hooks ~151+, non-null ~96):** no CI enforcement until count reaches zero.
- **Orphan billing schemas (m047/m070-072):** two-phase DROP candidates post-launch — not actionable until billing is live.
- **server-side `sync_op_log` retention (ADR-0065):** retention-job not implemented in `syncV2.ts`; design plan recorded but deferred to 2026-08-11 audit cycle per ADR cursor-safety invariant.

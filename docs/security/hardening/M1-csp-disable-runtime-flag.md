# M1 — `CSP_DISABLE=1` runtime fault-injection vector

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04) — see Resolution log.

| Field          | Value                                                  |
| -------------- | ------------------------------------------------------ |
| **Severity**   | Medium (CVSS 6.1, AV:N/AC:H/PR:H/UI:R/S:C/C:L/I:L/A:N) |
| **Sprint**     | [Sprint 2](./sprint-2.md)                              |
| **Owner**      | backend                                                |
| **Effort**     | 0.25 person-day                                        |
| **Status**     | **Closed** (2026-05-04)                                |
| **Discovered** | 2026-05-03 deep security review                        |

## Summary

`apps/server/src/http/security.ts` reads two environment variables at runtime:
`CSP_DISABLE=1` and `CSP_REPORT_ONLY=1`. Either flag completely changes the CSP
posture without a redeploy or a git commit. If a Railway env-var write
credential is ever leaked, an attacker can flip `CSP_DISABLE=1`, get a green
window for XSS exfiltration, and flip it back without leaving an audit trail.

## Affected files

- `apps/server/src/http/security.ts` — `process.env.CSP_DISABLE`,
  `process.env.CSP_REPORT_ONLY` branches.
- Railway dashboard env-vars (out of repo).

## Evidence

```ts
// apps/server/src/http/security.ts
if (process.env.CSP_DISABLE === "1") {
  // skip CSP entirely
} else if (process.env.CSP_REPORT_ONLY === "1") {
  // Content-Security-Policy-Report-Only
} else {
  // Content-Security-Policy
}
```

## Impact

1. **Audit trail gap.** Env-var changes in Railway are not recorded in the
   project git log; flipping `CSP_DISABLE` leaves no PR to review.
2. **Post-leak amplification.** A credential leak (Railway token, founder
   account password reuse) becomes a CSP-bypass primitive.
3. **CSP rollout interaction.** [C2](./C2-frontend-csp.md) ships a CSP-Report-Only
   header — the `CSP_DISABLE` flag is wider than `Report-Only` and therefore
   overrides everything C2 puts in place.

## Recommendation

- Delete `CSP_DISABLE`. Keep `CSP_REPORT_ONLY` only as a temporary toggle
  during the C2 rollout window (delete it after Sprint 3 once production CSP
  has been enforced for two weeks without false-positives).
- Disabling CSP in an emergency must require **a code change + redeploy** —
  this enforces a git audit trail and a four-eyes review.
- Document the change in `docs/security/access-policy.md` so operators know
  why the runtime flag is gone.

## Correction points

- `apps/server/src/http/security.ts` — remove the `CSP_DISABLE` branch:

```ts
const reportOnly = process.env.CSP_REPORT_ONLY === "1";
const headerName = reportOnly
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";
res.setHeader(headerName, cspString);
```

- `apps/server/src/http/security.test.ts` — add a regression test that
  asserts the CSP header is always set regardless of `CSP_DISABLE` presence.
- `docs/security/access-policy.md` — note "no runtime CSP kill switch".
- Railway dashboard — remove `CSP_DISABLE` from production / staging projects
  (record removal in `docs/security/secret-ownership-register.md`).

## Verification

- **Unit:** with `CSP_DISABLE=1` set in the test env, the response still
  includes `Content-Security-Policy` (`Report-Only` if the other flag is set).
- **Smoke:** in staging after deploy,
  `curl -sI https://api.../api/health | grep -i content-security-policy`
  returns the expected value.
- **Audit trail:** `grep -r CSP_DISABLE` in the codebase returns no matches.

## Cross-references

- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)
- [`./M3-pino-redact-paths.md`](./M3-pino-redact-paths.md)
- [`../secret-ownership-register.md`](../secret-ownership-register.md)
- [`../access-policy.md`](../access-policy.md) — `Runtime security knobs`

## Resolution log

### 2026-05-04 — closed

`CSP_DISABLE` runtime kill-switch видалено з кодової бази:

- `apps/server/src/http/security.ts` — гілка `process.env.CSP_DISABLE === "1"` повністю прибрана разом із boot-логом `csp_disabled`. CSP тепер вимикається лише прапорцем `servesFrontend: true` (Replit-режим, де SPA вимагає `script-src` без `'none'`). Залишився тільки `CSP_REPORT_ONLY=1` як phased-rollout-toggle (header переходить у `Content-Security-Policy-Report-Only`, не блокуючи запит).
- `apps/server/src/env/env.ts` — `CSP_DISABLE` Zod-entry прибрано з `EnvSchema`. Залишено M1-нотатку, чому його нема й куди йти за швидкою деградацією.
- `.env.example` — приклад env-var-у `CSP_DISABLE` прибрано; залишено пояснення про відсутність kill-switch.
- `docs/security/access-policy.md` — додано секцію `Runtime security knobs`, що формалізує "no runtime CSP kill switch" + загальний принцип щодо feature flags та audit trail.

**Tests** (`apps/server/src/http/security.test.ts` — нова `M1 — CSP_DISABLE runtime flag removal` describe-група, 4 кейси):

1. `CSP_DISABLE=1` НЕ вимикає CSP (header `Content-Security-Policy` все одно виставлений з `default-src 'none'`).
2. `CSP_DISABLE=true` (legacy truthy) НЕ вимикає CSP — захист від випадкового повернення kill-switch для будь-якого truthy-значення.
3. `CSP_REPORT_ONLY=1` → header стає `Content-Security-Policy-Report-Only` (phased-rollout працює).
4. `CSP_DISABLE=1 + CSP_REPORT_ONLY=1` → CSP активна у Report-Only-режимі (kill-switch повністю проігноровано).

**Audit trail check** (вимога з картки):

```bash
grep -r CSP_DISABLE apps/server/src/
# → no matches in code; only mentions у /docs/security/hardening/* (історичний контекст)
```

**Не зроблено в цьому PR (Railway-config drift, відносять до операційного boundary):**

- Видалити `CSP_DISABLE` з production / staging Railway env-vars (зараз read-only, але краще зачистити).
- Записати видалення у `docs/security/secret-ownership-register.md`.
  Обидва — наступний крок для @Skords-01 (≤ 5 хв роботи в Railway dashboard).

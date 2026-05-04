# M1 — `CSP_DISABLE=1` runtime fault-injection vector

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                                                  |
| -------------- | ------------------------------------------------------ |
| **Severity**   | Medium (CVSS 6.1, AV:N/AC:H/PR:H/UI:R/S:C/C:L/I:L/A:N) |
| **Sprint**     | [Sprint 2](./sprint-2.md)                              |
| **Owner**      | backend                                                |
| **Effort**     | 0.25 person-day                                        |
| **Status**     | Open                                                   |
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

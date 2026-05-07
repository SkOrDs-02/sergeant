# PR-26: CSP `report-uri` / `report-to` endpoint

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                                  |
| ------------------ | -------------------------------------------------------------------------------- |
| **Severity**       | Medium (M11)                                                                     |
| **Linked finding** | M11 (`00-overview.md`)                                                           |
| **Owner**          | TBD (sponsor: @Skords-01)                                                        |
| **Effort**         | 0.5–1 день                                                                       |
| **Risk**           | Low (additive — додаємо reporting; реальна CSP policy не міняється)              |
| **Touches**        | `apps/web/index.html`, `apps/web/vercel.json`, `apps/server/src/routes/csp-report.ts` |
| **Trigger**        | next CSP-violation incident у production (зараз — silent unless dev-tools open)  |

## Контекст

`apps/web/vercel.json` визначає CSP header без `report-uri` / `report-to`. Існуючий код:

- `apps/server/src/modules/observability/csp-report.ts` — handler **існує**.
- `apps/server/src/routes/csp-report.ts` — route **існує**.
- `apps/web/src/test/cspMonitoringAllowlist.test.ts` — тест **існує**.

Але CSP-header у production **не** вказує endpoint, куди репортити. Тобто infra готова, але directive відсутній.

Поточний state: CSP violations лишають невидимими, аж доки користувач не відкриє DevTools.

## Scope

### 1. CSP header додає reporting

`apps/web/vercel.json` (або `apps/web/middleware.ts`):

```json
{
  "headers": [{
    "source": "/:path*",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "default-src 'self'; ...; report-uri /api/csp-report; report-to csp-endpoint"
    }, {
      "key": "Reporting-Endpoints",
      "value": "csp-endpoint=\"https://sergeant.vercel.app/api/csp-report\""
    }]
  }]
}
```

`Report-To` header (deprecated але поки browsers підтримують) — можна додати legacy variant.

### 2. Server endpoint hardening

`apps/server/src/routes/csp-report.ts` — переконатися:

- Rate-limit (поточний `auth-rate-limit` не підходить — окремий liberal limit, e.g., 1k/min IP).
- Body-size policy: max 16KB per report.
- Sentry forwarding + structured log.
- Sanitize PII у report (URL paths можуть містити tokens).

### 3. Monitoring

`docs/observability/csp-monitoring.md`:

- Dashboard: violations grouped by `violated-directive`.
- Alert: spike (>10× baseline) → Sentry / Slack.
- Allowlist sync — поточний `cspMonitoringAllowlist.test.ts` зберігає known-good violations (third-party widgets, etc.).

### 4. Documentation update

`docs/security/hardening/M1-csp-disable-runtime-flag.md` — оновлений context: «Reports тепер shipping; runtime-disable lишається guarded».

## Out of scope

- CSP nonce-generation для inline scripts — окремий ADR (це Strict CSP).
- `Report-To` v2 (Reporting-Endpoints header) full migration — partial у scope, full — backlog.

## Acceptance criteria (DoD)

- [ ] `apps/web/vercel.json` (або `middleware.ts`) додає `report-uri` + `Reporting-Endpoints`.
- [ ] `apps/server/src/routes/csp-report.ts` має rate-limit + 16KB body cap.
- [ ] CSP report при load-і `/dummy-violation-page.html` (E2E test) → endpoint receives + Sentry breadcrumb.
- [ ] `docs/observability/csp-monitoring.md` з alert YAML + dashboard reference.
- [ ] `apps/web/src/test/cspMonitoringAllowlist.test.ts` updated з actual baseline.

## Тести

- `apps/server/src/modules/observability/csp-report.test.ts` — already exists, додати rate-limit case.
- E2E: web-test з intentional CSP-violation → endpoint receives report (через mock-server у тесті).

## Rollout

- Single PR. Reporting не блокує існуючий traffic.

## Risks & mitigations

| Risk                                                                  | Mitigation                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Reports flood (наприклад, browser extension violations)               | Rate-limit + Sentry sampling 10% на known-good directives        |
| Report endpoint exposes XSS via reflected URL у dashboard              | DOM-sanitize у dashboard (не сирий innerHTML); Sentry escapes by default |
| `Report-To` deprecated в Chrome 130+                                  | Use `Reporting-Endpoints` (новий header); fallback на report-uri |

## Touchpoints (file:line)

- `apps/web/vercel.json` — CSP headers
- `apps/web/middleware.ts` — додати fallback `Report-To` якщо відсутній у vercel.json
- `apps/web/index.html` — meta-CSP fallback
- `apps/server/src/routes/csp-report.ts` — existing handler
- `apps/server/src/modules/observability/csp-report.ts` — існуючий handler
- `apps/web/src/test/cspMonitoringAllowlist.test.ts` — баseline
- `docs/observability/csp-monitoring.md` — new
- `docs/security/hardening/M1-csp-disable-runtime-flag.md` — update context

## Refs

- [MDN: CSP `report-to`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/report-to)
- [Reporting API spec](https://www.w3.org/TR/reporting-1/)
- `docs/security/hardening/L11-csp-monitoring-allowlist.md`

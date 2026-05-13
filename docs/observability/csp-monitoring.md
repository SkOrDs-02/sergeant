# CSP monitoring

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Операційний playbook для моніторингу Content-Security-Policy
звітів. Закриває останній відкритий пункт DoD у
[`docs/initiatives/stack-pulse-2026-05/pr-26-csp-report-uri.md`](../initiatives/stack-pulse-2026-05/pr-26-csp-report-uri.md).

## Architecture

```text
Browser violation
    │
    ├── report-uri (legacy)        ─┐
    │     Content-Type:             │
    │     application/csp-report    │
    │                               ├──► POST /api/csp-report
    └── report-to (modern Reporting │       (rate-limit 120/min IP,
          API, Reporting-Endpoints) │        body ≤ 16 KB)
          Content-Type:             │           │
          application/reports+json ─┘           ▼
                                       cspViolationTotal Counter
                                       (`directive`, `disposition`)
                                                │
                                                ▼
                                       Grafana / Sentry breadcrumb
                                       (5% sample log)
```

### Shipping path

| Layer            | File                                                                                                               | Purpose                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Response headers | [`apps/web/vercel.json`](../../apps/web/vercel.json)                                                               | `Reporting-Endpoints` + CSP-RO with `report-uri` and `report-to`    |
| Meta fallback    | [`apps/web/index.html`](../../apps/web/index.html)                                                                 | `<meta>` CSP without `report-uri`/`report-to` (HTML spec exclusion) |
| Body parser      | [`apps/server/src/http/bodySizePolicy.ts`](../../apps/server/src/http/bodySizePolicy.ts)                           | 16 KB cap for both legacy and Reporting API content types           |
| Rate-limit       | [`apps/server/src/routes/csp-report.ts`](../../apps/server/src/routes/csp-report.ts)                               | 120 req/min per IP (`api:csp-report` bucket)                        |
| Handler          | [`apps/server/src/modules/observability/csp-report.ts`](../../apps/server/src/modules/observability/csp-report.ts) | Parses both wire formats, increments counter, sample-logs           |
| Parity test      | [`apps/web/src/test/cspMonitoringAllowlist.test.ts`](../../apps/web/src/test/cspMonitoringAllowlist.test.ts)       | Guards Vercel ↔ meta CSP drift                                      |

## Wire formats

Both shipping paths terminate at the same handler. Browsers pick which
one to use based on platform support:

### Legacy `report-uri`

```http
POST /api/csp-report HTTP/1.1
Content-Type: application/csp-report

{
  "csp-report": {
    "violated-directive": "script-src 'self'",
    "effective-directive": "script-src",
    "disposition": "report",
    "blocked-uri": "https://evil.example/x.js"
  }
}
```

### Modern `Reporting-Endpoints` + `report-to`

```http
POST /api/csp-report HTTP/1.1
Content-Type: application/reports+json

[
  {
    "type": "csp-violation",
    "body": {
      "effectiveDirective": "script-src",
      "disposition": "report",
      "blockedURL": "https://evil.example/x.js"
    }
  }
]
```

`report-to csp-endpoint` resolves through the `Reporting-Endpoints:
csp-endpoint="https://api.sergeant.app/api/csp-report"` header set in
`apps/web/vercel.json`. Chrome ≥96 and Firefox ≥118 prefer this path;
older Safari falls back to `report-uri`. Both ship in parallel so we
never lose violations during the browser transition window.

## Metric

`csp_violation_total{directive, disposition}` — Prometheus counter,
exposed by `apps/server/src/obs/metrics.ts` via `/metrics`.

| Label         | Domain                                             | Cardinality notes                                                             |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `directive`   | `script-src`, `connect-src`, …, `other`, `unknown` | Bounded — unknown directives collapse to `other` so noise can't inflate count |
| `disposition` | `report`, `enforce`, `unknown`                     | Bounded; `unknown` = browser sent missing/malformed field                     |

Always responds `204 No Content` regardless of payload validity
(browsers ignore response body; a noisy 4xx would feed retry
telemetry).

## Dashboard

Grafana panel queries (canonical name: **CSP violations**):

```promql
# Rate of violations by directive (last 5 min)
sum by (directive) (rate(csp_violation_total[5m]))

# Hourly breakdown of enforce vs report mode
sum by (disposition) (increase(csp_violation_total[1h]))

# Top 5 noisiest directives over 24 h
topk(5, sum by (directive) (increase(csp_violation_total[24h])))
```

`directive="other"` rising independently of known directives is the
early-warning signal that we shipped a directive we don't classify in
the [`KNOWN_DIRECTIVES`](../../apps/server/src/modules/observability/csp-report.ts) set — add it
to the set rather than letting the cardinality leak.

## Alerts

Two Alertmanager rules (suggested thresholds — tune after one full
baseline week of traffic on the new modern Reporting API path):

```yaml
groups:
  - name: csp
    rules:
      - alert: CspViolationSpike
        expr: |
          sum by (directive) (rate(csp_violation_total[5m]))
            > 10 * sum by (directive) (rate(csp_violation_total[1h] offset 1h))
        for: 10m
        labels:
          severity: warning
          owner: frontend
        annotations:
          summary: "CSP violations spiking 10× baseline on {{ $labels.directive }}"
          runbook: "https://github.com/Skords-01/Sergeant/blob/main/docs/observability/csp-monitoring.md#response"

      - alert: CspEnforceViolations
        expr: |
          sum by (directive) (rate(csp_violation_total{disposition="enforce"}[5m])) > 0
        for: 5m
        labels:
          severity: critical
          owner: frontend
        annotations:
          summary: "CSP enforce-mode violations on {{ $labels.directive }} — real user impact"
          runbook: "https://github.com/Skords-01/Sergeant/blob/main/docs/observability/csp-monitoring.md#response"
```

`CspEnforceViolations` only matters once the policy moves from
`Content-Security-Policy-Report-Only` to `Content-Security-Policy`
(Phase 2 of [C2 hardening](../security/hardening/C2-frontend-csp.md)).
Until then, the rule should be `0`.

## Allowlist (Sentry + PostHog)

Vendor hosts allowed in the policy live in
[`apps/web/src/test/cspMonitoringAllowlist.test.ts`](../../apps/web/src/test/cspMonitoringAllowlist.test.ts).
The same test guards parity between the Vercel response header and the
`<meta>` fallback in `apps/web/index.html` (modulo HTML-spec
exclusions: `report-uri`, `report-to`, `frame-ancestors`, `sandbox`).

To add a new vendor host:

1. Update the directive in `apps/web/vercel.json`.
2. Mirror the same source list into the `<meta>` tag in
   `apps/web/index.html`. Skip directives in the HTML-spec exclusion
   set — meta does not honour them.
3. Add the host to `REQUIRED_CONNECT_SRC` / `REQUIRED_SCRIPT_SRC` in
   the allowlist test.
4. Run `pnpm --filter @sergeant/web test cspMonitoringAllowlist`.

## Response

When an alert fires:

1. **Pull the directive label** from the page. Run
   `sum by (blocked_host) (increase(csp_violation_total{directive="<x>"}[1h]))`
   if a `blocked_host` panel is wired (currently only `directive` is
   labelled — the 5% sample log is the source of `blocked-uri`).
2. **Check 5% sample logs** in Loki / Railway:
   `pino.fields.event="csp-violation"`. The handler logs
   `{ directive, disposition, blocked-uri }` for one in twenty
   reports.
3. **Diff against the last deploy.** A spike right after a release
   usually points to a third-party SDK upgrade (PostHog, Sentry) that
   added a new domain.
4. **If legitimate**, widen the allowlist via the steps above.
5. **If suspicious** (unknown host, unfamiliar script source), escalate
   to security on-call and treat as a potential XSS exfiltration
   attempt. Reference
   [`docs/security/hardening/C2-frontend-csp.md`](../security/hardening/C2-frontend-csp.md)
   for the threat model.

## Out-of-scope

- **Nonce flow for inline scripts** — separate ADR (Strict CSP, Phase 3
  of C2 hardening).
- **CSP enforce-mode rollout** — Phase 2 of C2 hardening, gated on a
  full baseline week of Report-Only metrics.
- **Per-route CSP** — current design is one wildcard policy across the
  whole app. Module-scoped CSP is backlog.

## Refs

- [MDN: Reporting API](https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API)
- [MDN: CSP `report-to`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/report-to)
- [W3C: Reporting API spec](https://www.w3.org/TR/reporting/)
- [C2 hardening card](../security/hardening/C2-frontend-csp.md)
- [PR-26 initiative](../initiatives/stack-pulse-2026-05/pr-26-csp-report-uri.md)

# Sprint 4 — Low severity sweep and structural hardening

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Planned

Sprint 4 closes the **Low-severity sweep** (L1–L14 — paper cuts, defence in
depth, hygiene) and lands the **structural hardening track** (I3–I8 — SBOM,
`security.txt`, pre-commit secret detection, threat model, security-event
pipeline, periodic external pentest).

These items are individually small but collectively raise the project's
posture from "secure for an MVP" to "auditable for a paid product".

## Scope

| ID                                         | Title                                                | Severity | Owner    | Effort                                                                                                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [L1](./L1-uuid-override.md)                | `package.json` overrides — confirm `uuid` resolves   | Low      | platform | 0.1 d                                                                                                                                                                                                                                     |
| [L2](./L2-permissions-policy-broader.md)   | Permissions-Policy could disable more APIs           | Low      | frontend | 0.1 d                                                                                                                                                                                                                                     |
| [L3](./L3-meta-referrer.md)                | `index.html` missing `<meta name="referrer">`        | Low      | frontend | 0.1 d _(closed 2026-05-05 — batched L3 + L7 + L11 hardening PR; defense-in-depth meta tag mirrors Vercel `Referrer-Policy` for file:// / Vite-preview / proxy contexts)_                                                                  |
| [L4](./L4-html-lang-attribute.md)          | `<html lang>` attribute audit                        | Low      | frontend | 0.1 d _(closed 2026-05-05 — batched L4 + L5 + L6 + M21 hardening PR; new `apps/web/src/test/indexHtmlLang.test.ts` locks `<html lang="uk">` on the static index.html opening tag)_                                                        |
| [L5](./L5-dns-prefetch-control.md)         | Confirm `X-DNS-Prefetch-Control: off`                | Low      | backend  | 0.1 d _(closed 2026-05-05 — batched L4 + L5 + L6 + M21 hardening PR; new `L5 + L6 — explicit response-header defaults` describe-group in `apps/server/src/http/security.test.ts` with `captureHeaders` helper)_                           |
| [L6](./L6-no-sniff-explicit.md)            | Confirm `X-Content-Type-Options: nosniff`            | Low      | backend  | 0.1 d _(closed 2026-05-05 — batched L4 + L5 + L6 + M21 hardening PR; same `L5 + L6` regression group in `apps/server/src/http/security.test.ts`)_                                                                                         |
| [L7](./L7-health-endpoint-info-leak.md)    | Health endpoint info-leak audit                      | Low      | backend  | 0.25 d _(closed 2026-05-05 — batched L3 + L7 + L11 hardening PR; new regression test `apps/server/src/routes/health.infoleak.test.ts` locks probe payloads ≤ 32 bytes and `/healthz` body free of `commit`/`sha`/`version`/`build` keys)_ |
| [L8](./L8-openclaw-repo-root-traversal.md) | OpenClaw `OPENCLAW_REPO_ROOT` path-traversal guard   | Low      | console  | 0.25 d _(closed 2026-05-05 — batched M17 + L8 + L10 hardening PR; `apps/server/src/modules/openclaw/safeJoin.ts` + `readStrategyDoc` traversal-as-allowlist mapping)_                                                                     |
| [L9](./L9-sentry-release-sha.md)           | Sentry `release` not SHA-pinned                      | Low      | platform | 0.1 d _(closed 2026-05-04)_                                                                                                                                                                                                               |
| [L10](./L10-user-id-hash-in-logs.md)       | `recordSync*` logs raw `userId` instead of hash      | Low      | backend  | 0.25 d                                                                                                                                                                                                                                    |
| [L11](./L11-csp-monitoring-allowlist.md)   | CSP must allowlist Sentry / PostHog `connect-src`    | Low      | frontend | 0.25 d _(closed 2026-05-05 — batched L3 + L7 + L11 hardening PR; `apps/web/src/test/cspMonitoringAllowlist.test.ts` asserts vercel.json + index.html parity, required Sentry/PostHog hosts present, no bare wildcards in `connect-src`)_  |
| [L12](./L12-ios-app-transport-security.md) | iOS `NSAppTransportSecurity` audit                   | Low      | mobile   | 0.1 d                                                                                                                                                                                                                                     |
| [L13](./L13-docker-platform-pin.md)        | `Dockerfile.api` platform pin in CI                  | Low      | platform | 0.25 d                                                                                                                                                                                                                                    |
| [L14](./L14-pnpm-frozen-lockfile-dev.md)   | `pnpm install --frozen-lockfile` in dev workflow     | Low      | platform | 0.1 d                                                                                                                                                                                                                                     |
| [I3](./I3-sbom-generation.md)              | Generate SBOM during container build                 | Info     | platform | 0.5 d                                                                                                                                                                                                                                     |
| [I4](./I4-security-txt.md)                 | `/.well-known/security.txt` content + expiry refresh | Info     | platform | 0.1 d _(closed 2026-05-04)_                                                                                                                                                                                                               |
| [I5](./I5-pre-commit-secret-detection.md)  | Pre-commit hooks for secret detection                | Info     | platform | 0.25 d                                                                                                                                                                                                                                    |
| [I6](./I6-threat-model.md)                 | Document the STRIDE threat model per module          | Info     | platform | 1 d                                                                                                                                                                                                                                       |
| [I7](./I7-security-events-openclaw.md)     | Push security events to OpenClaw                     | Info     | backend  | 1 d                                                                                                                                                                                                                                       |
| [I8](./I8-periodic-external-pentest.md)    | Schedule a periodic external pentest                 | Info     | founder  | —                                                                                                                                                                                                                                         |

**Total effort:** ≈ 4.5 person-days (excluding I8 which is calendar-bound).

## Rationale

- **L1–L6, L9, L13, L14** are CI / lint / config audits that can be batched
  into a single "hygiene PR" with no functional impact.
- **L7, L8, L10, L11, L12** are surface-specific paper cuts grouped by area.
- **I3, I4, I5** raise compliance posture (SBOM, security.txt, secret
  detection at `git push` boundary).
- **I6 — threat model** is the largest documentation deliverable; it
  benefits from the prior 53 cards as input.
- **I7 — security-events to OpenClaw** turns the metrics added in earlier
  sprints (`mono_webhook_bad_payload`, `auth.session.ua_drift`,
  `prompt_injection_attempt`) into actionable signals for the founder.
- **I8 — external pentest** is a calendar item, not a code change, so it
  sits at the bottom and gets scheduled rather than implemented.

## Success metrics

- All 14 Low cards move to **Closed** within one sprint cycle (paper cuts
  do not justify cross-sprint drift).
- I3–I7 land as enabled features with at least one verification artefact
  each (SBOM file in container manifest, security.txt response in
  production, pre-commit hook installed in `package.json`,
  `docs/security/threat-model.md` published, OpenClaw security topic with
  at least one synthetic event delivered).

## Cross-references

- [`./README.md`](./README.md) — full backlog index.
- [`./sprint-3.md`](./sprint-3.md) — preceding sprint.
- [`../vulnerability-sla.md`](../vulnerability-sla.md) — Low SLA = 90 days.
- [`../audit-exceptions.md`](../audit-exceptions.md) — exception ledger.

# STRIDE threat model

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** Active

This is the canonical one-page threat map for Sergeant. The detailed finding
cards live in [`docs/security/hardening/`](./hardening/README.md); this document
groups the main surfaces by STRIDE category so reviewers can see what each
control is protecting.

## Scope

| Surface                              | Trust boundary                             | Primary assets                                         |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| Web PWA (`apps/web`)                 | Browser, Vercel, Railway API               | session state, local-first data, analytics events      |
| API (`apps/server`)                  | Public internet to Express + Better Auth   | user data, quotas, provider tokens, push tokens        |
| Mobile shell / Expo (`apps/mobile*`) | Device storage and native bridges          | bearer/session tokens, push tokens, local module data  |
| Console / OpenClaw (`tools/console`) | Telegram chat to privileged repo/ops tools | GitHub operations, n8n controls, cost-bearing AI calls |
| n8n workflows (`ops/n8n-workflows`)  | Webhooks and scheduled automation          | Mono events, deploy alerts, Telegram notifications     |
| Data stores                          | PostgreSQL, Redis, SQLite/MMKV             | module records, sync state, queues, encrypted secrets  |

## STRIDE Map

| Surface             | S      | T      | R      | I      | D      | E      | Main controls / refs                                                                                        |
| ------------------- | ------ | ------ | ------ | ------ | ------ | ------ | ----------------------------------------------------------------------------------------------------------- |
| Web PWA             | Medium | Medium | Low    | High   | Medium | Medium | CSP/COOP/COEP in [`docs/deploy/vercel.md`](../deploy/vercel.md), RQ key factories, local storage discipline |
| API                 | High   | High   | Medium | High   | High   | High   | Better Auth, per-route authz, rate limits, fail-closed quota plan, serializers, migration rules             |
| Mobile shell / Expo | High   | Medium | Low    | High   | Medium | Medium | Keychain/SecureStore posture, deep-link sanitization, native push token registration                        |
| Console / OpenClaw  | High   | High   | High   | Medium | High   | High   | Telegram allowlist fail-closed, approval gates, write-audit ADRs, per-call/daily AI caps                    |
| n8n workflows       | Medium | High   | Medium | Medium | Medium | Medium | Git source of truth, manifest validation, webhook secret rotation, deploy filtering                         |
| Data stores         | Medium | High   | Medium | High   | High   | High   | DB migrations policy, token encryption, backup/restore runbooks, RPO/RTO targets                            |

Legend: `S` spoofing, `T` tampering, `R` repudiation, `I` information
disclosure, `D` denial of service, `E` elevation of privilege.

## Highest-Risk Paths

1. **Public API auth and quota boundary.** Spoofing/elevation risk is highest
   where public requests become authenticated actions or cost-bearing AI calls.
   Controls: Better Auth session model, fail-closed rate-limit posture,
   AI quota circuit-breaker plan, and serializer tests.
2. **OpenClaw write tools.** A Telegram command can become a GitHub/n8n/Sentry
   action. Controls: allowlist, approval gates, append-only write audit, and
   per-call cost cap.
3. **Token and secret handling.** Mono, APNs/FCM, Anthropic, Voyage, Telegram,
   Vercel, and Railway secrets cross several operators and platforms. Controls:
   [`secret-ownership-register.md`](./secret-ownership-register.md),
   [`pii-handling.md`](./pii-handling.md), and rotation playbooks.
4. **Cross-origin browser isolation.** The PWA depends on strict COOP/COEP for
   SQLite-WASM performance. Controls: the Vercel compatibility matrix and
   audit-exception process before adding Stripe/OAuth iframes.
5. **Data recovery.** A destructive migration or unavailable Railway database
   can become customer data loss. Controls: forward-only migrations,
   two-phase DROP, backup/restore runbooks, and DR drills.

## Review Ritual

Every new security hardening card should link to one STRIDE row above. When a
new module or provider is added, update the surface table and mark whether the
dominant new risk is spoofing, tampering, repudiation, information disclosure,
denial of service, or elevation of privilege.

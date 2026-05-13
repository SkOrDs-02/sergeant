---
lang: en
---

# Playbook: Operational continuity

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active
> **Context:** Stack-pulse PR-04 bus-factor fix. This document answers: «що робити, якщо @Skords-01 недоступний тиждень / місяць / 6 місяців?»
>
> **Language note:** Intentionally English (`lang: en` frontmatter, opted out of the cyrillic-ratio gate via `scripts/check-playbook-language.mjs`). The audience is a future engineer or contractor who picks the project up cold during a bus-factor event and may not be Ukrainian-speaking; keeping it in English is part of the operational-continuity goal.

**Trigger:** @Skords-01 is unavailable (vacation, illness, emergency). You need to keep Sergeant running.

## Owner surface

- Primary surface: deploy infrastructure (Railway / Vercel / 1Password vaults), `tools/openclaw`, `apps/server`
- Coupled surface: every product surface, since this playbook is the fallback when no other owner is around
- Governing skill: `sergeant-start-here`

## Verification

- [ ] All systems in the «External systems & credential owners» table are reachable (Railway dashboard, Vercel dashboard, Sentry, PostHog).
- [ ] 1Password vault `Sergeant / Railway` opens and decrypts; same for the per-vendor sub-vaults referenced below.
- [ ] `pnpm db:migrate` runs against the production Postgres without prompting for credentials (Railway env injects `DATABASE_URL`).
- [ ] Each kill-switch in the «Kill-switches (emergency)» table can be activated from the Railway env panel without redeploy.
- [ ] Related runbooks (`docs/runbooks/operations-runbook.md`, `docs/security/disaster-recovery.md`, `docs/observability/runbook.md`) are reachable and their referenced tools are installed locally.

---

## External systems & credential owners

| System           | Purpose                   | Where credentials live                 | Primary contact |
| ---------------- | ------------------------- | -------------------------------------- | --------------- |
| **Railway**      | Server + Postgres hosting | 1Password vault `Sergeant / Railway`   | @Skords-01      |
| **Vercel**       | Web app deployment        | 1Password vault `Sergeant / Vercel`    | @Skords-01      |
| **Anthropic**    | Claude API (AI features)  | 1Password vault `Sergeant / Anthropic` | @Skords-01      |
| **Voyage AI**    | Embeddings (RAG)          | 1Password vault `Sergeant / Voyage`    | @Skords-01      |
| **Sentry**       | Error tracking            | 1Password vault `Sergeant / Sentry`    | @Skords-01      |
| **PostHog**      | Analytics                 | 1Password vault `Sergeant / PostHog`   | @Skords-01      |
| **Resend**       | Transactional email       | 1Password vault `Sergeant / Resend`    | @Skords-01      |
| **Monobank**     | Webhook source (finyk)    | 1Password vault `Sergeant / Monobank`  | @Skords-01      |
| **n8n**          | Automation workflows      | Railway deploy (same instance)         | @Skords-01      |
| **Apple APNs**   | iOS push (routine)        | 1Password vault `Sergeant / APNs`      | @Skords-01      |
| **Firebase FCM** | Android push (routine)    | 1Password vault `Sergeant / Firebase`  | @Skords-01      |
| **GitHub**       | Source + CI               | OpenClaw GitHub App credentials        | @Skords-01      |

> **Access escalation:** If you cannot get 1Password access, contact @Skords-01 directly. No credential is stored in the repository.

---

## What breaks first (absence timeline)

| Duration      | What breaks                                                 | Action                                                                             |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **< 1 week**  | Nothing critical. CI runs, deployments work.                | Monitor Sentry / Railway alerts.                                                   |
| **1–2 weeks** | Monobank webhook token may expire (30-day validity).        | Renew via Monobank developer portal using credentials in 1Password.                |
| **1 month**   | DNS / domain renewal reminder appears.                      | Check `sergeant.app` domain registrar (credentials in 1Password). Railway invoice. |
| **3 months**  | APNs key rotation may be needed (annual but good to check). | Re-generate APNs key in Apple Developer Portal; update Railway env var `APNS_KEY`. |
| **6 months**  | Renovate PRs accumulate. Security advisories may stack up.  | Merge Renovate PRs in order (check CI passes). Review `pnpm audit`.                |

---

## Daily operations (when @Skords-01 is out)

1. **Monitor alerts** — Sentry (error spikes), Railway (deploy failures), PostHog (DAU drop).
2. **n8n workflows** — WF-15 Telegram deploys, WF-98 alerts are automated. If they stop: check Railway n8n instance is running.
3. **Hotfix flow** — see `docs/runbooks/operations-runbook.md` § Hotfix flow.
4. **CI failures** — check `.github/workflows/ci.yml`. Most common: pnpm audit advisory → add `audit-exception` label or bump dep.

---

## Escalation contacts

| Role                | Contact                                                 | Scope                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary owner       | @Skords-01                                              | All                                                                                                                                                                                                                                                                  |
| Secondary (TBD)     | Hire when team grows                                    | Per-module — see [AGENTS.md § Module ownership map](../../AGENTS.md#module-ownership-map) `Secondary` column for placeholder roles (`frontend-engineer`, `backend-engineer`, `mobile-engineer`, `data-engineer`, `any-engineer`); enforced by `pnpm lint:codeowners` |
| Monobank API issues | [developers.monobank.ua](https://api.monobank.ua/docs/) | finyk webhooks                                                                                                                                                                                                                                                       |
| Railway support     | [railway.app/help](https://railway.app/help)            | Infra outages                                                                                                                                                                                                                                                        |
| Anthropic support   | [support.anthropic.com](https://support.anthropic.com)  | API quota issues                                                                                                                                                                                                                                                     |

---

## Kill-switches (emergency)

| Switch                    | How to activate                                                                  | Effect                                    |
| ------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| Disable AI features       | Set `AI_QUOTA_DISABLED=1` in Railway env (dev/test only — blocked in production) | All AI quota checks bypass                |
| Disable AI quota DB check | Set `AI_QUOTA_CIRCUIT_THRESHOLD=0`                                               | Circuit breaker disabled, quota fail-open |
| Disable Monobank webhook  | Remove Railway env `MONOBANK_WEBHOOK_SECRET`                                     | Webhooks return 401                       |
| Rollback deploy           | Railway dashboard → previous deployment → "Rollback"                             | Instant rollback                          |

> **Warning:** `AI_QUOTA_DISABLED=1` is hard-blocked in production (throws on startup). Use only in dev/staging.

---

## Related runbooks

- `docs/runbooks/operations-runbook.md` — full operations guide
- `docs/security/disaster-recovery.md` — DR scenarios (Postgres restore, bad migration, etc.)
- `docs/observability/runbook.md` — metrics + alerting runbook

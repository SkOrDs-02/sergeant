---
lang: en
---

# Playbook: Operational continuity

> **Last touched:** 2026-07-21 by @github-actions[bot]. **Next review:** 2026-10-19.
> **Status:** Active
> **Context:** Stack-pulse PR-04 bus-factor fix. This document answers: «що робити, якщо @Skords-01 недоступний тиждень / місяць / 6 місяців?»
>
> **Language note:** Intentionally English (`lang: en` frontmatter, opted out of the cyrillic-ratio gate via `scripts/check-playbook-language.mjs`). The audience is a future engineer or contractor who picks the project up cold during a bus-factor event and may not be Ukrainian-speaking; keeping it in English is part of the operational-continuity goal.

**Trigger:** @Skords-01 is unavailable (vacation, illness, emergency). You need to keep Sergeant running.

## Owner surface

- Primary surface: deploy infrastructure (Hetzner VPS + Coolify / Vercel / 1Password vaults), `apps/server`
- Coupled surface: every product surface, since this playbook is the fallback when no other owner is around
- Governing skill: `sergeant-start-here`

## Verification

- [ ] All systems in the «External systems & credential owners» table are reachable (Coolify dashboard, Vercel dashboard, Sentry, PostHog).
- [ ] 1Password vault `Sergeant / Hetzner` (SSH key + Coolify admin) opens and decrypts; same for the per-vendor sub-vaults referenced below.
- [ ] `pnpm db:migrate` runs against the production Postgres without prompting for credentials (Coolify injects `DATABASE_URL`; pre-deploy runs `node dist-server/migrate.js`).
- [ ] Each kill-switch in the «Kill-switches (emergency)» table can be activated from the Coolify app → Environment Variables panel and applied with a redeploy.
- [ ] Related runbooks (`docs/03-operations/runbooks/operations-runbook.md`, `docs/04-governance/security/disaster-recovery.md`, `docs/03-operations/observability/runbook.md`) are reachable and their referenced tools are installed locally.

> Hosting topology + rationale: [ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md) (backend on Hetzner CX23 + Coolify; Railway decommissioned 2026-07).

---

## External systems & credential owners

| System            | Purpose                                              | Where credentials live                      | Primary contact |
| ----------------- | ---------------------------------------------------- | ------------------------------------------- | --------------- |
| **Hetzner**       | VPS host (CX23) for backend                          | 1Password vault `Sergeant / Hetzner`        | @Skords-01      |
| **Coolify**       | Self-hosted PaaS on the VPS (API + Postgres + Redis) | Coolify admin login in `Sergeant / Hetzner` | @Skords-01      |
| **Vercel**        | Web app deployment + edge-proxy                      | 1Password vault `Sergeant / Vercel`         | @Skords-01      |
| **GHCR**          | API container registry                               | GitHub Actions `GITHUB_TOKEN` (auto)        | @Skords-01      |
| **Anthropic**     | Claude API (AI features)                             | 1Password vault `Sergeant / Anthropic`      | @Skords-01      |
| **OpenRouter**    | AI routing (coach/digest/classify)                   | 1Password vault `Sergeant / OpenRouter`     | @Skords-01      |
| **Voyage AI**     | Embeddings (RAG)                                     | 1Password vault `Sergeant / Voyage`         | @Skords-01      |
| **Sentry**        | Error tracking                                       | 1Password vault `Sergeant / Sentry`         | @Skords-01      |
| **Grafana Cloud** | Loki log sink                                        | 1Password vault `Sergeant / Grafana`        | @Skords-01      |
| **PostHog**       | Analytics                                            | 1Password vault `Sergeant / PostHog`        | @Skords-01      |
| **Resend**        | Transactional email                                  | 1Password vault `Sergeant / Resend`         | @Skords-01      |
| **Monobank**      | Webhook source (finyk)                               | 1Password vault `Sergeant / Monobank`       | @Skords-01      |
| **Apple APNs**    | iOS push (routine)                                   | 1Password vault `Sergeant / APNs`           | @Skords-01      |
| **Firebase FCM**  | Android push (routine)                               | 1Password vault `Sergeant / Firebase`       | @Skords-01      |
| **GitHub**        | Source + CI + GHCR                                   | GitHub App credentials                      | @Skords-01      |

> **Access escalation:** If you cannot get 1Password access, contact @Skords-01 directly. No credential is stored in the repository. The single SSH key that reaches the VPS lives in `Sergeant / Hetzner` — without it the server is unreachable (password login is disabled).

---

## What breaks first (absence timeline)

| Duration      | What breaks                                                 | Action                                                                                |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **< 1 week**  | Nothing critical. CI runs, auto-deploy works.               | Monitor Sentry / Coolify.                                                             |
| **1–2 weeks** | Monobank webhook token may expire (30-day validity).        | Renew via Monobank developer portal using credentials in 1Password.                   |
| **1 month**   | DNS / domain renewal reminder appears.                      | Check `sergeant.app` domain registrar (credentials in 1Password). Hetzner invoice.    |
| **3 months**  | APNs key rotation may be needed (annual but good to check). | Re-generate APNs key in Apple Developer Portal; update `APNS_KEY` in Coolify app env. |
| **6 months**  | Renovate PRs accumulate. Security advisories may stack up.  | Merge Renovate PRs in order (check CI passes). Review `pnpm audit`.                   |

---

## Daily operations (when @Skords-01 is out)

1. **Monitor alerts** — Sentry (error spikes), Coolify (deploy failures / unhealthy container), PostHog (DAU drop).
2. **Backups** — daily `pg_dump` runs on the VPS via cron (`/root/db-backup.sh` → `/root/db-backups/`, 14-day retention). Verify a recent dump exists after any incident.
3. **Hotfix flow** — see `docs/03-operations/runbooks/operations-runbook.md` § Hotfix flow. Push to `main` touching the backend auto-builds the image (`deploy-api.yml`) and redeploys via Coolify.
4. **CI failures** — check `.github/workflows/ci.yml`. Most common: pnpm audit advisory → add `audit-exception` label or bump dep.

---

## Escalation contacts

| Role                | Contact                                                 | Scope                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary owner       | @Skords-01                                              | All                                                                                                                                                                                                                                                                     |
| Secondary (TBD)     | Hire when team grows                                    | Per-module — see [AGENTS.md § Module ownership map](../../../AGENTS.md#module-ownership-map) `Secondary` column for placeholder roles (`frontend-engineer`, `backend-engineer`, `mobile-engineer`, `data-engineer`, `any-engineer`); enforced by `pnpm lint:codeowners` |
| Monobank API issues | [developers.monobank.ua](https://api.monobank.ua/docs/) | finyk webhooks                                                                                                                                                                                                                                                          |
| Hetzner support     | [console.hetzner.cloud](https://console.hetzner.cloud)  | VPS / infra outages                                                                                                                                                                                                                                                     |
| Anthropic support   | [support.anthropic.com](https://support.anthropic.com)  | API quota issues                                                                                                                                                                                                                                                        |

---

## Kill-switches (emergency)

| Switch                    | How to activate                                                                                                                                        | Effect                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Disable AI features       | Set `AI_QUOTA_DISABLED=1` in the Coolify app env (dev/test only — blocked in production)                                                               | All AI quota checks bypass                |
| Disable AI quota DB check | Set `AI_QUOTA_CIRCUIT_THRESHOLD=0`                                                                                                                     | Circuit breaker disabled, quota fail-open |
| Disable Monobank webhook  | Remove `MONO_TOKEN_ENC_KEY` / disable `MONO_WEBHOOK_ENABLED` in the Coolify app env                                                                    | Webhooks return 401                       |
| Rollback deploy           | Coolify → `sergeant-api` → Deployments → pick previous image tag → Redeploy. Data rollback: restore latest `/root/db-backups/*.dump` via `pg_restore`. | Previous image goes live                  |

> **Warning:** `AI_QUOTA_DISABLED=1` is hard-blocked in production (throws on startup). Use only in dev/staging. Any env change in Coolify requires a redeploy to take effect.

---

## Related runbooks

- `docs/03-operations/runbooks/operations-runbook.md` — full operations guide
- `docs/04-governance/security/disaster-recovery.md` — DR scenarios (Postgres restore, bad migration, etc.)
- `docs/03-operations/observability/runbook.md` — metrics + alerting runbook

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                         | Merged     |
| ------------------------------------------------------ | ------------------------------------------------------------- | ---------- |
| [#365](https://github.com/Skords-01/Sergeant/pull/365) | fix(ci): restore green main after OpenClaw decommission drift | 2026-07-21 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->

---
lang: en
---

# Playbook: Operational continuity

> **Last touched:** 2026-09-19 by @claude. **Next review:** 2026-12-30.
> **Status:** Active
> **Runtime-specific:** no
> **Context:** Stack-pulse PR-04 bus-factor fix. This document answers: «що робити, якщо @zaebal-beep недоступний тиждень / місяць / 6 місяців?»
>
> **Language note:** Intentionally English (`lang: en` frontmatter, opted out of the cyrillic-ratio gate via `scripts/check-playbook-language.mjs`). The audience is a future engineer or contractor who picks the project up cold during a bus-factor event and may not be Ukrainian-speaking; keeping it in English is part of the operational-continuity goal.

**Trigger:** @zaebal-beep is unavailable (vacation, illness, emergency). You need to keep Sergeant running.

## Owner surface

- Primary surface: deploy infrastructure (Hetzner VPS + Coolify / Vercel / 1Password vaults), `apps/server`
- Coupled surface: every product surface, since this playbook is the fallback when no other owner is around
- Governing skill: `sergeant-start-here`

## Verification

- [ ] All systems in the «External systems & credential owners» table are reachable (Coolify dashboard, Vercel dashboard, Sentry, PostHog).
- [ ] 1Password vault `Sergeant / Hetzner` (SSH key + Coolify admin) opens and decrypts; same for the per-vendor sub-vaults referenced below.
- [ ] `pnpm db:migrate` runs against the production Postgres without prompting for credentials (Coolify injects `DATABASE_URL`; pre-deploy runs `node dist-server/migrate.js`).
- [ ] Each kill-switch in the «Kill-switches (emergency)» table can be activated from the Coolify app → Environment Variables panel and applied with a redeploy.
- [ ] Related runbooks (`docs/start/instructions/operations-runbook.md`, `docs/governance/security/disaster-recovery.md`, `docs/operations/observability/runbook.md`) are reachable and their referenced tools are installed locally.

> Hosting topology + rationale: [ADR-0074](../../governance/adr/0074-hosting-hetzner-coolify.md) (backend on Hetzner CX23 + Coolify; Railway decommissioned 2026-07).

---

## External systems & credential owners

| System            | Purpose                                              | Where credentials live                      | Primary contact |
| ----------------- | ---------------------------------------------------- | ------------------------------------------- | --------------- |
| **Hetzner**       | VPS host (CX23) for backend                          | 1Password vault `Sergeant / Hetzner`        | @zaebal-beep    |
| **Coolify**       | Self-hosted PaaS on the VPS (API + Postgres + Redis) | Coolify admin login in `Sergeant / Hetzner` | @zaebal-beep    |
| **Vercel**        | Web app deployment + edge-proxy                      | 1Password vault `Sergeant / Vercel`         | @zaebal-beep    |
| **GHCR**          | API container registry                               | GitHub Actions `GITHUB_TOKEN` (auto)        | @zaebal-beep    |
| **Anthropic**     | Claude API (AI features)                             | 1Password vault `Sergeant / Anthropic`      | @zaebal-beep    |
| **OpenRouter**    | AI routing (coach/digest/classify)                   | 1Password vault `Sergeant / OpenRouter`     | @zaebal-beep    |
| **Voyage AI**     | Embeddings (RAG)                                     | 1Password vault `Sergeant / Voyage`         | @zaebal-beep    |
| **Sentry**        | Error tracking                                       | 1Password vault `Sergeant / Sentry`         | @zaebal-beep    |
| **Grafana Cloud** | Loki log sink                                        | 1Password vault `Sergeant / Grafana`        | @zaebal-beep    |
| **PostHog**       | Analytics                                            | 1Password vault `Sergeant / PostHog`        | @zaebal-beep    |
| **Resend**        | Transactional email                                  | 1Password vault `Sergeant / Resend`         | @zaebal-beep    |
| **Monobank**      | Webhook source (finyk)                               | 1Password vault `Sergeant / Monobank`       | @zaebal-beep    |
| **Apple APNs**    | iOS push (routine)                                   | 1Password vault `Sergeant / APNs`           | @zaebal-beep    |
| **Firebase FCM**  | Android push (routine)                               | 1Password vault `Sergeant / Firebase`       | @zaebal-beep    |
| **GitHub**        | Source + CI + GHCR                                   | GitHub App credentials                      | @zaebal-beep    |

> **Access escalation:** If you cannot get 1Password access, contact @zaebal-beep directly. No credential is stored in the repository. The single SSH key that reaches the VPS lives in `Sergeant / Hetzner` — without it the server is unreachable (password login is disabled).

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

## Daily operations (when @zaebal-beep is out)

1. **Monitor alerts** — Sentry (error spikes), Coolify (deploy failures / unhealthy container), PostHog (DAU drop).
2. **Backups** — daily `pg_dump` runs on the VPS via cron (`/root/db-backup.sh` → `/root/db-backups/`, 14-day retention). Verify a recent dump exists after any incident.
3. **Hotfix flow** — see `docs/start/instructions/operations-runbook.md` § Hotfix flow. Push to `main` touching the backend auto-builds the image (`deploy-api.yml`) and redeploys via Coolify.
4. **CI failures** — check `.github/workflows/ci.yml`. Most common: pnpm audit advisory → add `audit-exception` label or bump dep.

---

## Escalation contacts

| Role                | Contact                                                 | Scope                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary owner       | @zaebal-beep                                            | All                                                                                                                                                                                                                                                                                                                                                                  |
| Secondary (TBD)     | Hire when team grows                                    | Per-module — see [AGENTS.md § Module ownership map](../../../AGENTS.md#module-ownership-map) `Secondary` column for placeholder roles (`frontend-engineer`, `backend-engineer`, `mobile-engineer`, `data-engineer`, `any-engineer`); enforcement — ручний review (CODEOWNERS-гейт прибрано [ADR-0082](../../governance/adr/0082-private-storage-repo-posture.md) §3) |
| Monobank API issues | [developers.monobank.ua](https://api.monobank.ua/docs/) | finyk webhooks                                                                                                                                                                                                                                                                                                                                                       |
| Hetzner support     | [console.hetzner.cloud](https://console.hetzner.cloud)  | VPS / infra outages                                                                                                                                                                                                                                                                                                                                                  |
| Anthropic support   | [support.anthropic.com](https://support.anthropic.com)  | API quota issues                                                                                                                                                                                                                                                                                                                                                     |

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

- `docs/start/instructions/operations-runbook.md` — full operations guide
- `docs/governance/security/disaster-recovery.md` — DR scenarios (Postgres restore, bad migration, etc.)
- `docs/operations/observability/runbook.md` — metrics + alerting runbook

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                                                           | Merged     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------- |
| [#57](https://github.com/zaebal-beep/sergeant/pull/57) | fix(root): закрити знахідки наскрізного аудиту — валідація AI-шару, метрика конфліктів синку, браузерні дефекти | 2026-09-16 |
| [#51](https://github.com/zaebal-beep/sergeant/pull/51) | docs(agents): пʼять нових playbook-ів під повторювані поломки і ревізія наявних                                 | 2026-09-15 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->

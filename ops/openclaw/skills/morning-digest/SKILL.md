---
name: morning-digest
description: Ранковий digest для founder-а — щоденний звіт о 09:00 Europe/Kyiv, який Sergeant Gateway надсилає в Telegram DM.
trigger: cron
---

# Morning Digest

> **Last validated:** 2026-05-12 by Stage 5d implementation (PR for `provision-cron.mjs`). **Next review:** 2026-08-12.
> **Status:** Active — provisioned at gateway boot via `ops/openclaw/provision-cron.mjs` (cron-store entry, declarative).

## Опис

Щодня о 09:00 Europe/Kyiv OpenClaw Gateway піднімає isolated agent-turn з повідомленням `/digest day`. Layer 0 shortcut router у `@sergeant/openclaw-plugin` робить in-process fan-out по 4 read-tool-ах, рендерить Markdown-digest і повертає його host-у — `gateway.cron.delivery.mode = "announce"` доставляє результат у Telegram DM founder-а. Мета — за 30 секунд читання дати повну картину здоров'я продукту без ручних запитів. LLM-cost кожного ранку: $0 (Layer 0); fall-through на Layer 2 Sonnet — теоретичний бекстоп, який ми ще не бачили в proді.

## Cron

`0 9 * * *` Europe/Kyiv — рівно 09:00 за Kyiv-часом. Зберігається у `~/.openclaw/cron/jobs.json` як OpenClaw native job:

```jsonc
{
  "id": "sergeant-morning-digest",
  "name": "morning-digest",
  "schedule": { "kind": "cron", "expr": "0 9 * * *", "tz": "Europe/Kyiv" },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": { "kind": "agentTurn", "message": "/digest day" },
  "delivery": {
    "mode": "announce",
    "channel": "telegram",
    "to": "${OPENCLAW_FOUNDER_TG_USER_ID}",
    "bestEffort": true,
  },
}
```

Source of truth — `ops/openclaw/provision-cron.mjs` (idempotent upsert при кожному container-boot-і; existing job-у `id` + `createdAtMs` + runtime `state` зберігаються, `schedule`/`payload`/`delivery` overwrite-ються до canonical-івих значень). Gateway-level cron-store config (retry policy, sessionRetention, failure-alert) живе у `cron.*` блоці `ops/openclaw/openclaw.example.json`.

## Дані (4 кроки, виконуються паралельно)

Layer 0 shortcut `/digest day` (`packages/openclaw-plugin/src/shortcuts/digest.ts`) тригерить ці 4 tool-и без LLM-виклику:

1. **PostHog daily** — `get_posthog_stats({})` → daily metrics.
2. **Stripe failures** — `get_stripe_metrics({})` → failed payments + refunds за 24h.
3. **Sentry top issues** — `get_sentry_issues({ limit: 3 })`.
4. **PR queue** — `read_github({ resource: "pulls" })` → open PRs.

Інші три сигнали (open decisions, n8n failed executions, heartbeat thresholds) сидять у backlog-і Stage 5d.1 — додати їх можна без новoго cron-job-у, простим розширенням `digestShortcut.toolCalls`.

## Heartbeat thresholds (Locked decision #10)

| Умова                                                                                            | Дія                                                                                           |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| PR open > 48h без reviewer-а                                                                     | Тег `/Артем` у digest                                                                         |
| Decision без owner > 7d                                                                          | Тег `/Андрій` + запис у record_decision/list                                                  |
| Метрика-variance > 20% відносно 7-денної baseline (signups / MAU / Stripe revenue / Sentry rate) | «червоний» ⚠️ tag; якщо infra-related → тег `/Олексій`; якщо analytics-related → тег `/Ярема` |

Threshold-логіка ще не зашита в Layer 0 render-ері (рендер зараз віддає сирі tool-output-и). Доводить її — Stage 5d.1 follow-up на `digestShortcut.render`.

## Формат відповіді

Канонічна форма (рендер у `digestShortcut.render`):

```
📰 **Дайджест (day)**

**PostHog:**
<get_posthog_stats output>

**Stripe:**
<get_stripe_metrics output>

**Sentry:**
<get_sentry_issues output>

**PRs:**
<read_github output>
```

Inline-keyboard з кнопками «деталі по N» — Stage 5d.1 (потребує `delivery.mode="announce"` + per-block thread-id).

## Доступні tools

`get_posthog_stats`, `get_stripe_metrics`, `get_sentry_issues`, `read_github`. Усі read-only, $0 LLM cost.

❌ **Заборонено write-tools** — digest read-only.

## Дез-провіжионинг

`openclaw cron rm sergeant-morning-digest` (через CLI до running gateway), або `OPENCLAW_SKIP_CRON=1` env-var (вимикає cron-runtime повністю), або `cron.enabled: false` у gateway config. Видалення job-у з `~/.openclaw/cron/jobs.json` теж працює — але `provision-cron.mjs` поверне його при наступному container-restart-і. Щоб permanent-ло вимкнути morning-digest — приберіть виклик `node /app/ops/openclaw/provision-cron.mjs` з `docker-entrypoint.sh`.

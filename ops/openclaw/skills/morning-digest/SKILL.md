---
name: morning-digest
description: Ранковий digest для founder-а — щоденний звіт о 09:00 Kyiv з 6 data sources.
trigger: cron
---

# Morning Digest

> **Last validated:** 2026-05-11 by claude/review-openclaw-migration-HSeEx. **Next review:** 2026-08-11.
> **Status:** Active (missed in PR-C3, added via review).

## Опис

Щодня о 09:00 Europe/Kyiv автоматично надсилає founder-у стислий digest у Telegram DM.
Мета — дати за 30 секунд читання повну картину здоров'я продукту без ручних запитів.

## Cron

`0 9 * * *` Europe/Kyiv — рівно 09:00 за Kyiv-часом. Тригериться OpenClaw native scheduler-ом, **не** n8n.

## Дані (6 кроків, виконуються паралельно де можливо)

1. **Stripe failures** — `get_stripe_metrics` → failed payments + refunds за 24h.
2. **Sentry top issues** — `get_sentry_issues({ last24h: true, minSeverity: "warning", topK: 5 })`.
3. **PR queue** — `list_open_prs` → open PRs > 48h old + reviewer load.
4. **Open decisions** — `record_decision` list-mode → рішення без owner > 7d.
5. **PostHog daily** — `get_posthog_stats` → signups, MAU, key events за вчора.
6. **n8n failed executions** — `read_workflow_logs` для кожного Tier A/B workflow → failed runs за 24h.

## Heartbeat thresholds (Locked decision #10)

| Умова                                                                                            | Дія                                                                                           |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| PR open > 48h без reviewer-а                                                                     | Тег `/Артем` у digest                                                                         |
| Decision без owner > 7d                                                                          | Тег `/Андрій` + запис у record_decision/list                                                  |
| Метрика-variance > 20% відносно 7-денної baseline (signups / MAU / Stripe revenue / Sentry rate) | «червоний» ⚠️ tag; якщо infra-related → тег `/Олексій`; якщо analytics-related → тег `/Ярема` |

Порогові значення — defaults; founder може перевизначити через `openclaw.json` без редеплою Gateway.

## Формат відповіді

Коротка зведена відповідь у Telegram DM. Структура:

```
📊 Ранковий digest — <дата> Kyiv

💳 Stripe: <N> failed payments, <M> refunds
🔴 Sentry: <top issue title> (+N others)
📋 PRs: <K> open, <J> stalе (>48h) — /Артем
✅ Decisions: <L> без owner
📈 PostHog: <signups today> signups, <MAU> MAU
⚙️ n8n: <OK / N failed>
```

Inline-keyboard з кнопками «деталі по N» для кожного блоку.
Якщо всі метрики OK і немає stale-item — коротша «✅ Все добре» форма.

## Доступні tools

`get_stripe_metrics`, `get_sentry_issues`, `list_open_prs`, `record_decision`, `get_posthog_stats`, `read_workflow_logs`

❌ **Заборонено write-tools** — digest read-only.

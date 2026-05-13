# 98-error-handler — global n8n error workflow

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Глобальний error workflow (configured як **Error Workflow** у n8n settings).
Викликається коли будь-який інший workflow крашиться — пише event у
`n8n_failure_events` (dead-letter) + alert у Telegram-канал `🟠 Контрол-план`
(`TELEGRAM_TOPIC_META`).

## Контракт

| Триггер            | n8n `Error Trigger` (вмикається у `Settings → Error Workflow` для кожного workflow окремо або як account-default) |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Insert dead-letter | `n8n_failure_events` — кожна failure-event завжди логується (audit log)                                           |
| Telegram alert     | Сповіщення у `🟠 Контрол-план` топіку **за умови, що cooldown elapsed**                                           |
| Email (Resend)     | Fallback alert на `OPS_ALERT_EMAIL` коли Telegram delivery впала                                                  |
| Re-poke            | Manual (P0 protocol — див. REPORTING-MATRIX § Priority levels)                                                    |

## Alert dedup (cooldown 30 хв)

З PR-15 (48-plan, 2026-05-13) WF-98 використовує **30-min cooldown** по парі
`(workflow_id, error_signature)`, щоб не flood-ити канал при repeating
failures (Stripe partial outage, Postgres connection storm, …).

**Як працює:**

1. `Insert n8n failure event` — INSERT у `n8n_failure_events` з
   `RETURNING id, error_signature`. `error_signature` — generated column
   `md5(left(error_message, 200))`, заводиться у migration `058`.
2. `Check 30-min cooldown` — SELECT COUNT(\*) prior events за останні 30 хв
   із тим самим `(workflow_id, error_signature)`, виключаючи just-inserted
   row (`id <> $current`).
3. `IF cooldown elapsed` — branch by `prior_alerts === 0`:
   - **TRUE** (це перша поява сігнатури в 30-min window) → fire Telegram.
   - **FALSE** (вже алертили цей сігнатур у window) → no-op (event просто
     лежить у dead-letter, але не пейджить).

**Що НЕ дедупиться:**

- Різні workflow-и з тим самим error message — окремий alert per workflow.
- Та сама workflow з різним error (наприклад різні nodes впали) — окремі
  alerts: `md5(left(error_message, 200))` різний → різні signatures.

**Як прискорити alerting (bypass cooldown):**

Поки що — manual: dispatcher може заглянути у `n8n_failure_events` напряму
(SQL view), або re-run workflow вручну (це створить новий event з новим
`id`, але signature та сама — `prior_alerts > 0`, alert все одно
suppressed). Future: WF-98 callback для force-resend, або dashboard.

**Як побачити що було suppressed:**

```sql
SELECT
  workflow_id, workflow_name, error_signature,
  COUNT(*) AS event_count,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM n8n_failure_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY workflow_id, workflow_name, error_signature
HAVING COUNT(*) > 1
ORDER BY event_count DESC;
```

Скільки б суто recurring events не прилетіло у dead-letter, на пейджер
полетіло саме `COUNT(DISTINCT first-of-window)`. Для аудиту повний потік
лишається доступним у `n8n_failure_events`.

## Required env

- `TELEGRAM_ALERT_CHAT_ID` — supergroup `Sergeant Ops`.
- `TELEGRAM_TOPIC_META` — `message_thread_id` топіку `🟠 Контрол-план`.
- `OPS_ALERT_EMAIL` — fallback Resend recipient.

## Required credentials

- `Sergeant Postgres (sergeant-db)` — для dead-letter INSERT і cooldown SELECT.
- `Telegram (Sergeant_alert_bot)` — для alert delivery.
- `Resend (Bearer)` — для email fallback.

## Залежні міграції

- `015_n8n_failure_events.sql` — створює таблицю `n8n_failure_events`.
- `058_n8n_failure_events_signature.sql` — додає generated column
  `error_signature` + індекс `(workflow_id, error_signature, created_at)`.
  **Має бути застосована перед активацією PR-15 workflow JSON.**

## Rollout

PR-15 (48-plan) rollout-шаги:

1. Merge migration `058_n8n_failure_events_signature.sql` у `main`.
2. Дочекатися `pnpm db:migrate` на Railway (pre-deploy step).
3. Імпортувати оновлений `98-error-handler.json` у n8n production
   instance (Settings → Workflows → Import from File).
4. Verify: створити dummy failure (test workflow з `throw new Error('test')`),
   verify Telegram alert приходить. Друге виконання у window не повинно
   видати Telegram message — лише запис у `n8n_failure_events`.

Backout: down-migration `058_n8n_failure_events_signature.down.sql` +
re-import попередньої версії `98-error-handler.json` з git history.

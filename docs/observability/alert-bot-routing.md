# Alert-bot routing — n8n broadcast workflows → `tg_alert_acks`

> **Status:** Active. **Owner:** ops. **Last refreshed:** 2026-05-13 (O9 batch).
> **Spec:** [`docs/adr/0038-alert-bot-accountability.md`](../adr/0038-alert-bot-accountability.md)
> §3.2; reporting matrix footnote 5 in
> [`ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md).

This file documents how each Sergeant n8n broadcast workflow maps onto the
alert-bot accountability layer. It is the canonical wire-map for:

- the `tg_alert_acks` table (migration 060,
  [`apps/server/src/db/migrations/060_tg_alert_acks_dedup_signature.sql`](../../apps/server/src/db/migrations/060_tg_alert_acks_dedup_signature.sql)),
- the `POST /api/internal/alerts/post` writer
  ([`apps/server/src/modules/alerts/store.ts`](../../apps/server/src/modules/alerts/store.ts)),
- WF-103 alert-escalation cron + WF-104 alert-callback router,
- and the `/alerts pending` slash-command (O5, PR #2507).

## Wire pattern

Every wired broadcast workflow inserts two nodes immediately upstream of its
Telegram node:

1. **Build alert payload (Code node)** — constructs a deterministic `alertId`
   of the form `<workflow_id>:<execution_id>[:<suffix>]`. Suffix is used when
   a single workflow execution can fan out into multiple semantically
   distinct alerts (e.g. WF-15 branches on Railway deploy `branch` +
   `commitHash`; WF-98 keys on the failed workflow + `error_signature` to
   match its 30-min SQL cooldown 1:1).
2. **POST /api/internal/alerts/post (HTTP Request node)** — Bearer-auth call
   to `{{ $env.PUBLIC_API_BASE_URL }}/api/internal/alerts/post` with
   `INTERNAL_API_KEY`. Body carries `alertId`, `topic`, `severity`, `summary`,
   `metadata`. Idempotent on the server side via `ON CONFLICT DO NOTHING`,
   so n8n retries are safe. Set `onError=continueRegularOutput` so the
   Telegram broadcast still fires when the alerts endpoint is unreachable.

The Telegram node then renders an inline-keyboard with the three ack buttons
(✅ Прочитав / 🔄 Розбираю / 🔕 Замутити 30хв). Each button carries
`callback_data = "ack:<r|i|m>:<alertId>"`, which is consumed by WF-104.

Validator gates (`pnpm ops:n8n:validate`):

- Workflow JSON in git must keep `"active": false`. Activation is a manual
  step in the n8n UI after all `requiredEnv` are set on n8n Railway.
- Every `$env.VAR` referenced inside a node must appear in
  `ops/n8n-workflows/manifest.json` → `requiredEnv`.

## Wired workflows

The 17 broadcast workflows currently emitting ack rows. Cross-reference with
[`REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md) for
cadence + owner. PR column links the wave that wired the ack pattern.

| WF    | Workflow                              | Topic                           | Severity               | `alertId` shape                                 | PR                      |
| ----- | ------------------------------------- | ------------------------------- | ---------------------- | ----------------------------------------------- | ----------------------- |
| WF-01 | `01-stripe-pro-upgrade.json`          | `incidents`                     | P0                     | `<wfId>:<execId>`                               | W3 PR-3 batch 2         |
| WF-02 | `02-stripe-payment-failed.json`       | `incidents`                     | P0                     | `<wfId>:<execId>`                               | W3 PR-3 batch 2         |
| WF-03 | `03-anthropic-budget-guard.json`      | `incidents`/`ops`               | P0 (fatal) / P1 (warn) | `<wfId>:<execId>:<branch>`                      | W3 PR-3 batch 1 (#1503) |
| WF-04 | `04-daily-backup-verification.json`   | `incidents`                     | P1                     | `<wfId>:<execId>`                               | W3 PR-2 (#1480)         |
| WF-05 | `05-renovate-nonpatch.json`           | `engineering`                   | P1                     | `<wfId>:<execId>`                               | W3 PR-3 batch 2         |
| WF-06 | `06-mono-monthly-budget.json`         | `ops`                           | P1                     | `<wfId>:<execId>`                               | W3 PR-3 batch 2         |
| WF-08 | `08-weekly-financial-digest.json`     | `digest`                        | P2                     | `<wfId>:<execId>:weekly-digest`                 | W3 PR-4 (O9 batch)      |
| WF-15 | `15-railway-deployment-notify.json`   | `ops` (ok) / `incidents` (fail) | P2 (ok) / P1 (fail)    | `<wfId>:<execId>:railway-<branch>-<commitHash>` | W3 PR-4 (O9 batch)      |
| WF-16 | `16-posthog-daily-metrics.json`       | `growth`                        | P2                     | `<wfId>:<execId>:posthog-daily`                 | W3 PR-4 (O9 batch)      |
| WF-17 | `17-github-pr-stale-alert.json`       | `engineering`                   | P2                     | `<wfId>:<execId>`                               | W3 PR-3 batch 2         |
| WF-18 | `18-nightly-security-audit.json`      | `incidents`                     | P1                     | `<wfId>:<execId>`                               | W3 PR-3 batch 1 (#1503) |
| WF-19 | `19-db-health-report.json`            | `ops`                           | P1                     | `<wfId>:<execId>`                               | W3 PR-3 batch 2         |
| WF-30 | `30-ai-memory-daily-digest.json`      | `digest`                        | P2                     | `<wfId>:<execId>:ai-memory-digest`              | W3 PR-4 (O9 batch)      |
| WF-60 | `60-growth-funnel-snapshot.json`      | `growth`                        | P2                     | `<wfId>:<execId>:growth-funnel`                 | W3 PR-4 (O9 batch)      |
| WF-63 | `63-growth-acquisition-snapshot.json` | `growth`                        | P2                     | `<wfId>:<execId>:growth-acquisition`            | W3 PR-4 (O9 batch)      |
| WF-98 | `98-error-handler.json`               | `meta`                          | P0                     | `wf98:<failed_wfId>:<error_signature>`          | W3 PR-4 (O9 batch)      |
| WF-99 | `99-heartbeat.json`                   | `meta`                          | P3                     | `<wfId>:<execId>:heartbeat`                     | W3 PR-4 (O9 batch)      |

### Notes per row

- **WF-15** uses dynamic topic + severity expressions: the Build alert payload
  Code node sets `topic = parsed.ok ? "ops" : "incidents"` and
  `severity = parsed.ok ? "P2" : "P1"`. The suffix
  (`railway-<branch>-<commitHash>`) keeps successive deploys to the same
  service distinct.
- **WF-98** is the n8n global error handler. Its ack-row key
  (`wf98:<failed_workflow_id>:<error_signature>`) is intentionally the same
  granularity as the WF-98 SQL cooldown (30 min per failure class), so the
  Telegram fan-out is exactly one ack-row per cooldown window. WF-98 itself
  has no `errorWorkflow` set — a chained POST `/alerts/post` failure cannot
  loop back here.
- **WF-99** is a silent heartbeat. Telegram message keeps
  `disable_notification: true`; the ack-row is informational and exists so
  `/alerts pending` and WF-103 see a uniform paper-trail across all 17
  workflows. Operators can dismiss the row by tapping ✅ Прочитав, same as
  any other alert.

## Required environment

Every wired workflow declares these in `manifest.json` → `requiredEnv`:

- `PUBLIC_API_BASE_URL` — base URL for the Sergeant API. Falls back to
  `https://api.invalid.local` so the workflow degrades gracefully when the
  variable is missing (POST hits a no-op host instead of crashing).
- `INTERNAL_API_KEY` — Bearer token for `/api/internal/alerts/post`. Rotated
  via [`docs/playbooks/rotate-secrets.md`](../playbooks/rotate-secrets.md).

These are in addition to whatever topic-specific variables the workflow
already required (e.g. `TELEGRAM_TOPIC_GROWTH`, `POSTHOG_API_KEY`).

## Acknowledgment lifecycle

```
n8n workflow runs
        │
        ▼
POST /api/internal/alerts/post   ──►  INSERT INTO tg_alert_acks
   (idempotent, ON CONFLICT)            (acked_at = NULL,
        │                                escalated_at = NULL)
        ▼
Telegram message with inline_keyboard
        │
        │ (operator clicks one of 3 buttons)
        ▼
WF-104 callback router
        │
        ▼
POST /api/internal/alerts/ack    ──►  UPDATE tg_alert_acks SET
   (action = r | i | m)                  acked_at = now(),
        │                                acked_action = ...
        ▼
WF-104 editMessageText (drop buttons, add ack footer)

[parallel, every 5 minutes]
WF-103 alert-escalation cron
        │
        ▼
POST /api/internal/alerts/pending
   (olderThanMinutes=15,
    notYetEscalated=true)        ──►  UPDATE escalated_at,
        │                              DM founder via OpenClaw_sergeant_bot
        ▼
POST /api/internal/alerts/escalate
```

The same flow powers the `/alerts pending` slash-command (O5 / PR #2507),
which calls `POST /api/internal/alerts/pending` and renders the open
ack-rows in the founder DM.

## Adding a new broadcast workflow

When introducing a new WF-NN broadcast workflow:

1. Insert the Build alert payload + POST `/alerts/post` nodes upstream of
   the Telegram node — copy the pattern from
   [`ops/n8n-workflows/04-daily-backup-verification.json`](../../ops/n8n-workflows/04-daily-backup-verification.json).
2. Pick a stable `alertId` shape — append a suffix when one execution emits
   multiple alerts. The suffix should be the smallest piece of state that
   makes the alert distinguishable for dedup.
3. Update the Telegram node's `additionalFields.reply_markup` with the
   three-button inline keyboard, referencing
   `$('Build alert payload (...)').item.json.alertId`.
4. Append the workflow to the table above with topic / severity /
   `alertId` shape / PR.
5. Add `PUBLIC_API_BASE_URL` + `INTERNAL_API_KEY` to
   `manifest.json.requiredEnv`. Run `pnpm ops:n8n:validate` before pushing.
6. Update [`REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md)
   footnote 5 so the wired-workflow list stays in sync.

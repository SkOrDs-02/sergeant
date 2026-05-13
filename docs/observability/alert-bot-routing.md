# Alert-bot routing — n8n broadcast workflows → `tg_alert_acks`

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active. **Owner:** ops.
> **Spec:** [`docs/adr/0038-tg-alert-acks-and-escalation.md`](../adr/0038-tg-alert-acks-and-escalation.md)
> §3.2; reporting matrix footnote 5 in
> [`ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md).

This file documents how each Sergeant n8n broadcast workflow maps onto the
alert-bot accountability layer. It is the canonical wire-map for:

- the `tg_alert_acks` table (migration 060,
  [`apps/server/src/migrations/060_tg_alert_acks_dedup_signature.sql`](../../apps/server/src/migrations/060_tg_alert_acks_dedup_signature.sql)),
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
        │                                escalated_at, repeated_at,
        │                                sentry_warned_at, snoozed_until_at
        │                                = NULL)
        ▼
Telegram message with inline_keyboard
        │
        │ (operator clicks one of 3 ack buttons)
        ▼
WF-104 callback router (ack-branch)
        │
        ▼
POST /api/internal/alerts/ack    ──►  UPDATE tg_alert_acks SET
   (action = r | i | m)                  acked_at = now(),
        │                                acked_action = ...
        ▼
WF-104 editMessageText (drop buttons, add ack footer)

──── Sprint 6 escalation tiers ────

[T1, every 5 min] WF-103 alert-escalation cron
        │
        ▼
POST /api/internal/alerts/pending
   (olderThanMinutes=15, notYetEscalated=true)
        │
        ▼
POST /api/internal/alerts/escalate     ──►  UPDATE escalated_at = NOW(),
                                            DM founder via OpenClaw_sergeant_bot

[T2, every 15 min] WF-105 alert-repeat-ping cron
        │
        ▼
POST /api/internal/alerts/pending
   (olderThanMinutes=60, notYetRepeated=true, notSnoozed=true)
        │
        ▼
POST /api/internal/alerts/repeat       ──►  UPDATE repeated_at = NOW()
        │
        ▼
Telegram sendMessage у original topic з prefix "⚠ REPEAT (Nхв)"
   + inline_keyboard: ✅ Прочитав | 🕐 Snooze 1h | 🕓 Snooze 4h
        │
        │ (operator може клікнути snooze)
        ▼
WF-104 callback router (snooze-branch, callback_data="snooze:<1h|4h>:<alertId>")
        │
        ▼
POST /api/internal/alerts/snooze       ──►  UPDATE snoozed_until_at = NOW() + Nmin
                                            (latest-write-wins; не one-shot)
        │
        ▼
WF-104 editMessageText (drop snooze keyboard, add "Snoozed until HH:MM" footer)

[T3, every 15 min] WF-106 alert-sentry-warn cron
        │
        ▼
POST /api/internal/alerts/pending
   (olderThanMinutes=120, notYetSentryWarned=true, notSnoozed=true)
        │
        ▼
POST /api/internal/alerts/sentry-warn  ──►  UPDATE sentry_warned_at = NOW(),
                                            Sentry.captureMessage(
                                              "unacked-alert-escalation: <id>",
                                              level="warning",
                                              tags.kind="unacked-alert-escalation"
                                            )
```

Idempotency invariant: T1/T2/T3 mark-функції використовують
`UPDATE … SET <col> = NOW() WHERE alert_id=$1 AND <col> IS NULL` — гарантує
що cron retry (n8n queue replay, network flake) не призведе до double-DM /
double-repeat / double-Sentry-event.

The same `/alerts/pending` endpoint powers the `/alerts pending` slash-command
(O5 / PR #2507), which calls без filter prefs і renders усі open ack-rows у
founder DM.

For post-mortem debugging, `/alerts history [<days>] [limit=<N>]` (this PR)
hits the sibling `POST /api/internal/alerts/history` endpoint. It runs two
SQL aggregates against `tg_alert_acks` — top-N noisiest workflows (grouped by
`split_part(alert_id, ':', 1)`) plus a window-wide summary (totals, ack-rate,
avg time-to-ack, tier counts). Defaults: 7d look-back, top-10 workflows.
Same founder-only allowlist + 3/min rate-limit + `openclaw_invocations`
audit row as `/alerts pending`.

## T2 repeat-ping inline keyboard

Кнопки T2 message (WF-105) — три callback-action-buttons:

| Label          | `callback_data`       | Server endpoint                    | Effect                                  |
| -------------- | --------------------- | ---------------------------------- | --------------------------------------- |
| `✅ Прочитав`  | `ack:r:<alertId>`     | `POST /api/internal/alerts/ack`    | `ack_at = NOW()`, `ack_action = "read"` |
| `🕐 Snooze 1h` | `snooze:1h:<alertId>` | `POST /api/internal/alerts/snooze` | `snoozed_until_at = NOW() + 60 min`     |
| `🕓 Snooze 4h` | `snooze:4h:<alertId>` | `POST /api/internal/alerts/snooze` | `snoozed_until_at = NOW() + 240 min`    |

Snooze is **latest-write-wins** — другий клік (1h після 4h, чи навпаки)
перезапише `snoozed_until_at`. T1 НЕ фільтрується по snooze (T1 вже пройшов
до того як юзер бачить T2-keyboard); T2/T3 фільтруються
`(snoozed_until_at IS NULL OR snoozed_until_at < NOW())`. Detailed
escalation/disable runbook — у
[`docs/observability/runbook.md`](runbook.md) § "Alert-bot escalation ladder".

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

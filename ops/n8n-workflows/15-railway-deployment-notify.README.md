# WF-15 — Railway Deployment Notify

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-03.

> Webhook (`POST /webhook/railway-deploy`) → Telegram message in
> `Sergeant_ops` (`⚙️ Контрол-план` topic, success → ops; failure →
> incidents).

Workflow JSON: [`15-railway-deployment-notify.json`](./15-railway-deployment-notify.json).
Manifest entry: see `manifest.json`.

## §3.4 fix (Wave 1, 2026-05-03) — Telegram "Bad request" noise

**Problem.** WF-15 was raising `Bad request - please check your parameters`
on the `Telegram → #deploys` node 3+ times per day. Pulled the failing
executions via `n8n_API` → the underlying error in every case was:

```
Bad Request: can't parse entities:
Can't find end of the entity starting at byte offset N
```

i.e. Telegram's MarkdownV1 parser choked on commit messages that
contained `*`, `_`, `` ` ``, or `[` (e.g. `applyFizruk*`, `__init__`,
`feat[scope]: …`).

**Why MarkdownV1 is fragile.** Legacy `parse_mode: "Markdown"` does
**not** support backslash escaping — there's no way to send a literal
`*` once the message is in Markdown mode. The only options are:

1. Strip / replace specials in user-content fields (lossy).
2. Switch to `MarkdownV2` and escape ~16 chars.
3. Switch to `HTML` and escape `&<>` only.

**Fix.** Switched to `parse_mode: "HTML"`. The `Parse Railway payload`
node now produces `*Html` variants (`commitMsgHtml`, `serviceHtml`, …)
where `&`, `<`, `>` are escaped, and the Telegram node template uses
`<b>` / `<code>` instead of `*…*` / `` `…` ``. Bullet-proof: any commit
message we'll realistically see is now safe.

**Acceptance.** 0 `Bad request` errors in WF-15 for a 7-day window
post-merge (track via `n8n_API GET /executions?status=error&workflowId=CygZ4vLxTm2ltuRW`).

## Inbound payload — Railway webhook v2 (2026-05)

Railway POSTs JSON in this shape; only fields that the parser actually
consumes are listed (anything else is ignored). Confirmed from a live
`Deployment.deployed` execution on 2026-05-03 (n8n exec `402`):

```jsonc
{
  "type": "Deployment.deployed", // event-type discriminator
  "details": {
    "id": "<deployment uuid>",
    "branch": "main",
    "source": "GitHub",
    "status": "SUCCESS", // SUCCESS | FAILED | BUILDING | …
    "builder": "DOCKERFILE",
    "commitHash": "<full 40-char sha>",
    "commitAuthor": "<github login>",
    "commitMessage": "<full message; first line used>",
    "buildEnvironment": "V3",
  },
  "resource": {
    "project": { "id": "…", "name": "humorous-eagerness" },
    "service": { "id": "…", "name": "Sergeant" },
    "workspace": { "id": "…", "name": "skords-01's Projects" },
    "deployment": { "id": "…" },
    "environment": { "id": "…", "name": "production", "isEphemeral": false },
  },
  "severity": "INFO", // INFO | WARN | ERROR
  "timestamp": "2026-05-03T14:51:06.394Z",
}
```

### Fields used by `Parse Railway payload`

| Output field | Source path (in order, first non-empty wins)                                                     |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `status`     | `details.status` → `body.status` → `body.type` → `'UNKNOWN'`                                     |
| `service`    | `resource.service.name` → `body.service.name` → `body.serviceName` → `'—'`                       |
| `env`        | `resource.environment.name` → `body.environment.name` → `body.environmentName` → `'—'`           |
| `branch`     | `details.branch` → `body.deployment.meta.branch` → `body.branch` → `'—'`                         |
| `commitMsg`  | `details.commitMessage` → `body.deployment.meta.commitMessage` → `body.commitMessage` (1st line) |
| `commitHash` | `details.commitHash` → `body.deployment.meta.commitHash` → `body.commitHash` (truncated to 7)    |
| `url`        | `body.deployment.url` → `body.deploymentUrl` → `''`                                              |
| `duration`   | `Math.round(body.buildDuration / 1000) + 's'` → `'—'`                                            |
| `ok`         | `['SUCCESS', 'DEPLOYED', 'ACTIVE'].includes(status.toUpperCase())`                               |

`*Html` variants (`serviceHtml`, `envHtml`, …) apply `htmlEscape()` to
the same value — that's the ONLY thing the Telegram node should
interpolate, never the raw fields.

## Wiring (Railway-side)

Railway emits these per-project, configured under
`Project Settings → Webhooks`. Both `humorous-eagerness` (sergeant-api)
and `grateful-nurturing` (n8n itself) point at:

```
https://n8n-production-09ac.up.railway.app/webhook/railway-deploy
```

See `docs/integrations/railway-vercel.md §8` for the full procedure
(event-type filter, stale-rule cleanup, smoke-test).

## Live workflow

| n8n workflow ID    | `CygZ4vLxTm2ltuRW`              |
| ------------------ | ------------------------------- |
| Webhook path       | `/webhook/railway-deploy`       |
| Active             | `true`                          |
| Telegram chat      | `$env.TELEGRAM_ALERT_CHAT_ID`   |
| Topic — success    | `$env.TELEGRAM_TOPIC_OPS`       |
| Topic — failure    | `$env.TELEGRAM_TOPIC_INCIDENTS` |
| Telegram bot       | `Sergeant_alert_bot`            |
| Error-workflow ref | `iC82EFJzqBny9kxI` (WF-98)      |

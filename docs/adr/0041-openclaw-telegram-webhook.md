# ADR-0041: OpenClaw Telegram delivery via webhook

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0031 — OpenClaw v0 Telegram co-founder](./0031-openclaw-v0-telegram-cofounder.md) — DM bot baseline.
  - [ADR-0032 — Console consolidated into OpenClaw](./0032-console-consolidated-into-openclaw.md) — `apps/console` is OpenClaw's home process.
  - [ADR-0036 — OpenClaw write-tools with approval](./0036-openclaw-write-tools-with-approval.md) — inline-keyboard approval flow whose latency we're reducing.
  - [`docs/launch/openclaw-roadmap.md` §3.5](../launch/openclaw-roadmap.md) — pain "approval-кнопки 2-3 с".
  - [`docs/deploy/console.md`](../deploy/console.md) — Railway env vars + healthcheck.

---

## Context and Problem Statement

`@OpenClaw_sergeant_bot` (host: `apps/console`, ADR-0031) delivers updates via grammy's long-poll loop (`bot.start()` → `getUpdates`). Every approve/reject button tap on a Phase-4 write-tool card (ADR-0036) waits for the next `getUpdates` cycle — measured 2–3 s p95 in production. The lag is end-user-visible: founder taps Approve, the spinner stays for ~2 s, then the bot edits the card. Because grammy uses long-poll-with-timeout (≤ 30 s) Telegram delivers the update in chunks; under load (or on a wake-from-idle Railway container) p99 can hit 5+ s.

Adjacent pains:

1. **Single-instance lock.** Telegram allows only one long-poll consumer per token. `apps/console` redeploys cause the new container's `getUpdates` to crash with `409 Conflict` until the previous slot expires (~30–60 s) — we already mitigated with `STARTUP_409_BASE_DELAY_MS` exponential backoff, but the architecture forbids horizontal scale-out (precondition for ADR-0042 multi-instance failover).
2. **Idle wake cost.** Long-poll keeps a TCP connection open; on a quiet hour the same container could happily run on cheaper resources, but `getUpdates` traffic prevents Railway from autoscaling down to zero.
3. **Approval-loop optimisation.** ADR-0036 pre-computes approval card text at agent-loop time; the bottleneck is now purely `Telegram → bot` round-trip, not local work. Webhook eliminates that bottleneck.

Telegram's webhook delivery pushes updates HTTP POST → bot in 50–250 ms. Combined with `secret_token` header verification (Bot API ≥ 6.0) it gives us defence-in-depth on top of HTTPS without rolling our own auth.

## Considered Options

1. **Webhook hosted in `apps/console` (this Node process).** Add a tiny `node:http` listener that delegates to grammy's `webhookCallback`.
2. **Webhook hosted in `apps/server` (Express).** New route `POST /api/internal/openclaw/webhook/:secret`, then RPC into `apps/console` to dispatch updates to the in-process bot/`ApprovalStore`/`OpenClawSessionStore`.
3. **Telegram Bot API server (self-hosted) running side-by-side.** Run [tdlib's `telegram-bot-api`](https://github.com/tdlib/telegram-bot-api) on Railway, point bot at it for unlimited file size + lower latency.
4. **Status quo (long-poll only).**

## Decision

**Option 1.** Spin up a `node:http` listener inside `apps/console`, mounted on `OPENCLAW_WEBHOOK_PATH` (default `/webhook/openclaw`). Handler is grammy's built-in `webhookCallback(bot, "http", { secretToken })`. Feature-flag is the env-flag `OPENCLAW_USE_WEBHOOK` — default off so local `pnpm console:dev` stays on long-poll without any config gymnastics.

### 1. Modules

- **`apps/console/src/openclaw/webhook.ts`** — `createOpenClawWebhookServer({ bot, path, secretToken, port })` returns `{ start, stop }`. Routes:
  - `GET /healthz` → 200 ok (replaces Railway's old `pgrep`-based healthcheck).
  - `POST $path` → grammy `webhookCallback("http")`. grammy compares `X-Telegram-Bot-Api-Secret-Token` against `secretToken` and returns 401 on mismatch.
  - `else` → 404.
- **`apps/console/src/openclaw/bootstrap.ts`** — pure helpers:
  - `validateWebhookConfig({ url, secretToken })` — enforces https://, ≥ 32 chars, `[A-Za-z0-9_-]+` (Bot API spec). Fails fast with a helpful error before hitting Telegram.
  - `registerOpenClawWebhook(bot, config)` — `bot.api.setWebhook(url, { secret_token, drop_pending_updates: true, allowed_updates: ["message","callback_query"] })`. Idempotent server-side; we always call it on boot (cheaper than `getWebhookInfo` first).
  - `unregisterOpenClawWebhook(bot)` — `bot.api.deleteWebhook({ drop_pending_updates: false })`. Called on long-poll boot so a previous webhook deploy doesn't 409 the new `getUpdates`.
  - `shouldUseWebhook(value)` — fail-closed boolean: only `true | 1 | yes` (case-insensitive, trimmed) flips webhook on.

### 2. Boot logic in `apps/console/src/index.ts`

```
if (shouldUseWebhook(process.env.OPENCLAW_USE_WEBHOOK)) {
  // require OPENCLAW_WEBHOOK_URL + OPENCLAW_WEBHOOK_SECRET + PORT
  await server.start();
  await openclawBot.init();
  await registerOpenClawWebhook(openclawBot, { url, secretToken });
  // block forever; HTTP server keeps the event loop alive
} else {
  await openclawBot.init();
  await unregisterOpenClawWebhook(openclawBot);   // defensive, idempotent
  await startBotWithConflictRetry(openclawBot);   // existing long-poll path
}
```

Long-poll path is byte-for-byte identical to before, plus a defensive `deleteWebhook` so flipping `OPENCLAW_USE_WEBHOOK=true → false` and redeploying just works.

### 3. Env vars (production)

| Name                      | Default             | Required when                | Notes                                                                             |
| ------------------------- | ------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `OPENCLAW_USE_WEBHOOK`    | `false`             | always                       | `true` / `1` / `yes` → webhook; anything else → long-poll. Fail-closed.           |
| `OPENCLAW_WEBHOOK_URL`    | —                   | `OPENCLAW_USE_WEBHOOK=true`  | E.g. `https://sergeant-hubchat.up.railway.app/webhook/openclaw`. Must be `https`. |
| `OPENCLAW_WEBHOOK_SECRET` | —                   | `OPENCLAW_USE_WEBHOOK=true`  | ≥32 chars, `/^[A-Za-z0-9_-]+$/`. Telegram echoes it; mismatch → 401.              |
| `OPENCLAW_WEBHOOK_PATH`   | `/webhook/openclaw` | webhook mode (override only) | Path obscurity; not security on its own.                                          |
| `PORT`                    | (Railway-provided)  | webhook mode                 | Falls back to `OPENCLAW_WEBHOOK_PORT`, then `8080`.                               |

### 4. Rollout / backout

- Merge with flag default-off → no production behaviour change.
- Set Railway env vars on `sergeant-hubchat` service (per `docs/deploy/console.md`).
- Redeploy → `setWebhook` runs once → bot delivers via webhook.
- Verify approval-button p95 latency in PostHog / manual smoke (<500 ms).
- **Backout:** unset `OPENCLAW_USE_WEBHOOK` and redeploy. `unregisterOpenClawWebhook` runs idempotently and bot is back on long-poll. Healthcheck path must also be reverted from `/healthz` to the `pgrep` command, otherwise the long-poll container fails healthcheck and Railway kills it.

### 5. Production rollout (2026-05-03 21:26 UTC)

Activated on Railway service `sergeant-hubchat` (project `humorous-eagerness`, environment `production`):

- `serviceDomainCreate` → `sergeant-hubchat-production.up.railway.app:8080` (no domain previously since long-poll did not need one).
- `variableUpsert × 3` → `OPENCLAW_USE_WEBHOOK=true`, `OPENCLAW_WEBHOOK_URL=https://sergeant-hubchat-production.up.railway.app/webhook/openclaw`, `OPENCLAW_WEBHOOK_SECRET=<48-char hex>`.
- `serviceInstanceUpdate` → `healthcheckPath=/healthz`.
- `serviceInstanceRedeploy` (explicit, to migrate state cleanly).

Verification matrix (all green at 21:30 UTC):

| Check                                                          | Result                                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway deploy `74e6148c`                                      | SUCCESS                                                                                                                                                              |
| Bot logs                                                       | `OpenClaw starting in webhook mode on :8080/webhook/openclaw…` + `[openclaw] webhook registered with Telegram`                                                       |
| Telegram `getWebhookInfo`                                      | `url=https://sergeant-hubchat-production.up.railway.app/webhook/openclaw`, `secret_token` set, `allowed_updates=[message, callback_query]`, `pending_update_count=0` |
| `GET /healthz`                                                 | `200 ok`                                                                                                                                                             |
| `POST /webhook/openclaw` без `X-Telegram-Bot-Api-Secret-Token` | `401 secret token is wrong`                                                                                                                                          |
| `POST /webhook/openclaw` з вірним секретом                     | `200`                                                                                                                                                                |
| `GET /foo`                                                     | `404`                                                                                                                                                                |

#### Initial long-poll → webhook race (one-shot)

First activation hit a one-time race:

1. New container booted in webhook mode → `setWebhook` succeeded (visible in logs).
2. Old long-poll container, mid-graceful-shutdown, made one final `getUpdates` call. Telegram treats `getUpdates` as an implicit "I am polling, drop the webhook" signal — it cleared the registered URL server-side.
3. `getWebhookInfo` returned `url=""` despite logs claiming success.

**Workaround applied:** after the `OPENCLAW_USE_WEBHOOK=true` redeploy reported SUCCESS, manually re-issued `setWebhook` via Bot API curl, then triggered a follow-up `serviceInstanceRedeploy`. Subsequent webhook → webhook redeploys are stable because the new webhook-mode container never calls `getUpdates`, so Telegram-side state is preserved across deploys.

**W4.1 hardening (backlog):** add a poll-and-retry loop in `registerOpenClawWebhook` — after `setWebhook` succeeds, call `getWebhookInfo`, compare `url` against the configured one, and re-`setWebhook` with backoff (max 3 attempts) on mismatch. Eliminates the manual step on future long-poll → webhook migrations of other bots and on accidental re-activations of long-poll behaviour.

## Rationale

**Option 1 vs Option 2 (host in `apps/server`).** OpenClaw's stateful bits (`ApprovalStore`, `OpenClawSessionStore`, `RateLimiter`, agent-loop budget) live in-process inside `apps/console`. Putting the webhook in `apps/server` would require either cross-service IPC (extra failure mode) or duplicating those structures (consistency hazard). Latency is also strictly better one-hop: Telegram → Railway edge → `apps/console`, no internal fan-out. We pay for it with one new HTTP listener inside the console process — small surface, no new deps (grammy + `node:http`).

**Option 1 vs Option 3 (self-hosted Bot API server).** Self-hosted Bot API server unlocks 2 GB file uploads and removes the 30 MB media limit — neither is an OpenClaw need today (we send <2 KB cards). Operationally it adds another always-on container plus its own Postgres. Premature.

**Option 1 vs Option 4 (status quo).** Status quo keeps a 2–3 s lag we have explicit roadmap pain on (W4 / 3.5) and forecloses ADR-0042 (multi-instance failover for the same process — long-poll allows only one consumer per token).

## Consequences

### Positive

- Approval-button latency 2–3 s → <500 ms p95.
- Removes single-consumer-per-token constraint → unlocks ADR-0042 (advisory-leader failover) without further changes here.
- Healthcheck moves from `pgrep` (process-presence only) to `GET /healthz` (process is up AND HTTP loop is responsive).

### Negative

- New public endpoint to operate (TLS via Railway edge; secret-token verification mandatory). Compromise of the secret means an attacker can post fake updates — defence-in-depth via path obscurity, but the secret is the real boundary.
- Two boot paths (long-poll vs webhook) means double the surface for "OpenClaw didn't start" tickets. We mitigate with explicit log lines (`OpenClaw starting in webhook mode on …` vs `OpenClaw starting in long-poll mode…`) and the same fail-closed env validation.
- Webhook mode requires a stable HTTPS hostname. Railway preview environments don't have one by default; preview deploys must keep `OPENCLAW_USE_WEBHOOK=false` (which is the default — no action needed).

### Neutral

- Approval card UI, write-tool execution path, audit log, tone selector, persona system — untouched. This ADR is purely transport.
- `@Sergeant_alert_bot` (`apps/console`-external; pushed-to via n8n) does not poll Telegram and is unaffected.

## Compliance

- Vitest suites in `apps/console/src/openclaw/webhook.test.ts` (HTTP server end-to-end: 401 on missing/wrong secret, 200 + dispatch on valid, `/healthz`, 404).
- Vitest suites in `apps/console/src/openclaw/bootstrap.test.ts` (validation guards, `setWebhook` / `deleteWebhook` arguments, fail-closed flag parsing).
- `docs/deploy/console.md` lists all required env vars and the new `GET /healthz` Railway healthcheck.
- governance-sync CI keeps this ADR linked from `docs/launch/openclaw-roadmap.md` §3.5.

## Links

- [`apps/console/src/openclaw/webhook.ts`](../../apps/console/src/openclaw/webhook.ts) — HTTP server.
- [`apps/console/src/openclaw/bootstrap.ts`](../../apps/console/src/openclaw/bootstrap.ts) — set/delete webhook + flag parsing.
- [`apps/console/src/index.ts`](../../apps/console/src/index.ts) — boot-time mode selection.
- grammy [`webhookCallback("http")`](https://grammy.dev/guide/deployment-types#webhooks) docs — adapter for Node's native `http`.
- Telegram Bot API [`setWebhook`](https://core.telegram.org/bots/api#setwebhook) — `secret_token`, `allowed_updates`, `drop_pending_updates`.

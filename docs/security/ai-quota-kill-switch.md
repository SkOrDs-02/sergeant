# AI quota kill-switch policy

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Active

## TL;DR

`AI_QUOTA_DISABLED=true` (or `=1`) globally disables `assertAiQuota()` —
every per-user / per-IP daily limit becomes a no-op and the AI subsystem
runs without consulting `ai_usage_daily`. **In production this is
hard-blocked at startup.** The flag exists exclusively for CI/test
environments where end-to-end suites need to call the real Anthropic API
without burning real user quota.

## Why a kill-switch exists

Nightly Playwright e2e suites (`.github/workflows/extended-e2e.yml`,
`visual-regression.yml`, `ci.yml`) talk to the real Anthropic API to
exercise the full chat / coach / nutrition flows end-to-end. Counting
those calls against the per-IP `AI_DAILY_ANON_LIMIT=40` would either:

1. Make the tests flaky (they would 429 themselves after a few runs in
   the same window), or
2. Force the tests to share a real user account whose quota would be
   trivially exhausted by repeated CI runs.

The simplest fix is to wholesale disable the quota subsystem when the
env reports `NODE_ENV=test`. The runtime check
(`isAiQuotaDisabled()` in `apps/server/src/modules/chat/aiQuota.ts`)
short-circuits before the `pool.query` UPSERT into `ai_usage_daily`, so
the tests can hammer Anthropic without hitting any per-day cap.

## Why production is hard-blocked

`AI_QUOTA_DISABLED` in production is a fail-open kill-switch on billing.
Once it's true, `effectiveLimits()` returns `{ user: null, anon: null }`,
`assertAiQuota()` returns `true` unconditionally, no `ai_usage_daily`
row gets touched, and there is **no other gate** between an authenticated
user and Anthropic.

A single misconfigured Railway secret (copy-pasted from the staging or
test environment, dropped in by a helm-chart typo, or smuggled in via
`RAILWAY_ENVIRONMENT=production` + a `.env.local` left over from local
debugging) lets any client burn unlimited Anthropic budget. There is no
per-user cost cap below the quota, and the upstream Anthropic budget
guard is account-wide — by the time the alert fires, the damage is
already done.

The previous safeguard was an advisory `logger.warn` that fired once at
module import. In practice that warning was indistinguishable from any
of the dozens of legitimate "X is not configured" warnings during
production boot, and nobody saw it on staging when it shipped. Replacing
the advisory log with a startup throw means a misconfigured deploy
**refuses to boot** rather than silently leaking budget — the misconfig
is caught by the Railway crash-loop alert instead of by the next billing
cycle.

## Where the hard-block lives

Source of truth: `apps/server/src/env/env.ts` → `assertStartupEnv()`.

```ts
// Validated env exposes AI_QUOTA_DISABLED as a boolean (default false).
AI_QUOTA_DISABLED: z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1"),

// In assertStartupEnv():
if (isProduction && env.AI_QUOTA_DISABLED) {
  throw new Error(
    "AI_QUOTA_DISABLED MUST NOT be set in production. …",
  );
}
```

`isProduction` covers both `NODE_ENV=production` **and** any
`RAILWAY_ENVIRONMENT` / `RAILWAY_SERVICE_NAME` value being set. The
latter two cover the case where Railway boots the server without
`NODE_ENV` explicitly set to production — which is the default for
service deployments.

`assertStartupEnv()` is invoked from `apps/server/src/index.ts` before
the HTTP listener binds, so a tripped check produces an unrecoverable
boot error and the process exits non-zero.

## Allowed configurations

| Environment                        | `AI_QUOTA_DISABLED` | Behaviour                               |
| ---------------------------------- | ------------------- | --------------------------------------- |
| Local dev (`NODE_ENV=development`) | `false` (default)   | Quota active, normal per-day limits     |
| Local dev (`NODE_ENV=development`) | `true` / `1`        | Allowed — quota disabled                |
| CI (`NODE_ENV=test`)               | `true` / `1`        | Allowed — quota disabled                |
| Production (`NODE_ENV=production`) | `false` (default)   | Quota active, normal per-day limits     |
| Production (`NODE_ENV=production`) | `true` / `1`        | **Hard-block** — server refuses to boot |
| Railway (`RAILWAY_ENVIRONMENT=*`)  | `true` / `1`        | **Hard-block** — server refuses to boot |

## Test coverage

`apps/server/src/env/__tests__/assertStartupEnv.test.ts` — full matrix
covering:

- Production + truthy spelling (`true`, `1`) → throws.
- Production via Railway env (`RAILWAY_ENVIRONMENT`,
  `RAILWAY_SERVICE_NAME`) without `NODE_ENV=production` → throws.
- Production + falsy spelling (`false`, `0`, unset) → does not throw.
- `NODE_ENV=test` + `AI_QUOTA_DISABLED=true` → does not throw.
- `NODE_ENV=development` + `AI_QUOTA_DISABLED=1` → does not throw.

`apps/server/src/modules/chat/aiQuota.test.ts` — runtime behaviour of
`assertAiQuota()` and `consumeToolQuota()` when the flag is set; these
tests use `process.env.AI_QUOTA_DISABLED = "1"` directly so each case
mutates the runtime state without re-importing `env.js`.

## Operational guidance

### When you need to disable the quota subsystem in a non-test env

If something pathological is happening with `ai_usage_daily` (corrupt
rows, stuck row-locks, runaway upsert errors) and you genuinely need to
disable the quota subsystem in production while you fix it:

1. Acknowledge that this exposes the Anthropic budget. Decide whether
   to hard-pause AI routes at the gateway / feature flag instead — that
   is the safer alternative.
2. If you still need to flip the flag, **un-set** `RAILWAY_ENVIRONMENT`,
   `RAILWAY_SERVICE_NAME`, **and** set `NODE_ENV=development` for the
   affected service. The service will boot but will be visibly
   misconfigured (Sentry / metrics / `BETTER_AUTH_TOKEN_ENC_KEY`
   warnings will surface).
3. Document the reason in an incident ticket and remove the override
   immediately after.

### What to monitor

- Railway boot crash-loop alerts (`Error: AI_QUOTA_DISABLED MUST NOT be
set in production`) — fires the moment the misconfig hits.
- Anthropic billing dashboard daily spend — secondary signal if the
  hard-block is somehow bypassed.
- `ai_quota_blocks_total` (Prometheus counter) — sustained zero in
  production while traffic is non-zero is a smoke signal.

## Related docs

- ADR-0042 — `docs/adr/0042-password-hashing-strategy.md` (similar
  fail-closed pattern for bcrypt 72-byte cap).
- `docs/security/rate-limit-failure-mode.md` — same fail-closed mental
  model for `/api/auth/*`.
- `docs/planning/stack-pulse-2026-05/pr-15-ai-quota-disabled-hardblock.md`
  — original plan record.

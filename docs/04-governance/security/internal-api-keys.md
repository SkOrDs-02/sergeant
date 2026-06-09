# `INTERNAL_API_KEY` — rotation, audit & revocation runbook

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Scaffolded.
> **Owner:** ops + server.
> **Related:** [`api-internal-hmac.md`](./api-internal-hmac.md), [`secret-ownership-register.md`](./secret-ownership-register.md), [`secret-rotation.md`](./secret-rotation.md), [`docs/90-work/initiatives/stack-pulse-2026-05/pr-27-internal-api-key-rotation.md`](../../90-work/initiatives/stack-pulse-2026-05/pr-27-internal-api-key-rotation.md).

> **Scaffolded, not live.** Today `INTERNAL_API_KEY` is a single shared bearer secret with **no** rotation tooling, **no** TTL, and **no** per-call audit. This runbook documents the _current_ manual procedure that works now, plus the _planned_ `internal_api_keys` table + `/internal-key` CLI from stack-pulse PR-27. Sections tagged **(planned — not yet live)** describe behaviour that does not exist in the codebase yet; update this doc to remove the tags after the implementing PR merges.

## Why

`INTERNAL_API_KEY` is the single shared secret guarding every `/api/internal/*` route. Anyone who exfiltrates it (an n8n debug log, a CI env-var leak, an accidental `console.log` in a Function node) can forge requests as a trusted internal caller. HMAC signing ([`api-internal-hmac.md`](./api-internal-hmac.md)) adds a second factor, but the bearer itself is still:

- **One key for all consumers** — a single rotation event breaks every consumer at once.
- **TTL-less** — it never expires on its own.
- **Un-audited** — there is no record of which caller used the key, or when, so a suspected leak can't be scoped without a full env/log search.

## Current architecture (what exists today)

The bearer is defined once and consumed by a single shared guard:

- **Definition:** `apps/server/src/env/env.ts` → `INTERNAL_API_KEY: stringWithDefault("")` (re-exported via `apps/server/src/env.ts`).
- **Guard:** `apps/server/src/routes/internal/index.ts` mounts two middleware on `/api/internal/*`, in order:
  1. Constant-time bearer compare — `safeStringEqual(authHeader, \`Bearer ${INTERNAL_API_KEY}\`)`. **Fail-closed:** `503 "Internal API not configured"`if the key is unset;`401 "Unauthorized"` on mismatch. Constant-time (`crypto.timingSafeEqual`) so a naive `!==` can't leak the secret one byte at a time via branch timing.
  2. `verifyWebhookSignature()` — HMAC-SHA256, a no-op when `WEBHOOK_HMAC_SECRET` is empty (grace mode by default). See [`api-internal-hmac.md`](./api-internal-hmac.md).

**There is no per-route ACL and no per-key identity.** Every sub-router mounted in `index.ts` sits behind the same bearer; any holder reaches the entire internal surface.

### Consumer surfaces (the four families)

All four consume the same shared bearer via the `index.ts` guard (PR-27 §Context):

| Consumer route group        | File                                                                   | What it serves                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin / internal operations | `apps/server/src/routes/internal/index.ts` (+ all mounted sub-routers) | the shared guard + all `/api/internal/*` sub-surfaces                                                                                                                             |
| Monobank webhook intake     | `apps/server/src/routes/internal/mono.ts`                              | payment webhook callbacks                                                                                                                                                         |
| OpenClaw bot callback       | `apps/server/src/routes/internal/openclaw.ts`                          | 57 read/write/ritual/n8n/mute/reminder/seo routes (see [`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`](../../90-work/audits/2026-08-XX-openclaw-internal-roast.md)) |
| Sentry alerts router        | `apps/server/src/routes/internal/alerts.ts`                            | alert post / ack / escalate                                                                                                                                                       |

> n8n workflows (`ops/n8n-workflows/*`) are the largest external consumer of the bearer — ~25 workflows send `Authorization: Bearer <INTERNAL_API_KEY>` (see the HMAC rollout playbook). They are not a server route but must be re-pointed on every rotation.

### Secret ownership

`INTERNAL_API_KEY` is owned by the **Founder**, stored in Railway prod env (and local `.env` / CI where needed), per the [secret-ownership register](./secret-ownership-register.md). It is **not** yet broken out as its own register row — it currently rides under the general internal/auth secret groups. When PR-27 lands, add a dedicated register row (owner, storage, consumers, rotation cadence, blast radius).

## Manual rotation (works today — no tooling)

Because it is a single shared secret, a rotation is a coordinated, brief-downtime update. Do it during a low-traffic window. Cross-reference [`secret-rotation.md`](./secret-rotation.md) for the general rotation procedure.

1. **Generate** a new key: `openssl rand -hex 32`.
2. **Set** the new value as `INTERNAL_API_KEY` on the **server** Railway env (this is the source of truth the guard compares against). Redeploy.
3. **Update every consumer** to send the new bearer, in lockstep:
   - n8n: the ~25 `INTERNAL_API_KEY`-using workflows (set `INTERNAL_API_KEY` on the n8n Railway env; see [`api-internal-hmac.md`](./api-internal-hmac.md) for the workflow list pattern).
   - `tools/openclaw` / `packages/openclaw-plugin`: the OpenClaw Gateway service env.
   - Monobank webhook secret config, if it references this key.
4. **Verify** internal traffic recovers: watch `401` rate on `/api/internal/*` in Grafana / Sentry. A spike means a consumer wasn't updated.
5. If compromise is suspected, also rotate `WEBHOOK_HMAC_SECRET` per [`api-internal-hmac.md`](./api-internal-hmac.md) so a captured signature is invalidated immediately (the 5-minute replay window means a leaked signature is useless after a few minutes regardless).

> The current single-secret model has **no dual-key overlap**: there is a brief window between steps 2 and 3 where un-updated consumers get `401`. Keep the window short and do it off-peak. Per-name dual-key rotation arrives with PR-27 (below).

## Planned: `internal_api_keys` table + per-name keys (planned — not yet live)

PR-27 replaces the single shared secret with named, scoped, TTL'd keys stored hashed in Postgres. **None of this exists in the codebase yet.** Summary of the design (full detail in [PR-27](../../90-work/initiatives/stack-pulse-2026-05/pr-27-internal-api-key-rotation.md)):

- **`internal_api_keys` table** — `key_hash` (bcrypt), unique `name` (`mono-webhook` / `n8n-alerts` / `openclaw-callback` / `admin-cli` / `bootstrap`), `scopes TEXT[]`, mandatory `expires_at` TTL, `created_by`, `last_used_at`, `revoked_at`.
- **Hash-based lookup middleware** — the current `apps/server/src/http/requireInternalIp.ts`, renamed to `requireInternalApiKey.ts`: header `X-Internal-Api-Key: <raw-key>`, `bcrypt.compare` against the active row for the expected `name`, update `last_used_at` (throttled — only if `now - last_used > 60s`).
- **Dual-key rotation** — multiple non-revoked rows may share a `name`; both valid for 24h, then revoke the old via CLI. This removes the downtime window the manual procedure has today.
- **Bootstrap compatibility** — the env `INTERNAL_API_KEY` stays valid as a `name='bootstrap'` row with a 30-day expiry; drop the env var only after all consumers migrate.
- **Sentry tagging** — `internal_key_name` tag on every internal request, so a leak can be scoped to one named key and revoked with minimal blast radius.

## Planned: `/internal-key` CLI (planned — not yet live)

PR-27 adds a `/internal-key` command group to the OpenClaw Telegram bot (`tools/openclaw/src/agents/ops/internalKey.ts`), gated by the `ops` role. **These commands are stubs in this doc — they are not implemented yet.** Update this section to remove the "planned" tag once the implementing code merges.

| Command                                           | Purpose (planned)                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/internal-key list`                              | List active keys — `name`, `expires_at`, `last_used_at` (no raw values).                       |
| `/internal-key create <name> <ttl-days> <scopes>` | Generate a new key; return the raw value **once** (never stored in plaintext, never re-shown). |
| `/internal-key revoke <name\|id>`                 | Set `revoked_at = NOW()` on a key.                                                             |
| `/internal-key audit <since>`                     | Usage stats since a date — per-key `last_used_at` / call counts for leak triage.               |

Planned rotation with dual-key (once live):

1. `/internal-key create <name> <ttl> <scopes>` → capture the raw key once.
2. Update that one consumer to send the new key (both old and new valid for 24h).
3. Confirm the consumer's calls succeed (Sentry `internal_key_name` tag shows the new key).
4. `/internal-key revoke <name|id>` on the old key.

## Revocation / incident response

**Today (manual):** there is no targeted revocation — a compromised `INTERNAL_API_KEY` requires a full rotation (all consumers) per the manual procedure above. Rotate `WEBHOOK_HMAC_SECRET` alongside it.

**After PR-27 (planned):** `internal_key_name` Sentry tagging + `/internal-key audit` let you scope the leak to one named key and `/internal-key revoke` it with minimal blast radius — the other consumers keep working.

## See also

- HMAC signing (defence-in-depth on top of the bearer): [`api-internal-hmac.md`](./api-internal-hmac.md)
- General secret rotation: [`secret-rotation.md`](./secret-rotation.md)
- Secret ownership / blast radius: [`secret-ownership-register.md`](./secret-ownership-register.md)
- Source design: [`docs/90-work/initiatives/stack-pulse-2026-05/pr-27-internal-api-key-rotation.md`](../../90-work/initiatives/stack-pulse-2026-05/pr-27-internal-api-key-rotation.md)
- OpenClaw internal-route surface (audit): [`docs/90-work/audits/2026-08-XX-openclaw-internal-roast.md`](../../90-work/audits/2026-08-XX-openclaw-internal-roast.md)
- Guard implementation: `apps/server/src/routes/internal/index.ts`
- [OWASP API Security — Broken Authentication](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/)

# ADR-0055: OpenClaw External Gateway — Phase 0 infra + Phase 7 cutover

> **Last validated:** 2026-05-11 by claude/review-openclaw-migration-HSeEx. **Next review:** 2026-08-11.
> **Status:** Active

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @Skords-01
- **Supersedes:** [ADR-0031](./0031-openclaw-v0-telegram-cofounder.md), [ADR-0036](./0036-openclaw-write-tools-with-approval.md), [ADR-0041](./0041-openclaw-telegram-webhook.md)
- **Related:**
  - [ADR-0027 — OpenClaw / Console / MCP policy](./0027-openclaw-console-mcp-policy.md) — security policy (allowlist, fail-closed).
  - [ADR-0033 — OpenClaw multi-personas and council](./0033-openclaw-multi-personas-and-council.md)
  - [ADR-0037 — OpenClaw write-audit persistence](./0037-openclaw-write-audit-persistence.md) — server-side write-audit (remains Active).
  - [`docs/planning/openclaw-migration-plan.md`](../planning/openclaw-migration-plan.md) — full 18 Locked decisions + PR-A…PR-F tracker.

---

## Context and Problem Statement

The internal Telegram co-founder bot (`tools/openclaw/src/openclaw/`, ADR-0031) is a bespoke Node.js grammy long-poll process running as Railway service `sergeant-openclaw`. It covers one channel (Telegram) and one persona (co-founder). Growing product needs drove three sequential decisions:

- **ADR-0031** — initial OpenClaw v0 Telegram bot, single persona, read-only tools.
- **ADR-0036** — write-tools with founder-approval flow (Telegram inline-keyboard UX).
- **ADR-0041** — migration from long-poll to Telegram webhook to reduce latency and Railway idle cost.

By 2026-05 the internal implementation had accumulated 10 personas, council round-table, 25 tools, shortcut router, cheap-router, and a plugin architecture (`packages/openclaw-plugin/`). Maintaining parity with the open-source OpenClaw Gateway (25k+ LoC, 370k+ GitHub stars, MIT) was no longer feasible in-house.

## Considered Options

1. **Continue internal bot** — maintain the grammy-based implementation; add channels (WhatsApp, Slack) manually. High ongoing cost; blocks multi-channel roadmap.
2. **Replace entirely with OpenClaw Gateway** — migrate `tools/openclaw/src/openclaw/` → external OpenClaw Gateway + `@sergeant/openclaw-plugin`. Full feature set: 25+ channels, voice, multi-model, Canvas UI, community plugins.
3. **Hybrid: keep grammy fallback, add Gateway** — deploy Gateway on a new bot-identity (`@OpenClaw_sergeant_v2_bot`); keep grammy on `@OpenClaw_sergeant_bot` undisturbed as fallback. Phase 6.5 parallel run for ≥1 week before cutover.

## Decision

**Option 3** — identity-based cutover with grammy fallback.

Concretely:

- **New Railway service** `sergeant-openclaw-gateway` in the same Railway project as `apps/server`. Persistent volume 5 GB on `~/.openclaw` (Locked decision #1).
- **Container**: `Dockerfile.openclaw-gateway` (Node 24-alpine, single-stage — plugin runs as TypeScript source via OpenClaw runtime, no build step). Config via `railway.openclaw-gateway.toml`.
- **Plugin**: `@sergeant/openclaw-plugin` (`packages/openclaw-plugin/`) — thin TypeScript bridge over existing `/api/internal/openclaw/*` server endpoints.
- **Config-as-code**: `ops/openclaw/` — `openclaw.example.json`, `skills/`, `cheap-router.system.md`, `n8n-allowlist.json`. Copied to `~/.openclaw/` by `docker-entrypoint.sh` on every container start; persistent auth state (Telegram webhook, WhatsApp session) not overwritten.
- **New bot-identity**: `@OpenClaw_sergeant_v2_bot` (separate Telegram bot token `OPENCLAW_GATEWAY_BOT_TOKEN`). Founder switches DMs to the new bot after Phase 6.5 parity window.
- **Grammy fallback**: `@OpenClaw_sergeant_bot` on `sergeant-openclaw` Railway service stays running, undisturbed. No feature-flag flip in `tools/openclaw`. Removal is gated behind Locked decision #17 (reminder +28 days post cutover-day).
- **OpenClaw version pin**: latest stable tag at Phase 0 deploy date (Locked decision #2); weekly Renovate PR with manual review, no auto-merge.
- **Hard Rule #20 preserved**: no `OPENCLAW_GITHUB_PAT` / `Git_PAT` in production; `assertStartupEnv()` blocks server startup if present.

## Rationale

Option 3 de-risks the cutover by keeping grammy undisturbed. If the new Gateway bot has issues during Phase 6.5 the founder simply continues using `@OpenClaw_sergeant_bot`. The identity-based split (not a feature flag) means zero code change needed to revert.

The single-stage Docker image is possible because `openclaw.plugin.json` sets `"entry": "./src/index.ts"` — the OpenClaw runtime loads TypeScript source directly. No `build` script exists in `packages/openclaw-plugin/package.json`. This keeps the image simpler and avoids a pnpm build context.

## Consequences

### Positive

- 25+ channels (WhatsApp, Slack, Discord, Signal, iMessage, voice) available post Phase 8 pairing.
- All 18 locked decisions (team shape, cost caps, n8n tiers, approval variant, council sequence) preserved in Gateway architecture.
- External Gateway receives upstream security patches without internal effort.
- Config-as-code pattern (`ops/openclaw/`) makes prompt and skill changes reviewable via PR + container restart — no plugin release needed.

### Negative

- New external dependency: OpenClaw npm package must be pinned and upgraded deliberately (Renovate with manual review).
- Phase 6.5 (≥1 week parallel run) is a manual observation period — not automated.
- Grammar fallback consumes Railway resources until Locked decision #17 cleanup is executed.

### Neutral

- Server-side write-audit (`openclaw_invocations`, ADR-0037) unchanged — remains Active.
- CI pipeline unchanged; no new TS files in this PR-F, no new typecheck surface.
- `docs/architecture/service-catalog.md` updated in PR-F to include `sergeant-openclaw-gateway`.

## Compliance

- `Dockerfile.openclaw-gateway` specifies Node 24-alpine base image per migration plan prerequisites.
- `ops/openclaw/docker-entrypoint.sh` copies all config-as-code files; does not overwrite auth state subdirs.
- `railway.openclaw-gateway.toml` sets `restartPolicyType = "ON_FAILURE"` and `restartPolicyMaxRetries = 10`.
- `docs/playbooks/rotate-openclaw-credentials.md` updated with `OPENCLAW_GATEWAY_BOT_TOKEN` rotation section.
- ADR-0031, ADR-0036, ADR-0041 marked `Superseded by ADR-0055`.

## Links

- [PR-F](https://github.com/Skords-01/Sergeant/pulls) — this ADR ships in PR-F.
- [#2382](https://github.com/Skords-01/Sergeant/pull/2382) PR-A — migration plan v3.1 + 18 locked decisions.
- [#2385](https://github.com/Skords-01/Sergeant/pull/2385) PR-B — Phase 0.5 PoC spike.
- [#2419](https://github.com/Skords-01/Sergeant/pull/2419) PR review/fix — morning-digest skill, cheap-router externalisation, rollback section update.
- [`docs/planning/openclaw-migration-plan.md`](../planning/openclaw-migration-plan.md) — full plan with locked decisions and PR tracker.

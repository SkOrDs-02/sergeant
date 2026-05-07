# PR-35: `LOG_LEVEL=info` default + 5-min debug-window toggle

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                              |
| ------------------ | ---------------------------------------------------------------------------- |
| **Severity**       | Low (L8)                                                                     |
| **Linked finding** | L8 (`00-overview.md`)                                                        |
| **Owner**          | TBD (sponsor: @Skords-01)                                                    |
| **Effort**         | 0.5 дня                                                                      |
| **Risk**           | Low (logging policy зміна; не міняє runtime behavior)                        |
| **Touches**        | `apps/server/src/obs/logger.ts`, `apps/server/src/env/env.ts`, `tools/console` |
| **Trigger**        | next debugging session коли `LOG_LEVEL=debug` потрібно тимчасово              |

## Контекст

`apps/server/src/obs/logger.ts` (Pino) читає `LOG_LEVEL` з `env`. Поточний default — varies (audit згадував `info` у prod, але dev sometimes має `debug` env-var-style override).

Issue: переключення на `debug` для troubleshooting вимагає:
1. Railway env-var update.
2. Server restart.
3. Manual rollback після debug session-у.
4. Risk залишити `LOG_LEVEL=debug` у prod (cost-multiplier: log-storage 10×).

## Scope

### 1. Default-floor

`apps/server/src/env/env.ts`:

```ts
LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"])
  .default("info")
  .describe("Floor log level. Use /debug-window CLI to temporarily lower."),
```

Production explicit `info`, dev — `debug`.

### 2. Runtime debug-window

`apps/server/src/obs/logger.ts`:

```ts
let debugUntil: number | null = null;

export function enableDebugWindow(durationMs: number, requestedBy: string) {
  debugUntil = Date.now() + durationMs;
  log.info({ requestedBy, durationMs }, "Debug window enabled");
}

export function currentLogLevel(): string {
  if (debugUntil && Date.now() < debugUntil) return "debug";
  return process.env.LOG_LEVEL ?? "info";
}
```

Pino `level()` setter dynamically swap-ається на check.

### 3. CLI command

`tools/console` Telegram bot:

- `/debug-window 5m` — enable for 5 хв (max 30 хв).
- `/debug-window-status` — show remaining.
- Sentry breadcrumb на enable + audit-log у `internal_api_keys` table (якщо PR-27 зроблений).

### 4. Auto-revert + Sentry alert

Якщо `debugUntil > now + 30min` (someone bypassed CLI) → Sentry alert «debug window > 30min».

### 5. Tests

`apps/server/src/obs/__tests__/logger-debug-window.test.ts`:
- enable → currentLogLevel === "debug"
- after timeout → currentLogLevel === "info"
- max-duration enforcement.

## Out of scope

- Per-route LOG_LEVEL (log only `food-search` debug-level) — окремий PR.
- Web client log-level — окремий PR.

## Acceptance criteria (DoD)

- [ ] `apps/server/src/env/env.ts` LOG_LEVEL default `info`.
- [ ] `apps/server/src/obs/logger.ts` має `enableDebugWindow()` + Pino dynamic-level swap.
- [ ] `tools/console` `/debug-window` command з role-check `ops`.
- [ ] Auto-revert + Sentry alert на >30min window.
- [ ] Tests pass.
- [ ] `docs/observability/log-levels.md` documenting policy.

## Тести

- Unit: enable, expire, max-duration.
- Integration: `tools/console` CLI command.
- Manual: trigger 5min window, verify logs у Datadog.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                                              | Mitigation                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| Memory leak від dynamic-level (each call creates new Pino child)   | Use root-level setter `pino.level = "debug"` (in-place mutation) |
| Operator забуває revert → cost spike                              | Hard-cap 30min + Sentry alert + auto-revert                    |

## Touchpoints (file:line)

- `apps/server/src/env/env.ts` — LOG_LEVEL field
- `apps/server/src/obs/logger.ts` — Pino instance + debug-window logic
- `tools/console/src/agents/ops/debugWindow.ts` — new
- `apps/server/src/obs/__tests__/logger-debug-window.test.ts` — new
- `docs/observability/log-levels.md` — new

## Refs

- [Pino dynamic level](https://github.com/pinojs/pino/blob/master/docs/api.md#loggerlevel)
- [Sentry log-level cost analysis](https://sentry.io/pricing/)

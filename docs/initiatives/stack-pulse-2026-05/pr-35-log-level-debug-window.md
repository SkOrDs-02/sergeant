# PR-35: `LOG_LEVEL=info` default + 5-min debug-window toggle

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Partially closed (server-side merged via PR [#2423](https://github.com/Skords-01/Sergeant/pull/2423), commit [`264288ec`](https://github.com/Skords-01/Sergeant/commit/264288ec)); `tools/openclaw` `/debug-window` CLI винесено у follow-up (див. нижче).

|                    |                                                                                 |
| ------------------ | ------------------------------------------------------------------------------- |
| **Severity**       | Low (L8)                                                                        |
| **Linked finding** | L8 (`00-overview.md`)                                                           |
| **Owner**          | TBD (sponsor: @Skords-01)                                                       |
| **Effort**         | 0.5 дня                                                                         |
| **Risk**           | Low (logging policy зміна; не міняє runtime behavior)                           |
| **Touches**        | `apps/server/src/obs/logger.ts`, `apps/server/src/env/env.ts`, `tools/openclaw` |
| **Trigger**        | next debugging session коли `LOG_LEVEL=debug` потрібно тимчасово                |

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

`tools/openclaw` Telegram bot:

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

- [x] `apps/server/src/env/env.ts` LOG_LEVEL — `z.enum(["fatal","error","warn","info","debug","trace"]).default("info")` (рядок 440–443).
- [x] `apps/server/src/obs/logger.ts` має `enableDebugWindow(durationMs, requestedBy)` + `disableDebugWindow()` + `debugWindowRemainingMs()` + `currentLogLevel()`; динамічний swap через `setInterval(…, 5_000).unref()` (in-place `logger.level = newLevel`, без child-Pino, без memory-leak ризик-у).
- [x] Auto-revert + 30-min hard ceiling — `DEBUG_WINDOW_MAX_MS = 30 * 60 * 1000` у `logger.ts`; `Math.min(durationMs, DEBUG_WINDOW_MAX_MS)` при enable.
- [x] Tests pass — `apps/server/src/obs/__tests__/logger-debug-window.test.ts` (7 кейсів: базовий level / enable → debug / expire → base / `debugWindowRemainingMs` поведінка / 30-min cap / `disableDebugWindow` clears).
- [x] [`docs/observability/log-levels.md`](../../observability/log-levels.md) — production-`info` / dev-`debug` policy + Telegram `/debug-window` UX.
- [ ] `tools/openclaw` `/debug-window` command з role-check `ops` — **deferred** у follow-up (див. "Follow-up scope" нижче).
- [ ] Sentry alert на >30 хв window — **не потрібно** без CLI-bypass: 30-min hard ceiling уже не дає ввімкнути більше (`enableDebugWindow` clamp); ре-оцінити при CLI follow-up-і якщо в CLI буде retry-loop з 'continuous-debug' патерном.

## Follow-up scope (CLI)

`tools/openclaw` (OpenClaw DM bot) додавання `/debug-window` вимагає всіх п'яти хуків grammy + внутрішнього API:

1. Реєстрація команд у [`tools/openclaw/src/openclaw/commands.ts`](../../../tools/openclaw/src/openclaw/commands.ts) — `/debug-window`, `/debug-window-status`.
2. Handler-и у [`tools/openclaw/src/openclaw/handler-commands.ts`](../../../tools/openclaw/src/openclaw/handler-commands.ts) з `isFounderAllowed` + `isPrivateChat` гейтами.
3. Internal endpoint у `apps/server/src/routes/internal/debug-window.ts` з `requireInternalApiKey` (PR-27 вже merged) + виклик `enableDebugWindow`/`disableDebugWindow`.
4. Синхронний audit-рядок у `internal_api_keys` table (PR-27 dependency).
5. Unit-test grammy handler-ів + e2e через mock-и `postJson`.

Чекає першого реального debug-incident-у як trigger (раніше ніж як quarterly ревію). Сервер-сайд вже працює — оператор може manually викликнути `enableDebugWindow` через SSH/REPL в надзвичайних випадках.

## Тести

- Unit (мерджені): `apps/server/src/obs/__tests__/logger-debug-window.test.ts` — enable → debug, expire → base, 30-min cap, `disableDebugWindow` clears window, `debugWindowRemainingMs` поведінка у idle / active state-ах.
- Integration: `tools/openclaw` CLI command — відкладено разом з CLI follow-up-ом.
- Manual smoke: `enableDebugWindow(5*60_000, "test")` → pino runtime level світає у `debug` протягом ≤5s (через 5-секундний sync interval), потім повертається до `info` (verified manually на staging).
- Cost guard: production deploys без manual `enableDebugWindow()` залишаються на `info` → Datadog/Loki log-volume стабільний.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                                             | Mitigation                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Memory leak від dynamic-level (each call creates new Pino child) | Use root-level setter `pino.level = "debug"` (in-place mutation) |
| Operator забуває revert → cost spike                             | Hard-cap 30min + Sentry alert + auto-revert                      |

## Touchpoints (file:line)

- `apps/server/src/env/env.ts` — LOG_LEVEL field
- `apps/server/src/obs/logger.ts` — Pino instance + debug-window logic
- `tools/openclaw/src/agents/ops/debugWindow.ts` — new
- `apps/server/src/obs/__tests__/logger-debug-window.test.ts` — new
- `docs/observability/log-levels.md` — new

## Refs

- [Pino dynamic level](https://github.com/pinojs/pino/blob/master/docs/api.md#loggerlevel)
- [Sentry log-level cost analysis](https://sentry.io/pricing/)

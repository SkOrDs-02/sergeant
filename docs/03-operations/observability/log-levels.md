# Log-level policy

> **Last touched:** 2026-08-16 by @claude. **Next review:** 2026-11-30.
> **Status:** Active

## Default levels

| Environment | Default | Rationale                                                              |
| ----------- | ------- | ---------------------------------------------------------------------- |
| Production  | `info`  | Cost + noise floor; Loki storage ~10× more expensive at `debug`.       |
| Development | `debug` | Full visibility locally. `NODE_ENV !== "production"` → auto-downgrade. |

Override via the `LOG_LEVEL` environment variable (Coolify app env var).  
Valid values: `fatal` `error` `warn` `info` `debug` `trace`

## Runtime debug-window

Temporarily lower production log level to `debug` **without a restart or env-var change**:

### Via the internal debug-window HTTP API

Telegram-консоль (OpenClaw) декомісована — [ADR-0075](../../04-governance/adr/0075-openclaw-gateway-decommissioned.md).
Вікно вмикається напряму через internal API (`apps/server/src/routes/internal/debug-window.ts`,
Bearer `INTERNAL_API_KEY`):

```bash
curl -X POST $PROD_API_URL/api/internal/debug-window/enable \
  -H "Authorization: Bearer $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" -d '{"minutes":5}'   # максимум 30

curl -X GET  $PROD_API_URL/api/internal/debug-window/status  -H "Authorization: Bearer $INTERNAL_API_KEY"
curl -X POST $PROD_API_URL/api/internal/debug-window/disable -H "Authorization: Bearer $INTERNAL_API_KEY"
```

- **Hard ceiling:** 30 minutes. Longer requests are automatically capped.
- **Auto-revert:** The level returns to `info` when the window expires.
- **Audit trail:** `enableDebugWindow()` emits a structured `info`-level log with `{ requestedBy, durationMs }`.

### Programmatic API (server only)

```ts
import {
  enableDebugWindow,
  disableDebugWindow,
  debugWindowRemainingMs,
} from "./obs/logger.js";

enableDebugWindow(5 * 60_000, "oncall-user"); // 5 min
disableDebugWindow(); // cancel immediately
debugWindowRemainingMs(); // ms left
```

## PII redaction

All log levels pass through the same redaction pipeline — `redactPaths` + `redactKeyNames` in `logger.ts`.  
Lowering to `debug` does **not** leak PII; it only surfaces internal flow events.

## Cost guidance

Each log line is stored in Coolify container logs + shipped to Grafana Loki.  
`debug` can produce 50–100× more lines than `info` under load.  
Use the debug-window for targeted troubleshooting sessions only; do not set `LOG_LEVEL=debug` as a permanent env var in production.

## Related

- `apps/server/src/obs/logger.ts` — implementation
- `docs/03-operations/observability/logging.md` — log schema and transport pipeline
- `docs/03-operations/observability/prometheus/alert_rules.yml` — `AiDailyCostHigh` alert

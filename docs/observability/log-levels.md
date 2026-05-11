# Log-level policy

> **Last validated:** 2026-05-11 by @claude. **Next review:** 2026-08-09.
> **Status:** Active

## Default levels

| Environment | Default | Rationale                                                               |
| ----------- | ------- | ----------------------------------------------------------------------- |
| Production  | `info`  | Cost + noise floor; Railway log storage ~10× more expensive at `debug`. |
| Development | `debug` | Full visibility locally. `NODE_ENV !== "production"` → auto-downgrade.  |

Override via the `LOG_LEVEL` environment variable (Railway service var).  
Valid values: `fatal` `error` `warn` `info` `debug` `trace`

## Runtime debug-window

Temporarily lower production log level to `debug` **without a restart or env-var change**:

### Via `/debug-window` in the ops Telegram console

```
/debug-window 5m         # enable debug logs for 5 minutes
/debug-window 30m        # maximum allowed duration
/debug-window-status     # show remaining time
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

Each log line is stored in Railway + shipped to Grafana Loki.  
`debug` can produce 50–100× more lines than `info` under load.  
Use the debug-window for targeted troubleshooting sessions only; do not set `LOG_LEVEL=debug` as a permanent env var in production.

## Related

- `apps/server/src/obs/logger.ts` — implementation
- `docs/observability/logging.md` — log schema and transport pipeline
- `docs/observability/prometheus/alert_rules.yml` — `AiDailyCostHigh` alert

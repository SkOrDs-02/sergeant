import { Bot } from "grammy";

/**
 * Process-level lifecycle handlers for the OpenClaw bot host.
 *
 * Pain P9 (`docs/launch/tech/telegram-improvements-roadmap.md`):
 *
 *  > Бот падає → 6+ хв backoff retry без leader-election.
 *
 * The 6+ minute in-process backoff was already removed for the 409-on-
 * `getUpdates` path (див. `startup-conflict-retry.ts`). PR-46 closes
 * the remaining gap — non-409 fatal exits — by:
 *
 *  1. Catching `uncaughtException` / `unhandledRejection` explicitly so
 *     Sentry has a single, structured event-shape per fatal exit
 *     (auto-instrumentation is implicit; explicit handler also logs to
 *     stderr in a fixed shape so Grafana logs-explorer can graph it
 *     even when Sentry samples).
 *  2. Adding a tight randomized jitter (default 1–3s) before `exit(1)`
 *     so back-to-back crashes do not blow through Railway's
 *     `restartPolicyMaxRetries=10` (`railway.console.toml` — phase-2
 *     rename to `railway.openclaw.toml`) inside
 *     seconds. With 10 restarts × ~2s in-process delay + ~10s Railway
 *     rebuild + restart, the supervisor sees ≥120s of attempts before
 *     giving up — comfortably under any incident-paging threshold.
 *  3. Adding a `SIGTERM` / `SIGINT` handler that calls `bot.stop()` on
 *     every registered grammy bot BEFORE the process exits. Stopping
 *     the long-poll cleanly causes Telegram to drop the bot's
 *     consumer-slot immediately instead of waiting out the ~60s
 *     server-side timeout — so the next Railway deploy's bot.start()
 *     does NOT race against a lingering slot and avoids the 409
 *     retry-window entirely on the common Railway redeploy path.
 *
 * The supervisor-restart SLA (< 30s end-to-end recovery) is the
 * invariant locked by `bot-lifecycle.test.ts` + the existing
 * `startup-conflict-retry.test.ts` cooperative tests.
 */

export const FATAL_EXIT_BASE_DELAY_MS = 1_000;
export const FATAL_EXIT_JITTER_MAX_MS = 2_000;
export const SHUTDOWN_HARD_TIMEOUT_MS = 10_000;

export interface FatalExitOptions {
  /** Override the jittered backoff window (tests pin to 0). */
  sleep?: (ms: number) => Promise<void>;
  /** Inject a deterministic jitter source for tests. */
  random?: () => number;
  /** Inject process.exit so tests can assert exit code. */
  exit?: (code: number) => void;
  /** Inject stderr writer; defaults to `console.error`. */
  log?: (line: string) => void;
}

export function computeFatalExitDelayMs(
  random: () => number = Math.random,
): number {
  // Tight bounded jitter — supervisor-friendly. Math.random() ∈ [0, 1)
  // → delay ∈ [FATAL_EXIT_BASE_DELAY_MS, FATAL_EXIT_BASE_DELAY_MS +
  // FATAL_EXIT_JITTER_MAX_MS). NaN/non-finite sources collapse to the
  // baseline delay — never explode beyond the jitter ceiling.
  const raw = random();
  const r = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  return Math.floor(FATAL_EXIT_BASE_DELAY_MS + r * FATAL_EXIT_JITTER_MAX_MS);
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stable JSON log shape so Grafana can dashboard fatal exits without
 * regex-matching Sentry breadcrumb messages.
 */
function logFatal(
  log: (line: string) => void,
  reason: string,
  err: unknown,
  delayMs: number,
): void {
  const errPayload =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { name: "non-error", message: String(err) };
  const entry = {
    level: "fatal",
    service: "sergeant-openclaw",
    msg: "openclaw_fatal_exit",
    reason,
    delay_ms: delayMs,
    err: errPayload,
    ts: new Date().toISOString(),
  };
  log(JSON.stringify(entry));
}

/**
 * Idempotent fatal-exit path. Guard against re-entrance — without it,
 * `uncaughtException` fired during the `sleep()` window (e.g. a second
 * crash inside Sentry's own beforeExit hook) would race the first
 * exit + double-log.
 */
let exitInProgress = false;

export async function exitFatalWithBackoff(
  reason: string,
  err: unknown,
  options: FatalExitOptions = {},
): Promise<void> {
  if (exitInProgress) return;
  exitInProgress = true;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const log = options.log ?? ((line: string) => console.error(line));
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const delayMs = computeFatalExitDelayMs(random);
  logFatal(log, reason, err, delayMs);
  await sleep(delayMs);
  exit(1);
}

/**
 * For tests only — reset the re-entrance guard between cases.
 */
export function __resetExitInProgressForTests(): void {
  exitInProgress = false;
}

export interface BotLike {
  stop: () => Promise<void>;
}

export interface RegisterProcessLifecycleOptions {
  /** Bots registered for graceful long-poll shutdown on SIGTERM/SIGINT. */
  bots?: ReadonlyArray<{ label: string; bot: BotLike }>;
  /** Inject lifecycle target for tests; defaults to `process`. */
  target?: NodeJS.EventEmitter;
  /** Hard timeout for `bot.stop()` calls — if a bot deadlocks, force-exit. */
  hardTimeoutMs?: number;
  /** Forwarded to `exitFatalWithBackoff` for uncaught/unhandled paths. */
  fatalOptions?: FatalExitOptions;
  /** Inject process.exit; defaults to real `process.exit`. */
  exit?: (code: number) => void;
  /** Inject stderr writer; defaults to `console.error`. */
  log?: (line: string) => void;
}

/**
 * Wires the four process-level events the OpenClaw host cares about:
 *
 *  - `uncaughtException` / `unhandledRejection` → backoff + exit 1
 *  - `SIGTERM` / `SIGINT` → bot.stop() (releases TG slot) + exit 0
 *
 * Returns a `dispose()` callback so tests can detach the listeners
 * (Node-level `process.removeListener` calls otherwise leak across
 * `it()` blocks).
 */
export function registerProcessLifecycle(
  options: RegisterProcessLifecycleOptions = {},
): () => void {
  const target = options.target ?? process;
  const bots = options.bots ?? [];
  const hardTimeoutMs = options.hardTimeoutMs ?? SHUTDOWN_HARD_TIMEOUT_MS;
  const log = options.log ?? ((line: string) => console.error(line));
  const exit = options.exit ?? ((code: number) => process.exit(code));

  const onUncaught = (err: Error): void => {
    void exitFatalWithBackoff("uncaughtException", err, {
      ...options.fatalOptions,
      log,
      exit,
    });
  };
  const onUnhandled = (reason: unknown): void => {
    void exitFatalWithBackoff("unhandledRejection", reason, {
      ...options.fatalOptions,
      log,
      exit,
    });
  };

  let shuttingDown = false;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(
      JSON.stringify({
        level: "info",
        service: "sergeant-openclaw",
        msg: "signal_received",
        signal,
        bot_count: bots.length,
        ts: new Date().toISOString(),
      }),
    );
    // Hard timeout guards against a bot.stop() that never resolves —
    // grammy occasionally hangs on a half-closed long-poll socket. We
    // still want Railway to see exit 0 within the 10s grace-period.
    const hard = setTimeout(() => {
      log(
        JSON.stringify({
          level: "warn",
          service: "sergeant-openclaw",
          msg: "shutdown_hard_timeout",
          signal,
          ts: new Date().toISOString(),
        }),
      );
      exit(0);
    }, hardTimeoutMs);
    if (typeof (hard as { unref?: () => void }).unref === "function") {
      (hard as { unref: () => void }).unref();
    }
    void (async () => {
      const results = await Promise.allSettled(
        bots.map(({ bot }) => bot.stop()),
      );
      for (let i = 0; i < results.length; i += 1) {
        const r = results[i];
        if (r && r.status === "rejected") {
          const entry = bots[i];
          log(
            JSON.stringify({
              level: "warn",
              service: "sergeant-openclaw",
              msg: "bot_stop_failed",
              label: entry?.label ?? null,
              reason:
                r.reason instanceof Error ? r.reason.message : String(r.reason),
              ts: new Date().toISOString(),
            }),
          );
        }
      }
      clearTimeout(hard);
      log(
        JSON.stringify({
          level: "info",
          service: "sergeant-openclaw",
          msg: "shutdown_complete",
          signal,
          ts: new Date().toISOString(),
        }),
      );
      exit(0);
    })();
  };

  target.on("uncaughtException", onUncaught);
  target.on("unhandledRejection", onUnhandled);
  target.on("SIGTERM", onSignal);
  target.on("SIGINT", onSignal);

  return () => {
    target.removeListener("uncaughtException", onUncaught);
    target.removeListener("unhandledRejection", onUnhandled);
    target.removeListener("SIGTERM", onSignal);
    target.removeListener("SIGINT", onSignal);
  };
}

// Re-export `Bot` type for callers that need to satisfy `BotLike`.
export type { Bot };

import { GrammyError } from "grammy";
import type { Bot } from "grammy";

/**
 * Telegram allows only ONE long-poll consumer per bot token. When Railway
 * (or any platform) restarts a container faster than Telegram drops the
 * previous consumer's slot (~30-60s), the new instance hits a 409 Conflict
 * on its very first `getUpdates`.
 *
 * Earlier we tried to absorb the slot-release window inside the process
 * with up to ~6 minutes of exponential backoff (12 attempts × 30s cap).
 * That hides crashes from the Railway supervisor (Pain P9 in
 * `docs/launch/tech/telegram-improvements-roadmap.md`): the container
 * looks healthy, dashboards stay green, alerts never fire, and a real
 * misconfig can keep the bot offline for 6+ минут without paging anyone.
 *
 * New strategy: keep the in-process backoff window strictly under 30s so
 * the supervisor (Railway `restartPolicyType = ON_FAILURE`,
 * `restartPolicyMaxRetries = 10` per `railway.console.toml`) sees crashes
 * and reschedules. A typical recovery is now: wait ≤14s in-process →
 * crash → Railway restart (~10s) → bot live again — under 30s in the
 * common case, even if Telegram still holds the slot for the full 60s
 * the supervisor keeps retrying transparently.
 */
export const STARTUP_409_MAX_ATTEMPTS = 4;
export const STARTUP_409_BASE_DELAY_MS = 2_000;
export const STARTUP_409_MAX_DELAY_MS = 8_000;

export function computeStartupConflictBackoffDelayMs(attempt: number): number {
  // Mirrors the production exponential-backoff schedule used by
  // `startBotWithConflictRetry`. Surfaced as a pure function so the
  // 30-second supervisor SLA can be locked down with a unit test instead
  // of an integration probe against a live Telegram bot.
  if (attempt < 1) return 0;
  return Math.min(
    STARTUP_409_BASE_DELAY_MS * 2 ** (attempt - 1),
    STARTUP_409_MAX_DELAY_MS,
  );
}

export function totalStartupConflictBackoffMs(): number {
  // Sum of waits across attempts 1..(MAX_ATTEMPTS - 1). The final attempt
  // throws instead of waiting, so it does not contribute. Used by tests
  // to enforce the «<30s in-process» invariant.
  let total = 0;
  for (let attempt = 1; attempt < STARTUP_409_MAX_ATTEMPTS; attempt += 1) {
    total += computeStartupConflictBackoffDelayMs(attempt);
  }
  return total;
}

export interface StartBotWithConflictRetryOptions {
  // Injectable so unit tests can advance fake clocks without `setTimeout`.
  sleep?: (ms: number) => Promise<void>;
  warn?: (message: string) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function startBotWithConflictRetry(
  bot: Pick<Bot, "start">,
  label: string,
  options: StartBotWithConflictRetryOptions = {},
): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  const warn = options.warn ?? ((msg) => console.warn(msg));
  let attempt = 0;
  while (true) {
    try {
      await bot.start({ drop_pending_updates: false });
      return;
    } catch (err) {
      const isConflict = err instanceof GrammyError && err.error_code === 409;
      attempt += 1;
      if (!isConflict || attempt >= STARTUP_409_MAX_ATTEMPTS) {
        throw err;
      }
      const delayMs = computeStartupConflictBackoffDelayMs(attempt);
      warn(
        `[${label}] Telegram 409 on getUpdates (attempt ${attempt}/${STARTUP_409_MAX_ATTEMPTS}); waiting ${delayMs}ms before retry. ` +
          "Likely a previous container instance still holds the long-poll slot; supervisor will take over if retries exhaust.",
      );
      await sleep(delayMs);
    }
  }
}

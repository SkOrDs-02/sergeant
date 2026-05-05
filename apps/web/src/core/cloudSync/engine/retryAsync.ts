import { updateDebugSnapshot } from "../debugState";
import { isRetryableError } from "../errorNormalizer";
import { syncLog } from "../logger";

/**
 * Exponential-backoff retry wrapper for engine → `syncApi` calls.
 *
 * Retries only for transport failures and 5xx HTTP statuses, as classified
 * by `isRetryableError`. 4xx, parse errors, aborts and non-ApiError throws
 * are surfaced immediately so callers never loop on an unrecoverable
 * condition (e.g. 401 from a revoked session, or a malformed payload).
 *
 * Default schedule: 3 retries after the initial attempt, waiting 1s → 2s
 * → 4s between attempts (4 total tries max).
 */
export interface RetryAsyncOptions {
  maxRetries?: number;
  delaysMs?: readonly number[];
  /** Human-readable label included in `[cloud-sync] retry` log entries. */
  label?: string;
  /** Override for tests so they don't actually wait between attempts. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_DELAYS = [1000, 2000, 4000] as const;
const DEFAULT_MAX_RETRIES = 3;

export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: RetryAsyncOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const delays = opts.delaysMs ?? DEFAULT_DELAYS;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let attempt = 0;
  // We break out via `return` on success or `throw` on a terminal failure,
  // so a plain infinite loop is clearer than instrumenting the condition.
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isRetryableError(err)) throw err;
      const delay = delays[Math.min(attempt, delays.length - 1)];
      syncLog.retry({ attempt: attempt + 1, delay: delay!, label: opts.label });
      updateDebugSnapshot({ lastAction: "retry" });
      await sleep(delay!);
      attempt += 1;
    }
  }
}

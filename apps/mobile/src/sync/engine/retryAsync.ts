/**
 * Exponential-backoff retry wrapper for engine → `syncApi` calls.
 * Port of `apps/web/src/core/cloudSync/engine/retryAsync.ts`.
 *
 * Retries only for transport failures and 5xx HTTP statuses, as
 * classified by `isRetryableError`. 4xx, parse errors, aborts and
 * non-ApiError throws are surfaced immediately so callers never loop
 * on an unrecoverable condition (e.g. 401 from a revoked session, or
 * a malformed payload).
 *
 * Features:
 * - Exponential backoff with configurable base delay and multiplier
 * - Random jitter (0-30%) to prevent thundering herd
 * - Capped maximum delay to avoid excessive wait times
 * - Optional progress callback for UI feedback
 *
 * Default schedule: 3 retries after the initial attempt, waiting
 * 1s → 2s → 4s between attempts (4 total tries max).
 */
import { isRetryableError } from "../errorNormalizer";

export interface RetryAsyncOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delays in ms for each retry (default: [1000, 2000, 4000]) */
  delaysMs?: readonly number[];
  /** Label for logging/debugging */
  label?: string;
  /** Override for tests so they don't actually wait between attempts. */
  sleep?: (ms: number) => Promise<void>;
  /** Add random jitter to delays (0-30%). Helps prevent thundering herd. Default: true */
  jitter?: boolean;
  /** Maximum delay cap in ms. Default: 30000 (30s) */
  maxDelay?: number;
  /** Called on each retry attempt with attempt number and delay */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
}

const DEFAULT_DELAYS = [1000, 2000, 4000] as const;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_MAX_DELAY = 30000;
const JITTER_FACTOR = 0.3; // 0-30% random jitter

/**
 * Calculate delay with exponential backoff and optional jitter.
 */
function calculateDelay(
  attempt: number,
  delays: readonly number[],
  jitter: boolean,
  maxDelay: number,
): number {
  // Get base delay for this attempt
  const baseDelay = delays[Math.min(attempt, delays.length - 1)];

  // Apply exponential multiplier for attempts beyond the delays array
  const multiplier =
    attempt >= delays.length ? Math.pow(2, attempt - delays.length + 1) : 1;

  let delay = baseDelay * multiplier;

  // Apply jitter: random value between 0 and JITTER_FACTOR of the delay
  if (jitter) {
    const jitterAmount = delay * JITTER_FACTOR * Math.random();
    delay += jitterAmount;
  }

  // Cap at maximum delay
  return Math.min(delay, maxDelay);
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: RetryAsyncOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const delays = opts.delaysMs ?? DEFAULT_DELAYS;
  const jitter = opts.jitter ?? true;
  const maxDelay = opts.maxDelay ?? DEFAULT_MAX_DELAY;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      // Don't retry if we've exhausted attempts or error is not retryable
      if (attempt >= maxRetries || !isRetryableError(err)) {
        throw err;
      }

      const delay = calculateDelay(attempt, delays, jitter, maxDelay);

      // Notify caller of retry (for UI feedback, logging, etc.)
      opts.onRetry?.(attempt + 1, delay, err);

      await sleep(delay);
      attempt += 1;
    }
  }
}

/**
 * Retry with circuit breaker pattern.
 * After consecutive failures, enters "open" state and fails fast for a cooldown period.
 */
export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

export interface RetryWithCircuitBreakerOptions extends RetryAsyncOptions {
  /** Unique key for this circuit breaker (e.g., "sync-pull") */
  circuitKey: string;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Cooldown period in ms before trying again (default: 60000) */
  cooldownMs?: number;
}

export async function retryWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  opts: RetryWithCircuitBreakerOptions,
): Promise<T> {
  const {
    circuitKey,
    failureThreshold = 5,
    cooldownMs = 60000,
    ...retryOpts
  } = opts;

  // Get or create circuit breaker state
  let state = circuitBreakers.get(circuitKey);
  if (!state) {
    state = { failures: 0, lastFailure: 0, isOpen: false };
    circuitBreakers.set(circuitKey, state);
  }

  // Check if circuit is open
  if (state.isOpen) {
    const elapsed = Date.now() - state.lastFailure;
    if (elapsed < cooldownMs) {
      // Still in cooldown, fail fast
      throw new Error(
        `Circuit breaker open for ${circuitKey}. Retry in ${Math.ceil((cooldownMs - elapsed) / 1000)}s`,
      );
    }
    // Cooldown expired, try again (half-open state)
    state.isOpen = false;
  }

  try {
    const result = await retryAsync(fn, retryOpts);
    // Success - reset failures
    state.failures = 0;
    state.isOpen = false;
    return result;
  } catch (err) {
    // Failure - increment counter
    state.failures += 1;
    state.lastFailure = Date.now();

    // Open circuit if threshold exceeded
    if (state.failures >= failureThreshold) {
      state.isOpen = true;
    }

    throw err;
  }
}

/**
 * Reset a specific circuit breaker (for testing or manual recovery)
 */
export function resetCircuitBreaker(circuitKey: string): void {
  circuitBreakers.delete(circuitKey);
}

/**
 * Get current state of a circuit breaker
 */
export function getCircuitBreakerState(
  circuitKey: string,
): CircuitBreakerState | undefined {
  return circuitBreakers.get(circuitKey);
}

/**
 * Shared timing utilities for server-side performance measurement.
 * Consolidates duplicated timing code from various modules.
 */

/**
 * Returns elapsed milliseconds since `start` using high-resolution time.
 * Uses process.hrtime.bigint() for nanosecond precision.
 *
 * @param start - The start time from process.hrtime.bigint()
 * @returns Elapsed time in milliseconds (with decimal precision)
 *
 * @example
 * const start = process.hrtime.bigint();
 * // ... do work ...
 * const ms = elapsedMs(start); // e.g., 42.123
 */
export function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

/**
 * Checks if an error is an AbortError or TimeoutError.
 * Useful for handling fetch timeout scenarios.
 */
export function isAbortError(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    ((e as { name?: string }).name === "AbortError" ||
      (e as { name?: string }).name === "TimeoutError")
  );
}

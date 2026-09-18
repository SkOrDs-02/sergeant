/**
 * Shared Detox helpers.
 *
 * Keep these thin — prefer suite-local matchers so a failure message
 * points at the actual flow, not a generic helper. See
 * `finyk-manual-expense.e2e.ts` for the canonical usage.
 */
import { by, element, expect as detoxExpect, waitFor } from "detox";

/** Default timeout for single-step Detox waits (ms). */
export const DEFAULT_WAIT_MS = 10_000;

/** `waitFor(...).toBeVisible()` with a consistent timeout. */
export async function waitForVisibleById(
  testID: string,
  timeoutMs: number = DEFAULT_WAIT_MS,
): Promise<void> {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeoutMs);
}

/** Convenience for the common "tap once visible" pattern. */
export async function tapWhenVisible(
  testID: string,
  timeoutMs: number = DEFAULT_WAIT_MS,
): Promise<void> {
  await waitForVisibleById(testID, timeoutMs);
  await element(by.id(testID)).tap();
}

/** Shorthand so suites read top-to-bottom without nesting `by.id`. */
export function byId(testID: string) {
  return element(by.id(testID));
}

/**
 * Assert that a node with the given testID is on screen. Separate from
 * `waitForVisibleById` because some callers want the assertion to be
 * synchronous (the element is expected to already be rendered).
 */
export async function expectVisibleById(testID: string): Promise<void> {
  await detoxExpect(element(by.id(testID))).toBeVisible();
}

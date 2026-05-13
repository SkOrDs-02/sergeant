/**
 * Shared assertion helpers for the full Detox suites. Wraps the
 * regex/`atIndex` pattern used in `finyk-manual-expense.e2e.ts` so the
 * intent of each step reads at the top of the file.
 */
import { by, element, expect as detoxExpect, waitFor } from "detox";

import { DEFAULT_WAIT_MS } from "../helpers";

/**
 * Assert that at least one element whose `testID` matches `prefix`
 * (treated as a regex anchored at the start) is visible. Returns the
 * first match for chaining if the caller wants to interact with it.
 */
export async function expectAnyByPrefix(
  prefix: string,
  timeoutMs: number = DEFAULT_WAIT_MS,
): Promise<void> {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`^${escaped}`);
  await waitFor(element(by.id(matcher)))
    .toBeVisible()
    .withTimeout(timeoutMs);
  await detoxExpect(element(by.id(matcher)).atIndex(0)).toBeVisible();
}

/**
 * Assert that NO element matching the regex `pattern` is visible —
 * useful for confirming a sheet closed or a modal dismissed.
 */
export async function expectNotVisibleById(
  testID: string,
  timeoutMs: number = DEFAULT_WAIT_MS,
): Promise<void> {
  await waitFor(element(by.id(testID)))
    .not.toBeVisible()
    .withTimeout(timeoutMs);
}

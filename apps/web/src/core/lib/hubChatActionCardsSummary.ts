/**
 * Backwards-compatible re-export of the action-card summary renderer.
 *
 * The implementation moved to `hubChatActionCardsRegistry.ts` so it can be
 * shared/tested as a data table instead of a 470-line switch. The `summaryFor`
 * function name is preserved so call sites and tests stay untouched.
 */
import type { ChatAction } from "./chatActions/types";
import { renderSummary } from "./hubChatActionCardsRegistry";

export function summaryFor(
  name: string,
  input: ChatAction["input"] | Record<string, unknown>,
  result: string,
): string {
  return renderSummary(name, input, result);
}

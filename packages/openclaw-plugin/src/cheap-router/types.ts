/**
 * Stage 4c — Layer 1 cheap-router types.
 *
 * Mirrors the server-side `CheapRouterClassification` from
 * `apps/server/src/modules/openclaw/classify.ts`. Kept independent (no
 * cross-package import) because the plugin compiles into the Gateway
 * runtime and must not depend on the apps/server build.
 */

export const CHEAP_ROUTER_CLASSES = [
  "routine_metrics",
  "routine_recall",
  "routine_remind",
  "thinking",
  "chat",
] as const;

export type CheapRouterClass = (typeof CHEAP_ROUTER_CLASSES)[number];

/**
 * Parsed classification from the Haiku JSON response. Optional fields use
 * `string | null | undefined` because the server may return either explicit
 * `null` or omit the key entirely; consumers treat both identically.
 */
export interface CheapRouterClassification {
  class: CheapRouterClass;
  shortcut?: string | null | undefined;
  persona?: string | null | undefined;
  params?: Record<string, unknown> | null | undefined;
  chat_response?: string | null | undefined;
}

/** Classifier interface — DI seam for testing without HTTP. */
export interface CheapRouterClassifier {
  classify(userMessage: string): Promise<CheapRouterClassification>;
}

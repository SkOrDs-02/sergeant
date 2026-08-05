/**
 * Deterministic, cross-device advice/insight id.
 *
 * AI-CONTEXT: the recommendation `Rec.id` values produced by
 * `./recommendations/**` (e.g. `budget_over_${categoryId}`) are already
 * content-derived and therefore stable across devices for the SAME account
 * — two devices evaluating the same rule against the same domain data land
 * on the exact same string. What they are NOT is a fixed-shape, opaque
 * identifier safe to put in analytics as a dimension: raw ids differ in
 * length/format per rule and can embed a user-chosen custom-category slug.
 * `computeAdviceId` normalises any `(adviceType, canonicalContent)` pair
 * into one fixed-width, deterministic id — same inputs, same id, on any
 * device, any session, forever (no per-session randomness, no in-memory
 * map to keep in sync across tabs).
 *
 * Consumers (`InsightCard` in `apps/web`) pass the insight's stable
 * `kind` as `adviceType` and its already-deterministic `id` string as
 * `canonicalContent` — see the `advice_shown` / `advice_dismissed` event
 * contract in `packages/shared/src/lib/analyticsEvents.valueLoops.ts`.
 *
 * Deliberately NOT used for the free-text AI coach insight
 * (`apps/web/src/core/observability/adviceTelemetry.ts`'s `ai_advice_shown` /
 * `ai_advice_reacted`) — that system hashes-avoidance is a documented,
 * separate privacy decision (raw LLM prose as the "content" would turn the
 * id into a content signature); do not repurpose this helper there without
 * revisiting that rationale explicitly.
 */

/**
 * FNV-1a-family 64-bit-ish hash, computed as two interleaved 32-bit
 * accumulators for a wider (16 hex char) output than a single 32-bit hash
 * gives — same technique as `hashToken` in
 * `apps/web/src/shared/lib/api/queryKeys.ts` (kept as a separate copy here:
 * that helper hashes auth tokens for a web-only RQ-key concern, and this
 * package is DOM-free / shared with `apps/mobile`, so it cannot import from
 * `apps/web`).
 *
 * Not cryptographic — this is a correlation id for a dashboard, not a
 * security boundary, so collision-resistance beyond "good enough for
 * product analytics cardinality" is not a requirement.
 */
function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x100000001b3) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * Deterministic advice id: `adv-<16 hex chars>`. Same `(adviceType,
 * canonicalContent)` pair always produces the same id — on any device,
 * any session, computed independently with no shared state.
 *
 * `canonicalContent` must identify the advice's IDENTITY, not necessarily
 * its literal rendered prose — for rule-based recommendations that's
 * already the deterministic `Rec.id` (e.g. `budget_over_food`); it should
 * NOT be raw free-text LLM output (see the module doc comment above).
 */
export function computeAdviceId(
  adviceType: string,
  canonicalContent: string,
): string {
  return `adv-${stableHash(`${adviceType}::${canonicalContent}`)}`;
}

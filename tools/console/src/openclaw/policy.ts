/**
 * OpenClaw per-call USD cap (M18).
 *
 * Closes [`docs/security/hardening/M18-openclaw-per-call-usd-cap.md`](../../../../docs/security/hardening/M18-openclaw-per-call-usd-cap.md):
 * the daily-budget guard at `/api/internal/openclaw/budget` enforces a
 * per-day ceiling, but a single Anthropic call with an inflated
 * `max_tokens` (or a more expensive model) can exhaust the entire
 * daily budget in one round-trip and leave the bot mute for the rest
 * of the day. Pre-flight cost estimator + guard caps the worst-case
 * spend per call.
 *
 * The estimate is **conservative** — we assume the response uses the
 * full `max_tokens` budget at output pricing. Input tokens are
 * cheaper and bounded by Anthropic-side context windows, so the
 * output-only estimate is an upper bound on the call cost. If the
 * upper bound exceeds the per-call cap, we reject the call **before**
 * it is dispatched.
 *
 * Rationale for fail-closed defaults: an unknown model is treated as
 * the **most expensive known tier** so a future model upgrade does
 * not silently bypass the cap.
 */

/** Default per-call USD cap (overridable via `OPENCLAW_MAX_PER_CALL_USD`). */
export const DEFAULT_MAX_PER_CALL_USD = 0.5;

/** Per-million-token pricing for known Anthropic models. */
interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
}

/**
 * Pricing table — verified against Anthropic public pricing
 * (2025-Q4 snapshot). Update when models or pricing change. The
 * table is open-ended: any unknown model id is treated as the
 * most expensive entry below (Opus tier).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude 4 Sonnet — current OpenClaw default.
  "claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15 },
  // Claude 4 Haiku — cheap classifier (router.ts).
  "claude-haiku-4-20250414": { inputPerMillion: 1, outputPerMillion: 5 },
  // Claude 4 Opus — premium tier; not used today but priced as
  // fail-closed fallback for unknown ids.
  "claude-opus-4-20250514": { inputPerMillion: 15, outputPerMillion: 75 },
};

/** Worst-case pricing for unknown model ids — Opus tier. */
const UNKNOWN_MODEL_FALLBACK: ModelPricing = {
  inputPerMillion: 15,
  outputPerMillion: 75,
};

/**
 * Conservative upper bound on the cost of a single Anthropic call:
 * `max_tokens × output_price_per_token`. We ignore input cost
 * deliberately — including it would make the estimate brittle vs.
 * conversation length. Output-only is the dominant factor for
 * Claude 4 pricing where output is 5× input.
 */
export function estimateMaxCallCostUsd(
  model: string,
  maxTokens: number,
): number {
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) return 0;
  const pricing = MODEL_PRICING[model] ?? UNKNOWN_MODEL_FALLBACK;
  return (maxTokens * pricing.outputPerMillion) / 1_000_000;
}

/** Result of the per-call cap check. */
export type PerCallCapCheck =
  | { kind: "allow"; projectedUsd: number; capUsd: number }
  | { kind: "reject"; projectedUsd: number; capUsd: number };

/**
 * Pure decision function — given `(model, maxTokens, capUsd)`,
 * returns `allow` if the conservative cost estimate is `<= capUsd`,
 * `reject` otherwise.
 */
export function checkPerCallCap(
  model: string,
  maxTokens: number,
  capUsd: number,
): PerCallCapCheck {
  const projectedUsd = estimateMaxCallCostUsd(model, maxTokens);
  if (projectedUsd <= capUsd) {
    return { kind: "allow", projectedUsd, capUsd };
  }
  return { kind: "reject", projectedUsd, capUsd };
}

/**
 * Parses `OPENCLAW_MAX_PER_CALL_USD` env var. Returns
 * `DEFAULT_MAX_PER_CALL_USD` for missing / unparseable / non-positive
 * values (fail-closed: a typo'd env var must not silently disable
 * the cap).
 */
export function parseMaxPerCallUsd(value: string | undefined): number {
  if (!value) return DEFAULT_MAX_PER_CALL_USD;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_PER_CALL_USD;
  }
  return parsed;
}

/**
 * Structured error thrown by `assertPerCallCapAllowed` when the
 * conservative cost estimate exceeds the cap. The OpenClaw handler
 * catches this and emits a structured Telegram error to the founder.
 */
export class PerCallCapExceededError extends Error {
  readonly projectedUsd: number;
  readonly capUsd: number;
  readonly model: string;
  readonly maxTokens: number;

  constructor(args: {
    model: string;
    maxTokens: number;
    projectedUsd: number;
    capUsd: number;
  }) {
    super(
      `OpenClaw per-call USD cap exceeded: model=${args.model} max_tokens=${args.maxTokens} projected=$${args.projectedUsd.toFixed(4)} cap=$${args.capUsd.toFixed(2)}`,
    );
    this.name = "PerCallCapExceededError";
    this.projectedUsd = args.projectedUsd;
    this.capUsd = args.capUsd;
    this.model = args.model;
    this.maxTokens = args.maxTokens;
  }
}

/**
 * Throws `PerCallCapExceededError` if the call would exceed the cap.
 * Call this **before** `client.messages.create` so the rejection
 * happens client-side without spending tokens.
 */
export function assertPerCallCapAllowed(
  model: string,
  maxTokens: number,
  capUsd: number,
): void {
  const result = checkPerCallCap(model, maxTokens, capUsd);
  if (result.kind === "reject") {
    throw new PerCallCapExceededError({
      model,
      maxTokens,
      projectedUsd: result.projectedUsd,
      capUsd: result.capUsd,
    });
  }
}

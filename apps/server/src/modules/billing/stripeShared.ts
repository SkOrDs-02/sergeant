import type { BillingPlan } from "@sergeant/shared";
import { capturePostHogEvent } from "../../lib/posthogCapture.js";

export interface StripeEvent {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> };
}

export interface StripeSubscriptionPricing {
  priceCents: number | null;
  currency: string | null;
  cadence: string | null;
}

export function extractSubscriptionPricing(
  object: Record<string, unknown>,
): StripeSubscriptionPricing {
  const items = object["items"];
  const data =
    items && typeof items === "object" && !Array.isArray(items)
      ? (items as Record<string, unknown>)["data"]
      : null;
  const first = Array.isArray(data) ? (data[0] as unknown) : null;
  const price =
    first && typeof first === "object" && !Array.isArray(first)
      ? ((first as Record<string, unknown>)["price"] as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const recurring =
    price &&
    typeof price["recurring"] === "object" &&
    price["recurring"] !== null &&
    !Array.isArray(price["recurring"])
      ? (price["recurring"] as Record<string, unknown>)
      : undefined;
  return {
    priceCents:
      typeof price?.["unit_amount"] === "number"
        ? (price["unit_amount"] as number)
        : null,
    currency:
      typeof price?.["currency"] === "string"
        ? (price["currency"] as string).toUpperCase()
        : null,
    cadence:
      typeof recurring?.["interval"] === "string"
        ? (recurring["interval"] as string)
        : null,
  };
}

/**
 * Inject-point для unit-тестів. Production-код викликає `capturePostHogEvent`
 * напряму (default), але `stripe.test.ts` підмінює fetch через цей setter,
 * щоб НЕ stub-ити global `fetch` і не залежати від мережі.
 */
type CaptureFn = typeof capturePostHogEvent;
let captureImpl: CaptureFn = capturePostHogEvent;
export function __setPostHogCaptureForTesting(fn: CaptureFn | null): void {
  captureImpl = fn ?? capturePostHogEvent;
}
export function getPostHogCapture(): CaptureFn {
  return captureImpl;
}

export function getStripeObjectString(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const value = object[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getStripeMetadata(
  object: Record<string, unknown>,
): Record<string, unknown> {
  const metadata = object["metadata"];
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

export function getStripeNestedRecord(
  object: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = object[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getMetadataUserId(
  object: Record<string, unknown>,
): string | null {
  const metadata = getStripeMetadata(object);
  return typeof metadata["user_id"] === "string" ? metadata["user_id"] : null;
}

export function unixSecondsToDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

export function isoOrNull(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export function normalizePlan(): BillingPlan {
  return "pro";
}

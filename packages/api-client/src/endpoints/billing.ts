import {
  BillingCancelResponseSchema,
  BillingCheckoutConflictCodeSchema,
  BillingCheckoutRequestSchema,
  BillingCheckoutResponseSchema,
  BillingPortalResponseSchema,
  BillingProvidersResponseSchema,
  BillingStatusResponseSchema,
  z,
} from "@sergeant/shared";
import { isApiError } from "../ApiError";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

export const BillingCheckoutRequestBodySchema = BillingCheckoutRequestSchema;
export const BillingCheckoutResponseBodySchema = BillingCheckoutResponseSchema;
export const BillingStatusResponseBodySchema = BillingStatusResponseSchema;
export const BillingPortalResponseBodySchema = BillingPortalResponseSchema;
export const BillingCancelResponseBodySchema = BillingCancelResponseSchema;
export const BillingProvidersResponseBodySchema =
  BillingProvidersResponseSchema;
export const BillingCheckoutConflictCodeBodySchema =
  BillingCheckoutConflictCodeSchema;

export type BillingCheckoutRequest = z.infer<
  typeof BillingCheckoutRequestBodySchema
>;
export type BillingCheckoutResponse = z.infer<
  typeof BillingCheckoutResponseBodySchema
>;
export type BillingStatusResponse = z.infer<
  typeof BillingStatusResponseBodySchema
>;
/** Знімок доступу: стан free/trial/pro/grace, фічі реєстру, тижневі лічильники. */
export type BillingAccess = BillingStatusResponse["access"];
export type BillingPortalResponse = z.infer<
  typeof BillingPortalResponseBodySchema
>;
export type BillingCancelResponse = z.infer<
  typeof BillingCancelResponseBodySchema
>;
export type BillingProvidersResponse = z.infer<
  typeof BillingProvidersResponseBodySchema
>;

/** `code` 409-відповіді `POST /api/billing/checkout`: вже є підписка або живий checkout. */
export type BillingCheckoutConflictCode = z.infer<
  typeof BillingCheckoutConflictCodeBodySchema
>;

/**
 * Розпізнає 409-відмову checkout-у (`ALREADY_SUBSCRIBED` / `CHECKOUT_PENDING`).
 * `null` для будь-якої іншої помилки, зокрема 409 з чужим `code`.
 */
export function billingCheckoutConflictCode(
  err: unknown,
): BillingCheckoutConflictCode | null {
  if (!isApiError(err) || err.status !== 409) return null;
  const code =
    err.body && typeof err.body === "object"
      ? (err.body as { code?: unknown }).code
      : undefined;
  const parsed = BillingCheckoutConflictCodeBodySchema.safeParse(code);
  return parsed.success ? parsed.data : null;
}

export interface BillingEndpoints {
  createCheckout: (
    body: BillingCheckoutRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<BillingCheckoutResponse>;
  status: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<BillingStatusResponse>;
  createPortal: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<BillingPortalResponse>;
  cancel: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<BillingCancelResponse>;
  providers: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<BillingProvidersResponse>;
}

export function createBillingEndpoints(http: HttpClient): BillingEndpoints {
  return {
    createCheckout: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>("/api/billing/checkout", body, {
        signal,
      });
      return BillingCheckoutResponseBodySchema.parse(raw);
    },
    status: async ({ signal } = {}) => {
      const raw = await http.get<unknown>("/api/billing/status", { signal });
      return BillingStatusResponseBodySchema.parse(raw);
    },
    createPortal: async ({ signal } = {}) => {
      const raw = await http.post<unknown>("/api/billing/portal", undefined, {
        signal,
      });
      return BillingPortalResponseBodySchema.parse(raw);
    },
    cancel: async ({ signal } = {}) => {
      const raw = await http.post<unknown>("/api/billing/cancel", undefined, {
        signal,
      });
      return BillingCancelResponseBodySchema.parse(raw);
    },
    providers: async ({ signal } = {}) => {
      const raw = await http.get<unknown>("/api/billing/providers", { signal });
      return BillingProvidersResponseBodySchema.parse(raw);
    },
  };
}

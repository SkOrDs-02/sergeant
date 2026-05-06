import {
  BillingCheckoutRequestSchema,
  BillingCheckoutResponseSchema,
  BillingStatusResponseSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

export const BillingCheckoutRequestBodySchema = BillingCheckoutRequestSchema;
export const BillingCheckoutResponseBodySchema = BillingCheckoutResponseSchema;
export const BillingStatusResponseBodySchema = BillingStatusResponseSchema;

export type BillingCheckoutRequest = z.infer<
  typeof BillingCheckoutRequestBodySchema
>;
export type BillingCheckoutResponse = z.infer<
  typeof BillingCheckoutResponseBodySchema
>;
export type BillingStatusResponse = z.infer<
  typeof BillingStatusResponseBodySchema
>;

export interface BillingEndpoints {
  createCheckout: (
    body: BillingCheckoutRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<BillingCheckoutResponse>;
  status: (
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<BillingStatusResponse>;
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
  };
}

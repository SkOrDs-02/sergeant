import type {
  BarcodeProduct as SharedBarcodeProduct,
  BarcodeLookupSuccess,
  BarcodeLookupError,
} from "@sergeant/shared/schemas";
import type { HttpClient } from "../httpClient";

// Response shapes come from `@sergeant/shared/schemas` (AGENTS.md Hard
// Rule #3 — single source of truth for API contracts). The server handler
// in `apps/server/src/modules/nutrition/barcode.ts` validates its outgoing
// payload against the same schema, so drift between these types and what
// the server actually sends is caught at test time instead of silently in
// production.
//
// Historical note: `BarcodeProduct` used to be declared here by hand with
// every field marked optional (`name?: string`) even though the server
// always returned `name: string`. That mismatch let consumers write code
// guarding against an impossible `undefined`. The schema now locks down
// which fields are truly nullable (brand, macros, serving, …) vs required.
export type BarcodeProduct = SharedBarcodeProduct;

export type BarcodeLookupResponse = Partial<BarcodeLookupSuccess> &
  Partial<BarcodeLookupError>;

export interface BarcodeEndpoints {
  lookup: (barcode: string) => Promise<BarcodeLookupResponse>;
}

export function createBarcodeEndpoints(http: HttpClient): BarcodeEndpoints {
  return {
    lookup: (barcode) =>
      http.get<BarcodeLookupResponse>("/api/barcode", { query: { barcode } }),
  };
}

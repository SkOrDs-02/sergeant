import {
  ManualExpenseCreateSchema,
  ManualExpenseCreateResponseSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";
import {
  createFinykReceiptsEndpoints,
  type FinykReceiptsEndpoints,
} from "./finykReceipts";
import {
  createFinykImportEndpoints,
  type FinykImportEndpoints,
} from "./finykImport";

export const ManualExpenseCreateBodySchema = ManualExpenseCreateSchema;
export const ManualExpenseCreateResponseBodySchema =
  ManualExpenseCreateResponseSchema;

export type ManualExpenseCreateRequest = z.infer<
  typeof ManualExpenseCreateBodySchema
>;
export type ManualExpenseCreateResponse = z.infer<
  typeof ManualExpenseCreateResponseBodySchema
>;

/**
 * All `/api/finyk/*` operations under one flat namespace
 * (`apiClient.finyk.*`) — matches the `mono`/`push` convention of one
 * endpoints-object per URL-prefix domain, even though the underlying
 * request bodies span several sub-resources. The receipt-scan (`Finyk
 * Receipts*`) and bulk-import (`FinykImport*`) methods are implemented in
 * `./finykReceipts` / `./finykImport` (mirroring the `@sergeant/shared`
 * schema-file split into `receipts.ts` / `import.ts`) and merged in below
 * — splitting purely for file-size/readability, not for a nested
 * `finyk.receipts.xxx()` consumer API.
 */
export interface FinykEndpoints
  extends FinykReceiptsEndpoints, FinykImportEndpoints {
  /**
   * `POST /api/v1/finyk/manual-expenses` — записати ручну (не-Mono) витрату.
   * `amount` — копійки (Hard Rule #1); сервер скоупить запис по сесії
   * (`user_id` ніколи не передається з body). Контракт-тест:
   * `endpoints/finyk.test.ts` ↔ серверний серіалізатор у
   * `apps/server/src/modules/finyk/manualExpenses.ts` (Hard Rule #3).
   */
  createManualExpense: (
    body: ManualExpenseCreateRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ManualExpenseCreateResponse>;
}

export function createFinykEndpoints(http: HttpClient): FinykEndpoints {
  return {
    createManualExpense: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>("/api/finyk/manual-expenses", body, {
        signal,
      });
      return ManualExpenseCreateResponseBodySchema.parse(raw);
    },
    ...createFinykReceiptsEndpoints(http),
    ...createFinykImportEndpoints(http),
  };
}

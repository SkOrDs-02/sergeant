import {
  ManualExpenseCreateSchema,
  ManualExpenseCreateResponseSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

export const ManualExpenseCreateBodySchema = ManualExpenseCreateSchema;
export const ManualExpenseCreateResponseBodySchema =
  ManualExpenseCreateResponseSchema;

export type ManualExpenseCreateRequest = z.infer<
  typeof ManualExpenseCreateBodySchema
>;
export type ManualExpenseCreateResponse = z.infer<
  typeof ManualExpenseCreateResponseBodySchema
>;

export interface FinykEndpoints {
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
  };
}

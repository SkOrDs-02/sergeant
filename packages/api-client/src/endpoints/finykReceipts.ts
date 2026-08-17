import {
  ReceiptAnalyzeRequestSchema,
  ReceiptDraftResponseSchema,
  ReceiptGetResponseSchema,
  ReceiptLookupRequestSchema,
  ReceiptSaveRequestSchema,
  ReceiptSaveResponseSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

/**
 * `POST /api/finyk/receipts/*` + `GET /api/finyk/receipts/:id` — чек-скан
 * v1 (`docs/90-work/planning/specs/receipt-scan.md`).
 *
 * Response/request shapes re-export `z.infer<>` of the canonical Zod
 * schemas from `@sergeant/shared` (`packages/shared/src/schemas/
 * receipts.ts`) — сервер `.parse()`-ить КОЖНУ відповідь через ТІ САМІ
 * схеми безпосередньо перед `res.json()` (AGENTS.md Hard Rule #3), тож
 * drift між сервером і цими типами неможливий без TS compile error десь
 * у монорепо (ніщо тут не редекларує форму руками).
 *
 * Contract test:
 * `packages/api-client/src/__tests__/contracts/finyk-receipts.contract.test.ts`.
 */

export const ReceiptLookupRequestBodySchema = ReceiptLookupRequestSchema;
export const ReceiptAnalyzeRequestBodySchema = ReceiptAnalyzeRequestSchema;
export const ReceiptSaveRequestBodySchema = ReceiptSaveRequestSchema;
export const ReceiptDraftResponseBodySchema = ReceiptDraftResponseSchema;
export const ReceiptSaveResponseBodySchema = ReceiptSaveResponseSchema;
export const ReceiptGetResponseBodySchema = ReceiptGetResponseSchema;

export type ReceiptLookupRequest = z.infer<
  typeof ReceiptLookupRequestBodySchema
>;
export type ReceiptAnalyzeRequest = z.infer<
  typeof ReceiptAnalyzeRequestBodySchema
>;
export type ReceiptSaveRequest = z.infer<typeof ReceiptSaveRequestBodySchema>;
export type ReceiptDraftResponse = z.infer<
  typeof ReceiptDraftResponseBodySchema
>;
export type ReceiptSaveResponse = z.infer<typeof ReceiptSaveResponseBodySchema>;
export type ReceiptGetResponse = z.infer<typeof ReceiptGetResponseBodySchema>;

// Nested shapes referenced inside the response types above — re-exported
// verbatim so callers (review-card / transaction-detail UI) can type
// against them without reaching past `@sergeant/api-client` into
// `@sergeant/shared` directly.
export type {
  Receipt,
  ReceiptDraft,
  ReceiptDraftItem,
  ReceiptDraftSource,
  ReceiptItem,
  ReceiptLink,
} from "@sergeant/shared";

export interface FinykReceiptsEndpoints {
  /**
   * `POST /api/finyk/receipts/lookup` — QR/ДПС lookup (body:
   * `{fn,id,date,time,sm}`, opaque QR fields). Returns a draft WITHOUT
   * persisting anything — save happens via a separate `saveReceipt()`
   * call.
   *
   * Errors use the standard `{error, message, code, requestId}` envelope
   * (`ApiError.serverMessage` / `ApiError.requestId`); `ApiError.status`
   * + the server's stable `code` (surfaced on `ApiError.body.code`)
   * distinguish:
   *   - `503 DPS_TOKEN_MISSING` — no `DPS_API_TOKEN` configured server-side.
   *   - `404 DPS_RECEIPT_NOT_FOUND` — not yet indexed by the DPS registry
   *     (appearance lag) — UI should suggest "wait a bit" or "take a photo".
   *   - `503 DPS_AUTH_ERROR` — DPS rejected the configured token (401/403).
   *   - `502 DPS_UPSTREAM_ERROR` — DPS registry unavailable/erroring.
   *   - `502 DPS_PARSE_ERROR` — DPS responded but the XML didn't parse.
   */
  lookupReceipt: (
    body: ReceiptLookupRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ReceiptDraftResponse>;
  /**
   * `POST /api/finyk/receipts/analyze` — vision fallback (photo without a
   * QR code). Body is **snake_case** (`image_base64`, `mime_type?`) —
   * mirrors the nutrition `analyze-photo` request contract. Returns a
   * draft (`source: "vision"`, `fiscalNum: null`, `confidence: 0..1`)
   * WITHOUT persisting anything.
   *
   * `413`/`415` responses use a NON-standard envelope — NOT
   * `{error, message, code, requestId}` — see
   * `ImageValidationErrorBody` / `isImageValidationErrorBody` in
   * `./imageValidationError`. `503 RECEIPT_VISION_UNAVAILABLE` (no vision
   * provider configured) uses the standard envelope.
   */
  analyzeReceipt: (
    body: ReceiptAnalyzeRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ReceiptDraftResponse>;
  /**
   * `POST /api/finyk/receipts` — save the (possibly edited) draft +
   * `category`. `201` — a new receipt was created; `200` +
   * `alreadyExists: true` — idempotent replay of an already-saved
   * receipt (no duplicate `receipt`/`receipt_items`/expense row).
   *
   * **`clientScanId`** — generate `crypto.randomUUID()` ONCE per save
   * attempt for a vision-sourced draft (`draft.fiscalNum === null`) and
   * resend the SAME value on every retry of that same attempt (network
   * timeout, double-tap). QR/ДПС receipts (`fiscalNum` present) already
   * have a server-side idempotency key (`(user_id, fiscal_num)`) —
   * `clientScanId` is optional for them. Without `clientScanId`, every
   * retry of a vision-sourced save creates a NEW receipt (the server has
   * no other way to recognise the retry).
   */
  saveReceipt: (
    body: ReceiptSaveRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ReceiptSaveResponse>;
  /**
   * `GET /api/finyk/receipts/:id` — receipt with its line items, for the
   * transaction-detail drill-down. `404` for BOTH another user's receipt
   * and a non-existent id (the server never distinguishes the two, to
   * avoid leaking id existence across users).
   */
  getReceipt: (
    id: number,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ReceiptGetResponse>;
}

export function createFinykReceiptsEndpoints(
  http: HttpClient,
): FinykReceiptsEndpoints {
  return {
    lookupReceipt: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>("/api/finyk/receipts/lookup", body, {
        signal,
      });
      return ReceiptDraftResponseBodySchema.parse(raw);
    },
    analyzeReceipt: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>(
        "/api/finyk/receipts/analyze",
        body,
        { signal },
      );
      return ReceiptDraftResponseBodySchema.parse(raw);
    },
    saveReceipt: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>("/api/finyk/receipts", body, {
        signal,
      });
      return ReceiptSaveResponseBodySchema.parse(raw);
    },
    getReceipt: async (id, { signal } = {}) => {
      const raw = await http.get<unknown>(`/api/finyk/receipts/${id}`, {
        signal,
      });
      return ReceiptGetResponseBodySchema.parse(raw);
    },
  };
}

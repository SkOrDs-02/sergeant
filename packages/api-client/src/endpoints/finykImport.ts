import {
  ImportBatchGetResponseSchema,
  ImportBatchUndoResponseSchema,
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  ImportScreenshotAnalyzeRequestSchema,
  ImportScreenshotAnalyzeResponseSchema,
  ImportStatementPreviewRequestSchema,
  ImportStatementPreviewResponseSchema,
  z,
} from "@sergeant/shared";
import type { HttpClient } from "../httpClient";
import type { RequestOptions } from "../types";

/**
 * `POST /api/finyk/import/*` + `GET`/`DELETE /api/finyk/import/batches/:id`
 * — «Масове ведення» (`docs/90-work/planning/specs/receipt-scan.md` §
 * Фаза 2: скрін банкінгу (vision) + виписка CSV + commit/undo журналу
 * батчів). Batch-чеки (N × v1 `finyk.receipts`/`finyk.analyzeReceipt`) —
 * НЕ ця поверхня.
 *
 * Response/request shapes re-export `z.infer<>` of the canonical Zod
 * schemas from `@sergeant/shared` (`packages/shared/src/schemas/
 * import.ts`) — сервер `.parse()`-ить КОЖНУ відповідь через ТІ САМІ
 * схеми безпосередньо перед `res.json()` (AGENTS.md Hard Rule #3).
 *
 * Contract test:
 * `packages/api-client/src/__tests__/contracts/finyk-import.contract.test.ts`.
 */

export const ImportScreenshotAnalyzeRequestBodySchema =
  ImportScreenshotAnalyzeRequestSchema;
export const ImportScreenshotAnalyzeResponseBodySchema =
  ImportScreenshotAnalyzeResponseSchema;
export const ImportStatementPreviewRequestBodySchema =
  ImportStatementPreviewRequestSchema;
export const ImportStatementPreviewResponseBodySchema =
  ImportStatementPreviewResponseSchema;
export const ImportCommitRequestBodySchema = ImportCommitRequestSchema;
export const ImportCommitResponseBodySchema = ImportCommitResponseSchema;
export const ImportBatchGetResponseBodySchema = ImportBatchGetResponseSchema;
export const ImportBatchUndoResponseBodySchema = ImportBatchUndoResponseSchema;

export type ImportScreenshotAnalyzeRequest = z.infer<
  typeof ImportScreenshotAnalyzeRequestBodySchema
>;
export type ImportScreenshotAnalyzeResponse = z.infer<
  typeof ImportScreenshotAnalyzeResponseBodySchema
>;
export type ImportStatementPreviewRequest = z.infer<
  typeof ImportStatementPreviewRequestBodySchema
>;
export type ImportStatementPreviewResponse = z.infer<
  typeof ImportStatementPreviewResponseBodySchema
>;
export type ImportCommitRequest = z.infer<typeof ImportCommitRequestBodySchema>;
export type ImportCommitResponse = z.infer<
  typeof ImportCommitResponseBodySchema
>;
export type ImportBatchGetResponse = z.infer<
  typeof ImportBatchGetResponseBodySchema
>;
export type ImportBatchUndoResponse = z.infer<
  typeof ImportBatchUndoResponseBodySchema
>;

// Nested shapes referenced inside the response types above — re-exported
// verbatim so callers (bulk-review / import-batch UI) can type against
// them without reaching past `@sergeant/api-client` into
// `@sergeant/shared` directly.
export type {
  ImportBatch,
  ImportBatchStatus,
  ImportColumnMapping,
  ImportCommitRow,
  ImportDateFormat,
  ImportDirection,
  ImportScreenshotDocType,
  ImportScreenshotDraft,
  ImportScreenshotRow,
  ImportSkipReason,
  ImportSkippedRow,
  ImportSource,
  ImportStatementProfile,
  ImportStatementRow,
} from "@sergeant/shared";

export interface FinykImportEndpoints {
  /**
   * `POST /api/finyk/import/screenshot/analyze` — vision recognition of a
   * banking-app screenshot, returns a draft WITHOUT persisting anything.
   * `docType: "receipt"` is NOT an error — it's a 200 hint for the UI to
   * fall back to `finyk.analyzeReceipt` (v1 single-receipt flow);
   * `"other"` is a 200 with empty `rows`.
   *
   * `413`/`415` responses use the SAME non-standard envelope as
   * `analyzeReceipt` — see `ImageValidationErrorBody` /
   * `isImageValidationErrorBody` in `./imageValidationError`. `503
   * IMPORT_VISION_UNAVAILABLE` (no vision provider configured) uses the
   * standard envelope.
   */
  analyzeImportScreenshot: (
    body: ImportScreenshotAnalyzeRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ImportScreenshotAnalyzeResponse>;
  /**
   * `POST /api/finyk/import/statement/preview` — CSV-only bank-statement
   * parsing, WITHOUT persisting anything. Discriminated by
   * `needsMapping`:
   *   - `false` — `profile` (`"mono" | "privat24" | "custom"`) +
   *     `rows`/`skipped` are populated; `headers`/`sampleRows` are absent.
   *   - `true` — the inverse: `profile: null`, `rows`/`skipped` empty,
   *     `headers`/`sampleRows` populated for a manual column-mapper UI. A
   *     follow-up call with a resolved `mapping` yields `profile:
   *     "custom"`.
   */
  previewImportStatement: (
    body: ImportStatementPreviewRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ImportStatementPreviewResponse>;
  /**
   * `POST /api/finyk/import/commit` — selected/edited rows → the
   * `import_batches` journal + `finyk_manual_expenses` rows (triple-tier
   * dedup: mono-matcher, then between-imports row-key). `linked` is
   * always `0` in this slice (the journal covers transaction rows only,
   * not batch-checks); `skipped.monoMatched` + `skipped.duplicate`
   * explain why `created < rows.length`.
   */
  commitImport: (
    body: ImportCommitRequest,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ImportCommitResponse>;
  /**
   * `GET /api/finyk/import/batches/:id` — batch status/summary. `404`
   * for BOTH another user's batch and a non-existent id.
   */
  getImportBatch: (
    id: number,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ImportBatchGetResponse>;
  /**
   * `DELETE /api/finyk/import/batches/:id` — undo: tombstones every row
   * in `batch.createdRowIds`. Idempotent — a repeat call returns
   * `tombstoned: 0` (still `200`, `batch.status` stays `"undone"`), not
   * an error.
   */
  deleteImportBatch: (
    id: number,
    opts?: Pick<RequestOptions, "signal">,
  ) => Promise<ImportBatchUndoResponse>;
}

export function createFinykImportEndpoints(
  http: HttpClient,
): FinykImportEndpoints {
  return {
    analyzeImportScreenshot: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>(
        "/api/finyk/import/screenshot/analyze",
        body,
        { signal },
      );
      return ImportScreenshotAnalyzeResponseBodySchema.parse(raw);
    },
    previewImportStatement: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>(
        "/api/finyk/import/statement/preview",
        body,
        { signal },
      );
      return ImportStatementPreviewResponseBodySchema.parse(raw);
    },
    commitImport: async (body, { signal } = {}) => {
      const raw = await http.post<unknown>("/api/finyk/import/commit", body, {
        signal,
      });
      return ImportCommitResponseBodySchema.parse(raw);
    },
    getImportBatch: async (id, { signal } = {}) => {
      const raw = await http.get<unknown>(`/api/finyk/import/batches/${id}`, {
        signal,
      });
      return ImportBatchGetResponseBodySchema.parse(raw);
    },
    deleteImportBatch: async (id, { signal } = {}) => {
      const raw = await http.del<unknown>(
        `/api/finyk/import/batches/${id}`,
        undefined,
        { signal },
      );
      return ImportBatchUndoResponseBodySchema.parse(raw);
    },
  };
}

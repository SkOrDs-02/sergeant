/**
 * Wire shape for the image-validation error envelope emitted by
 * `POST /api/finyk/receipts/analyze` and
 * `POST /api/finyk/import/screenshot/analyze` on `413`/`415` responses.
 *
 * NON-standard: every other error these two endpoints can emit (503
 * `RECEIPT_VISION_UNAVAILABLE` / `IMPORT_VISION_UNAVAILABLE`, 400
 * validation, 401) uses the canonical
 * `{error, message, code, requestId}` envelope from
 * `apps/server/src/http/errorHandler.ts` (see `ApiError.serverMessage` /
 * `ApiError.requestId`). THIS envelope is hand-rolled —
 * `res.status(413|415).json({...})`, never `.parse()`-ed against a shared
 * zod schema — in `apps/server/src/modules/finyk/receipts/analyze.ts`
 * and `apps/server/src/modules/finyk/import/screenshotAnalyze.ts` (both
 * call the SAME `validateImageBase64()` in
 * `apps/server/src/lib/imageMagic.ts` and serialize its
 * `ValidateImageError` union byte-for-byte identically — the import
 * handler's own comment calls this out as an intentional duplication,
 * not a shared helper). It mirrors the pattern already used by
 * `apps/server/src/modules/nutrition/{analyze,refine}-photo.ts` for the
 * same underlying validator.
 *
 * There is no `@sergeant/shared` zod schema for this envelope (unlike
 * every other response shape in `finykReceipts.ts` / `finykImport.ts`) —
 * the server never validates its own output here, so this type is
 * hand-written to mirror `ValidateImageError` in
 * `apps/server/src/lib/imageMagic.ts` (source of truth), not re-exported
 * from shared. `declared_mime`/`detected_mime` are present ONLY when
 * `code === "MAGIC_MISMATCH"` — every other code carries just
 * `{code, detail}`.
 */
export type ImageValidationErrorCode =
  "INVALID_BASE64" | "TOO_LARGE" | "TRUNCATED" | "MAGIC_MISMATCH";

export type ImageValidationErrorBody =
  | {
      code: Exclude<ImageValidationErrorCode, "MAGIC_MISMATCH">;
      detail: string;
    }
  | {
      code: "MAGIC_MISMATCH";
      detail: string;
      declared_mime: string;
      detected_mime: string | null;
    };

/**
 * Narrows `ApiError.body` (or any `unknown` 413/415 response body) to
 * `ImageValidationErrorBody`. Use after catching `ApiError` with
 * `status === 413 || status === 415` from `analyzeReceipt` /
 * `analyzeImportScreenshot` specifically — every OTHER status on every
 * OTHER finyk endpoint uses the standard `{error, message, code,
 * requestId}` envelope instead (`ApiError.serverMessage` /
 * `ApiError.requestId` already cover that case; do not use this guard
 * there).
 */
export function isImageValidationErrorBody(
  body: unknown,
): body is ImageValidationErrorBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b["code"] !== "string" || typeof b["detail"] !== "string") {
    return false;
  }
  if (b["code"] === "MAGIC_MISMATCH") {
    return (
      typeof b["declared_mime"] === "string" &&
      (typeof b["detected_mime"] === "string" || b["detected_mime"] === null)
    );
  }
  return (
    b["code"] === "INVALID_BASE64" ||
    b["code"] === "TOO_LARGE" ||
    b["code"] === "TRUNCATED"
  );
}

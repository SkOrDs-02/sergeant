/**
 * Shared request-ID extraction and clipboard-copy helpers.
 *
 * Consumed by both `ErrorBoundary` (hub-level) and `ModuleErrorBoundary`
 * (module-level) so the logic lives in exactly one place. Extracted as
 * part of UX-roast 2026-Q2 PR-14.
 *
 * Duck-typed intentionally: we do NOT import `ApiError` here so this
 * module stays out of the api-client critical path and works with errors
 * from any source (SW, lazy chunks, third-party) that happens to carry
 * a `requestId` field.
 */

import { CONFIRM_FLASH_MS } from "@shared/lib/ui/timeouts";

/**
 * Витягуємо `requestId` з помилки, якщо помилка — `ApiError`-сумісна.
 * Не імпортуємо `ApiError` напряму, щоб не тягнути api-client у головний
 * бандл і зберегти duck-typing (помилки з SW/інших джерел теж можуть
 * мати `requestId`).
 */
export function extractRequestId(error: unknown): string | undefined {
  if (error == null || typeof error !== "object") return undefined;
  const id = (error as { requestId?: unknown }).requestId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** 5xx або network-kind ApiError — кейси, де requestId максимально цінний. */
export function isServerLikeError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  const kind = (error as { kind?: unknown }).kind;
  return kind === "network" || kind === "parse";
}

/**
 * Copy `requestId` to the clipboard, with a textarea-execCommand fallback
 * for older browsers / restricted WebViews.
 *
 * @param id - The requestId string to copy.
 * @param onDone - Called after the copy attempt completes (success or
 *   fallback). Use this to set a "Скопійовано" flash state with a
 *   `CONFIRM_FLASH_MS` auto-reset.
 */
export function copyRequestIdToClipboard(id: string, onDone: () => void): void {
  const fallbackCopy = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = id;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      /* noop */
    }
  };

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(id).then(onDone, () => {
        fallbackCopy();
        onDone();
      });
      return;
    }
  } catch {
    /* fallthrough */
  }
  fallbackCopy();
  onDone();
}

/**
 * Build the auto-reset callback used by error boundary copy buttons.
 *
 * Returns a function that:
 *  1. Calls `setState({ copied: true })`.
 *  2. Schedules `setState({ copied: false })` after `CONFIRM_FLASH_MS`.
 */
export function makeCopyDoneCallback(
  setState: (update: { copied: boolean }) => void,
): () => void {
  return () => {
    setState({ copied: true });
    setTimeout(() => setState({ copied: false }), CONFIRM_FLASH_MS);
  };
}

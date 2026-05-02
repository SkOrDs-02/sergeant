/**
 * Defaults for the standardised "undo toast" pattern used after destructive
 * actions (delete habit / transaction / set / memory entry / etc.).
 *
 * The actual `showUndoToast()` helper lives per-platform because the toast
 * API differs (web's `useToast` exposes `show(msg, type, duration, action)`
 * with `onClick`; React Native uses `onPress`). Both implementations import
 * these constants so wording and timing stay in sync — see
 * `apps/web/src/shared/lib/undoToast.tsx`.
 */

/** Default visible duration in ms (5 sec, matching the original product brief). */
export const UNDO_TOAST_DEFAULT_DURATION_MS = 5_000;

/** Default action-button label. */
export const UNDO_TOAST_DEFAULT_LABEL = "Повернути";

/**
 * Default error message shown if the `onUndo` callback throws — historically
 * a `catch {}` swallowed real failures (e.g. localStorage quota errors)
 * and the user mistakenly assumed restore had succeeded.
 */
export const UNDO_TOAST_DEFAULT_ERROR_MSG =
  "Не вдалось повернути. Спробуй ще раз.";

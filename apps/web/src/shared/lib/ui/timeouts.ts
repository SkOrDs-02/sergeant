/**
 * Canonical UI timeout constants for transient feedback, deferred reveals,
 * and auto-clearing status banners. Replaces ~6 inline magic-numbers that
 * accumulated across `core/` and `modules/` (see audit annex 2026-05-15
 * in `docs/tech-debt/frontend.md` § "Web UI timeout magic-numbers").
 *
 * # Three categories
 *
 * - **transient-confirm**: visual feedback that flashes then auto-dismisses
 *   without further user interaction (e.g. "copied!" pill, post-success
 *   redirect after toast read).
 * - **delayed-show**: wait period before introducing an intrusive UI
 *   element so the app has time to stabilize (e.g. iOS install banner).
 * - **status-clear**: lingering banner / highlight / hint that auto-clears
 *   after the user has had time to read it.
 *
 * # Why centralize
 *
 * Each timeout value encodes a UX contract ("user has at least N ms to
 * read this"). Inlining magic-numbers makes those contracts invisible
 * and lets values drift between similar call-sites — e.g. a 1500 ms
 * "copied" pill in one place vs. 2000 ms in another, even though the
 * user-perceived intent is the same.
 *
 * Adding a new call-site? Pick the constant that matches the **user
 * intent**, not just the raw duration. If no category fits, add a new
 * constant here with a comment explaining the UX contract — don't
 * inline a fresh magic-number.
 *
 * @last-validated 2026-05-22
 */

/** Short transient confirm — copy-to-clipboard pill, success-state flash. */
export const CONFIRM_FLASH_MS = 1500;

/** Post-success redirect — give the user time to read the toast before
 *  navigating away. Pairs with `toast.success()` calls. */
export const POST_SUCCESS_REDIRECT_MS = 1500;

/** Delay before introducing intrusive promotion / install banners so the
 *  initial UI mount can stabilize first. */
export const PROMO_BANNER_REVEAL_MS = 3000;

/** Clear lingering highlight ring on a programmatically focused element
 *  (e.g. deep-linked budget category, recently-edited row). */
export const HIGHLIGHT_CLEAR_MS = 3000;

/** Auto-hide a status message banner ("Saved", "Imported", "Scanned"). */
export const STATUS_AUTO_HIDE_MS = 4000;

/** Auto-dismiss an inline hint / tooltip. */
export const HINT_AUTO_HIDE_MS = 4000;

/** Delay before revealing a one-shot hint tooltip so the user has a chance
 *  to discover the affordance organically first. */
export const HINT_REVEAL_DELAY_MS = 2000;

/**
 * `useMonobank()` is the single Monobank hook for the Finyk module.
 *
 * Historically there were two implementations (legacy direct-poll vs. the
 * webhook-backed flow), gated behind the `mono_webhook` feature flag. After
 * the webhook cutover (#705 → #708 → Roadmap-D push wiring) the legacy path
 * has no remaining callers and is removed in this PR — see the cleanup
 * notes under Monobank Roadmap section A.
 *
 * The hook now re-exports {@link useMonobankWebhook} verbatim. We keep this
 * thin module instead of having callers import `useMonobankWebhook` directly
 * because:
 *
 *   1. ~30 callers across `apps/web/src/modules/finyk/**`,
 *      `apps/web/src/core/**` and tests already import `useMonobank` —
 *      keeping the symbol stable avoids a noisy churn-PR.
 *   2. If/when we add a third bank (Privat, etc.) and want to switch on
 *      account source, this is the right place for that branching.
 */
export { useMonobankWebhook as useMonobank } from "./useMonobankWebhook";

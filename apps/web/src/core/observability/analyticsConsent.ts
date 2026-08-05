/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * In-memory cache of the current user's `analytics` consent preference
 * (`UserPreferences.analytics`, `/api/me/preferences`), so call-sites that
 * fire analytics events synchronously from a UI event handler (e.g.
 * `InsightCard`'s dismiss button) can gate on it without an async round
 * trip on every click.
 *
 * AI-CONTEXT: this is a NARROW, additive gate for the `advice_shown` /
 * `advice_dismissed` events (beta-hardening, founder decision) — it does
 * NOT retrofit consent-checking onto the rest of the `trackEvent` pipeline
 * (`core/observability/analytics.ts`), which today fires unconditionally
 * once PostHog is initialised. That is a pre-existing gap the `analytics`
 * toggle in `PrivacySection` does not yet enforce anywhere; fixing it
 * repo-wide is a separate, larger change, not this one.
 *
 * Default `false` — DENY UNTIL HYDRATED (CodeRabbit PR #627). This used to
 * default `true` (mirroring `UserPreferencesSchema.analytics`'s implicit
 * opt-out model), but that created a race on reload: this in-memory cache
 * resets to the default on every page load, and `PrivacySection` — the
 * only prior hydration point — only fetches `/api/me/preferences` once
 * the user opens Settings → Privacy. Any `InsightCard` mounted before that
 * (or in a session where Settings is never opened) fired `advice_shown` /
 * `advice_dismissed` under an implicit "yes" the server may not agree
 * with (server-side `analytics` column defaults `FALSE` — migration 111).
 * Denying by default until an authenticated boot actually reads the
 * server value closes that window; the false-negative cost (a few
 * dropped events between boot and hydration) is much cheaper than an
 * unconsented emit.
 *
 * Two writers keep this in sync with the server value:
 *
 *   - `useAnalyticsConsentBoot` (`./useAnalyticsConsentBoot.ts`) — mounted
 *     app-wide next to `useProfileWriteThroughBoot`, hydrates once per
 *     authenticated `userId` as early as possible after boot.
 *   - `PrivacySection` — calls it again after both `getPreferences()`
 *     (mount, if the user opens Settings) and `updatePreferences()`
 *     (toggle, optimistically — see that component for the revert-on-
 *     failure contract) resolve, so the cache never lags a page that's
 *     already open.
 */

let cachedAnalyticsConsent = false;

/** `true` when analytics events are currently allowed to fire. */
export function getAnalyticsConsent(): boolean {
  return cachedAnalyticsConsent;
}

/** Called whenever a caller learns the server's current (or optimistic) value. */
export function setAnalyticsConsent(value: boolean): void {
  cachedAnalyticsConsent = value;
}

/** Test-only reset. Not for production call-sites. */
export function __resetAnalyticsConsentForTests(): void {
  cachedAnalyticsConsent = false;
}

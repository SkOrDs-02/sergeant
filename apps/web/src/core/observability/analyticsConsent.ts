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
 * Default `true` mirrors `UserPreferencesSchema.analytics`'s implicit
 * opt-out model (every existing default in `PrivacySection.DEFAULT_PREFERENCES`
 * is `analytics: true`) — an anonymous visitor or a session that hasn't
 * fetched preferences yet is treated as consenting, same as everywhere else
 * in the app today.
 *
 * `PrivacySection` is the only writer: it calls {@link setAnalyticsConsent}
 * after both `getPreferences()` (mount) and `updatePreferences()` (toggle)
 * resolve, so the cache tracks the server value as soon as either the page
 * loads or the user changes it — no polling, no subscription plumbing.
 */

let cachedAnalyticsConsent = true;

/** `true` when analytics events are currently allowed to fire. */
export function getAnalyticsConsent(): boolean {
  return cachedAnalyticsConsent;
}

/** Called by `PrivacySection` whenever it learns the server's current value. */
export function setAnalyticsConsent(value: boolean): void {
  cachedAnalyticsConsent = value;
}

/** Test-only reset. Not for production call-sites. */
export function __resetAnalyticsConsentForTests(): void {
  cachedAnalyticsConsent = true;
}

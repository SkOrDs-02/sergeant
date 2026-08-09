/**
 * Build-time kill switches for the two public surfaces that are not ready to
 * be shown during the closed beta: commerce (tariffs, subscription, paywall
 * CTAs) and the legal documents.
 *
 * AI-CONTEXT: deliberately NOT part of `core/lib/featureFlags.ts`. That
 * registry is user-facing — every flag renders as a toggle in
 * Settings → Експериментальне and lives in localStorage, so a beta tester
 * could switch these back on, and the value would be per-device. These two
 * are a deployment decision, not a user preference, so they are read from
 * the build environment instead. `vite.config.js#define` injects both as
 * literals so the value is fixed at build time.
 *
 * These consts drive RUNTIME branches (does this component render, is this
 * section in the list). They deliberately do NOT gate the lazy route imports
 * in `app/StandaloneRoutes.tsx`: measured 2026-08-08, a branch reading the
 * flag through this module does not fold, so Rollup keeps emitting the
 * `PricingPage`/`LegalPage` chunks and the service worker precaches them.
 * That call-site spells the `import.meta.env` comparison out inline instead —
 * see the AI-CONTEXT note there before refactoring either side.
 *
 * Both default to DISABLED — an unset variable hides the surface. That is
 * the safe direction for a beta: forgetting to configure an environment
 * hides commerce rather than exposing a half-finished checkout. Re-enable by
 * setting the variable to `"1"` in the target Vercel project.
 *
 * The two switches are separate on purpose: the legal documents will very
 * plausibly need to come back BEFORE pricing does — a privacy-policy URL is
 * mandatory for an App Store submission of the Capacitor shell, and it is
 * the surface a GDPR request asks for.
 */

/**
 * Tariffs page, the Settings → «Підписка та план» section, paywall purchase
 * CTAs, trial banner, and every in-app link to `/pricing`.
 */
export const COMMERCE_SURFACES_ENABLED =
  import.meta.env.VITE_ENABLE_COMMERCE === "1";

/** `/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/offer`. */
export const LEGAL_SURFACES_ENABLED = import.meta.env.VITE_ENABLE_LEGAL === "1";

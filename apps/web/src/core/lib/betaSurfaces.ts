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

// `import.meta.env` only exists inside the Vite pipeline. Playwright's esbuild
// loader does not provide it, and this module is reachable from there, so the
// access is optional — reading the property off an undefined object threw and
// took down two CI lanes. Vite's `define` substitutes the exact text
// `import.meta.env.VITE_*`, which this indirection no longer matches; that is
// fine here, because these consts drive runtime branches only. The one place
// that genuinely needs the literal substitution (to make the lazy route import
// statically dead) spells it out inline — see `app/StandaloneRoutes.tsx`.
const env = import.meta.env as ImportMetaEnv | undefined;

/**
 * Tariffs page, the Settings → «Підписка та план» section, paywall purchase
 * CTAs, trial banner, and every in-app link to `/pricing`.
 */
export const COMMERCE_SURFACES_ENABLED = env?.VITE_ENABLE_COMMERCE === "1";

/** `/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/offer`. */
export const LEGAL_SURFACES_ENABLED = env?.VITE_ENABLE_LEGAL === "1";

/**
 * True when an in-app href points at a surface hidden for the closed beta.
 *
 * Exists for content that outlives the surface it links to: release notes are
 * an append-only archive, so the newest note still carries a
 * «Подивитись тарифи» → `/pricing` CTA. Rather than editing history — or
 * teaching the data module about build flags, since `whatsNew/releases.ts` is
 * imported by Playwright helpers and must stay free of `import.meta.env` —
 * the consumer asks this before rendering the link.
 */
export function isHiddenBetaHref(href: string): boolean {
  if (!COMMERCE_SURFACES_ENABLED && href.startsWith("/pricing")) return true;
  if (!LEGAL_SURFACES_ENABLED && href.startsWith("/legal/")) return true;
  return false;
}

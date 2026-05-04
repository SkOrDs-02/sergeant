/**
 * PostHog env accessor split into its own module so Jest can `jest.mock`
 * the read and drive `initPostHog` through both the key-set and
 * key-absent branches in a single test file. Mirrors `./env.ts`
 * (Sentry DSN) — see that file for the rationale around Expo's
 * `EXPO_PUBLIC_*` build-time inlining.
 */

const DEFAULT_HOST = "https://eu.i.posthog.com";

export function getPostHogKey(): string | undefined {
  return process.env.EXPO_PUBLIC_POSTHOG_KEY;
}

export function getPostHogHost(): string {
  return process.env.EXPO_PUBLIC_POSTHOG_HOST || DEFAULT_HOST;
}
